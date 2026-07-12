import { type BrowserDatasetManifest } from '@isochrone/gtfs-types';

export const DATASET_SOURCE_URL =
  'https://data.bodik.jp/dataset/231002_7109030000_bus-gtfs-jp';
export const CC_BY_4_URL = 'https://creativecommons.org/licenses/by/4.0/deed.ja';

export function formatDatasetSummary(manifest: BrowserDatasetManifest): string {
  const { startDate, endDate } = manifest.servicePeriod;
  const period = startDate === null || endDate === null
    ? '有効期間不明'
    : `${formatGtfsDate(startDate)}〜${formatGtfsDate(endDate)}`;
  return `feed_version ${manifest.feedVersion} / ${period}`;
}

function formatGtfsDate(date: string): string {
  return `${date.slice(0, 4)}/${date.slice(4, 6)}/${date.slice(6, 8)}`;
}
