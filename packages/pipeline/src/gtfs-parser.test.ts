import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { getGtfsStats, parseGtfsTimeToMinutes, parseGtfsZip } from './gtfs-parser.js';

const parseOptions = {
  agencyId: 'nagoya-cbus',
  idPrefix: 'nagoya-cbus',
};

describe('parseGtfsTimeToMinutes', () => {
  it('keeps 24h+ GTFS times on the service-day timeline', () => {
    expect(parseGtfsTimeToMinutes('26:15:00')).toBe(1575);
  });
});

describe('parseGtfsZip', () => {
  it('normalizes ids and parses a small GTFS fixture', () => {
    const gtfs = parseGtfsZip(createFixtureZip(), parseOptions);

    expect(gtfs.stops[0]).toMatchObject({
      stopId: 'nagoya-cbus:S1',
      stopName: 'Stop 1',
      stopLat: 35.1,
      stopLon: 136.9,
    });
    expect(gtfs.routes[0]?.routeId).toBe('nagoya-cbus:R1');
    expect(gtfs.trips[0]?.serviceId).toBe('nagoya-cbus:WKD');
    expect(gtfs.stopTimes[1]).toMatchObject({
      tripId: 'nagoya-cbus:T1',
      stopId: 'nagoya-cbus:S2',
      stopSequence: 2,
      arrivalTime: 1575,
      departureTime: 1575,
    });
    expect(getGtfsStats(gtfs)).toEqual({
      stops: 2,
      routes: 1,
      trips: 1,
      stopTimes: 2,
      maxStopTimeMinutes: 1575,
    });
  });

  it('fails when a required column is missing', () => {
    const zip = createFixtureZip({
      'trips.txt': csv([
        ['route_id', 'trip_id'],
        ['R1', 'T1'],
      ]),
    });

    expect(() => parseGtfsZip(zip, parseOptions)).toThrow(
      'GTFS file trips.txt is missing required column: service_id',
    );
  });

  it('fails when a required file is empty', () => {
    const zip = createFixtureZip({
      'stops.txt': '',
    });

    expect(() => parseGtfsZip(zip, parseOptions)).toThrow('GTFS file is empty: stops.txt');
  });
});

function createFixtureZip(overrides: Readonly<Record<string, string>> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries({ ...baseFixtureFiles, ...overrides })) {
    files[path] = new TextEncoder().encode(content);
  }
  return zipSync(files);
}

const baseFixtureFiles = {
  'stops.txt': csv([
    ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'],
    ['S1', 'Stop 1', '35.1', '136.9'],
    ['S2', 'Stop 2', '35.2', '137.0'],
  ]),
  'routes.txt': csv([
    ['route_id', 'route_short_name', 'route_long_name', 'route_type'],
    ['R1', '幹1', 'Main Route', '3'],
  ]),
  'trips.txt': csv([
    ['route_id', 'service_id', 'trip_id', 'trip_headsign'],
    ['R1', 'WKD', 'T1', 'Terminal'],
  ]),
  'stop_times.txt': csv([
    ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
    ['T1', '08:00:00', '08:00:00', 'S1', '1'],
    ['T1', '26:15:00', '26:15:00', 'S2', '2'],
  ]),
  'calendar.txt': csv([
    [
      'service_id',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
      'start_date',
      'end_date',
    ],
    ['WKD', '1', '1', '1', '1', '1', '0', '0', '20260328', '20270430'],
  ]),
  'calendar_dates.txt': csv([
    ['service_id', 'date', 'exception_type'],
    ['WKD', '20260506', '2'],
  ]),
};

function csv(rows: readonly (readonly string[])[]): string {
  return `${rows.map((row) => row.join(',')).join('\n')}\n`;
}
