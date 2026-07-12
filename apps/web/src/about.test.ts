import { type BrowserDatasetManifest } from '@isochrone/gtfs-types';
import { describe, expect, it } from 'vitest';

import { formatDatasetSummary } from './about.js';

describe('dataset attribution', () => {
  it('derives the displayed version and service period from the manifest', () => {
    expect(formatDatasetSummary(manifest)).toBe(
      'feed_version version-from-manifest / 2026/03/28〜2027/03/27',
    );
  });
});

const manifest: BrowserDatasetManifest = {
  formatVersion: 1,
  agencyId: 'nagoya-cbus',
  feedVersion: 'version-from-manifest',
  servicePeriod: { startDate: '20260328', endDate: '20270327' },
  files: {
    stops: { path: 'stops.json', sha256: 'a', bytes: 1, gzipBytes: 1 },
    timetable: { path: 'timetable.json', sha256: 'b', bytes: 1, gzipBytes: 1 },
  },
  sizeGate: { limitBytes: 1, dataGzipBytes: 1 },
};
