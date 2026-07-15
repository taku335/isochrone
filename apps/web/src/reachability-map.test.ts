import { type ReachabilityPolygonsResult } from '@isochrone/raptor';
import { describe, expect, it } from 'vitest';

import { REACHABILITY_COLORS, toPolygonCollection } from './reachability-map.js';

describe('reachability map layers', () => {
  it('orders the 60-minute polygon before the 30-minute polygon', () => {
    expect(toPolygonCollection(polygons).features).toEqual([
      polygons.layers[1]?.feature,
      polygons.layers[0]?.feature,
    ]);
  });

  it('uses distinct color-universal reachability colors', () => {
    expect(new Set(Object.values(REACHABILITY_COLORS)).size).toBe(5);
  });
});

const polygons: ReachabilityPolygonsResult = {
  generationMs: 20,
  layers: [30, 60].map((limitMinutes) => ({
    limitMinutes: limitMinutes as 30 | 60,
    generationMs: 10,
    feature: {
      type: 'Feature',
      properties: { limitMinutes },
      geometry: {
        type: 'Polygon',
        coordinates: [[[136, 35], [137, 35], [137, 36], [136, 35]]],
      },
    },
  })),
};
