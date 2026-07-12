import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAP_STYLE_URL,
  NAGOYA_MAP_CENTER,
  resolveMapConfig,
} from './map-config.js';

describe('resolveMapConfig', () => {
  it('uses the OpenFreeMap Liberty style by default', () => {
    expect(resolveMapConfig({})).toEqual({
      styleUrl: DEFAULT_MAP_STYLE_URL,
      center: NAGOYA_MAP_CENTER,
      zoom: 11.8,
    });
  });

  it('uses a configured style URL', () => {
    expect(resolveMapConfig({ VITE_MAP_STYLE_URL: 'https://maps.example.test/style.json' }).styleUrl)
      .toBe('https://maps.example.test/style.json');
  });

  it('falls back when the configured style URL is blank', () => {
    expect(resolveMapConfig({ VITE_MAP_STYLE_URL: '  ' }).styleUrl).toBe(DEFAULT_MAP_STYLE_URL);
  });
});
