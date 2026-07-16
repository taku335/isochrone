import { type LoadedTimetable } from './index.js';
import {
  resolveReverseServiceLayers,
  resolveServiceLayers,
  type ServiceLayer,
  type ServiceMinuteOffset,
} from './service-days.js';

export type Minutes = number;

export const UNREACHED = 0xffff;
export const DEFAULT_MAX_ROUNDS = 5;

export interface EarliestArrivalQuery {
  readonly kind: 'earliestArrival';
  readonly origins: readonly Origin[];
  readonly originPoint?: PointOrigin;
  readonly serviceDate: string;
  readonly maxRounds?: number;
}

export interface PointOrigin {
  readonly lon: number;
  readonly lat: number;
  readonly departure: Minutes;
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

export interface EarliestArrivalResult {
  readonly kind: 'earliestArrival';
  readonly arrival: Uint16Array;
  readonly rounds: number;
}

export type OneToAllResult = EarliestArrivalResult;

export interface LatestDepartureResult {
  readonly kind: 'latestDeparture';
  readonly departure: Uint16Array;
  readonly rounds: number;
}

export type RouteResult = EarliestArrivalResult | LatestDepartureResult;

interface BoardedTrip {
  readonly tripIndex: number;
  readonly minuteOffset: ServiceMinuteOffset;
}

export function route(
  data: LoadedTimetable,
  query: EarliestArrivalQuery,
): EarliestArrivalResult;
export function route(
  data: LoadedTimetable,
  query: LatestDepartureQuery,
): LatestDepartureResult;
export function route(data: LoadedTimetable, query: Query): RouteResult;
export function route(data: LoadedTimetable, query: Query): RouteResult {
  return query.kind === 'earliestArrival'
    ? routeEarliestArrival(data, query)
    : routeLatestDeparture(data, query);
}

function routeEarliestArrival(
  data: LoadedTimetable,
  query: EarliestArrivalQuery,
): EarliestArrivalResult {
  const maxRounds = query.maxRounds ?? DEFAULT_MAX_ROUNDS;
  assertMaxRounds(maxRounds);

  const arrival = new Uint16Array(data.stopIds.length);
  arrival.fill(UNREACHED);
  let marked = new Uint8Array(data.stopIds.length);
  const footpathRows = buildFootpathRows(data);

  for (const origin of query.origins) {
    assertStopIndex(origin.stopIndex, data.stopIds.length);
    assertMinute(origin.departure, 'Origin departure');
    if (origin.departure < (arrival[origin.stopIndex] ?? UNREACHED)) {
      arrival[origin.stopIndex] = origin.departure;
      marked[origin.stopIndex] = 1;
    }
  }

  const originSources = marked.slice();
  relaxFootpaths(data, originSources, arrival.slice(), arrival, marked, footpathRows);

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

    const footpathSources = nextMarked.slice();
    relaxFootpaths(
      data,
      footpathSources,
      arrival.slice(),
      arrival,
      nextMarked,
      footpathRows,
    );
    rounds = round;
    marked = nextMarked;
    if (!marked.some((value) => value !== 0)) {
      break;
    }
  }

  return { kind: 'earliestArrival', arrival, rounds };
}

function routeLatestDeparture(
  data: LoadedTimetable,
  query: LatestDepartureQuery,
): LatestDepartureResult {
  const maxRounds = query.maxRounds ?? DEFAULT_MAX_ROUNDS;
  assertMaxRounds(maxRounds);

  const departure = new Uint16Array(data.stopIds.length);
  departure.fill(UNREACHED);
  let marked = new Uint8Array(data.stopIds.length);
  const inboundFootpaths = buildInboundFootpaths(data);

  for (const destination of query.destinations) {
    assertStopIndex(destination.stopIndex, data.stopIds.length);
    assertMinute(destination.arrival, 'Destination arrival');
    if (improvesLatest(destination.arrival, departure[destination.stopIndex] ?? UNREACHED)) {
      departure[destination.stopIndex] = destination.arrival;
      marked[destination.stopIndex] = 1;
    }
  }

  const destinationSources = marked.slice();
  relaxInboundFootpaths(
    destinationSources,
    departure.slice(),
    departure,
    marked,
    inboundFootpaths,
  );

  const layers = resolveReverseServiceLayers(
    data.calendar,
    normalizeServiceDate(query.serviceDate),
  );
  const activeServices = layers.map((layer) => buildActiveServices(data, layer));
  const stopPatternRows = buildStopPatternRows(data);
  const queuedEnds = new Int32Array(Math.max(data.patterns.stopOffsets.length - 1, 0));
  let rounds = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    queuedEnds.fill(-1);
    queueMarkedPatternsReverse(data, marked, stopPatternRows, queuedEnds);
    if (!queuedEnds.some((end) => end >= 0)) {
      break;
    }

    const previous = departure.slice();
    const nextMarked = new Uint8Array(data.stopIds.length);

    for (let patternIndex = 0; patternIndex < queuedEnds.length; patternIndex += 1) {
      const endPosition = queuedEnds[patternIndex] ?? -1;
      if (endPosition < 0) {
        continue;
      }
      scanPatternReverse(
        data,
        patternIndex,
        endPosition,
        previous,
        departure,
        nextMarked,
        layers,
        activeServices,
      );
    }

    const footpathSources = nextMarked.slice();
    relaxInboundFootpaths(
      footpathSources,
      departure.slice(),
      departure,
      nextMarked,
      inboundFootpaths,
    );
    rounds = round;
    marked = nextMarked;
    if (!marked.some((value) => value !== 0)) {
      break;
    }
  }

  return { kind: 'latestDeparture', departure, rounds };
}

function relaxFootpaths(
  data: LoadedTimetable,
  sources: Uint8Array,
  sourceArrival: Uint16Array,
  arrival: Uint16Array,
  marked: Uint8Array,
  footpathRows: Int32Array,
): void {
  sources.forEach((isSource, stopIndex) => {
    if (isSource === 0) {
      return;
    }
    const reachedAt = sourceArrival[stopIndex] ?? UNREACHED;
    const row = footpathRows[stopIndex] ?? -1;
    if (reachedAt === UNREACHED || row < 0) {
      return;
    }

    const edgeStart = data.footpaths.offsets[row] ?? 0;
    const edgeEnd = data.footpaths.offsets[row + 1] ?? edgeStart;
    for (let edge = edgeStart; edge < edgeEnd; edge += 1) {
      const targetStopIndex = data.footpaths.targetStopIndices[edge];
      const duration = data.footpaths.durations[edge];
      if (targetStopIndex === undefined || duration === undefined) {
        continue;
      }
      const transferredArrival = reachedAt + duration;
      if (
        transferredArrival < UNREACHED &&
        transferredArrival < (arrival[targetStopIndex] ?? UNREACHED)
      ) {
        arrival[targetStopIndex] = transferredArrival;
        marked[targetStopIndex] = 1;
      }
    }
  });
}

interface InboundFootpaths {
  readonly offsets: Int32Array;
  readonly sourceStopIndices: Int32Array;
  readonly durations: Uint16Array;
}

function relaxInboundFootpaths(
  destinations: Uint8Array,
  destinationDeparture: Uint16Array,
  departure: Uint16Array,
  marked: Uint8Array,
  inbound: InboundFootpaths,
): void {
  destinations.forEach((isDestination, stopIndex) => {
    if (isDestination === 0) {
      return;
    }
    const leaveDestinationBy = destinationDeparture[stopIndex] ?? UNREACHED;
    if (leaveDestinationBy === UNREACHED) {
      return;
    }

    const edgeStart = inbound.offsets[stopIndex] ?? 0;
    const edgeEnd = inbound.offsets[stopIndex + 1] ?? edgeStart;
    for (let edge = edgeStart; edge < edgeEnd; edge += 1) {
      const sourceStopIndex = inbound.sourceStopIndices[edge];
      const duration = inbound.durations[edge];
      if (sourceStopIndex === undefined || duration === undefined) {
        continue;
      }
      const transferredDeparture = leaveDestinationBy - duration;
      if (
        transferredDeparture >= 0 &&
        improvesLatest(transferredDeparture, departure[sourceStopIndex] ?? UNREACHED)
      ) {
        departure[sourceStopIndex] = transferredDeparture;
        marked[sourceStopIndex] = 1;
      }
    }
  });
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

function scanPatternReverse(
  data: LoadedTimetable,
  patternIndex: number,
  endPosition: number,
  previous: Uint16Array,
  departure: Uint16Array,
  nextMarked: Uint8Array,
  layers: readonly ServiceLayer[],
  activeServices: readonly Uint8Array[],
): void {
  const stopStart = data.patterns.stopOffsets[patternIndex] ?? 0;
  let boarded: BoardedTrip | null = null;

  for (let position = endPosition; position >= 0; position -= 1) {
    const stopIndex = data.patterns.stopIndices[stopStart + position];
    if (stopIndex === undefined) {
      continue;
    }

    if (boarded !== null) {
      const leaveAt = getGlobalTripTime(data, boarded, position, true);
      if (
        leaveAt >= 0 &&
        leaveAt < UNREACHED &&
        improvesLatest(leaveAt, departure[stopIndex] ?? UNREACHED)
      ) {
        departure[stopIndex] = leaveAt;
        nextMarked[stopIndex] = 1;
      }
    }

    const arriveBy = previous[stopIndex] ?? UNREACHED;
    if (arriveBy === UNREACHED) {
      continue;
    }

    const candidate = findLatestAlightableTrip(
      data,
      patternIndex,
      position,
      arriveBy,
      layers,
      activeServices,
    );
    if (
      candidate !== null &&
      (boarded === null ||
        getGlobalTripTime(data, candidate, position, false) >
          getGlobalTripTime(data, boarded, position, false))
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

function findLatestAlightableTrip(
  data: LoadedTimetable,
  patternIndex: number,
  stopPosition: number,
  arriveBy: number,
  layers: readonly ServiceLayer[],
  activeServices: readonly Uint8Array[],
): BoardedTrip | null {
  const tripStart = data.patterns.tripOffsets[patternIndex] ?? 0;
  const tripEnd = data.patterns.tripOffsets[patternIndex + 1] ?? tripStart;
  let best: BoardedTrip | null = null;

  layers.forEach((layer, layerIndex) => {
    const localArriveBy = arriveBy + layer.minuteOffset;
    if (localArriveBy < 0 || localArriveBy >= UNREACHED) {
      return;
    }

    const active = activeServices[layerIndex];
    if (active === undefined) {
      return;
    }

    let tripIndex = upperBoundTripArrival(
      data,
      tripStart,
      tripEnd,
      stopPosition,
      localArriveBy,
    ) - 1;
    while (tripIndex >= tripStart) {
      const serviceIndex = data.trips.serviceIndices[tripIndex] ?? -1;
      if ((active[serviceIndex] ?? 0) !== 0) {
        const candidate: BoardedTrip = { tripIndex, minuteOffset: layer.minuteOffset };
        if (
          best === null ||
          getGlobalTripTime(data, candidate, stopPosition, false) >
            getGlobalTripTime(data, best, stopPosition, false)
        ) {
          best = candidate;
        }
        break;
      }
      tripIndex -= 1;
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

function upperBoundTripArrival(
  data: LoadedTimetable,
  start: number,
  end: number,
  stopPosition: number,
  arriveBy: number,
): number {
  let low = start;
  let high = end;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const arrival = readTripTime(data, middle, stopPosition, false);
    if (arrival <= arriveBy) {
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

function getGlobalTripTime(
  data: LoadedTimetable,
  trip: BoardedTrip,
  stopPosition: number,
  departure: boolean,
): number {
  return readTripTime(data, trip.tripIndex, stopPosition, departure) - trip.minuteOffset;
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

function queueMarkedPatternsReverse(
  data: LoadedTimetable,
  marked: Uint8Array,
  stopPatternRows: Int32Array,
  queuedEnds: Int32Array,
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
      if (position > (queuedEnds[patternIndex] ?? -1)) {
        queuedEnds[patternIndex] = position;
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

function buildFootpathRows(data: LoadedTimetable): Int32Array {
  const rows = new Int32Array(data.stopIds.length);
  rows.fill(-1);
  data.footpaths.stopIndices.forEach((stopIndex, row) => {
    if (stopIndex >= 0 && stopIndex < rows.length) {
      rows[stopIndex] = row;
    }
  });
  return rows;
}

function buildInboundFootpaths(data: LoadedTimetable): InboundFootpaths {
  const stopCount = data.stopIds.length;
  const counts = new Int32Array(stopCount);
  const footpathRows = buildFootpathRows(data);

  for (let sourceStopIndex = 0; sourceStopIndex < stopCount; sourceStopIndex += 1) {
    const row = footpathRows[sourceStopIndex] ?? -1;
    if (row < 0) {
      continue;
    }
    const edgeStart = data.footpaths.offsets[row] ?? 0;
    const edgeEnd = data.footpaths.offsets[row + 1] ?? edgeStart;
    for (let edge = edgeStart; edge < edgeEnd; edge += 1) {
      const targetStopIndex = data.footpaths.targetStopIndices[edge] ?? -1;
      if (targetStopIndex >= 0 && targetStopIndex < stopCount) {
        counts[targetStopIndex] = (counts[targetStopIndex] ?? 0) + 1;
      }
    }
  }

  const offsets = new Int32Array(stopCount + 1);
  for (let stopIndex = 0; stopIndex < stopCount; stopIndex += 1) {
    offsets[stopIndex + 1] = (offsets[stopIndex] ?? 0) + (counts[stopIndex] ?? 0);
  }
  const edgeCount = offsets[stopCount] ?? 0;
  const sourceStopIndices = new Int32Array(edgeCount);
  const durations = new Uint16Array(edgeCount);
  const cursors = offsets.slice(0, stopCount);

  for (let sourceStopIndex = 0; sourceStopIndex < stopCount; sourceStopIndex += 1) {
    const row = footpathRows[sourceStopIndex] ?? -1;
    if (row < 0) {
      continue;
    }
    const edgeStart = data.footpaths.offsets[row] ?? 0;
    const edgeEnd = data.footpaths.offsets[row + 1] ?? edgeStart;
    for (let edge = edgeStart; edge < edgeEnd; edge += 1) {
      const targetStopIndex = data.footpaths.targetStopIndices[edge] ?? -1;
      const duration = data.footpaths.durations[edge];
      if (targetStopIndex < 0 || targetStopIndex >= stopCount || duration === undefined) {
        continue;
      }
      const cursor = cursors[targetStopIndex] ?? 0;
      sourceStopIndices[cursor] = sourceStopIndex;
      durations[cursor] = duration;
      cursors[targetStopIndex] = cursor + 1;
    }
  }

  return { offsets, sourceStopIndices, durations };
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

function improvesLatest(candidate: number, current: number): boolean {
  return current === UNREACHED || candidate > current;
}
