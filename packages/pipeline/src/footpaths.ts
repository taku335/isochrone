import {
  type FootpathCsr,
  type NormalizedStop,
  type PrefixedId,
  type StopNameGroup,
} from '@isochrone/gtfs-types';

import { type FootpathConfig } from './agencies.js';

export interface FootpathStats {
  readonly stops: number;
  readonly directedFootpaths: number;
  readonly sameNameGroups: number;
  readonly uniqueStopNames: number;
  readonly symmetric: boolean;
}

export const DEFAULT_FOOTPATH_CONFIG: FootpathConfig = {
  radiusMeters: 300,
  sameNameRadiusMeters: 500,
  walkMetersPerMinute: 80,
  bufferMinutes: 1,
  gridCellMeters: 300,
};

interface ProjectedStop {
  readonly index: number;
  readonly stop: NormalizedStop;
  readonly x: number;
  readonly y: number;
  readonly cellX: number;
  readonly cellY: number;
}

const metersPerDegreeLat = 111_320;

export function buildFootpaths(
  stops: readonly NormalizedStop[],
  config: FootpathConfig = DEFAULT_FOOTPATH_CONFIG,
): FootpathCsr {
  const projectedStops = projectStops(stops, config.gridCellMeters);
  const grid = buildGrid(projectedStops);
  const edges = stops.map(() => new Map<number, number>());
  const neighborRange = Math.ceil(
    Math.max(config.radiusMeters, config.sameNameRadiusMeters) / config.gridCellMeters,
  );

  for (const stop of projectedStops) {
    for (const candidate of nearbyCandidates(stop, grid, neighborRange)) {
      if (candidate.index <= stop.index) {
        continue;
      }

      const distanceMeters = distance(stop, candidate);
      const sameName = stop.stop.stopName === candidate.stop.stopName;
      const limit = sameName ? config.sameNameRadiusMeters : config.radiusMeters;
      if (distanceMeters <= limit) {
        const duration = Math.ceil(distanceMeters / config.walkMetersPerMinute + config.bufferMinutes);
        addSymmetricEdge(edges, stop.index, candidate.index, duration);
      }
    }
  }

  return toFootpathCsr(stops, edges, buildSameNameGroups(stops));
}

export function getFootpathStats(footpaths: FootpathCsr): FootpathStats {
  return {
    stops: footpaths.stopIds.length,
    directedFootpaths: footpaths.targetStopIds.length,
    sameNameGroups: footpaths.sameNameGroups.filter((group) => group.stopIds.length > 1).length,
    uniqueStopNames: footpaths.sameNameGroups.length,
    symmetric: isSymmetricFootpathCsr(footpaths),
  };
}

export function isSymmetricFootpathCsr(footpaths: FootpathCsr): boolean {
  const byStop = new Map<PrefixedId, Map<PrefixedId, number>>();

  footpaths.stopIds.forEach((stopId, index) => {
    const targets = new Map<PrefixedId, number>();
    const start = footpaths.offsets[index] ?? 0;
    const end = footpaths.offsets[index + 1] ?? start;
    for (let cursor = start; cursor < end; cursor += 1) {
      const targetStopId = footpaths.targetStopIds[cursor];
      const duration = footpaths.durations[cursor];
      if (targetStopId !== undefined && duration !== undefined) {
        targets.set(targetStopId, duration);
      }
    }
    byStop.set(stopId, targets);
  });

  for (const [fromStopId, targets] of byStop) {
    for (const [toStopId, duration] of targets) {
      if (byStop.get(toStopId)?.get(fromStopId) !== duration) {
        return false;
      }
    }
  }

  return true;
}

function projectStops(stops: readonly NormalizedStop[], gridCellMeters: number): ProjectedStop[] {
  const meanLat = stops.reduce((sum, stop) => sum + stop.stopLat, 0) / Math.max(stops.length, 1);
  const metersPerDegreeLon = metersPerDegreeLat * Math.cos((meanLat * Math.PI) / 180);

  return stops.map((stop, index) => {
    const x = stop.stopLon * metersPerDegreeLon;
    const y = stop.stopLat * metersPerDegreeLat;
    return {
      index,
      stop,
      x,
      y,
      cellX: Math.floor(x / gridCellMeters),
      cellY: Math.floor(y / gridCellMeters),
    };
  });
}

function buildGrid(stops: readonly ProjectedStop[]): Map<string, ProjectedStop[]> {
  const grid = new Map<string, ProjectedStop[]>();
  for (const stop of stops) {
    const key = cellKey(stop.cellX, stop.cellY);
    const cellStops = grid.get(key) ?? [];
    cellStops.push(stop);
    grid.set(key, cellStops);
  }
  return grid;
}

function nearbyCandidates(
  stop: ProjectedStop,
  grid: ReadonlyMap<string, readonly ProjectedStop[]>,
  neighborRange: number,
): ProjectedStop[] {
  const candidates: ProjectedStop[] = [];
  for (let dx = -neighborRange; dx <= neighborRange; dx += 1) {
    for (let dy = -neighborRange; dy <= neighborRange; dy += 1) {
      candidates.push(...(grid.get(cellKey(stop.cellX + dx, stop.cellY + dy)) ?? []));
    }
  }
  return candidates;
}

function distance(a: ProjectedStop, b: ProjectedStop): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function addSymmetricEdge(
  edges: readonly Map<number, number>[],
  fromIndex: number,
  toIndex: number,
  duration: number,
): void {
  addEdge(edges, fromIndex, toIndex, duration);
  addEdge(edges, toIndex, fromIndex, duration);
}

function addEdge(
  edges: readonly Map<number, number>[],
  fromIndex: number,
  toIndex: number,
  duration: number,
): void {
  const fromEdges = edges[fromIndex];
  if (fromEdges === undefined) {
    throw new Error(`Unknown stop index: ${String(fromIndex)}`);
  }

  const current = fromEdges.get(toIndex);
  if (current === undefined || duration < current) {
    fromEdges.set(toIndex, duration);
  }
}

function toFootpathCsr(
  stops: readonly NormalizedStop[],
  edges: readonly Map<number, number>[],
  sameNameGroups: readonly StopNameGroup[],
): FootpathCsr {
  const offsets = [0];
  const targetStopIds: PrefixedId[] = [];
  const durations: number[] = [];

  edges.forEach((targets) => {
    const sortedTargets = [...targets.entries()].sort(([a], [b]) => a - b);
    for (const [targetIndex, duration] of sortedTargets) {
      const targetStop = stops[targetIndex];
      if (targetStop === undefined) {
        throw new Error(`Unknown target stop index: ${String(targetIndex)}`);
      }
      targetStopIds.push(targetStop.stopId);
      durations.push(duration);
    }
    offsets.push(targetStopIds.length);
  });

  return {
    stopIds: stops.map((stop) => stop.stopId),
    offsets,
    targetStopIds,
    durations,
    sameNameGroups,
  };
}

function buildSameNameGroups(stops: readonly NormalizedStop[]): StopNameGroup[] {
  const byName = new Map<string, PrefixedId[]>();
  for (const stop of stops) {
    const group = byName.get(stop.stopName) ?? [];
    group.push(stop.stopId);
    byName.set(stop.stopName, group);
  }

  return [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, stopIds]) => ({ name, stopIds }));
}

function cellKey(x: number, y: number): string {
  return `${String(x)},${String(y)}`;
}
