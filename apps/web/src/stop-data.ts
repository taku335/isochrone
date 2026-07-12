import {
  type BrowserDatasetManifest,
  type BrowserStopsDataset,
} from '@isochrone/gtfs-types';

export const DEFAULT_DATASET_MANIFEST_URL = '/data/manifest.json';

export function resolveDatasetManifestUrl(
  environment: Readonly<Record<string, string | undefined>> = import.meta.env,
): string {
  const configuredUrl = environment.VITE_DATASET_MANIFEST_URL?.trim();
  return configuredUrl === undefined || configuredUrl.length === 0
    ? DEFAULT_DATASET_MANIFEST_URL
    : configuredUrl;
}

export async function loadStopDataset(
  manifestUrl: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = window.location.href,
): Promise<BrowserStopsDataset> {
  const absoluteManifestUrl = new URL(manifestUrl, baseUrl).href;
  const manifest = await fetchJson<BrowserDatasetManifest>(absoluteManifestUrl, fetchImpl);
  const stopsUrl = new URL(manifest.files.stops.path, absoluteManifestUrl).href;
  return fetchJson<BrowserStopsDataset>(stopsUrl, fetchImpl);
}

async function fetchJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${String(response.status)} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}
