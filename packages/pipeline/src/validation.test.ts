import { type BrowserTimetableDataset, type NormalizedGtfs } from '@isochrone/gtfs-types';
import { describe, expect, it } from 'vitest';

import { buildBrowserDatasetFiles } from './dataset.js';
import { validateBrowserDataset } from './validation.js';

const fixtureRanges = {
  stops: { min: 1, max: 10 },
  patterns: { min: 1, max: 10 },
  trips: { min: 1, max: 10 },
};

describe('validateBrowserDataset', () => {
  it('passes generated browser dataset files and reports stats', () => {
    const files = buildBrowserDatasetFiles(fixture, { feedVersion: '2026-07-01T00:00:00Z' });
    const result = validateBrowserDataset(files, {
      ranges: fixtureRanges,
      goldenStats: {
        stops: 2,
        patterns: 1,
        trips: 1,
        calendarDates: 1,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.stats).toMatchObject({
      stops: 2,
      routes: 1,
      patterns: 1,
      trips: 1,
      services: 1,
      calendarDates: 1,
      warnings: 0,
    });
  });

  it('fails when a pattern references a missing stop', () => {
    const files = buildBrowserDatasetFiles(fixture, { feedVersion: '2026-07-01T00:00:00Z' });
    const timetable: BrowserTimetableDataset = {
      ...files.timetable,
      patterns: {
        ...files.timetable.patterns,
        stopIds: ['nagoya-cbus:missing', ...files.timetable.patterns.stopIds.slice(1)],
      },
    };
    const result = validateBrowserDataset({ ...files, timetable }, { ranges: fixtureRanges });

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'missing-stop-ref' }));
  });

  it('fails when a trip has decreasing times', () => {
    const files = buildBrowserDatasetFiles(fixture, { feedVersion: '2026-07-01T00:00:00Z' });
    const timeDeltas = [...files.timetable.trips.timeDeltas];
    timeDeltas[1] = -1;
    const timetable: BrowserTimetableDataset = {
      ...files.timetable,
      trips: {
        ...files.timetable.trips,
        timeDeltas,
      },
    };
    const result = validateBrowserDataset({ ...files, timetable }, { ranges: fixtureRanges });

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'decreasing-trip-time' }));
  });
});

const fixture: NormalizedGtfs = {
  agencyId: 'nagoya-cbus',
  idPrefix: 'nagoya-cbus',
  stops: [
    {
      stopId: 'nagoya-cbus:S1',
      stopName: 'Stop 1',
      stopLat: 35.17,
      stopLon: 136.91,
    },
    {
      stopId: 'nagoya-cbus:S2',
      stopName: 'Stop 2',
      stopLat: 35.1709,
      stopLon: 136.91,
    },
  ],
  routes: [
    {
      routeId: 'nagoya-cbus:R1',
      routeShortName: 'R1',
      routeLongName: 'Route 1',
      routeType: 3,
    },
  ],
  trips: [
    {
      tripId: 'nagoya-cbus:T1',
      routeId: 'nagoya-cbus:R1',
      serviceId: 'nagoya-cbus:WKD',
    },
  ],
  stopTimes: [
    {
      tripId: 'nagoya-cbus:T1',
      stopId: 'nagoya-cbus:S1',
      stopSequence: 1,
      arrivalTime: 480,
      departureTime: 480,
    },
    {
      tripId: 'nagoya-cbus:T1',
      stopId: 'nagoya-cbus:S2',
      stopSequence: 2,
      arrivalTime: 500,
      departureTime: 500,
    },
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
  ],
  calendarDates: [
    {
      serviceId: 'nagoya-cbus:WKD',
      date: '20260720',
      exceptionType: 2,
    },
  ],
};
