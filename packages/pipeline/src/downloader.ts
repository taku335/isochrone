import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { type AgencyConfig } from './agencies.js';

export interface CkanResource {
  readonly id: string;
  readonly name: string;
  readonly format: string;
  readonly url: string;
  readonly lastModified: string;
  readonly size?: number;
}

export interface DownloadManifest {
  readonly agencyId: string;
  readonly packageId: string;
  readonly resourceId: string;
  readonly resourceName: string;
  readonly url: string;
  readonly lastModified: string;
  readonly zipPath: string;
  readonly downloadedAt: string;
}

export interface DownloadResult {
  readonly status: 'downloaded' | 'cached';
  readonly manifest: DownloadManifest;
}

export interface GtfsUpdateCheck {
  readonly updateAvailable: boolean;
  readonly currentLastModified: string | null;
  readonly remote: CkanResource;
}

export interface DownloadOptions {
  readonly agency: AgencyConfig;
  readonly cacheDir: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}

export async function checkGtfsUpdate(
  agency: AgencyConfig,
  currentLastModified: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<GtfsUpdateCheck> {
  const remote = await resolveCkanResource(agency, fetchImpl);
  return {
    updateAvailable: isUpdateAvailable(
      remote.lastModified,
      currentLastModified === null ? null : { lastModified: currentLastModified },
    ),
    currentLastModified,
    remote,
  };
}

interface CkanPackageResponse {
  readonly success: boolean;
  readonly result?: {
    readonly resources?: readonly unknown[];
  };
  readonly error?: {
    readonly message?: string;
  };
}

export async function downloadGtfsZip(options: DownloadOptions): Promise<DownloadResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const resource = await resolveCkanResource(options.agency, fetchImpl);
  const agencyCacheDir = join(options.cacheDir, options.agency.id);
  const manifestPath = join(agencyCacheDir, 'manifest.json');
  const zipPath = join(agencyCacheDir, getZipFileName(resource));
  const previousManifest = await readDownloadManifest(manifestPath);

  if (
    previousManifest?.lastModified === resource.lastModified &&
    previousManifest.resourceId === resource.id &&
    (await fileExists(zipPath))
  ) {
    return { status: 'cached', manifest: previousManifest };
  }

  const response = await fetchImpl(resource.url);
  if (!response.ok) {
    throw new Error(`Failed to download GTFS zip: ${String(response.status)} ${response.statusText}`);
  }

  await mkdir(agencyCacheDir, { recursive: true });
  await writeFile(zipPath, Buffer.from(await response.arrayBuffer()));

  const manifest: DownloadManifest = {
    agencyId: options.agency.id,
    packageId: options.agency.packageId,
    resourceId: resource.id,
    resourceName: resource.name,
    url: resource.url,
    lastModified: resource.lastModified,
    zipPath,
    downloadedAt: now().toISOString(),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return { status: 'downloaded', manifest };
}

export async function resolveCkanResource(
  agency: AgencyConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<CkanResource> {
  const endpoint = new URL(agency.ckanEndpoint);
  endpoint.searchParams.set('id', agency.packageId);

  const response = await fetchImpl(endpoint);
  if (!response.ok) {
    throw new Error(`Failed to resolve CKAN package: ${String(response.status)} ${response.statusText}`);
  }

  const payload = (await response.json()) as CkanPackageResponse;
  if (!payload.success) {
    throw new Error(payload.error?.message ?? `CKAN package_show failed for ${agency.packageId}`);
  }

  const resources = payload.result?.resources?.map(parseCkanResource) ?? [];
  return selectCkanResource(resources, agency);
}

export function selectCkanResource(
  resources: readonly CkanResource[],
  agency: AgencyConfig,
): CkanResource {
  const selected = resources
    .filter((resource) => matchesSelector(resource, agency))
    .sort((a, b) => {
      if (agency.resourceSelector.preferLatest === false) {
        return 0;
      }
      return Date.parse(b.lastModified) - Date.parse(a.lastModified);
    })[0];

  if (selected === undefined) {
    throw new Error(`No matching GTFS resource found for ${agency.id}.`);
  }

  return selected;
}

export function isUpdateAvailable(
  remoteLastModified: string,
  manifest: Pick<DownloadManifest, 'lastModified'> | null,
): boolean {
  return manifest === null || manifest.lastModified !== remoteLastModified;
}

export async function readDownloadManifest(path: string): Promise<DownloadManifest | null> {
  try {
    return parseDownloadManifest(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function parseCkanResource(value: unknown): CkanResource {
  if (!isRecord(value)) {
    throw new Error('Invalid CKAN resource.');
  }

  const resource: CkanResource = {
    id: readString(value, 'id'),
    name: readString(value, 'name'),
    format: readString(value, 'format'),
    url: readString(value, 'url'),
    lastModified: readString(value, 'last_modified'),
  };

  return typeof value.size === 'number' ? { ...resource, size: value.size } : resource;
}

function parseDownloadManifest(value: unknown): DownloadManifest {
  if (!isRecord(value)) {
    throw new Error('Invalid download manifest.');
  }

  return {
    agencyId: readString(value, 'agencyId'),
    packageId: readString(value, 'packageId'),
    resourceId: readString(value, 'resourceId'),
    resourceName: readString(value, 'resourceName'),
    url: readString(value, 'url'),
    lastModified: readString(value, 'lastModified'),
    zipPath: readString(value, 'zipPath'),
    downloadedAt: readString(value, 'downloadedAt'),
  };
}

function matchesSelector(resource: CkanResource, agency: AgencyConfig): boolean {
  const { format, nameIncludes } = agency.resourceSelector;
  const formatMatches = format === undefined || resource.format.toLowerCase() === format.toLowerCase();
  const nameMatches =
    nameIncludes === undefined || nameIncludes.every((needle) => resource.name.includes(needle));
  return formatMatches && nameMatches;
}

function getZipFileName(resource: CkanResource): string {
  const name = basename(new URL(resource.url).pathname);
  return name.endsWith('.zip') ? name : `${resource.id}.zip`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function readString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected non-empty string at ${key}.`);
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
