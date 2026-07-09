import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import {
  type MinutesSinceServiceDayStart,
  type NormalizedCalendar,
  type NormalizedCalendarDate,
  type NormalizedGtfs,
  type NormalizedRoute,
  type NormalizedStop,
  type NormalizedStopTime,
  type NormalizedTrip,
  type PrefixedId,
} from '@isochrone/gtfs-types';
import { unzipSync } from 'fflate';

import { parseCsvRecords, type CsvRecord } from './csv.js';

export interface ParseGtfsOptions {
  readonly agencyId: string;
  readonly idPrefix: string;
}

export interface GtfsStats {
  readonly stops: number;
  readonly routes: number;
  readonly trips: number;
  readonly stopTimes: number;
  readonly maxStopTimeMinutes: number;
}

const decoder = new TextDecoder('utf-8');

export async function parseGtfsZipFile(
  zipPath: string,
  options: ParseGtfsOptions,
): Promise<NormalizedGtfs> {
  return parseGtfsZip(await readFile(zipPath), options);
}

export function parseGtfsZip(zipBytes: Uint8Array, options: ParseGtfsOptions): NormalizedGtfs {
  const entries = unzipSync(zipBytes);

  return {
    agencyId: options.agencyId,
    idPrefix: options.idPrefix,
    stops: parseStops(readGtfsText(entries, 'stops.txt'), options.idPrefix),
    routes: parseRoutes(readGtfsText(entries, 'routes.txt'), options.idPrefix),
    trips: parseTrips(readGtfsText(entries, 'trips.txt'), options.idPrefix),
    stopTimes: parseStopTimes(readGtfsText(entries, 'stop_times.txt'), options.idPrefix),
    calendar: parseCalendar(readGtfsText(entries, 'calendar.txt'), options.idPrefix),
    calendarDates: parseCalendarDates(readGtfsText(entries, 'calendar_dates.txt'), options.idPrefix),
  };
}

export function getGtfsStats(gtfs: NormalizedGtfs): GtfsStats {
  let maxStopTimeMinutes = 0;
  for (const stopTime of gtfs.stopTimes) {
    maxStopTimeMinutes = Math.max(maxStopTimeMinutes, stopTime.arrivalTime, stopTime.departureTime);
  }

  return {
    stops: gtfs.stops.length,
    routes: gtfs.routes.length,
    trips: gtfs.trips.length,
    stopTimes: gtfs.stopTimes.length,
    maxStopTimeMinutes,
  };
}

export function parseGtfsTimeToMinutes(value: string): MinutesSinceServiceDayStart {
  const match = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(value);
  if (match === null) {
    throw new Error(`Invalid GTFS time: ${value}`);
  }

  const [, hours, minutes, seconds] = match;
  if (hours === undefined || minutes === undefined || seconds === undefined) {
    throw new Error(`Invalid GTFS time: ${value}`);
  }

  return Number(hours) * 60 + Number(minutes) + Math.floor(Number(seconds) / 60);
}

function parseStops(text: string, idPrefix: string): NormalizedStop[] {
  return parseCsvRecords(text, 'stops.txt', ['stop_id', 'stop_name', 'stop_lat', 'stop_lon']).map(
    (record) => ({
      stopId: prefixId(idPrefix, readRequired(record, 'stop_id')),
      stopName: readRequired(record, 'stop_name'),
      stopLat: readNumber(record, 'stop_lat'),
      stopLon: readNumber(record, 'stop_lon'),
      ...readOptionalString(record, 'stop_code', 'stopCode'),
      ...readOptionalString(record, 'stop_name_kana', 'stopNameKana'),
    }),
  );
}

function parseRoutes(text: string, idPrefix: string): NormalizedRoute[] {
  return parseCsvRecords(text, 'routes.txt', ['route_id', 'route_type']).map((record) => ({
    routeId: prefixId(idPrefix, readRequired(record, 'route_id')),
    routeShortName: record.route_short_name ?? '',
    routeLongName: record.route_long_name ?? '',
    routeType: readInteger(record, 'route_type'),
  }));
}

function parseTrips(text: string, idPrefix: string): NormalizedTrip[] {
  return parseCsvRecords(text, 'trips.txt', ['route_id', 'service_id', 'trip_id']).map((record) => ({
    tripId: prefixId(idPrefix, readRequired(record, 'trip_id')),
    routeId: prefixId(idPrefix, readRequired(record, 'route_id')),
    serviceId: prefixId(idPrefix, readRequired(record, 'service_id')),
    ...readOptionalString(record, 'trip_headsign', 'tripHeadsign'),
    ...readOptionalInteger(record, 'direction_id', 'directionId'),
  }));
}

function parseStopTimes(text: string, idPrefix: string): NormalizedStopTime[] {
  return parseCsvRecords(text, 'stop_times.txt', [
    'trip_id',
    'arrival_time',
    'departure_time',
    'stop_id',
    'stop_sequence',
  ]).map((record) => ({
    tripId: prefixId(idPrefix, readRequired(record, 'trip_id')),
    stopId: prefixId(idPrefix, readRequired(record, 'stop_id')),
    stopSequence: readInteger(record, 'stop_sequence'),
    arrivalTime: parseGtfsTimeToMinutes(readRequired(record, 'arrival_time')),
    departureTime: parseGtfsTimeToMinutes(readRequired(record, 'departure_time')),
  }));
}

function parseCalendar(text: string, idPrefix: string): NormalizedCalendar[] {
  return parseCsvRecords(text, 'calendar.txt', [
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
  ]).map((record) => ({
    serviceId: prefixId(idPrefix, readRequired(record, 'service_id')),
    monday: readBooleanBit(record, 'monday'),
    tuesday: readBooleanBit(record, 'tuesday'),
    wednesday: readBooleanBit(record, 'wednesday'),
    thursday: readBooleanBit(record, 'thursday'),
    friday: readBooleanBit(record, 'friday'),
    saturday: readBooleanBit(record, 'saturday'),
    sunday: readBooleanBit(record, 'sunday'),
    startDate: readRequired(record, 'start_date'),
    endDate: readRequired(record, 'end_date'),
  }));
}

function parseCalendarDates(text: string, idPrefix: string): NormalizedCalendarDate[] {
  return parseCsvRecords(text, 'calendar_dates.txt', ['service_id', 'date', 'exception_type']).map(
    (record) => ({
      serviceId: prefixId(idPrefix, readRequired(record, 'service_id')),
      date: readRequired(record, 'date'),
      exceptionType: readExceptionType(record, 'exception_type'),
    }),
  );
}

function readGtfsText(entries: Readonly<Record<string, Uint8Array>>, fileName: string): string {
  const entry = Object.entries(entries).find(([path]) => basename(path) === fileName);
  if (entry === undefined) {
    throw new Error(`GTFS zip is missing required file: ${fileName}`);
  }

  const [, bytes] = entry;
  if (bytes.length === 0) {
    throw new Error(`GTFS file is empty: ${fileName}`);
  }

  return decoder.decode(bytes);
}

function prefixId(prefix: string, id: string): PrefixedId {
  return `${prefix}:${id}`;
}

function readRequired(record: CsvRecord, key: string): string {
  const value = record[key];
  if (value === undefined || value.length === 0) {
    throw new Error(`GTFS row is missing required value: ${key}`);
  }
  return value;
}

function readNumber(record: CsvRecord, key: string): number {
  const value = Number(readRequired(record, key));
  if (!Number.isFinite(value)) {
    throw new Error(`GTFS row has invalid number at ${key}.`);
  }
  return value;
}

function readInteger(record: CsvRecord, key: string): number {
  const value = readNumber(record, key);
  if (!Number.isInteger(value)) {
    throw new Error(`GTFS row has invalid integer at ${key}.`);
  }
  return value;
}

function readBooleanBit(record: CsvRecord, key: string): boolean {
  const value = readRequired(record, key);
  if (value === '0') {
    return false;
  }
  if (value === '1') {
    return true;
  }
  throw new Error(`GTFS row has invalid boolean bit at ${key}.`);
}

function readExceptionType(record: CsvRecord, key: string): 1 | 2 {
  const value = readInteger(record, key);
  if (value === 1 || value === 2) {
    return value;
  }
  throw new Error(`GTFS row has invalid exception_type: ${String(value)}`);
}

function readOptionalString<T extends string>(
  record: CsvRecord,
  csvKey: string,
  outputKey: T,
): Partial<Record<T, string>> {
  const value = record[csvKey];
  return value === undefined || value.length === 0 ? {} : { [outputKey]: value } as Record<T, string>;
}

function readOptionalInteger<T extends string>(
  record: CsvRecord,
  csvKey: string,
  outputKey: T,
): Partial<Record<T, number>> {
  const value = record[csvKey];
  return value === undefined || value.length === 0
    ? {}
    : { [outputKey]: readInteger(record, csvKey) } as Record<T, number>;
}
