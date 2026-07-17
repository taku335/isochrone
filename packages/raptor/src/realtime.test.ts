import { type NormalizedGtfs, type PrefixedId } from '@isochrone/gtfs-types';
import { buildBrowserDatasetFiles } from '@isochrone/pipeline';
import { describe, expect, it } from 'vitest';

import {
  applyRealtimeSnapshot,
  loadTimetable,
  route,
  type NormalizedRealtimeSnapshot,
  type LoadedTimetable,
} from './index.js';

describe('applyRealtimeSnapshot', () => {
  const scheduled = loadTimetable(buildBrowserDatasetFiles(fixture, { feedVersion: 'static-v1' }));
  const now = 1_800_000_000;

  it('applies stop delays, propagates them, and keeps RAPTOR correct when trips overtake', () => {
    const applied = applyRealtimeSnapshot(scheduled, snapshot([
      {
        tripId: id('T1'),
        serviceDate: '20260707',
        stopTimeUpdates: [
          {
            stopId: id('B'),
            arrivalDelaySeconds: 1_200,
            departureDelaySeconds: 1_200,
          },
        ],
      },
    ]), { nowEpochSeconds: now });

    expect(applied.status).toBe('applied');
    expect(applied.ageSeconds).toBe(30);
    expect(applied.stats).toEqual({
      tripUpdates: 1,
      matchedTrips: 1,
      unmatchedTrips: 0,
      adjustedTrips: 1,
      adjustedEvents: 4,
    });
    expect(readEventDelays(applied.timetable, id('T1'), '20260707')).toEqual([
      0, 0, 20, 20, 20, 20,
    ]);

    const forward = route(applied.timetable, {
      kind: 'earliestArrival',
      origins: [{ stopIndex: stopIndex(applied.timetable, id('B')), departure: 491 }],
      serviceDate: '20260707',
      maxRounds: 1,
    });
    expect(forward.arrival[stopIndex(applied.timetable, id('C'))]).toBe(505);

    const reverse = route(applied.timetable, {
      kind: 'latestDeparture',
      destinations: [{ stopIndex: stopIndex(applied.timetable, id('C')), arrival: 515 }],
      serviceDate: '20260707',
      maxRounds: 1,
    });
    expect(reverse.departure[stopIndex(applied.timetable, id('B'))]).toBe(495);

    const otherDate = route(applied.timetable, {
      kind: 'earliestArrival',
      origins: [{ stopIndex: stopIndex(applied.timetable, id('B')), departure: 489 }],
      serviceDate: '20260708',
      maxRounds: 1,
    });
    expect(otherDate.arrival[stopIndex(applied.timetable, id('C'))]).toBe(500);
  });

  it('rounds sub-minute predictions up to avoid reporting an early arrival', () => {
    const applied = applyRealtimeSnapshot(scheduled, snapshot([
      {
        tripId: id('T2'),
        serviceDate: '20260707',
        stopTimeUpdates: [{ stopId: id('C'), arrivalDelaySeconds: 1 }],
      },
    ]), { nowEpochSeconds: now });

    expect(readEventDelays(applied.timetable, id('T2'), '20260707')).toEqual([0, 0, 0, 0, 1, 1]);
  });

  it('applies updates to the matching previous-day service layer after midnight', () => {
    const applied = applyRealtimeSnapshot(scheduled, snapshot([
      {
        tripId: id('T3'),
        serviceDate: '20260707',
        stopTimeUpdates: [{ stopId: id('A'), departureDelaySeconds: 600 }],
      },
    ]), { nowEpochSeconds: now });

    const result = route(applied.timetable, {
      kind: 'earliestArrival',
      origins: [{ stopIndex: stopIndex(applied.timetable, id('A')), departure: 65 }],
      serviceDate: '20260708',
      maxRounds: 1,
    });
    expect(result.arrival[stopIndex(applied.timetable, id('B'))]).toBe(80);
  });

  it.each([
    ['stale', now - 121],
    ['future', now + 31],
  ] as const)('falls back to the scheduled timetable for a %s snapshot', (status, timestamp) => {
    const applied = applyRealtimeSnapshot(scheduled, { ...snapshot([]), timestamp }, {
      nowEpochSeconds: now,
    });

    expect(applied.status).toBe(status);
    expect(applied.timetable).toBe(scheduled);
  });

  it('rejects a realtime feed version that does not match the static source', () => {
    const applied = applyRealtimeSnapshot(scheduled, {
      ...snapshot([]),
      sourceFeedVersion: 'different-static-version',
    }, { nowEpochSeconds: now });

    expect(applied.status).toBe('incompatible');
    expect(applied.timetable).toBe(scheduled);
    expect(applied.issues).toContainEqual(expect.objectContaining({ code: 'feed-version-mismatch' }));
  });

  it('ignores unknown trips and invalid stop delays without changing scheduled data', () => {
    const applied = applyRealtimeSnapshot(scheduled, snapshot([
      {
        tripId: id('UNKNOWN'),
        serviceDate: '20260707',
        stopTimeUpdates: [{ stopId: id('A'), departureDelaySeconds: 60 }],
      },
      {
        tripId: id('T1'),
        serviceDate: '20260707',
        stopTimeUpdates: [{ stopId: id('A'), departureDelaySeconds: 1.5 }],
      },
    ]), { nowEpochSeconds: now });

    expect(applied.status).toBe('applied');
    expect(applied.timetable).toBe(scheduled);
    expect(applied.stats).toMatchObject({
      tripUpdates: 2,
      matchedTrips: 1,
      unmatchedTrips: 1,
      adjustedTrips: 0,
    });
    expect(applied.issues.map(({ code }) => code)).toEqual(['unknown-trip', 'invalid-delay']);
  });

  it('rejects delays that make adjusted trip times decrease', () => {
    const applied = applyRealtimeSnapshot(scheduled, snapshot([
      {
        tripId: id('T1'),
        serviceDate: '20260707',
        stopTimeUpdates: [{ stopId: id('B'), arrivalDelaySeconds: -1_200 }],
      },
    ]), { nowEpochSeconds: now });

    expect(applied.timetable).toBe(scheduled);
    expect(applied.stats.adjustedTrips).toBe(0);
    expect(applied.issues).toContainEqual(expect.objectContaining({
      code: 'adjusted-time-decreasing',
    }));
  });

  function snapshot(
    tripUpdates: NormalizedRealtimeSnapshot['tripUpdates'],
  ): NormalizedRealtimeSnapshot {
    return {
      sourceAgencyId: 'mini',
      sourceFeedVersion: 'static-v1',
      timestamp: now - 30,
      tripUpdates,
    };
  }
});

const fixture: NormalizedGtfs = {
  agencyId: 'mini',
  idPrefix: 'mini',
  stops: ['A', 'B', 'C'].map((stopId, index) => ({
    stopId: id(stopId),
    stopName: stopId,
    stopLat: 35 + index * 0.01,
    stopLon: 136 + index * 0.01,
  })),
  routes: [
    {
      routeId: id('R1'),
      routeShortName: 'R1',
      routeLongName: 'Route 1',
      routeType: 3,
    },
  ],
  trips: ['T1', 'T2', 'T3'].map((tripId) => ({
    tripId: id(tripId),
    routeId: id('R1'),
    serviceId: id('WKD'),
  })),
  stopTimes: [
    ...stopTimes('T1', [480, 490, 500]),
    ...stopTimes('T2', [485, 495, 505]),
    ...stopTimes('T3', [1_500, 1_510, 1_520]),
  ],
  calendar: [
    {
      serviceId: id('WKD'),
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
      startDate: '20260701',
      endDate: '20260731',
    },
  ],
  calendarDates: [],
};

function stopTimes(tripId: string, times: readonly number[]) {
  return ['A', 'B', 'C'].map((stopId, index) => ({
    tripId: id(tripId),
    stopId: id(stopId),
    stopSequence: index + 1,
    arrivalTime: times[index] ?? 0,
    departureTime: times[index] ?? 0,
  }));
}

function id(value: string): PrefixedId {
  return `mini:${value}`;
}

function stopIndex(timetable: LoadedTimetable, stopId: PrefixedId): number {
  const index = timetable.stopIds.indexOf(stopId);
  if (index < 0) {
    throw new Error(`Unknown test stop: ${stopId}`);
  }
  return index;
}

function readEventDelays(
  timetable: LoadedTimetable,
  tripId: PrefixedId,
  serviceDate: string,
): readonly number[] {
  const tripIndex = timetable.trips.ids.indexOf(tripId);
  if (tripIndex < 0) {
    throw new Error(`Unknown test trip: ${tripId}`);
  }
  const delay = timetable.realtime?.tripEventDelays[tripIndex]?.find(
    (candidate) => candidate.serviceDate === serviceDate,
  );
  return Array.from(delay?.eventDelays ?? []);
}
