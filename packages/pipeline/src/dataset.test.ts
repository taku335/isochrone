import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { type BrowserDatasetManifest, type NormalizedGtfs } from '@isochrone/gtfs-types';
import { describe, expect, it } from 'vitest';

import {
  buildBrowserDatasetFiles,
  DatasetSizeLimitError,
  writeBrowserDataset,
} from './dataset.js';

describe('buildBrowserDatasetFiles', () => {
  it('creates stable content-hashed browser dataset files', () => {
    const first = buildBrowserDatasetFiles(fixture, { feedVersion: '2026-07-01T00:00:00Z' });
    const second = buildBrowserDatasetFiles(fixture, { feedVersion: '2026-07-01T00:00:00Z' });

    expect(first.manifest.files.stops.path).toMatch(/^stops-[0-9a-f]{16}\.json$/);
    expect(first.manifest.files.timetable.path).toMatch(/^timetable-[0-9a-f]{16}\.json$/);
    expect(second.manifest.files).toEqual(first.manifest.files);
    expect(first.manifest.servicePeriod).toEqual({ startDate: '20260701', endDate: '20260731' });
    expect(first.stops.stops.ids).toEqual(['nagoya-cbus:S1', 'nagoya-cbus:S2']);
    expect(first.timetable.calendar.weekdayMasks).toEqual([31]);
    expect(first.totalGzipBytes).toBeLessThan(1_500_000);
  });

  it('fails when the gzip size gate is exceeded', () => {
    expect(() =>
      buildBrowserDatasetFiles(fixture, {
        feedVersion: '2026-07-01T00:00:00Z',
        sizeLimitBytes: 1,
      }),
    ).toThrow(DatasetSizeLimitError);
  });
});

describe('writeBrowserDataset', () => {
  it('writes manifest, stops, and timetable files', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'isochrone-dataset-'));

    try {
      const result = await writeBrowserDataset(fixture, {
        outDir,
        feedVersion: '2026-07-01T00:00:00Z',
      });
      const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8')) as BrowserDatasetManifest;

      expect(manifest).toEqual(result.manifest);
      await expect(readFile(result.stopsPath, 'utf8')).resolves.toContain('"stops"');
      await expect(readFile(result.timetablePath, 'utf8')).resolves.toContain('"patterns"');
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});

const fixture: NormalizedGtfs = {
  agencyId: 'nagoya-cbus',
  idPrefix: 'nagoya-cbus',
  stops: [
    {
      stopId: 'nagoya-cbus:S2',
      stopName: 'Stop 2',
      stopLat: 35.1709,
      stopLon: 136.91,
      stopNameKana: 'stop-2-kana',
    },
    {
      stopId: 'nagoya-cbus:S1',
      stopName: 'Stop 1',
      stopLat: 35.17,
      stopLon: 136.91,
      stopCode: '001',
      stopNameKana: 'stop-1-kana',
    },
  ],
  routes: [
    {
      routeId: 'nagoya-cbus:R1',
      routeShortName: 'R1',
      routeLongName: 'Route 1',
      routeType: 3,
    },
  ],
  trips: [
    {
      tripId: 'nagoya-cbus:T1',
      routeId: 'nagoya-cbus:R1',
      serviceId: 'nagoya-cbus:WKD',
    },
  ],
  stopTimes: [
    {
      tripId: 'nagoya-cbus:T1',
      stopId: 'nagoya-cbus:S1',
      stopSequence: 1,
      arrivalTime: 480,
      departureTime: 480,
    },
    {
      tripId: 'nagoya-cbus:T1',
      stopId: 'nagoya-cbus:S2',
      stopSequence: 2,
      arrivalTime: 500,
      departureTime: 500,
    },
  ],
  calendar: [
    {
      serviceId: 'nagoya-cbus:WKD',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
      startDate: '20260701',
      endDate: '20260731',
    },
  ],
  calendarDates: [
    {
      serviceId: 'nagoya-cbus:WKD',
      date: '20260720',
      exceptionType: 2,
    },
  ],
};
