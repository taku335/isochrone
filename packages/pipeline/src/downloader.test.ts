import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type AgencyConfig } from './agencies.js';
import {
  checkGtfsUpdate,
  downloadGtfsZip,
  isUpdateAvailable,
  resolveCkanResource,
  selectCkanResource,
  type CkanResource,
} from './downloader.js';

const agency: AgencyConfig = {
  id: 'nagoya-cbus',
  displayName: 'Nagoya City Bus',
  ckanEndpoint: 'https://data.bodik.jp/api/3/action/package_show',
  packageId: '231002_7109030000_bus-gtfs-jp',
  resourceSelector: {
    format: 'ZIP',
    nameIncludes: ['市バスGTFS-JPデータ'],
    preferLatest: true,
  },
  idPrefix: 'nagoya-cbus',
};

const olderResource: CkanResource = {
  id: 'old',
  name: '市バスGTFS-JPデータ 2025年3月29日改正',
  format: 'ZIP',
  url: 'https://example.test/old.zip',
  lastModified: '2025-05-09T00:27:03.685482',
};

const latestResource: CkanResource = {
  id: 'latest',
  name: '市バスGTFS-JPデータ 2026年3月28日改正',
  format: 'ZIP',
  url: 'https://example.test/latest.zip',
  lastModified: '2026-05-18T01:57:40.761365',
};

describe('selectCkanResource', () => {
  it('selects the latest matching zip resource', () => {
    expect(selectCkanResource([olderResource, latestResource], agency)).toEqual(latestResource);
  });
});

describe('isUpdateAvailable', () => {
  it('compares remote last_modified with the local manifest', () => {
    expect(isUpdateAvailable('2026-05-18T01:57:40.761365', null)).toBe(true);
    expect(
      isUpdateAvailable('2026-05-18T01:57:40.761365', {
        lastModified: '2026-05-18T01:57:40.761365',
      }),
    ).toBe(false);
  });
});

describe('checkGtfsUpdate', () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(
      Response.json({
        success: true,
        result: {
          resources: [
            {
              id: latestResource.id,
              name: latestResource.name,
              format: latestResource.format,
              url: latestResource.url,
              last_modified: latestResource.lastModified,
            },
          ],
        },
      }),
    );

  it('reports no update when the approved version matches CKAN', async () => {
    await expect(checkGtfsUpdate(agency, latestResource.lastModified, fetchImpl)).resolves.toEqual({
      updateAvailable: false,
      currentLastModified: latestResource.lastModified,
      remote: latestResource,
    });
  });

  it('reports an update when the approved version is stale', async () => {
    await expect(checkGtfsUpdate(agency, olderResource.lastModified, fetchImpl)).resolves.toMatchObject({
      updateAvailable: true,
      currentLastModified: olderResource.lastModified,
      remote: latestResource,
    });
  });
});

describe('downloadGtfsZip', () => {
  it('downloads once and skips the zip request when last_modified is unchanged', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'isochrone-gtfs-'));
    const requestedUrls: string[] = [];
    const packageResponse = {
      success: true,
      result: {
        resources: [
          {
            id: latestResource.id,
            name: latestResource.name,
            format: latestResource.format,
            url: latestResource.url,
            last_modified: latestResource.lastModified,
          },
        ],
      },
    };
    const fetchImpl: typeof fetch = (input) => {
      const url = stringifyFetchInput(input);
      requestedUrls.push(url);

      if (url.startsWith(agency.ckanEndpoint)) {
        return Promise.resolve(Response.json(packageResponse));
      }

      return Promise.resolve(new Response('zip-bytes'));
    };

    try {
      const first = await downloadGtfsZip({
        agency,
        cacheDir,
        fetchImpl,
        now: () => new Date('2026-07-09T00:00:00.000Z'),
      });
      const second = await downloadGtfsZip({ agency, cacheDir, fetchImpl });

      expect(first.status).toBe('downloaded');
      expect(second.status).toBe('cached');
      expect(requestedUrls).toEqual([
        `${agency.ckanEndpoint}?id=${agency.packageId}`,
        latestResource.url,
        `${agency.ckanEndpoint}?id=${agency.packageId}`,
      ]);
      await expect(readFile(first.manifest.zipPath, 'utf8')).resolves.toBe('zip-bytes');
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('fails when CKAN cannot resolve a matching resource', async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        Response.json({
          success: true,
          result: {
            resources: [],
          },
        }),
      );

    await expect(downloadGtfsZip({ agency, cacheDir: tmpdir(), fetchImpl })).rejects.toThrow(
      'No matching GTFS resource found',
    );
  });
});

describe('resolveCkanResource', () => {
  it('fails when CKAN reports a package resolution error', async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        Response.json({
          success: false,
          error: {
            message: 'Not found',
          },
        }),
      );

    await expect(resolveCkanResource(agency, fetchImpl)).rejects.toThrow('Not found');
  });
});

function stringifyFetchInput(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}
