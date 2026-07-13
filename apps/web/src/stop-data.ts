import {
  type BrowserDatasetManifest,
  type BrowserStopsDataset,
} from '@isochrone/gtfs-types';

export const DEFAULT_DATASET_MANIFEST_URL = '/data/manifest.json';

export interface LoadedStopDataset {
  readonly manifest: BrowserDatasetManifest;
  readonly stops: BrowserStopsDataset;
}

export function resolveDatasetManifestUrl(
  environment: Readonly<Record<string, string | undefined>> = import.meta.env,
): string {
  const configuredUrl = environment.VITE_DATASET_MANIFEST_URL?.trim();
  if (configuredUrl !== undefined && configuredUrl.length > 0) {
    return configuredUrl;
  }
  const baseUrl = environment.BASE_URL?.trim();
  if (baseUrl === undefined || baseUrl.length === 0 || baseUrl === '/') {
    return DEFAULT_DATASET_MANIFEST_URL;
  }
  return `${baseUrl.replace(/\/+$/, '')}/data/manifest.json`;
}

export async function loadStopDataset(
  manifestUrl: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = window.location.href,
): Promise<BrowserStopsDataset> {
  return (await loadStopDatasetWithManifest(manifestUrl, fetchImpl, baseUrl)).stops;
}

export async function loadStopDatasetWithManifest(
  manifestUrl: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = window.location.href,
): Promise<LoadedStopDataset> {
  const absoluteManifestUrl = new URL(manifestUrl, baseUrl).href;
  const manifest = await fetchJson<BrowserDatasetManifest>(absoluteManifestUrl, fetchImpl);
  const stopsUrl = new URL(manifest.files.stops.path, absoluteManifestUrl).href;
  const stops = await fetchJson<BrowserStopsDataset>(stopsUrl, fetchImpl);
  return { manifest, stops };
}

async function fetchJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${String(response.status)} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}
