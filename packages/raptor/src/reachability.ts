import union from '@turf/union';
import {
  type Feature,
  type FeatureCollection,
  type MultiPolygon,
  type Polygon,
} from 'geojson';

import { UNREACHED } from './core.js';

const EARTH_RADIUS_METERS = 6_371_008.8;
const WALKING_METERS_PER_MINUTE = 80;
const MAX_BUFFER_METERS = 960;
const BUFFER_STEPS = 16;
const MIN_BUFFER_METERS = 0.1;
const UNION_BATCH_SIZE = 4;

export const REACHABILITY_LIMITS = [30, 60] as const;

export interface ReachabilityPolygonLayer {
  readonly limitMinutes: (typeof REACHABILITY_LIMITS)[number];
  readonly feature: Feature<Polygon | MultiPolygon> | null;
  readonly generationMs: number;
}

export interface ReachabilityPolygonsResult {
  readonly layers: readonly ReachabilityPolygonLayer[];
  readonly generationMs: number;
}

export interface ReachabilityGenerationOptions {
  readonly now?: () => number;
  readonly originPoint?: { readonly lon: number; readonly lat: number };
}

export function generateReachabilityPolygons(
  stopLats: ArrayLike<number>,
  stopLons: ArrayLike<number>,
  arrival: Uint16Array,
  departure: number,
  options: ReachabilityGenerationOptions = {},
): ReachabilityPolygonsResult {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const layers = REACHABILITY_LIMITS.map((limitMinutes) => {
    const layerStartedAt = now();
    const feature = unionBuffers(
      stopLats,
      stopLons,
      arrival,
      departure,
      limitMinutes,
      options.originPoint,
    );
    return { limitMinutes, feature, generationMs: now() - layerStartedAt };
  });
  return { layers, generationMs: now() - startedAt };
}

function unionBuffers(
  stopLats: ArrayLike<number>,
  stopLons: ArrayLike<number>,
  arrival: Uint16Array,
  departure: number,
  limitMinutes: (typeof REACHABILITY_LIMITS)[number],
  originPoint: { readonly lon: number; readonly lat: number } | undefined,
): Feature<Polygon | MultiPolygon> | null {
  const buffersByCenter = new Map<string, { readonly lon: number; readonly lat: number; radius: number }>();
  arrival.forEach((arrivalMinute, stopIndex) => {
    const elapsed = arrivalMinute - departure;
    const lat = stopLats[stopIndex];
    const lon = stopLons[stopIndex];
    if (
      arrivalMinute === UNREACHED ||
      elapsed < 0 ||
      elapsed > limitMinutes ||
      lat === undefined ||
      lon === undefined
    ) {
      return;
    }
    const radius = Math.max(
      MIN_BUFFER_METERS,
      Math.min((limitMinutes - elapsed) * WALKING_METERS_PER_MINUTE, MAX_BUFFER_METERS),
    );
    const centerKey = `${String(lon)},${String(lat)}`;
    const existing = buffersByCenter.get(centerKey);
    if (existing === undefined) {
      buffersByCenter.set(centerKey, { lon, lat, radius });
    } else if (radius > existing.radius) {
      existing.radius = radius;
    }
  });

  if (originPoint !== undefined) {
    const radius = Math.max(
      MIN_BUFFER_METERS,
      Math.min(limitMinutes * WALKING_METERS_PER_MINUTE, MAX_BUFFER_METERS),
    );
    buffersByCenter.set(`${String(originPoint.lon)},${String(originPoint.lat)}`, {
      lon: originPoint.lon,
      lat: originPoint.lat,
      radius,
    });
  }

  const features = removeContainedBuffers([...buffersByCenter.values()]).map(({ lon, lat, radius }) =>
    createBufferPolygon(lon, lat, radius));
  if (features.length === 0) {
    return null;
  }
  if (features.length === 1) {
    const feature = features[0];
    return feature === undefined
      ? null
      : { ...feature, properties: { limitMinutes } };
  }
  return unionInBatches(features, limitMinutes);
}

interface BufferCircle {
  readonly lon: number;
  readonly lat: number;
  readonly radius: number;
}

function removeContainedBuffers(buffers: readonly BufferCircle[]): readonly BufferCircle[] {
  const accepted: BufferCircle[] = [];
  const grid = new Map<string, BufferCircle[]>();
  const ordered = [...buffers].sort((left, right) => right.radius - left.radius);
  for (const candidate of ordered) {
    const cellX = Math.floor(candidate.lon / 0.01);
    const cellY = Math.floor(candidate.lat / 0.01);
    let contained = false;
    for (let offsetX = -2; offsetX <= 2 && !contained; offsetX += 1) {
      for (let offsetY = -2; offsetY <= 2 && !contained; offsetY += 1) {
        const nearby = grid.get(`${String(cellX + offsetX)},${String(cellY + offsetY)}`) ?? [];
        contained = nearby.some((container) =>
          distanceMeters(candidate, container) + candidate.radius <= container.radius);
      }
    }
    if (contained) {
      continue;
    }
    accepted.push(candidate);
    const key = `${String(cellX)},${String(cellY)}`;
    const cell = grid.get(key);
    if (cell === undefined) {
      grid.set(key, [candidate]);
    } else {
      cell.push(candidate);
    }
  }
  return accepted;
}

function distanceMeters(left: BufferCircle, right: BufferCircle): number {
  const leftLat = toRadians(left.lat);
  const rightLat = toRadians(right.lat);
  const latDelta = rightLat - leftLat;
  const lonDelta = toRadians(right.lon - left.lon);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(lonDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function unionInBatches(
  features: readonly Feature<Polygon | MultiPolygon>[],
  limitMinutes: (typeof REACHABILITY_LIMITS)[number],
): Feature<Polygon | MultiPolygon> | null {
  let pending = [...features];
  while (pending.length > 1) {
    const merged: Feature<Polygon | MultiPolygon>[] = [];
    for (let start = 0; start < pending.length; start += UNION_BATCH_SIZE) {
      const batch = pending.slice(start, start + UNION_BATCH_SIZE);
      if (batch.length === 1) {
        const feature = batch[0];
        if (feature !== undefined) {
          merged.push(feature);
        }
        continue;
      }
      const collection: FeatureCollection<Polygon | MultiPolygon> = {
        type: 'FeatureCollection',
        features: batch,
      };
      const feature = union(collection, { properties: { limitMinutes } });
      if (feature !== null) {
        merged.push(feature);
      }
    }
    pending = merged;
  }
  const feature = pending[0];
  return feature === undefined ? null : { ...feature, properties: { limitMinutes } };
}

function createBufferPolygon(lon: number, lat: number, radiusMeters: number): Feature<Polygon> {
  const centerLat = toRadians(lat);
  const centerLon = toRadians(lon);
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const ring: [number, number][] = [];

  for (let step = 0; step < BUFFER_STEPS; step += 1) {
    const bearing = (step / BUFFER_STEPS) * Math.PI * 2;
    const pointLat = Math.asin(
      Math.sin(centerLat) * Math.cos(angularDistance) +
      Math.cos(centerLat) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLon = centerLon + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLat),
      Math.cos(angularDistance) - Math.sin(centerLat) * Math.sin(pointLat),
    );
    ring.push([normalizeLongitude(toDegrees(pointLon)), toDegrees(pointLat)]);
  }
  const first = ring[0];
  if (first !== undefined) {
    ring.push([...first]);
  }
  return {
    type: 'Feature',
    properties: null,
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

function normalizeLongitude(lon: number): number {
  return ((lon + 540) % 360) - 180;
}

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function toDegrees(radians: number): number {
  return radians * 180 / Math.PI;
}
