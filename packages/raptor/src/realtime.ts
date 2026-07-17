import { type PrefixedId } from '@isochrone/gtfs-types';

import {
  type LoadedRealtimeTripDelay,
  type LoadedTimetable,
} from './index.js';
import { UNREACHED } from './core.js';

export const DEFAULT_REALTIME_MAX_AGE_SECONDS = 120;
export const DEFAULT_REALTIME_MAX_FUTURE_SKEW_SECONDS = 30;

export interface NormalizedRealtimeSnapshot {
  readonly sourceAgencyId: string;
  readonly sourceFeedVersion: string;
  readonly timestamp: number;
  readonly tripUpdates: readonly NormalizedRealtimeTripUpdate[];
}

export interface NormalizedRealtimeTripUpdate {
  readonly tripId: PrefixedId;
  readonly serviceDate: string;
  readonly stopTimeUpdates: readonly NormalizedRealtimeStopTimeUpdate[];
}

export interface NormalizedRealtimeStopTimeUpdate {
  readonly stopId: PrefixedId;
  readonly arrivalDelaySeconds?: number;
  readonly departureDelaySeconds?: number;
}

export interface RealtimeApplyOptions {
  readonly nowEpochSeconds?: number;
  readonly maxAgeSeconds?: number;
  readonly maxFutureSkewSeconds?: number;
}

export type RealtimeSnapshotStatus =
  | 'applied'
  | 'stale'
  | 'future'
  | 'incompatible'
  | 'invalid';

export interface RealtimeApplyResult {
  readonly status: RealtimeSnapshotStatus;
  readonly timetable: LoadedTimetable;
  readonly ageSeconds: number | null;
  readonly stats: RealtimeApplyStats;
  readonly issues: readonly RealtimeApplyIssue[];
}

export interface RealtimeApplyStats {
  readonly tripUpdates: number;
  readonly matchedTrips: number;
  readonly unmatchedTrips: number;
  readonly adjustedTrips: number;
  readonly adjustedEvents: number;
}

export interface RealtimeApplyIssue {
  readonly code: string;
  readonly message: string;
  readonly tripId?: PrefixedId;
  readonly stopId?: PrefixedId;
}

interface CompiledTripDelay {
  readonly tripIndex: number;
  readonly serviceDate: string;
  readonly eventDelays: readonly number[];
}

interface MutableRealtimeStats {
  tripUpdates: number;
  matchedTrips: number;
  unmatchedTrips: number;
  adjustedTrips: number;
  adjustedEvents: number;
}

/**
 * Validates a provider-neutral TripUpdates snapshot and overlays it on a loaded
 * static timetable. Stale, future-dated, incompatible, or invalid snapshots
 * safely fall back to the original scheduled timetable.
 *
 * Delay values use GTFS-Realtime seconds and are rounded up to the routing
 * engine's minute resolution so predicted arrivals are never shown early.
 */
export function applyRealtimeSnapshot(
  timetable: LoadedTimetable,
  snapshot: NormalizedRealtimeSnapshot,
  options: RealtimeApplyOptions = {},
): RealtimeApplyResult {
  const stats: MutableRealtimeStats = {
    tripUpdates: snapshot.tripUpdates.length,
    matchedTrips: 0,
    unmatchedTrips: 0,
    adjustedTrips: 0,
    adjustedEvents: 0,
  };
  const issues: RealtimeApplyIssue[] = [];
  const compatibilityIssue = getCompatibilityIssue(timetable, snapshot);
  if (compatibilityIssue !== null) {
    return result('incompatible', timetable, null, stats, [compatibilityIssue]);
  }

  if (!Number.isInteger(snapshot.timestamp) || snapshot.timestamp <= 0) {
    return result('invalid', timetable, null, stats, [{
      code: 'invalid-timestamp',
      message: 'Realtime snapshot timestamp must be a positive integer epoch second.',
    }]);
  }

  const now = options.nowEpochSeconds ?? Math.floor(Date.now() / 1_000);
  const maxAge = options.maxAgeSeconds ?? DEFAULT_REALTIME_MAX_AGE_SECONDS;
  const maxFutureSkew = options.maxFutureSkewSeconds ?? DEFAULT_REALTIME_MAX_FUTURE_SKEW_SECONDS;
  if (!Number.isFinite(now) || !Number.isFinite(maxAge) || maxAge < 0 ||
      !Number.isFinite(maxFutureSkew) || maxFutureSkew < 0) {
    return result('invalid', timetable, null, stats, [{
      code: 'invalid-policy',
      message: 'Realtime freshness policy values must be finite and non-negative.',
    }]);
  }

  const ageSeconds = now - snapshot.timestamp;
  if (ageSeconds > maxAge) {
    return result('stale', timetable, ageSeconds, stats, [{
      code: 'stale-snapshot',
      message: `Realtime snapshot is ${String(ageSeconds)} seconds old.`,
    }]);
  }
  if (ageSeconds < -maxFutureSkew) {
    return result('future', timetable, ageSeconds, stats, [{
      code: 'future-snapshot',
      message: `Realtime snapshot is ${String(-ageSeconds)} seconds in the future.`,
    }]);
  }

  const compiled = compileTripDelays(timetable, snapshot.tripUpdates, stats, issues);
  const adjusted = compiled.length === 0
    ? timetable
    : applyCompiledDelays(timetable, compiled, stats, issues);
  return result('applied', adjusted, ageSeconds, stats, issues);
}

function getCompatibilityIssue(
  timetable: LoadedTimetable,
  snapshot: NormalizedRealtimeSnapshot,
): RealtimeApplyIssue | null {
  const sources = timetable.manifest.sources ?? [{
    agencyId: timetable.manifest.agencyId,
    feedVersion: timetable.manifest.feedVersion,
  }];
  const source = sources.find(({ agencyId }) => agencyId === snapshot.sourceAgencyId);
  if (source === undefined) {
    return {
      code: 'unknown-source',
      message: `Realtime source is not present in the static dataset: ${snapshot.sourceAgencyId}`,
    };
  }
  if (source.feedVersion !== snapshot.sourceFeedVersion) {
    return {
      code: 'feed-version-mismatch',
      message: `Realtime source version ${snapshot.sourceFeedVersion} does not match static version ${source.feedVersion}.`,
    };
  }
  return null;
}

function compileTripDelays(
  timetable: LoadedTimetable,
  updates: readonly NormalizedRealtimeTripUpdate[],
  stats: MutableRealtimeStats,
  issues: RealtimeApplyIssue[],
): CompiledTripDelay[] {
  const tripIndexById = new Map(timetable.trips.ids.map((tripId, tripIndex) => [tripId, tripIndex]));
  const patternByTrip = buildPatternByTrip(timetable);
  const seenTrips = new Set<string>();
  const compiled: CompiledTripDelay[] = [];

  for (const update of updates) {
    const updateKey = `${update.tripId}\u001f${update.serviceDate}`;
    if (seenTrips.has(updateKey)) {
      issues.push({
        code: 'duplicate-trip-update',
        message: `Realtime snapshot contains duplicate trip update: ${update.tripId} on ${update.serviceDate}`,
        tripId: update.tripId,
      });
      continue;
    }
    seenTrips.add(updateKey);

    if (!/^\d{8}$/.test(update.serviceDate)) {
      issues.push({
        code: 'invalid-service-date',
        message: `Realtime trip update has invalid service date: ${update.serviceDate}`,
        tripId: update.tripId,
      });
      continue;
    }

    const tripIndex = tripIndexById.get(update.tripId);
    if (tripIndex === undefined) {
      stats.unmatchedTrips += 1;
      issues.push({
        code: 'unknown-trip',
        message: `Realtime trip does not exist in the static dataset: ${update.tripId}`,
        tripId: update.tripId,
      });
      continue;
    }
    stats.matchedTrips += 1;

    const patternIndex = patternByTrip[tripIndex] ?? -1;
    if (patternIndex < 0) {
      issues.push({
        code: 'missing-trip-pattern',
        message: `Static trip is not assigned to a pattern: ${update.tripId}`,
        tripId: update.tripId,
      });
      continue;
    }
    const eventDelays = compileTripEventDelays(timetable, patternIndex, update, issues);
    if (eventDelays !== null) {
      compiled.push({ tripIndex, serviceDate: update.serviceDate, eventDelays });
    }
  }
  return compiled;
}

function compileTripEventDelays(
  timetable: LoadedTimetable,
  patternIndex: number,
  update: NormalizedRealtimeTripUpdate,
  issues: RealtimeApplyIssue[],
): readonly number[] | null {
  if (update.stopTimeUpdates.length === 0) {
    issues.push({
      code: 'empty-trip-update',
      message: `Realtime trip update has no stop-time updates: ${update.tripId}`,
      tripId: update.tripId,
    });
    return null;
  }

  const stopStart = timetable.patterns.stopOffsets[patternIndex] ?? 0;
  const stopEnd = timetable.patterns.stopOffsets[patternIndex + 1] ?? stopStart;
  const stopIds = Array.from(
    timetable.patterns.stopIndices.slice(stopStart, stopEnd),
    (stopIndex) => timetable.stopIds[stopIndex],
  );
  const updateByPosition = new Map<number, NormalizedRealtimeStopTimeUpdate>();

  for (const stopUpdate of update.stopTimeUpdates) {
    const positions = stopIds.flatMap((stopId, position) =>
      stopId === stopUpdate.stopId ? [position] : []);
    if (positions.length !== 1) {
      issues.push({
        code: positions.length === 0 ? 'unknown-update-stop' : 'ambiguous-update-stop',
        message: positions.length === 0
          ? `Realtime stop is not on static trip ${update.tripId}: ${stopUpdate.stopId}`
          : `Realtime stop occurs multiple times on static trip ${update.tripId}: ${stopUpdate.stopId}`,
        tripId: update.tripId,
        stopId: stopUpdate.stopId,
      });
      return null;
    }
    const position = positions[0];
    if (position === undefined || updateByPosition.has(position)) {
      issues.push({
        code: 'duplicate-stop-update',
        message: `Realtime trip contains duplicate stop-time update: ${stopUpdate.stopId}`,
        tripId: update.tripId,
        stopId: stopUpdate.stopId,
      });
      return null;
    }
    if (stopUpdate.arrivalDelaySeconds === undefined &&
        stopUpdate.departureDelaySeconds === undefined) {
      issues.push({
        code: 'missing-delay',
        message: `Realtime stop-time update has no arrival or departure delay: ${stopUpdate.stopId}`,
        tripId: update.tripId,
        stopId: stopUpdate.stopId,
      });
      return null;
    }
    if (
      (stopUpdate.arrivalDelaySeconds !== undefined &&
        !Number.isInteger(stopUpdate.arrivalDelaySeconds)) ||
      (stopUpdate.departureDelaySeconds !== undefined &&
        !Number.isInteger(stopUpdate.departureDelaySeconds))
    ) {
      issues.push({
        code: 'invalid-delay',
        message: `Realtime delay must be an integer for ${update.tripId} at ${stopUpdate.stopId}.`,
        tripId: update.tripId,
        stopId: stopUpdate.stopId,
      });
      return null;
    }
    updateByPosition.set(position, stopUpdate);
  }

  const eventDelays: number[] = [];
  let carriedDelay = 0;
  for (let position = 0; position < stopIds.length; position += 1) {
    const stopUpdate = updateByPosition.get(position);
    const arrivalDelay = stopUpdate === undefined
      ? carriedDelay
      : toDelayMinutes(
          stopUpdate.arrivalDelaySeconds ?? stopUpdate.departureDelaySeconds,
          update.tripId,
          stopUpdate.stopId,
        );
    const departureDelay = stopUpdate === undefined
      ? arrivalDelay
      : toDelayMinutes(
          stopUpdate.departureDelaySeconds ?? stopUpdate.arrivalDelaySeconds,
          update.tripId,
          stopUpdate.stopId,
        );
    eventDelays.push(arrivalDelay, departureDelay);
    carriedDelay = departureDelay;
  }
  return eventDelays;
}

function toDelayMinutes(
  seconds: number | undefined,
  tripId: PrefixedId,
  stopId: PrefixedId,
): number {
  if (seconds === undefined || !Number.isInteger(seconds)) {
    throw new Error(`Missing validated realtime delay for ${tripId} at ${stopId}.`);
  }
  return Math.ceil(seconds / 60);
}

function applyCompiledDelays(
  timetable: LoadedTimetable,
  compiled: readonly CompiledTripDelay[],
  stats: MutableRealtimeStats,
  issues: RealtimeApplyIssue[],
): LoadedTimetable {
  const overlaysByTrip: (LoadedRealtimeTripDelay[] | null)[] = timetable.trips.ids.map(() => null);
  for (const { tripIndex, serviceDate, eventDelays } of compiled) {
    const tripId = timetable.trips.ids[tripIndex];
    const start = timetable.trips.timeOffsets[tripIndex] ?? 0;
    const end = timetable.trips.timeOffsets[tripIndex + 1] ?? start;
    const scheduled = Array.from(timetable.trips.times.slice(start, end));
    const adjusted = scheduled.map((time, eventIndex) => time + (eventDelays[eventIndex] ?? 0));
    if (adjusted.some((time) => time < 0 || time >= UNREACHED)) {
      issues.push({
        code: 'adjusted-time-out-of-range',
        message: `Realtime delay moves trip time outside the supported range: ${tripId ?? String(tripIndex)}`,
        ...(tripId === undefined ? {} : { tripId }),
      });
      continue;
    }
    if (adjusted.some((time, index) => index > 0 && time < (adjusted[index - 1] ?? 0))) {
      issues.push({
        code: 'adjusted-time-decreasing',
        message: `Realtime delay makes trip times decrease: ${tripId ?? String(tripIndex)}`,
        ...(tripId === undefined ? {} : { tripId }),
      });
      continue;
    }
    const adjustedEvents = adjusted.filter((time, index) => time !== scheduled[index]).length;
    if (adjustedEvents === 0) {
      continue;
    }
    stats.adjustedTrips += 1;
    stats.adjustedEvents += adjustedEvents;
    const tripOverlays = overlaysByTrip[tripIndex] ?? [];
    tripOverlays.push({ serviceDate, eventDelays: Int32Array.from(eventDelays) });
    overlaysByTrip[tripIndex] = tripOverlays;
  }

  if (stats.adjustedTrips === 0) {
    return timetable;
  }
  return {
    ...timetable,
    realtime: {
      tripEventDelays: overlaysByTrip,
    },
  };
}

function buildPatternByTrip(timetable: LoadedTimetable): Int32Array {
  const patternByTrip = new Int32Array(timetable.trips.ids.length);
  patternByTrip.fill(-1);
  for (let patternIndex = 0; patternIndex < timetable.patterns.tripOffsets.length - 1; patternIndex += 1) {
    const start = timetable.patterns.tripOffsets[patternIndex] ?? 0;
    const end = timetable.patterns.tripOffsets[patternIndex + 1] ?? start;
    for (let tripIndex = start; tripIndex < end; tripIndex += 1) {
      patternByTrip[tripIndex] = patternIndex;
    }
  }
  return patternByTrip;
}

function result(
  status: RealtimeSnapshotStatus,
  timetable: LoadedTimetable,
  ageSeconds: number | null,
  stats: MutableRealtimeStats,
  issues: readonly RealtimeApplyIssue[],
): RealtimeApplyResult {
  return { status, timetable, ageSeconds, stats: { ...stats }, issues };
}
