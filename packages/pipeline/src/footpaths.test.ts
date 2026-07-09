import { type NormalizedStop, type PrefixedId } from '@isochrone/gtfs-types';
import { describe, expect, it } from 'vitest';

import {
  buildFootpaths,
  DEFAULT_FOOTPATH_CONFIG,
  getFootpathStats,
  isSymmetricFootpathCsr,
} from './footpaths.js';

describe('buildFootpaths', () => {
  it('creates symmetric CSR edges within the normal radius', () => {
    const footpaths = buildFootpaths(stops, DEFAULT_FOOTPATH_CONFIG);

    expect(isSymmetricFootpathCsr(footpaths)).toBe(true);
    expect(targetsFor(footpaths, 'nagoya-cbus:A')).toContain('nagoya-cbus:B');
    expect(targetsFor(footpaths, 'nagoya-cbus:B')).toContain('nagoya-cbus:A');
  });

  it('connects same-name stops up to the same-name radius', () => {
    const footpaths = buildFootpaths(stops, DEFAULT_FOOTPATH_CONFIG);

    expect(targetsFor(footpaths, 'nagoya-cbus:A')).toContain('nagoya-cbus:C');
    expect(footpaths.sameNameGroups).toContainEqual({
      name: 'Sakae',
      stopIds: ['nagoya-cbus:A', 'nagoya-cbus:C'],
    });
  });

  it('reflects parameter changes in the output', () => {
    const narrow = buildFootpaths(stops, {
      ...DEFAULT_FOOTPATH_CONFIG,
      radiusMeters: 50,
      sameNameRadiusMeters: 50,
    });

    expect(getFootpathStats(narrow).directedFootpaths).toBe(0);
  });
});

const stops: readonly NormalizedStop[] = [
  stop('A', 'Sakae', 35.17, 136.91),
  stop('B', 'Hisaya', 35.1709, 136.91),
  stop('C', 'Sakae', 35.1738, 136.91),
];

function stop(id: string, name: string, lat: number, lon: number): NormalizedStop {
  return {
    stopId: `nagoya-cbus:${id}`,
    stopName: name,
    stopLat: lat,
    stopLon: lon,
  };
}

function targetsFor(
  footpaths: ReturnType<typeof buildFootpaths>,
  stopId: PrefixedId,
): readonly PrefixedId[] {
  const index = footpaths.stopIds.indexOf(stopId);
  const start = footpaths.offsets[index] ?? 0;
  const end = footpaths.offsets[index + 1] ?? start;
  return footpaths.targetStopIds.slice(start, end);
}
