import {
  type NormalizedGtfs,
  type NormalizedStop,
  type NormalizedStopTime,
  type PrefixedId,
} from '@isochrone/gtfs-types';
import { buildBrowserDatasetFiles } from '@isochrone/pipeline';
import { describe, expect, it } from 'vitest';

import {
  type JsonResponse,
  loadTimetable,
  loadTimetableFromManifestUrl,
} from './index.js';

describe('loadTimetable', () => {
  it('expands a pipeline-generated mini fixture into typed arrays', () => {
    const files = buildBrowserDatasetFiles(miniGtfs, { feedVersion: 'mini-20260701' });
    const loaded = loadTimetable(files);

    expect(loaded.loadStats).toEqual({
      stops: 5,
      routes: 2,
      patterns: 2,
      trips: 3,
      footpaths: loaded.footpaths.targetStopIndices.length,
      services: 2,
      calendarDates: 1,
      loadMs: 0,
    });
    expect(loaded.stopIds).toEqual([
      'nagoya-cbus:S1',
      'nagoya-cbus:S2',
      'nagoya-cbus:S3',
      'nagoya-cbus:S4',
      'nagoya-cbus:S5',
    ]);
    expect([...loaded.patterns.stopOffsets]).toEqual([0, 3, 6]);
    expect([...loaded.patterns.stopIndices]).toEqual([0, 1, 2, 0, 3, 4]);
    expect([...loaded.patterns.tripOffsets]).toEqual([0, 2, 3]);
    expect([...loaded.trips.routeIndices]).toEqual([0, 0, 1]);
    expect(loaded.calendar.serviceIds).toEqual(['nagoya-cbus:WE', 'nagoya-cbus:WKD']);
    expect([...loaded.trips.serviceIndices]).toEqual([1, 1, 0]);
    expect([...loaded.trips.timeOffsets]).toEqual([0, 6, 12, 18]);
    expect([...loaded.trips.times.slice(0, 6)]).toEqual([480, 480, 490, 490, 500, 500]);
    expect([...loaded.calendar.weekdayMasks]).toEqual([96, 31]);
  });

  it('loads manifest, stops, and timetable through a fetch abstraction', async () => {
    const files = buildBrowserDatasetFiles(miniGtfs, { feedVersion: 'mini-20260701' });
    const responses = new Map<string, unknown>([
      ['https://example.test/data/manifest.json', files.manifest],
      [`https://example.test/data/${files.manifest.files.stops.path}`, files.stops],
      [`https://example.test/data/${files.manifest.files.timetable.path}`, files.timetable],
    ]);
    const loaded = await loadTimetableFromManifestUrl('https://example.test/data/manifest.json', {
      fetchImpl: async (url) => jsonResponse(responses, url),
      now: (() => {
        let current = 100;
        return () => {
          current += 7;
          return current;
        };
      })(),
    });

    expect(loaded.manifest.feedVersion).toBe('mini-20260701');
    expect(loaded.loadStats.stops).toBe(files.stops.stops.ids.length);
    expect(loaded.loadStats.trips).toBe(files.timetable.trips.ids.length);
    expect(loaded.loadStats.loadMs).toBe(7);
  });

  it('rejects references that cannot be mapped to typed array indices', () => {
    const files = buildBrowserDatasetFiles(miniGtfs, { feedVersion: 'mini-20260701' });

    expect(() =>
      loadTimetable({
        ...files,
        timetable: {
          ...files.timetable,
          trips: {
            ...files.timetable.trips,
            routeIds: ['nagoya-cbus:missing', ...files.timetable.trips.routeIds.slice(1)],
          },
        },
      }),
    ).toThrow('Unknown trip route id: nagoya-cbus:missing');
  });
});

function jsonResponse(responses: ReadonlyMap<string, unknown>, url: string): Promise<JsonResponse> {
  const value = responses.get(url);
  return Promise.resolve({
    ok: value !== undefined,
    status: value === undefined ? 404 : 200,
    statusText: value === undefined ? 'Not Found' : 'OK',
    json() {
      return Promise.resolve(value);
    },
  });
}

const miniGtfs: NormalizedGtfs = {
  agencyId: 'nagoya-cbus',
  idPrefix: 'nagoya-cbus',
  stops: [
    stop('S1', 'Stop 1', 35.17, 136.91),
    stop('S2', 'Stop 2', 35.171, 136.911),
    stop('S3', 'Stop 3', 35.172, 136.912),
    stop('S4', 'Stop 4', 35.173, 136.913),
    stop('S5', 'Stop 5', 35.174, 136.914),
  ],
  routes: [
    { routeId: 'nagoya-cbus:R1', routeShortName: 'R1', routeLongName: 'Route 1', routeType: 3 },
    { routeId: 'nagoya-cbus:R2', routeShortName: 'R2', routeLongName: 'Route 2', routeType: 3 },
  ],
  trips: [
    { tripId: 'nagoya-cbus:T1', routeId: 'nagoya-cbus:R1', serviceId: 'nagoya-cbus:WKD' },
    { tripId: 'nagoya-cbus:T2', routeId: 'nagoya-cbus:R1', serviceId: 'nagoya-cbus:WKD' },
    { tripId: 'nagoya-cbus:T3', routeId: 'nagoya-cbus:R2', serviceId: 'nagoya-cbus:WE' },
  ],
  stopTimes: [
    stopTime('T1', 'S1', 1, 480),
    stopTime('T1', 'S2', 2, 490),
    stopTime('T1', 'S3', 3, 500),
    stopTime('T2', 'S1', 1, 510),
    stopTime('T2', 'S2', 2, 520),
    stopTime('T2', 'S3', 3, 530),
    stopTime('T3', 'S1', 1, 540),
    stopTime('T3', 'S4', 2, 550),
    stopTime('T3', 'S5', 3, 560),
  ],
  calendar: [
    {
      serviceId: 'nagoya-cbus:WKD',
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
    {
      serviceId: 'nagoya-cbus:WE',
      monday: false,
      tuesday: false,
      wednesday: false,
      thursday: false,
      friday: false,
      saturday: true,
      sunday: true,
      startDate: '20260701',
      endDate: '20260731',
    },
  ],
  calendarDates: [
    {
      serviceId: 'nagoya-cbus:WKD',
      date: '20260720',
      exceptionType: 2,
    },
  ],
};

function stop(id: string, name: string, lat: number, lon: number): NormalizedStop {
  return {
    stopId: prefixedId(id),
    stopName: name,
    stopLat: lat,
    stopLon: lon,
  };
}

function stopTime(
  tripId: string,
  stopId: string,
  stopSequence: number,
  time: number,
): NormalizedStopTime {
  return {
    tripId: prefixedId(tripId),
    stopId: prefixedId(stopId),
    stopSequence,
    arrivalTime: time,
    departureTime: time,
  };
}

function prefixedId(id: string): PrefixedId {
  return `nagoya-cbus:${id}` as PrefixedId;
}
