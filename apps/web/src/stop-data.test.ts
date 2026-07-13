import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DATASET_MANIFEST_URL,
  resolveDatasetManifestUrl,
} from './stop-data.js';

describe('dataset manifest URL', () => {
  it('uses the origin root during local development', () => {
    expect(resolveDatasetManifestUrl({ BASE_URL: '/' })).toBe(DEFAULT_DATASET_MANIFEST_URL);
  });

  it('uses the Vite repository base on GitHub Pages', () => {
    expect(resolveDatasetManifestUrl({ BASE_URL: '/isochrone/' })).toBe(
      '/isochrone/data/manifest.json',
    );
  });

  it('keeps an explicit manifest override', () => {
    expect(resolveDatasetManifestUrl({
      BASE_URL: '/isochrone/',
      VITE_DATASET_MANIFEST_URL: 'https://data.example.test/manifest.json',
    })).toBe('https://data.example.test/manifest.json');
  });
});
