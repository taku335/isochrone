import { type BrowserStopsDataset, type PrefixedId } from '@isochrone/gtfs-types';
import { describe, expect, it } from 'vitest';

import {
  buildPointOriginIndex,
  POINT_ORIGIN_RADIUS_METERS,
} from './point-origin.js';

describe('point origin index', () => {
  it('returns nearby stops ordered by distance with buffered walking minutes', () => {
    const selection = buildPointOriginIndex(stops).select(136.9, 35.17);

    expect(selection.stops.map(({ stopIndex }) => stopIndex)).toEqual([0, 1]);
    expect(selection.stops[0]).toMatchObject({ distanceMeters: 0, walkMinutes: 1 });
    expect(selection.stops[1]?.distanceMeters).toBeGreaterThan(POINT_ORIGIN_RADIUS_METERS / 2);
    expect(selection.stops[1]?.walkMinutes).toBeGreaterThan(1);
  });

  it('returns an empty selection outside the connection radius', () => {
    expect(buildPointOriginIndex(stops).select(137.1, 35.3).stops).toEqual([]);
  });

  it('rejects invalid coordinates', () => {
    expect(() => buildPointOriginIndex(stops).select(181, 35)).toThrow('Invalid origin coordinate');
  });
});

const stops: BrowserStopsDataset = {
  formatVersion: 1,
  agencyId: 'mini',
  stops: {
    ids: ['A', 'B', 'C'].map((id) => `mini:${id}` as PrefixedId),
    names: ['A', 'B', 'C'],
    nameKanas: [null, null, null],
    codes: [null, null, null],
    lats: [35.17, 35.1745, 35.19],
    lons: [136.9, 136.9, 136.9],
  },
  footpaths: { stopIds: [], offsets: [0], targetStopIds: [], durations: [], sameNameGroups: [] },
};
