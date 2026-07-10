import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import {
  type BrowserDatasetFile,
  type BrowserDatasetManifest,
  type BrowserDatasetServicePeriod,
  type BrowserStopsDataset,
  type BrowserTimetableDataset,
  type NormalizedCalendar,
  type NormalizedCalendarDate,
  type NormalizedGtfs,
  type NormalizedRoute,
  type NormalizedStop,
  type NormalizedTrip,
  type PrefixedId,
} from '@isochrone/gtfs-types';

import { type FootpathConfig } from './agencies.js';
import { buildFootpaths, DEFAULT_FOOTPATH_CONFIG } from './footpaths.js';
import { buildCompactTimetable } from './patterns.js';

export const DEFAULT_DATASET_SIZE_LIMIT_BYTES = 1_500_000;

export interface BuildBrowserDatasetOptions {
  readonly feedVersion: string;
  readonly footpathConfig?: FootpathConfig;
  readonly sizeLimitBytes?: number;
}

export interface BrowserDatasetFiles {
  readonly manifest: BrowserDatasetManifest;
  readonly stops: BrowserStopsDataset;
  readonly timetable: BrowserTimetableDataset;
  readonly manifestBytes: Uint8Array;
  readonly stopsBytes: Uint8Array;
  readonly timetableBytes: Uint8Array;
  readonly manifestGzipBytes: number;
  readonly totalGzipBytes: number;
}

export interface WriteBrowserDatasetOptions extends BuildBrowserDatasetOptions {
  readonly outDir: string;
}

export interface WriteBrowserDatasetResult {
  readonly manifest: BrowserDatasetManifest;
  readonly outDir: string;
  readonly manifestPath: string;
  readonly stopsPath: string;
  readonly timetablePath: string;
  readonly manifestGzipBytes: number;
  readonly totalGzipBytes: number;
}

interface FilePayload<T> {
  readonly value: T;
  readonly bytes: Uint8Array;
  readonly file: BrowserDatasetFile;
}

export class DatasetSizeLimitError extends Error {
  constructor(
    readonly totalGzipBytes: number,
    readonly limitBytes: number,
  ) {
    super(
      `Browser dataset gzip size ${String(totalGzipBytes)} bytes exceeds limit ${String(limitBytes)} bytes.`,
    );
  }
}

export function buildBrowserDatasetFiles(
  gtfs: NormalizedGtfs,
  options: BuildBrowserDatasetOptions,
): BrowserDatasetFiles {
  const limitBytes = options.sizeLimitBytes ?? DEFAULT_DATASET_SIZE_LIMIT_BYTES;
  const stopsPayload = createFilePayload('stops', buildBrowserStopsDataset(gtfs, options.footpathConfig));
  const timetablePayload = createFilePayload('timetable', buildBrowserTimetableDataset(gtfs));
  const manifest: BrowserDatasetManifest = {
    formatVersion: 1,
    agencyId: gtfs.agencyId,
    feedVersion: options.feedVersion,
    servicePeriod: getServicePeriod(gtfs),
    files: {
      stops: stopsPayload.file,
      timetable: timetablePayload.file,
    },
    sizeGate: {
      limitBytes,
      dataGzipBytes: stopsPayload.file.gzipBytes + timetablePayload.file.gzipBytes,
    },
  };
  const manifestBytes = toJsonBytes(manifest);
  const manifestGzipBytes = getGzipBytes(manifestBytes);
  const totalGzipBytes = manifestGzipBytes + manifest.sizeGate.dataGzipBytes;

  if (totalGzipBytes > limitBytes) {
    throw new DatasetSizeLimitError(totalGzipBytes, limitBytes);
  }

  return {
    manifest,
    stops: stopsPayload.value,
    timetable: timetablePayload.value,
    manifestBytes,
    stopsBytes: stopsPayload.bytes,
    timetableBytes: timetablePayload.bytes,
    manifestGzipBytes,
    totalGzipBytes,
  };
}

export async function writeBrowserDataset(
  gtfs: NormalizedGtfs,
  options: WriteBrowserDatasetOptions,
): Promise<WriteBrowserDatasetResult> {
  const files = buildBrowserDatasetFiles(gtfs, options);
  const stopsPath = join(options.outDir, files.manifest.files.stops.path);
  const timetablePath = join(options.outDir, files.manifest.files.timetable.path);
  const manifestPath = join(options.outDir, 'manifest.json');

  await mkdir(options.outDir, { recursive: true });
  await Promise.all([
    writeFile(stopsPath, files.stopsBytes),
    writeFile(timetablePath, files.timetableBytes),
    writeFile(manifestPath, files.manifestBytes),
  ]);

  return {
    manifest: files.manifest,
    outDir: options.outDir,
    manifestPath,
    stopsPath,
    timetablePath,
    manifestGzipBytes: files.manifestGzipBytes,
    totalGzipBytes: files.totalGzipBytes,
  };
}

export function buildBrowserStopsDataset(
  gtfs: NormalizedGtfs,
  footpathConfig: FootpathConfig = DEFAULT_FOOTPATH_CONFIG,
): BrowserStopsDataset {
  const stops = sortStops(gtfs.stops);
  const footpaths = buildFootpaths(stops, footpathConfig);

  return {
    formatVersion: 1,
    agencyId: gtfs.agencyId,
    stops: {
      ids: stops.map((stop) => stop.stopId),
      names: stops.map((stop) => stop.stopName),
      nameKanas: stops.map((stop) => stop.stopNameKana ?? null),
      codes: stops.map((stop) => stop.stopCode ?? null),
      lats: stops.map((stop) => stop.stopLat),
      lons: stops.map((stop) => stop.stopLon),
    },
    footpaths,
  };
}

export function buildBrowserTimetableDataset(gtfs: NormalizedGtfs): BrowserTimetableDataset {
  const timetable = buildCompactTimetable(gtfs);
  const routes = sortRoutes(gtfs.routes);
  const tripById = new Map(gtfs.trips.map((trip) => [trip.tripId, trip]));
  const calendar = sortCalendar(gtfs.calendar);
  const calendarDates = sortCalendarDates(gtfs.calendarDates);

  return {
    formatVersion: 1,
    agencyId: gtfs.agencyId,
    routes: {
      ids: routes.map((route) => route.routeId),
      shortNames: routes.map((route) => route.routeShortName),
      longNames: routes.map((route) => route.routeLongName),
      types: routes.map((route) => route.routeType),
    },
    patterns: {
      stopOffsets: timetable.patternStopOffsets,
      stopIds: timetable.patternStopIds,
      tripOffsets: timetable.patternTripOffsets,
    },
    trips: {
      ids: timetable.tripIds,
      routeIds: timetable.tripIds.map((tripId) => readTrip(tripById, tripId).routeId),
      serviceIds: timetable.tripServiceIds,
      timeOffsets: timetable.tripTimeOffsets,
      timeDeltas: timetable.tripTimeDeltas,
    },
    stopPatternIndex: {
      stopOffsets: timetable.stopPatternOffsets,
      stopIds: timetable.stopPatternStopIds,
      patternIndices: timetable.stopPatternIndices,
    },
    calendar: {
      serviceIds: calendar.map((entry) => entry.serviceId),
      weekdayMasks: calendar.map(getWeekdayMask),
      startDates: calendar.map((entry) => entry.startDate),
      endDates: calendar.map((entry) => entry.endDate),
      exceptions: {
        serviceIds: calendarDates.map((entry) => entry.serviceId),
        dates: calendarDates.map((entry) => entry.date),
        types: calendarDates.map((entry) => entry.exceptionType),
      },
    },
    warnings: timetable.warnings,
  };
}

function createFilePayload<T>(prefix: string, value: T): FilePayload<T> {
  const bytes = toJsonBytes(value);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  return {
    value,
    bytes,
    file: {
      path: `${prefix}-${sha256.slice(0, 16)}.json`,
      sha256,
      bytes: bytes.byteLength,
      gzipBytes: getGzipBytes(bytes),
    },
  };
}

function toJsonBytes(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
}

function getGzipBytes(bytes: Uint8Array): number {
  return gzipSync(bytes, { level: 9 }).byteLength;
}

function getServicePeriod(gtfs: NormalizedGtfs): BrowserDatasetServicePeriod {
  const dates = [
    ...gtfs.calendar.flatMap((entry) => [entry.startDate, entry.endDate]),
    ...gtfs.calendarDates.map((entry) => entry.date),
  ].filter((date) => date.length > 0);

  if (dates.length === 0) {
    return { startDate: null, endDate: null };
  }

  dates.sort();
  return {
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
  };
}

function getWeekdayMask(entry: NormalizedCalendar): number {
  return (
    (entry.monday ? 1 : 0) |
    (entry.tuesday ? 1 << 1 : 0) |
    (entry.wednesday ? 1 << 2 : 0) |
    (entry.thursday ? 1 << 3 : 0) |
    (entry.friday ? 1 << 4 : 0) |
    (entry.saturday ? 1 << 5 : 0) |
    (entry.sunday ? 1 << 6 : 0)
  );
}

function sortStops(stops: readonly NormalizedStop[]): NormalizedStop[] {
  return [...stops].sort((a, b) => a.stopId.localeCompare(b.stopId));
}

function sortRoutes(routes: readonly NormalizedRoute[]): NormalizedRoute[] {
  return [...routes].sort((a, b) => a.routeId.localeCompare(b.routeId));
}

function sortCalendar(calendar: readonly NormalizedCalendar[]): NormalizedCalendar[] {
  return [...calendar].sort(
    (a, b) =>
      a.serviceId.localeCompare(b.serviceId) ||
      a.startDate.localeCompare(b.startDate) ||
      a.endDate.localeCompare(b.endDate),
  );
}

function sortCalendarDates(calendarDates: readonly NormalizedCalendarDate[]): NormalizedCalendarDate[] {
  return [...calendarDates].sort(
    (a, b) =>
      a.serviceId.localeCompare(b.serviceId) ||
      a.date.localeCompare(b.date) ||
      a.exceptionType - b.exceptionType,
  );
}

function readTrip(tripById: ReadonlyMap<PrefixedId, NormalizedTrip>, tripId: PrefixedId): NormalizedTrip {
  const trip = tripById.get(tripId);
  if (trip === undefined) {
    throw new Error(`Compact timetable references unknown trip: ${tripId}`);
  }
  return trip;
}
