import { describe, expect, it } from 'vitest';

import {
  hasRunnableUrlState,
  readAppUrlState,
  writeAppUrlState,
} from './url-state.js';

describe('URL state', () => {
  it('reads a complete shared search', () => {
    const state = readAppUrlState(
      new URL('https://example.test/?origin=%E6%A0%84&date=2026-07-07&time=08%3A00&view=stops'),
    );
    expect(state).toEqual({
      mode: 'depart',
      origin: '栄',
      destination: null,
      date: '2026-07-07',
      time: '08:00',
      view: 'stops',
    });
    expect(hasRunnableUrlState(state)).toBe(true);
  });

  it('ignores invalid dates and times instead of restoring a broken search', () => {
    const state = readAppUrlState(
      new URL('https://example.test/?origin=%E6%A0%84&date=07-07-2026&time=25%3A00'),
    );
    expect(state.date).toBeNull();
    expect(state.time).toBeNull();
    expect(hasRunnableUrlState(state)).toBe(false);
  });

  it('reads a complete arrive-by search', () => {
    const state = readAppUrlState(
      new URL('https://example.test/?mode=arrive&destination=%E6%A0%84&date=2026-07-07&time=23%3A30'),
    );

    expect(state).toMatchObject({
      mode: 'arrive',
      origin: null,
      destination: '栄',
      date: '2026-07-07',
      time: '23:30',
    });
    expect(hasRunnableUrlState(state)).toBe(true);
  });

  it('writes canonical query parameters while preserving unrelated parameters', () => {
    const updated = writeAppUrlState(new URL('https://example.test/?lang=ja&debug=stops'), {
      mode: 'depart',
      origin: '名古屋駅',
      destination: null,
      date: '2026-07-08',
      time: '09:15',
      view: 'polygons',
    });
    expect(updated.href).toBe(
      'https://example.test/?lang=ja&mode=depart&origin=%E5%90%8D%E5%8F%A4%E5%B1%8B%E9%A7%85&date=2026-07-08&time=09%3A15',
    );
  });
});
