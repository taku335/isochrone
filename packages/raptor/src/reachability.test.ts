import { type MultiPolygon, type Polygon, type Position } from 'geojson';
import { describe, expect, it } from 'vitest';

import { generateReachabilityPolygons, UNREACHED } from './index.js';

describe('reachability polygons', () => {
  it('unions 16-sided walking buffers into valid GeoJSON layers', () => {
    const result = generateReachabilityPolygons(
      [35.17, 35.171, 35.18],
      [136.9, 136.901, 136.91],
      Uint16Array.from([480, 500, UNREACHED]),
      480,
      { now: sequenceNow(10, 12, 20, 22, 42, 50) },
    );

    expect(result.generationMs).toBe(40);
    expect(result.layers.map((layer) => layer.generationMs)).toEqual([8, 20]);
    expect(result.layers.map((layer) => layer.limitMinutes)).toEqual([30, 60]);
    result.layers.forEach((layer) => {
      expect(layer.feature?.geometry.type).toMatch(/^(Multi)?Polygon$/);
      expect(layer.feature?.properties).toEqual({ limitMinutes: layer.limitMinutes });
      expectValidRings(layer.feature?.geometry ?? null);
    });
  });

  it('contains every reached stop in its corresponding 30/60-minute polygon', () => {
    const random = seededRandom(19);
    const departure = 480;
    const lats = Array.from({ length: 60 }, () => 35.1 + random() * 0.18);
    const lons = Array.from({ length: 60 }, () => 136.8 + random() * 0.24);
    const arrival = Uint16Array.from(
      Array.from({ length: 60 }, () => departure + Math.floor(random() * 75)),
    );
    const result = generateReachabilityPolygons(lats, lons, arrival, departure);

    result.layers.forEach((layer) => {
      const geometry = layer.feature?.geometry;
      expect(geometry).not.toBeNull();
      arrival.forEach((arrivalMinute, stopIndex) => {
        if (arrivalMinute - departure <= layer.limitMinutes) {
          expect(
            containsPoint(geometry ?? null, [lons[stopIndex] ?? 0, lats[stopIndex] ?? 0]),
          ).toBe(true);
        }
      });
    });
  });
});

function expectValidRings(geometry: Polygon | MultiPolygon | null): void {
  expect(geometry).not.toBeNull();
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.coordinates ?? [];
  polygons.flat().forEach((ring) => {
    expect(ring.length).toBeGreaterThanOrEqual(4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    ring.flat().forEach((coordinate) => {
      expect(Number.isFinite(coordinate)).toBe(true);
    });
  });
}

function containsPoint(geometry: Polygon | MultiPolygon | null, point: Position): boolean {
  if (geometry === null) {
    return false;
  }
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => {
    const exterior = polygon[0];
    return exterior !== undefined && pointInRing(point, exterior);
  });
}

function pointInRing(point: Position, ring: readonly Position[]): boolean {
  const x = point[0] ?? 0;
  const y = point[1] ?? 0;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (currentPoint === undefined || previousPoint === undefined) {
      continue;
    }
    const currentX = currentPoint[0] ?? 0;
    const currentY = currentPoint[1] ?? 0;
    const previousX = previousPoint[0] ?? 0;
    const previousY = previousPoint[1] ?? 0;
    if (
      (currentY > y) !== (previousY > y) &&
      x < (previousX - currentX) * (y - currentY) / (previousY - currentY) + currentX
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function sequenceNow(...values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}

function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 16_807) % 2_147_483_647;
    return (value - 1) / 2_147_483_646;
  };
}
