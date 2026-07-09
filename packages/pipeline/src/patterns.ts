import {
  type CompactTimetable,
  type NormalizedGtfs,
  type NormalizedStopTime,
  type NormalizedTrip,
  type PrefixedId,
} from '@isochrone/gtfs-types';

export interface CompactTimetableStats {
  readonly patterns: number;
  readonly trips: number;
  readonly stopTimes: number;
  readonly encodedTimeValues: number;
  readonly roundTripMismatches: number;
  readonly warnings: number;
}

interface TripStopTimes {
  readonly trip: NormalizedTrip;
  readonly stopTimes: readonly NormalizedStopTime[];
  readonly patternIndex: number;
  readonly firstDepartureTime: number;
}

export function buildCompactTimetable(gtfs: NormalizedGtfs): CompactTimetable {
  const stopTimesByTrip = groupStopTimesByTrip(gtfs.stopTimes);
  const patternIndexByKey = new Map<string, number>();
  const patternStops: PrefixedId[][] = [];
  const tripsByPattern: TripStopTimes[][] = [];
  const warnings: string[] = [];

  for (const trip of gtfs.trips) {
    const stopTimes = [...(stopTimesByTrip.get(trip.tripId) ?? [])].sort(
      (a, b) => a.stopSequence - b.stopSequence,
    );

    if (stopTimes.length === 0) {
      warnings.push(`Trip has no stop_times: ${trip.tripId}`);
      continue;
    }

    const monotonicWarning = validateMonotonicTimes(trip.tripId, stopTimes);
    if (monotonicWarning !== null) {
      warnings.push(monotonicWarning);
    }

    const stopIds = stopTimes.map((stopTime) => stopTime.stopId);
    const patternKey = stopIds.join('\u001f');
    const patternIndex = getOrCreatePattern(patternKey, stopIds, patternIndexByKey, patternStops);
    const patternTrips = tripsByPattern[patternIndex] ?? [];
    patternTrips.push({
      trip,
      stopTimes,
      patternIndex,
      firstDepartureTime: stopTimes[0]?.departureTime ?? 0,
    });
    tripsByPattern[patternIndex] = patternTrips;
  }

  const patternStopOffsets = buildOffsets(patternStops.map((stops) => stops.length));
  const patternStopIds = patternStops.flat();
  const sortedTripsByPattern = tripsByPattern.map((trips) =>
    [...trips].sort((a, b) => a.firstDepartureTime - b.firstDepartureTime || a.trip.tripId.localeCompare(b.trip.tripId)),
  );
  const patternTripOffsets = buildOffsets(sortedTripsByPattern.map((trips) => trips.length));
  const orderedTrips = sortedTripsByPattern.flat();
  const tripIds = orderedTrips.map((trip) => trip.trip.tripId);
  const tripServiceIds = orderedTrips.map((trip) => trip.trip.serviceId);
  const encodedTrips = orderedTrips.map((trip) => encodeTripTimes(trip.stopTimes));
  const tripTimeOffsets = buildOffsets(encodedTrips.map((times) => times.length));
  const tripTimeDeltas = encodedTrips.flat();
  const stopPatternIndex = buildStopPatternIndex(patternStops);

  return {
    patternStopOffsets,
    patternStopIds,
    patternTripOffsets,
    tripIds,
    tripServiceIds,
    tripTimeOffsets,
    tripTimeDeltas,
    stopPatternOffsets: stopPatternIndex.offsets,
    stopPatternStopIds: stopPatternIndex.stopIds,
    stopPatternIndices: stopPatternIndex.patternIndices,
    warnings,
  };
}

export function decodeTripTimes(timetable: CompactTimetable, tripIndex: number): number[] {
  const start = timetable.tripTimeOffsets[tripIndex];
  const end = timetable.tripTimeOffsets[tripIndex + 1];
  if (start === undefined || end === undefined) {
    throw new Error(`Unknown encoded trip index: ${String(tripIndex)}`);
  }

  const deltas = timetable.tripTimeDeltas.slice(start, end);
  const [first, ...rest] = deltas;
  if (first === undefined) {
    return [];
  }

  const values = [first];
  let current = first;
  for (const delta of rest) {
    current += delta;
    values.push(current);
  }
  return values;
}

export function getCompactTimetableStats(
  gtfs: NormalizedGtfs,
  timetable: CompactTimetable,
): CompactTimetableStats {
  return {
    patterns: timetable.patternStopOffsets.length - 1,
    trips: timetable.tripIds.length,
    stopTimes: gtfs.stopTimes.length,
    encodedTimeValues: timetable.tripTimeDeltas.length,
    roundTripMismatches: countRoundTripMismatches(gtfs, timetable),
    warnings: timetable.warnings.length,
  };
}

export function countRoundTripMismatches(gtfs: NormalizedGtfs, timetable: CompactTimetable): number {
  const originalByTrip = groupStopTimesByTrip(gtfs.stopTimes);
  let mismatches = 0;

  timetable.tripIds.forEach((tripId, tripIndex) => {
    const original = [...(originalByTrip.get(tripId) ?? [])].sort((a, b) => a.stopSequence - b.stopSequence);
    const expected = original.flatMap((stopTime) => [stopTime.arrivalTime, stopTime.departureTime]);
    const actual = decodeTripTimes(timetable, tripIndex);

    if (expected.length !== actual.length) {
      mismatches += Math.abs(expected.length - actual.length);
    }

    const comparedLength = Math.min(expected.length, actual.length);
    for (let index = 0; index < comparedLength; index += 1) {
      if (expected[index] !== actual[index]) {
        mismatches += 1;
      }
    }
  });

  return mismatches;
}

function groupStopTimesByTrip(
  stopTimes: readonly NormalizedStopTime[],
): Map<PrefixedId, NormalizedStopTime[]> {
  const byTrip = new Map<PrefixedId, NormalizedStopTime[]>();
  for (const stopTime of stopTimes) {
    const tripStopTimes = byTrip.get(stopTime.tripId) ?? [];
    tripStopTimes.push(stopTime);
    byTrip.set(stopTime.tripId, tripStopTimes);
  }
  return byTrip;
}

function getOrCreatePattern(
  key: string,
  stopIds: readonly PrefixedId[],
  patternIndexByKey: Map<string, number>,
  patternStops: PrefixedId[][],
): number {
  const existing = patternIndexByKey.get(key);
  if (existing !== undefined) {
    return existing;
  }

  const index = patternStops.length;
  patternIndexByKey.set(key, index);
  patternStops.push([...stopIds]);
  return index;
}

function validateMonotonicTimes(
  tripId: PrefixedId,
  stopTimes: readonly NormalizedStopTime[],
): string | null {
  let previous = -Infinity;
  for (const stopTime of stopTimes) {
    const values = [stopTime.arrivalTime, stopTime.departureTime];
    for (const value of values) {
      if (value < previous) {
        return `Trip has decreasing times: ${tripId}`;
      }
      previous = value;
    }
  }
  return null;
}

function encodeTripTimes(stopTimes: readonly NormalizedStopTime[]): number[] {
  const values = stopTimes.flatMap((stopTime) => [stopTime.arrivalTime, stopTime.departureTime]);
  const [first, ...rest] = values;
  if (first === undefined) {
    return [];
  }

  const deltas = [first];
  let previous = first;
  for (const value of rest) {
    deltas.push(value - previous);
    previous = value;
  }
  return deltas;
}

function buildOffsets(lengths: readonly number[]): number[] {
  const offsets = [0];
  let cursor = 0;
  for (const length of lengths) {
    cursor += length;
    offsets.push(cursor);
  }
  return offsets;
}

function buildStopPatternIndex(patternStops: readonly (readonly PrefixedId[])[]): {
  readonly offsets: number[];
  readonly stopIds: PrefixedId[];
  readonly patternIndices: number[];
} {
  const patternsByStop = new Map<PrefixedId, number[]>();

  patternStops.forEach((stopIds, patternIndex) => {
    for (const stopId of new Set(stopIds)) {
      const patternIndices = patternsByStop.get(stopId) ?? [];
      patternIndices.push(patternIndex);
      patternsByStop.set(stopId, patternIndices);
    }
  });

  const stopIds = [...patternsByStop.keys()].sort();
  const offsets = [0];
  const patternIndices: number[] = [];

  for (const stopId of stopIds) {
    const indices = patternsByStop.get(stopId) ?? [];
    indices.sort((a, b) => a - b);
    patternIndices.push(...indices);
    offsets.push(patternIndices.length);
  }

  return { offsets, stopIds, patternIndices };
}
