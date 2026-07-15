import {
  type NormalizedGtfs,
  type NormalizedStopTime,
  type PrefixedId,
} from '@isochrone/gtfs-types';
import { buildBrowserDatasetFiles } from '@isochrone/pipeline';
import { describe, expect, it } from 'vitest';

import {
  loadTimetable,
  type LoadedTimetable,
  route,
  UNREACHED,
} from './index.js';

describe('route', () => {
  const data = loadTimetable(buildBrowserDatasetFiles(miniGtfs, { feedVersion: 'mini' }));
  const stopIndex = new Map(data.stopIds.map((id, index) => [id, index]));
  const transferData = withFootpaths(data, [
    [indexOf('B'), indexOf('E'), 3],
    [indexOf('W'), indexOf('A'), 1],
  ]);
  const asymmetricTransferData = withDirectedFootpaths(data, [
    [indexOf('W'), indexOf('A'), 1],
  ]);

  it('matches known arrivals with zero, one, and two transfers', () => {
    const oneRide = run(1);
    expect(read(oneRide, 'A')).toBe(479);
    expect(read(oneRide, 'B')).toBe(490);
    expect(read(oneRide, 'C')).toBe(UNREACHED);

    const oneTransfer = run(2);
    expect(read(oneTransfer, 'C')).toBe(505);
    expect(read(oneTransfer, 'D')).toBe(UNREACHED);

    const twoTransfers = run(3);
    expect(read(twoTransfers, 'D')).toBe(520);
  });

  it('combines the previous service day 24h+ trip with the query timeline', () => {
    const result = route(data, {
      kind: 'earliestArrival',
      origins: [{ stopIndex: indexOf('N1'), departure: 55 }],
      serviceDate: '2026-07-08',
      maxRounds: 1,
    });

    expect(read(result.arrival, 'N2')).toBe(70);
  });

  it('never worsens arrivals when maxRounds increases', () => {
    const results = [0, 1, 2, 3, 4].map(run);

    for (let round = 1; round < results.length; round += 1) {
      const previous = results[round - 1];
      const current = results[round];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      current?.forEach((arrival, index) => {
        expect(arrival).toBeLessThanOrEqual(previous?.[index] ?? UNREACHED);
      });
    }
  });

  it('uses an initial walk before the first transit round', () => {
    const result = route(transferData, {
      kind: 'earliestArrival',
      origins: [{ stopIndex: indexOf('W'), departure: 478 }],
      serviceDate: '20260707',
      maxRounds: 1,
    });

    expect(read(result.arrival, 'A')).toBe(479);
    expect(read(result.arrival, 'B')).toBe(490);
  });

  it('relaxes a footpath between transit rounds without worsening labels', () => {
    const firstRound = runTransfers([{ stopIndex: indexOf('A'), departure: 479 }], 1);
    const secondRound = runTransfers([{ stopIndex: indexOf('A'), departure: 479 }], 2);

    expect(read(firstRound, 'E')).toBe(493);
    expect(read(firstRound, 'F')).toBe(UNREACHED);
    expect(read(secondRound, 'F')).toBe(515);
    secondRound.forEach((arrival, index) => {
      expect(arrival).toBeLessThanOrEqual(firstRound[index] ?? UNREACHED);
    });
  });

  it('returns the element-wise minimum of each origin searched alone', () => {
    const origins = [
      { stopIndex: indexOf('A'), departure: 499 },
      { stopIndex: indexOf('C'), departure: 509 },
      { stopIndex: indexOf('W'), departure: 478 },
    ];
    const singles = origins.map((origin) => runTransfers([origin], 3));
    const combined = runTransfers(origins, 3);

    combined.forEach((arrival, index) => {
      const expected = Math.min(...singles.map((single) => single[index] ?? UNREACHED));
      expect(arrival).toBe(expected);
    });
  });

  it('matches known latest departures with zero, one, and two transfers', () => {
    const query = {
      kind: 'latestDeparture' as const,
      destinations: [{ stopIndex: indexOf('D'), arrival: 520 }],
      serviceDate: '2026-07-07',
    };

    const oneRide = route(data, { ...query, maxRounds: 1 }).departure;
    expect(read(oneRide, 'C')).toBe(510);
    expect(read(oneRide, 'B')).toBe(UNREACHED);

    const oneTransfer = route(data, { ...query, maxRounds: 2 }).departure;
    expect(read(oneTransfer, 'B')).toBe(495);
    expect(read(oneTransfer, 'A')).toBe(UNREACHED);

    const twoTransfers = route(data, { ...query, maxRounds: 3 }).departure;
    expect(read(twoTransfers, 'A')).toBe(480);
  });

  it('uses the next service day on the reverse query timeline', () => {
    const result = route(data, {
      kind: 'latestDeparture',
      destinations: [{ stopIndex: indexOf('B'), arrival: 1950 }],
      serviceDate: '20260705',
      maxRounds: 1,
    });

    expect(read(result.departure, 'A')).toBe(1940);
  });

  it('relaxes asymmetric footpaths in the inbound direction', () => {
    const result = route(asymmetricTransferData, {
      kind: 'latestDeparture',
      destinations: [{ stopIndex: indexOf('B'), arrival: 490 }],
      serviceDate: '20260707',
      maxRounds: 1,
    });

    expect(read(result.departure, 'A')).toBe(480);
    expect(read(result.departure, 'W')).toBe(479);
  });

  it('chooses the element-wise latest departure across destinations', () => {
    const result = route(data, {
      kind: 'latestDeparture',
      destinations: [
        { stopIndex: indexOf('D'), arrival: 520 },
        { stopIndex: indexOf('B'), arrival: 510 },
      ],
      serviceDate: '20260707',
      maxRounds: 3,
    });

    expect(read(result.departure, 'A')).toBe(500);
    expect(read(result.departure, 'B')).toBe(510);
  });

  it('matches a brute-force forward search for every fixture stop', () => {
    const deadline = 515;
    const maxRounds = 2;
    const destination = indexOf('F');
    const reverse = route(transferData, {
      kind: 'latestDeparture',
      destinations: [{ stopIndex: destination, arrival: deadline }],
      serviceDate: '20260707',
      maxRounds,
    }).departure;

    data.stopIds.forEach((_, origin) => {
      let expected = UNREACHED;
      for (let departure = 0; departure <= deadline; departure += 1) {
        const arrival = route(transferData, {
          kind: 'earliestArrival',
          origins: [{ stopIndex: origin, departure }],
          serviceDate: '20260707',
          maxRounds,
        }).arrival[destination] ?? UNREACHED;
        if (arrival <= deadline) {
          expected = departure;
        }
      }
      expect(reverse[origin], `stop ${data.stopNames[origin] ?? String(origin)}`).toBe(expected);
    });
  });

  function run(maxRounds: number): Uint16Array {
    return route(data, {
      kind: 'earliestArrival',
      origins: [{ stopIndex: indexOf('A'), departure: 479 }],
      serviceDate: '20260707',
      maxRounds,
    }).arrival;
  }

  function runTransfers(
    origins: readonly { readonly stopIndex: number; readonly departure: number }[],
    maxRounds: number,
  ): Uint16Array {
    return route(transferData, {
      kind: 'earliestArrival',
      origins,
      serviceDate: '20260707',
      maxRounds,
    }).arrival;
  }

  function indexOf(id: string): number {
    const index = stopIndex.get(prefixedId(id));
    if (index === undefined) {
      throw new Error(`Unknown fixture stop: ${id}`);
    }
    return index;
  }

  function read(arrival: Uint16Array, id: string): number {
    return arrival[indexOf(id)] ?? UNREACHED;
  }
});

const miniGtfs: NormalizedGtfs = {
  agencyId: 'mini',
  idPrefix: 'mini',
  stops: ['A', 'B', 'C', 'D', 'E', 'F', 'N1', 'N2', 'W'].map((id, index) => ({
    stopId: prefixedId(id),
    stopName: id,
    stopLat: 35 + index * 0.01,
    stopLon: 136 + index * 0.01,
  })),
  routes: ['AB', 'BC', 'CD', 'EF', 'N'].map((id) => ({
    routeId: prefixedId(id),
    routeShortName: id,
    routeLongName: id,
    routeType: 3,
  })),
  trips: [
    trip('AB1', 'AB'),
    trip('AB2', 'AB'),
    trip('BC1', 'BC'),
    trip('CD1', 'CD'),
    trip('EF1', 'EF'),
    trip('N1', 'N'),
  ],
  stopTimes: [
    ...times('AB1', ['A', 'B'], [480, 490]),
    ...times('AB2', ['A', 'B'], [500, 510]),
    ...times('BC1', ['B', 'C'], [495, 505]),
    ...times('CD1', ['C', 'D'], [510, 520]),
    ...times('EF1', ['E', 'F'], [495, 515]),
    ...times('N1', ['N1', 'N2'], [1500, 1510]),
  ],
  calendar: [
    {
      serviceId: prefixedId('WKD'),
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

function trip(tripId: string, routeId: string) {
  return {
    tripId: prefixedId(tripId),
    routeId: prefixedId(routeId),
    serviceId: prefixedId('WKD'),
  };
}

function times(
  tripId: string,
  stopIds: readonly string[],
  minutes: readonly number[],
): NormalizedStopTime[] {
  return stopIds.map((stopId, index) => {
    const minute = minutes[index];
    if (minute === undefined) {
      throw new Error(`Missing fixture time for ${tripId} at ${stopId}.`);
    }
    return {
      tripId: prefixedId(tripId),
      stopId: prefixedId(stopId),
      stopSequence: index + 1,
      arrivalTime: minute,
      departureTime: minute,
    };
  });
}

function prefixedId(id: string): PrefixedId {
  return `mini:${id}` as PrefixedId;
}

function withFootpaths(
  data: LoadedTimetable,
  undirectedEdges: readonly (readonly [number, number, number])[],
): LoadedTimetable {
  const edges = Array.from({ length: data.stopIds.length }, () => new Map<number, number>());
  for (const [from, to, duration] of undirectedEdges) {
    edges[from]?.set(to, duration);
    edges[to]?.set(from, duration);
  }

  const offsets = [0];
  const targetStopIndices: number[] = [];
  const durations: number[] = [];
  edges.forEach((targets) => {
    for (const [target, duration] of [...targets].sort(([a], [b]) => a - b)) {
      targetStopIndices.push(target);
      durations.push(duration);
    }
    offsets.push(targetStopIndices.length);
  });

  return {
    ...data,
    footpaths: {
      stopIndices: Int32Array.from(data.stopIds.map((_, index) => index)),
      offsets: Int32Array.from(offsets),
      targetStopIndices: Int32Array.from(targetStopIndices),
      durations: Uint16Array.from(durations),
    },
  };
}

function withDirectedFootpaths(
  data: LoadedTimetable,
  directedEdges: readonly (readonly [number, number, number])[],
): LoadedTimetable {
  const edges = Array.from({ length: data.stopIds.length }, () => new Map<number, number>());
  for (const [from, to, duration] of directedEdges) {
    edges[from]?.set(to, duration);
  }

  const offsets = [0];
  const targetStopIndices: number[] = [];
  const durations: number[] = [];
  edges.forEach((targets) => {
    for (const [target, duration] of [...targets].sort(([a], [b]) => a - b)) {
      targetStopIndices.push(target);
      durations.push(duration);
    }
    offsets.push(targetStopIndices.length);
  });

  return {
    ...data,
    footpaths: {
      stopIndices: Int32Array.from(data.stopIds.map((_, index) => index)),
      offsets: Int32Array.from(offsets),
      targetStopIndices: Int32Array.from(targetStopIndices),
      durations: Uint16Array.from(durations),
    },
  };
}
