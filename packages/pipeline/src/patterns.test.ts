import { describe, expect, it } from 'vitest';

import {
  buildCompactTimetable,
  countRoundTripMismatches,
  decodeTripTimes,
  getCompactTimetableStats,
} from './patterns.js';
import { type NormalizedGtfs } from '@isochrone/gtfs-types';

describe('buildCompactTimetable', () => {
  it('groups trips by stop pattern and round-trips delta encoded times', () => {
    const timetable = buildCompactTimetable(fixture);

    expect(timetable.patternStopOffsets).toEqual([0, 2, 4]);
    expect(timetable.patternStopIds).toEqual([
      'nagoya-cbus:S1',
      'nagoya-cbus:S2',
      'nagoya-cbus:S1',
      'nagoya-cbus:S3',
    ]);
    expect(timetable.tripIds).toEqual(['nagoya-cbus:T2', 'nagoya-cbus:T1', 'nagoya-cbus:T3']);
    expect(decodeTripTimes(timetable, 1)).toEqual([480, 480, 500, 500]);
    expect(countRoundTripMismatches(fixture, timetable)).toBe(0);
    expect(getCompactTimetableStats(fixture, timetable)).toEqual({
      patterns: 2,
      trips: 3,
      stopTimes: 6,
      encodedTimeValues: 12,
      roundTripMismatches: 0,
      warnings: 0,
    });
  });

  it('records a warning for decreasing trip times before encoding', () => {
    const timetable = buildCompactTimetable({
      ...fixture,
      stopTimes: [
        {
          tripId: 'nagoya-cbus:T1',
          stopId: 'nagoya-cbus:S1',
          stopSequence: 1,
          arrivalTime: 500,
          departureTime: 500,
        },
        {
          tripId: 'nagoya-cbus:T1',
          stopId: 'nagoya-cbus:S2',
          stopSequence: 2,
          arrivalTime: 490,
          departureTime: 490,
        },
      ],
    });

    expect(timetable.warnings).toContain('Trip has decreasing times: nagoya-cbus:T1');
  });
});

const fixture: NormalizedGtfs = {
  agencyId: 'nagoya-cbus',
  idPrefix: 'nagoya-cbus',
  stops: [
    { stopId: 'nagoya-cbus:S1', stopName: 'Stop 1', stopLat: 35.1, stopLon: 136.9 },
    { stopId: 'nagoya-cbus:S2', stopName: 'Stop 2', stopLat: 35.2, stopLon: 137.0 },
    { stopId: 'nagoya-cbus:S3', stopName: 'Stop 3', stopLat: 35.3, stopLon: 137.1 },
  ],
  routes: [{ routeId: 'nagoya-cbus:R1', routeShortName: 'R1', routeLongName: 'Route 1', routeType: 3 }],
  trips: [
    { tripId: 'nagoya-cbus:T1', routeId: 'nagoya-cbus:R1', serviceId: 'nagoya-cbus:WKD' },
    { tripId: 'nagoya-cbus:T2', routeId: 'nagoya-cbus:R1', serviceId: 'nagoya-cbus:WKD' },
    { tripId: 'nagoya-cbus:T3', routeId: 'nagoya-cbus:R1', serviceId: 'nagoya-cbus:SAT' },
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
    {
      tripId: 'nagoya-cbus:T2',
      stopId: 'nagoya-cbus:S1',
      stopSequence: 1,
      arrivalTime: 470,
      departureTime: 470,
    },
    {
      tripId: 'nagoya-cbus:T2',
      stopId: 'nagoya-cbus:S2',
      stopSequence: 2,
      arrivalTime: 490,
      departureTime: 490,
    },
    {
      tripId: 'nagoya-cbus:T3',
      stopId: 'nagoya-cbus:S1',
      stopSequence: 1,
      arrivalTime: 510,
      departureTime: 510,
    },
    {
      tripId: 'nagoya-cbus:T3',
      stopId: 'nagoya-cbus:S3',
      stopSequence: 2,
      arrivalTime: 530,
      departureTime: 530,
    },
  ],
  calendar: [],
  calendarDates: [],
};
