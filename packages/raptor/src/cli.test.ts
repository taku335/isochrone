import {
  type NormalizedGtfs,
  type NormalizedStopTime,
  type PrefixedId,
} from '@isochrone/gtfs-types';
import { buildBrowserDatasetFiles } from '@isochrone/pipeline';
import { describe, expect, it } from 'vitest';

import { benchmarkRaptor, runRaptorCli } from './cli.js';
import { loadTimetable } from './index.js';

describe('benchmarkRaptor', () => {
  it('reports a known arrival, sanity status, and median duration', () => {
    const result = benchmarkRaptor(data, {
      stopName: 'Alpha',
      serviceDate: '20260707',
      departure: 479,
      representativeStopNames: ['Beta'],
      runs: 4,
      warmupRuns: 1,
      now: tickingClock(5),
    });

    expect(result).toMatchObject({
      query: { originStopCount: 1, departure: '07:59' },
      dataset: { feedVersion: 'snapshot-v1', stops: 2, trips: 1 },
      result: {
        reachableStops: 2,
        representatives: [{ stopName: 'Beta', stopCount: 1, arrival: '08:10', arrivalMinute: 490 }],
      },
      performance: {
        warmupRuns: 1,
        measuredRuns: 4,
        durationsMs: [5, 5, 5, 5],
        medianMs: 5,
        targetMs: 200,
        withinTarget: true,
      },
      sanity: { ok: true, issues: [] },
    });
  });

  it('rejects an unknown exact stop name', () => {
    expect(() => benchmarkRaptor(data, {
      stopName: 'Missing',
      serviceDate: '20260707',
      departure: 480,
    })).toThrow('No stops found with exact name: Missing');
  });

  it('flags a result where nothing beyond the origin is reachable', () => {
    const result = benchmarkRaptor(data, {
      stopName: 'Alpha',
      serviceDate: '20260707',
      departure: 479,
      maxRounds: 0,
      runs: 1,
      warmupRuns: 0,
      now: tickingClock(1),
    });

    expect(result.sanity).toEqual({
      ok: false,
      issues: ['No stops beyond the origin poles are reachable.'],
    });
  });
});

describe('runRaptorCli', () => {
  it('parses CLI arguments and writes the benchmark JSON', async () => {
    const output: string[] = [];
    const exitCode = await runRaptorCli(
      ['--', 'Alpha', '2026-07-07', '07:59', '--representative', 'Beta', '--runs', '2', '--warmup', '0'],
      (message) => output.push(message),
      () => undefined,
      { loadData: () => Promise.resolve(data), now: tickingClock(3) },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(output[0] ?? '{}')).toMatchObject({
      query: { stopName: 'Alpha', serviceDate: '2026-07-07' },
      result: { representatives: [{ stopName: 'Beta', arrival: '08:10' }] },
      performance: { medianMs: 3 },
    });
  });
});

function tickingClock(step: number): () => number {
  let current = 0;
  return () => {
    const value = current;
    current += step;
    return value;
  };
}

const miniGtfs: NormalizedGtfs = {
  agencyId: 'mini',
  idPrefix: 'mini',
  stops: [
    { stopId: id('A'), stopName: 'Alpha', stopLat: 35, stopLon: 136 },
    { stopId: id('B'), stopName: 'Beta', stopLat: 35.01, stopLon: 136.01 },
  ],
  routes: [
    { routeId: id('R'), routeShortName: 'R', routeLongName: 'Route', routeType: 3 },
  ],
  trips: [{ tripId: id('T'), routeId: id('R'), serviceId: id('WKD') }],
  stopTimes: [stopTime('A', 1, 480), stopTime('B', 2, 490)],
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

const data = loadTimetable(buildBrowserDatasetFiles(miniGtfs, { feedVersion: 'snapshot-v1' }));

function stopTime(stopId: string, stopSequence: number, minute: number): NormalizedStopTime {
  return {
    tripId: id('T'),
    stopId: id(stopId),
    stopSequence,
    arrivalTime: minute,
    departureTime: minute,
  };
}

function id(value: string): PrefixedId {
  return `mini:${value}` as PrefixedId;
}
