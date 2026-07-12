import { type BrowserStopsDataset, type PrefixedId } from '@isochrone/gtfs-types';
import { describe, expect, it } from 'vitest';

import {
  buildStopGroups,
  normalizeSearchText,
  searchStopGroups,
} from './stop-search.js';

describe('stop search', () => {
  it('groups same-name poles and retains every stop index', () => {
    expect(groups[0]).toEqual({
      name: '栄',
      kana: 'さかえ',
      stopIndices: [0, 1],
      center: [136.905, 35.175],
    });
  });

  it('finds Sakae by kanji, hiragana, or katakana', () => {
    expect(searchStopGroups(groups, '栄').map((group) => group.name)).toEqual(['栄']);
    expect(searchStopGroups(groups, 'さかえ').map((group) => group.name)).toEqual(['栄']);
    expect(searchStopGroups(groups, 'サカエ').map((group) => group.name)).toEqual(['栄']);
  });

  it('orders prefix matches before substring matches', () => {
    expect(searchStopGroups(groups, 'なごや').map((group) => group.name)).toEqual([
      '名古屋駅',
      '西名古屋港',
    ]);
  });

  it('normalizes width and whitespace', () => {
    expect(normalizeSearchText(' サカエ　')).toBe('さかえ');
  });
});

const fixture: BrowserStopsDataset = {
  formatVersion: 1,
  agencyId: 'mini',
  stops: {
    ids: [id('S1'), id('S2'), id('S3'), id('S4')],
    names: ['栄', '栄', '名古屋駅', '西名古屋港'],
    nameKanas: ['さかえ', 'さかえ', 'なごやえき', 'にしなごやこう'],
    codes: [null, null, null, null],
    lats: [35.17, 35.18, 35.171, 35.09],
    lons: [136.9, 136.91, 136.88, 136.86],
  },
  footpaths: {
    stopIds: [id('S1'), id('S2'), id('S3'), id('S4')],
    offsets: [0, 0, 0, 0, 0],
    targetStopIds: [],
    durations: [],
    sameNameGroups: [
      { name: '栄', stopIds: [id('S1'), id('S2')] },
      { name: '名古屋駅', stopIds: [id('S3')] },
      { name: '西名古屋港', stopIds: [id('S4')] },
    ],
  },
};

const groups = buildStopGroups(fixture);

function id(value: string): PrefixedId {
  return `mini:${value}` as PrefixedId;
}
