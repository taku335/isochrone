import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type BrowserDatasetManifest,
  type BrowserStopsDataset,
  type PrefixedId,
} from '@isochrone/gtfs-types';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { PIPELINE_HELP, runPipelineCli } from './cli.js';

describe('runPipelineCli', () => {
  it('prints help for --help', async () => {
    const output: string[] = [];

    await expect(runPipelineCli(['--help'], (message) => output.push(message))).resolves.toBe(0);
    expect(output).toEqual([PIPELINE_HELP]);
  });

  it('requires an explicit composite id for multiple agencies', async () => {
    const errors: string[] = [];

    await expect(runPipelineCli(
      ['dataset', 'nagoya-cbus', 'nagoya-subway'],
      () => undefined,
      (message) => errors.push(message),
    )).resolves.toBe(1);
    expect(errors).toEqual([
      'Usage error: dataset requires --dataset-id for multiple agencies.',
    ]);
  });

  it('builds and validates a composite dataset from cached agency feeds', async () => {
    const root = await mkdtemp(join(tmpdir(), 'isochrone-cli-'));
    const configPath = join(root, 'config', 'agencies.json');
    const cacheDir = join(root, 'cache');
    const outDir = join(root, 'dataset');

    try {
      await mkdir(join(root, 'config'), { recursive: true });
      await writeFile(configPath, `${JSON.stringify({
        agencies: [
          agencyConfig('nagoya-cbus', '名古屋市交通局 市バス'),
          agencyConfig('nagoya-subway', '名古屋市交通局 地下鉄'),
        ],
      }, null, 2)}\n`);
      await writeCachedFeed({
        cacheDir,
        agencyId: 'nagoya-cbus',
        feedVersion: 'bus-v1',
        stopLat: 35.1709,
        routeType: 3,
        startDate: '20260701',
        endDate: '20260731',
      });
      await writeCachedFeed({
        cacheDir,
        agencyId: 'nagoya-subway',
        feedVersion: 'subway-v2',
        stopLat: 35.171,
        routeType: 1,
        startDate: '20260715',
        endDate: '20260831',
      });

      const output: string[] = [];
      const errors: string[] = [];
      const commonArgs = [
        'nagoya-subway',
        'nagoya-cbus',
        '--dataset-id',
        'nagoya-transit',
        '--config',
        configPath,
        '--cache-dir',
        cacheDir,
      ];
      await expect(runPipelineCli(
        ['dataset', ...commonArgs, '--out-dir', outDir],
        (message) => output.push(message),
        (message) => errors.push(message),
      )).resolves.toBe(0);
      expect(errors).toEqual([]);
      expect(JSON.parse(output[0] ?? '{}')).toMatchObject({ outDir });

      const manifest = JSON.parse(
        await readFile(join(outDir, 'manifest.json'), 'utf8'),
      ) as BrowserDatasetManifest;
      expect(manifest).toMatchObject({
        agencyId: 'nagoya-transit',
        servicePeriod: { startDate: '20260715', endDate: '20260731' },
        sources: [
          { agencyId: 'nagoya-cbus', feedVersion: 'bus-v1' },
          { agencyId: 'nagoya-subway', feedVersion: 'subway-v2' },
        ],
      });
      expect(manifest.feedVersion).toMatch(/^multi-[0-9a-f]{16}$/);

      const stops = JSON.parse(
        await readFile(join(outDir, manifest.files.stops.path), 'utf8'),
      ) as BrowserStopsDataset;
      expect(footpathTargets(stops, 'nagoya-cbus:SAKAE')).toContain('nagoya-subway:SAKAE');
      expect(footpathTargets(stops, 'nagoya-subway:SAKAE')).toContain('nagoya-cbus:SAKAE');

      const validationOutput: string[] = [];
      const validationErrors: string[] = [];
      await expect(runPipelineCli(
        ['validate', ...commonArgs],
        (message) => validationOutput.push(message),
        (message) => validationErrors.push(message),
      )).resolves.toBe(1);
      expect(JSON.parse(validationOutput[0] ?? '{}')).toMatchObject({
        ok: false,
        stats: { stops: 2, routes: 2, patterns: 2, trips: 2 },
      });
      expect(validationErrors).toHaveLength(3);
      expect(validationErrors.every((message) => message.startsWith('stat-out-of-range:'))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function agencyConfig(id: string, displayName: string) {
  return {
    id,
    displayName,
    ckanEndpoint: 'https://example.test/api',
    packageId: `${id}-gtfs`,
    resourceSelector: { format: 'ZIP' },
    idPrefix: id,
    attribution: {
      datasetUrl: `https://example.test/${id}`,
      licenseName: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  };
}

interface CachedFeedFixture {
  readonly cacheDir: string;
  readonly agencyId: string;
  readonly feedVersion: string;
  readonly stopLat: number;
  readonly routeType: number;
  readonly startDate: string;
  readonly endDate: string;
}

async function writeCachedFeed(options: CachedFeedFixture): Promise<void> {
  const agencyDir = join(options.cacheDir, options.agencyId);
  const zipPath = join(agencyDir, 'feed.zip');
  await mkdir(agencyDir, { recursive: true });
  await writeFile(zipPath, createFixtureZip(options));
  await writeFile(join(agencyDir, 'manifest.json'), `${JSON.stringify({
    agencyId: options.agencyId,
    packageId: `${options.agencyId}-gtfs`,
    resourceId: `${options.agencyId}-resource`,
    resourceName: `${options.agencyId} GTFS`,
    url: `https://example.test/${options.agencyId}.zip`,
    lastModified: options.feedVersion,
    zipPath,
    downloadedAt: '2026-07-18T00:00:00.000Z',
  }, null, 2)}\n`);
}

function createFixtureZip(options: CachedFeedFixture): Uint8Array {
  const files = {
    'stops.txt': csv([
      ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'],
      ['SAKAE', '栄', String(options.stopLat), '136.908'],
    ]),
    'routes.txt': csv([
      ['route_id', 'route_short_name', 'route_long_name', 'route_type'],
      ['R1', 'R1', 'Route 1', String(options.routeType)],
    ]),
    'trips.txt': csv([
      ['route_id', 'service_id', 'trip_id'],
      ['R1', 'WKD', 'T1'],
    ]),
    'stop_times.txt': csv([
      ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
      ['T1', '08:00:00', '08:00:00', 'SAKAE', '1'],
    ]),
    'calendar.txt': csv([
      [
        'service_id',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
        'start_date',
        'end_date',
      ],
      ['WKD', '1', '1', '1', '1', '1', '0', '0', options.startDate, options.endDate],
    ]),
    'calendar_dates.txt': csv([
      ['service_id', 'date', 'exception_type'],
    ]),
  };
  return zipSync(Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, new TextEncoder().encode(content)]),
  ));
}

function csv(rows: readonly (readonly string[])[]): string {
  return `${rows.map((row) => row.join(',')).join('\n')}\n`;
}

function footpathTargets(stops: BrowserStopsDataset, stopId: PrefixedId): readonly PrefixedId[] {
  const stopIndex = stops.footpaths.stopIds.indexOf(stopId);
  const start = stops.footpaths.offsets[stopIndex] ?? 0;
  const end = stops.footpaths.offsets[stopIndex + 1] ?? start;
  return stops.footpaths.targetStopIds.slice(start, end);
}
