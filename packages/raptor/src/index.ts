import {
  type BrowserDatasetManifest,
  type BrowserStopsDataset,
  type BrowserTimetableDataset,
  type DatasetIdentity,
  type PrefixedId,
} from '@isochrone/gtfs-types';

export function formatRaptorDatasetLabel(dataset: DatasetIdentity): string {
  return `${dataset.agencyId}:${dataset.feedVersion}`;
}

export * from './service-days.js';

export interface LoadedTimetable {
  readonly manifest: BrowserDatasetManifest;
  readonly stopIds: readonly PrefixedId[];
  readonly stopNames: readonly string[];
  readonly stopNameKanas: readonly (string | null)[];
  readonly stopCodes: readonly (string | null)[];
  readonly stopLats: Float64Array;
  readonly stopLons: Float64Array;
  readonly routes: LoadedRoutes;
  readonly patterns: LoadedPatterns;
  readonly trips: LoadedTrips;
  readonly footpaths: LoadedFootpaths;
  readonly stopPatternIndex: LoadedStopPatternIndex;
  readonly calendar: LoadedCalendar;
  readonly loadStats: LoadedTimetableStats;
}

export interface LoadedRoutes {
  readonly ids: readonly PrefixedId[];
  readonly shortNames: readonly string[];
  readonly longNames: readonly string[];
  readonly types: Uint16Array;
}

export interface LoadedPatterns {
  readonly stopOffsets: Int32Array;
  readonly stopIndices: Int32Array;
  readonly tripOffsets: Int32Array;
}

export interface LoadedTrips {
  readonly ids: readonly PrefixedId[];
  readonly routeIndices: Int32Array;
  readonly serviceIndices: Int32Array;
  readonly timeOffsets: Int32Array;
  readonly times: Uint16Array;
}

export interface LoadedFootpaths {
  readonly stopIndices: Int32Array;
  readonly offsets: Int32Array;
  readonly targetStopIndices: Int32Array;
  readonly durations: Uint16Array;
}

export interface LoadedStopPatternIndex {
  readonly stopIndices: Int32Array;
  readonly offsets: Int32Array;
  readonly patternIndices: Int32Array;
}

export interface LoadedCalendar {
  readonly serviceIds: readonly PrefixedId[];
  readonly weekdayMasks: Uint8Array;
  readonly startDates: readonly string[];
  readonly endDates: readonly string[];
  readonly exceptions: {
    readonly serviceIndices: Int32Array;
    readonly dates: readonly string[];
    readonly types: Uint8Array;
  };
}

export interface LoadedTimetableStats {
  readonly stops: number;
  readonly routes: number;
  readonly patterns: number;
  readonly trips: number;
  readonly footpaths: number;
  readonly services: number;
  readonly calendarDates: number;
  readonly loadMs: number;
}

export interface BrowserDatasetPayload {
  readonly manifest: BrowserDatasetManifest;
  readonly stops: BrowserStopsDataset;
  readonly timetable: BrowserTimetableDataset;
}

export interface LoadTimetableFromManifestOptions {
  readonly fetchImpl?: DatasetFetch;
  readonly now?: () => number;
}

export type DatasetFetch = (url: string) => Promise<JsonResponse>;

export interface JsonResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
}

export async function loadTimetableFromManifestUrl(
  manifestUrl: string,
  options: LoadTimetableFromManifestOptions = {},
): Promise<LoadedTimetable> {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const manifest = await fetchJson<BrowserDatasetManifest>(manifestUrl, fetchImpl);
  const stopsUrl = new URL(manifest.files.stops.path, manifestUrl).href;
  const timetableUrl = new URL(manifest.files.timetable.path, manifestUrl).href;
  const [stops, timetable] = await Promise.all([
    fetchJson<BrowserStopsDataset>(stopsUrl, fetchImpl),
    fetchJson<BrowserTimetableDataset>(timetableUrl, fetchImpl),
  ]);

  return loadTimetable({ manifest, stops, timetable }, now() - startedAt);
}

export function loadTimetable(payload: BrowserDatasetPayload, loadMs = 0): LoadedTimetable {
  const stopIndexById = buildIndex(payload.stops.stops.ids, 'stop');
  const routeIndexById = buildIndex(payload.timetable.routes.ids, 'route');
  const serviceIds = buildServiceIds(payload.timetable);
  const serviceIndexById = buildIndex(serviceIds, 'service');

  return {
    manifest: payload.manifest,
    stopIds: payload.stops.stops.ids,
    stopNames: payload.stops.stops.names,
    stopNameKanas: payload.stops.stops.nameKanas,
    stopCodes: payload.stops.stops.codes,
    stopLats: Float64Array.from(payload.stops.stops.lats),
    stopLons: Float64Array.from(payload.stops.stops.lons),
    routes: {
      ids: payload.timetable.routes.ids,
      shortNames: payload.timetable.routes.shortNames,
      longNames: payload.timetable.routes.longNames,
      types: Uint16Array.from(payload.timetable.routes.types),
    },
    patterns: {
      stopOffsets: Int32Array.from(payload.timetable.patterns.stopOffsets),
      stopIndices: toIndexArray(payload.timetable.patterns.stopIds, stopIndexById, 'pattern stop'),
      tripOffsets: Int32Array.from(payload.timetable.patterns.tripOffsets),
    },
    trips: {
      ids: payload.timetable.trips.ids,
      routeIndices: toIndexArray(payload.timetable.trips.routeIds, routeIndexById, 'trip route'),
      serviceIndices: toIndexArray(payload.timetable.trips.serviceIds, serviceIndexById, 'trip service'),
      timeOffsets: Int32Array.from(payload.timetable.trips.timeOffsets),
      times: decodeTripTimes(payload.timetable.trips.timeOffsets, payload.timetable.trips.timeDeltas),
    },
    footpaths: {
      stopIndices: toIndexArray(payload.stops.footpaths.stopIds, stopIndexById, 'footpath stop'),
      offsets: Int32Array.from(payload.stops.footpaths.offsets),
      targetStopIndices: toIndexArray(payload.stops.footpaths.targetStopIds, stopIndexById, 'footpath target'),
      durations: Uint16Array.from(payload.stops.footpaths.durations),
    },
    stopPatternIndex: {
      stopIndices: toIndexArray(payload.timetable.stopPatternIndex.stopIds, stopIndexById, 'stop-pattern stop'),
      offsets: Int32Array.from(payload.timetable.stopPatternIndex.stopOffsets),
      patternIndices: Int32Array.from(payload.timetable.stopPatternIndex.patternIndices),
    },
    calendar: {
      serviceIds,
      weekdayMasks: Uint8Array.from(payload.timetable.calendar.weekdayMasks),
      startDates: payload.timetable.calendar.startDates,
      endDates: payload.timetable.calendar.endDates,
      exceptions: {
        serviceIndices: toIndexArray(
          payload.timetable.calendar.exceptions.serviceIds,
          serviceIndexById,
          'calendar exception service',
        ),
        dates: payload.timetable.calendar.exceptions.dates,
        types: Uint8Array.from(payload.timetable.calendar.exceptions.types),
      },
    },
    loadStats: {
      stops: payload.stops.stops.ids.length,
      routes: payload.timetable.routes.ids.length,
      patterns: Math.max(payload.timetable.patterns.stopOffsets.length - 1, 0),
      trips: payload.timetable.trips.ids.length,
      footpaths: payload.stops.footpaths.targetStopIds.length,
      services: serviceIds.length,
      calendarDates: payload.timetable.calendar.exceptions.dates.length,
      loadMs,
    },
  };
}

function decodeTripTimes(offsets: readonly number[], deltas: readonly number[]): Uint16Array {
  const times = new Uint16Array(deltas.length);

  for (let tripIndex = 0; tripIndex < offsets.length - 1; tripIndex += 1) {
    const start = offsets[tripIndex] ?? 0;
    const end = offsets[tripIndex + 1] ?? start;
    let current = 0;

    for (let index = start; index < end; index += 1) {
      const delta = deltas[index] ?? 0;
      current = index === start ? delta : current + delta;
      if (current < 0 || current > 65_535) {
        throw new Error(`Decoded trip time is outside Uint16 range at trip ${String(tripIndex)}.`);
      }
      times[index] = current;
    }
  }

  return times;
}

function buildServiceIds(timetable: BrowserTimetableDataset): PrefixedId[] {
  const ids: PrefixedId[] = [];
  const seen = new Set<PrefixedId>();
  for (const serviceId of [
    ...timetable.calendar.serviceIds,
    ...timetable.calendar.exceptions.serviceIds,
  ]) {
    if (!seen.has(serviceId)) {
      seen.add(serviceId);
      ids.push(serviceId);
    }
  }
  return ids;
}

function buildIndex(ids: readonly PrefixedId[], label: string): Map<PrefixedId, number> {
  const indexById = new Map<PrefixedId, number>();
  ids.forEach((id, index) => {
    if (indexById.has(id)) {
      throw new Error(`Duplicate ${label} id: ${id}`);
    }
    indexById.set(id, index);
  });
  return indexById;
}

function toIndexArray(
  ids: readonly PrefixedId[],
  indexById: ReadonlyMap<PrefixedId, number>,
  label: string,
): Int32Array {
  return Int32Array.from(ids.map((id) => readIndex(indexById, id, label)));
}

function readIndex(
  indexById: ReadonlyMap<PrefixedId, number>,
  id: PrefixedId,
  label: string,
): number {
  const index = indexById.get(id);
  if (index === undefined) {
    throw new Error(`Unknown ${label} id: ${id}`);
  }
  return index;
}

async function fetchJson<T>(url: string, fetchImpl: DatasetFetch): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${String(response.status)} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function defaultFetch(url: string): Promise<JsonResponse> {
  if (typeof fetch !== 'function') {
    throw new Error('No fetch implementation is available.');
  }
  return fetch(url);
}
