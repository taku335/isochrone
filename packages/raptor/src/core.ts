import { type LoadedTimetable } from './index.js';
import { resolveServiceLayers, type ServiceLayer } from './service-days.js';

export type Minutes = number;

export const UNREACHED = 0xffff;
export const DEFAULT_MAX_ROUNDS = 5;

export interface EarliestArrivalQuery {
  readonly kind: 'earliestArrival';
  readonly origins: readonly Origin[];
  readonly serviceDate: string;
  readonly maxRounds?: number;
}

export interface Origin {
  readonly stopIndex: number;
  readonly departure: Minutes;
}

export interface LatestDepartureQuery {
  readonly kind: 'latestDeparture';
  readonly destinations: readonly Destination[];
  readonly serviceDate: string;
  readonly maxRounds?: number;
}

export interface Destination {
  readonly stopIndex: number;
  readonly arrival: Minutes;
}

export type Query = EarliestArrivalQuery | LatestDepartureQuery;

export interface OneToAllResult {
  readonly arrival: Uint16Array;
  readonly rounds: number;
}

interface BoardedTrip {
  readonly tripIndex: number;
  readonly minuteOffset: 0 | 1440;
}

export function route(
  data: LoadedTimetable,
  query: EarliestArrivalQuery,
): OneToAllResult {
  const maxRounds = query.maxRounds ?? DEFAULT_MAX_ROUNDS;
  assertMaxRounds(maxRounds);

  const arrival = new Uint16Array(data.stopIds.length);
  arrival.fill(UNREACHED);
  let marked = new Uint8Array(data.stopIds.length);

  for (const origin of query.origins) {
    assertStopIndex(origin.stopIndex, data.stopIds.length);
    assertMinute(origin.departure, 'Origin departure');
    if (origin.departure < (arrival[origin.stopIndex] ?? UNREACHED)) {
      arrival[origin.stopIndex] = origin.departure;
      marked[origin.stopIndex] = 1;
    }
  }

  const layers = resolveServiceLayers(data.calendar, normalizeServiceDate(query.serviceDate));
  const activeServices = layers.map((layer) => buildActiveServices(data, layer));
  const stopPatternRows = buildStopPatternRows(data);
  const queuedStarts = new Int32Array(Math.max(data.patterns.stopOffsets.length - 1, 0));
  let rounds = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    queuedStarts.fill(-1);
    queueMarkedPatterns(data, marked, stopPatternRows, queuedStarts);
    if (!queuedStarts.some((start) => start >= 0)) {
      break;
    }

    const previous = arrival.slice();
    const nextMarked = new Uint8Array(data.stopIds.length);

    for (let patternIndex = 0; patternIndex < queuedStarts.length; patternIndex += 1) {
      const startPosition = queuedStarts[patternIndex] ?? -1;
      if (startPosition < 0) {
        continue;
      }
      scanPattern(
        data,
        patternIndex,
        startPosition,
        previous,
        arrival,
        nextMarked,
        layers,
        activeServices,
      );
    }

    rounds = round;
    marked = nextMarked;
    if (!marked.some((value) => value !== 0)) {
      break;
    }
  }

  return { arrival, rounds };
}

function scanPattern(
  data: LoadedTimetable,
  patternIndex: number,
  startPosition: number,
  previous: Uint16Array,
  arrival: Uint16Array,
  nextMarked: Uint8Array,
  layers: readonly ServiceLayer[],
  activeServices: readonly Uint8Array[],
): void {
  const stopStart = data.patterns.stopOffsets[patternIndex] ?? 0;
  const stopEnd = data.patterns.stopOffsets[patternIndex + 1] ?? stopStart;
  let boarded: BoardedTrip | null = null;

  // Earliest-arrival scans stops and trips forward. Latest-departure will reverse
  // these bounds and invert the comparisons while retaining the round structure.
  for (let position = startPosition; stopStart + position < stopEnd; position += 1) {
    const stopIndex = data.patterns.stopIndices[stopStart + position];
    if (stopIndex === undefined) {
      continue;
    }

    if (boarded !== null) {
      const reachedAt = readTripTime(data, boarded.tripIndex, position, false) - boarded.minuteOffset;
      if (reachedAt >= 0 && reachedAt < (arrival[stopIndex] ?? UNREACHED)) {
        arrival[stopIndex] = reachedAt;
        nextMarked[stopIndex] = 1;
      }
    }

    const readyAt = previous[stopIndex] ?? UNREACHED;
    if (readyAt === UNREACHED) {
      continue;
    }

    const candidate = findEarliestBoardableTrip(
      data,
      patternIndex,
      position,
      readyAt,
      layers,
      activeServices,
    );
    if (
      candidate !== null &&
      (boarded === null ||
        getGlobalDeparture(data, candidate, position) < getGlobalDeparture(data, boarded, position))
    ) {
      boarded = candidate;
    }
  }
}

function findEarliestBoardableTrip(
  data: LoadedTimetable,
  patternIndex: number,
  stopPosition: number,
  readyAt: number,
  layers: readonly ServiceLayer[],
  activeServices: readonly Uint8Array[],
): BoardedTrip | null {
  const tripStart = data.patterns.tripOffsets[patternIndex] ?? 0;
  const tripEnd = data.patterns.tripOffsets[patternIndex + 1] ?? tripStart;
  let best: BoardedTrip | null = null;

  layers.forEach((layer, layerIndex) => {
    const localReadyAt = readyAt + layer.minuteOffset;
    if (localReadyAt > UNREACHED) {
      return;
    }

    const active = activeServices[layerIndex];
    if (active === undefined) {
      return;
    }

    let tripIndex = lowerBoundTrip(
      data,
      tripStart,
      tripEnd,
      stopPosition,
      localReadyAt,
    );
    while (tripIndex < tripEnd) {
      const serviceIndex = data.trips.serviceIndices[tripIndex] ?? -1;
      if ((active[serviceIndex] ?? 0) !== 0) {
        const candidate: BoardedTrip = { tripIndex, minuteOffset: layer.minuteOffset };
        if (
          best === null ||
          getGlobalDeparture(data, candidate, stopPosition) <
            getGlobalDeparture(data, best, stopPosition)
        ) {
          best = candidate;
        }
        break;
      }
      tripIndex += 1;
    }
  });

  return best;
}

function lowerBoundTrip(
  data: LoadedTimetable,
  start: number,
  end: number,
  stopPosition: number,
  readyAt: number,
): number {
  let low = start;
  let high = end;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const departure = readTripTime(data, middle, stopPosition, true);
    if (departure < readyAt) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function getGlobalDeparture(
  data: LoadedTimetable,
  trip: BoardedTrip,
  stopPosition: number,
): number {
  return readTripTime(data, trip.tripIndex, stopPosition, true) - trip.minuteOffset;
}

function readTripTime(
  data: LoadedTimetable,
  tripIndex: number,
  stopPosition: number,
  departure: boolean,
): number {
  const timeStart = data.trips.timeOffsets[tripIndex];
  const timeEnd = data.trips.timeOffsets[tripIndex + 1];
  if (timeStart === undefined || timeEnd === undefined) {
    throw new Error(`Unknown trip index: ${String(tripIndex)}`);
  }
  const timeIndex = timeStart + stopPosition * 2 + (departure ? 1 : 0);
  if (timeIndex >= timeEnd) {
    throw new Error(`Trip ${String(tripIndex)} has no time at stop position ${String(stopPosition)}.`);
  }
  return data.trips.times[timeIndex] ?? UNREACHED;
}

function queueMarkedPatterns(
  data: LoadedTimetable,
  marked: Uint8Array,
  stopPatternRows: Int32Array,
  queuedStarts: Int32Array,
): void {
  marked.forEach((isMarked, stopIndex) => {
    if (isMarked === 0) {
      return;
    }
    const row = stopPatternRows[stopIndex] ?? -1;
    if (row < 0) {
      return;
    }
    const indexStart = data.stopPatternIndex.offsets[row] ?? 0;
    const indexEnd = data.stopPatternIndex.offsets[row + 1] ?? indexStart;
    for (let index = indexStart; index < indexEnd; index += 1) {
      const patternIndex = data.stopPatternIndex.patternIndices[index];
      if (patternIndex === undefined) {
        continue;
      }
      const position = findStopPosition(data, patternIndex, stopIndex);
      const queued = queuedStarts[patternIndex] ?? -1;
      if (position >= 0 && (queued < 0 || position < queued)) {
        queuedStarts[patternIndex] = position;
      }
    }
  });
}

function findStopPosition(
  data: LoadedTimetable,
  patternIndex: number,
  stopIndex: number,
): number {
  const start = data.patterns.stopOffsets[patternIndex] ?? 0;
  const end = data.patterns.stopOffsets[patternIndex + 1] ?? start;
  for (let index = start; index < end; index += 1) {
    if (data.patterns.stopIndices[index] === stopIndex) {
      return index - start;
    }
  }
  return -1;
}

function buildStopPatternRows(data: LoadedTimetable): Int32Array {
  const rows = new Int32Array(data.stopIds.length);
  rows.fill(-1);
  data.stopPatternIndex.stopIndices.forEach((stopIndex, row) => {
    if (stopIndex >= 0 && stopIndex < rows.length) {
      rows[stopIndex] = row;
    }
  });
  return rows;
}

function buildActiveServices(data: LoadedTimetable, layer: ServiceLayer): Uint8Array {
  const active = new Uint8Array(data.calendar.serviceIds.length);
  layer.serviceIndices.forEach((serviceIndex) => {
    if (serviceIndex >= 0 && serviceIndex < active.length) {
      active[serviceIndex] = 1;
    }
  });
  return active;
}

function normalizeServiceDate(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date.replaceAll('-', '');
  }
  return date;
}

function assertMaxRounds(maxRounds: number): void {
  if (!Number.isInteger(maxRounds) || maxRounds < 0) {
    throw new Error(`maxRounds must be a non-negative integer: ${String(maxRounds)}`);
  }
}

function assertStopIndex(stopIndex: number, stopCount: number): void {
  if (!Number.isInteger(stopIndex) || stopIndex < 0 || stopIndex >= stopCount) {
    throw new Error(`Invalid stop index: ${String(stopIndex)}`);
  }
}

function assertMinute(minute: number, label: string): void {
  if (!Number.isInteger(minute) || minute < 0 || minute >= UNREACHED) {
    throw new Error(`${label} must be an integer from 0 to ${String(UNREACHED - 1)}.`);
  }
}
