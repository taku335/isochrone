import { type BrowserStopsDataset, type PrefixedId } from '@isochrone/gtfs-types';
import { UNREACHED, type WorkerServiceLayer } from '@isochrone/raptor';
import { describe, expect, it } from 'vitest';

import {
  buildReachableStopCollection,
  countReachableStops,
  formatServiceLayers,
  getDefaultDeparture,
  parseDeparture,
} from './departure-search.js';

describe('departure search', () => {
  it('uses local date and time as defaults', () => {
    expect(getDefaultDeparture(new Date(2026, 6, 12, 8, 5))).toEqual({
      date: '2026-07-12',
      time: '08:05',
    });
  });

  it('keeps the selected calendar date and marks 00:00-02:59 as late night', () => {
    expect(parseDeparture('2026-07-08', '02:59')).toEqual({
      serviceDate: '20260708',
      departure: 179,
      isLateNight: true,
    });
    expect(parseDeparture('2026-07-08', '03:00').isLateNight).toBe(false);
  });

  it('builds 30 and 60 minute dot bands and reports the CLI-compatible total', () => {
    const arrival = Uint16Array.from([480, 510, 540, 541, UNREACHED]);
    const collection = buildReachableStopCollection(stops, arrival, 480);
    expect(collection.features.map((feature) => feature.properties.band)).toEqual([30, 30, 60]);
    expect(collection.features.map((feature) => feature.properties.elapsed)).toEqual([0, 30, 60]);
    expect(countReachableStops(arrival)).toBe(4);
  });

  it('shows both service days for late-night searches', () => {
    expect(formatServiceLayers(layers, true)).toBe('指定日: 平日 / 前日深夜: 土曜');
    expect(formatServiceLayers(layers, false)).toBe('指定日: 平日');
  });
});

const layers: readonly WorkerServiceLayer[] = [
  { date: '20260708', minuteOffset: 0, dayType: 'weekday', displayName: '平日' },
  { date: '20260707', minuteOffset: 1440, dayType: 'saturday', displayName: '土曜' },
];

const stops: BrowserStopsDataset = {
  formatVersion: 1,
  agencyId: 'mini',
  stops: {
    ids: [0, 1, 2, 3, 4].map((index) => `mini:${String(index)}` as PrefixedId),
    names: ['A', 'B', 'C', 'D', 'E'],
    nameKanas: [null, null, null, null, null],
    codes: [null, null, null, null, null],
    lats: [35, 35.01, 35.02, 35.03, 35.04],
    lons: [136, 136.01, 136.02, 136.03, 136.04],
  },
  footpaths: { stopIds: [], offsets: [0], targetStopIds: [], durations: [], sameNameGroups: [] },
};
