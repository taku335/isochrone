import { type BrowserDatasetManifest } from '@isochrone/gtfs-types';

export const DATASET_SOURCE_URL =
  'https://data.bodik.jp/dataset/231002_7109030000_bus-gtfs-jp';
export const CC_BY_4_URL = 'https://creativecommons.org/licenses/by/4.0/deed.ja';

export function formatDatasetSummary(manifest: BrowserDatasetManifest): string {
  const { startDate, endDate } = manifest.servicePeriod;
  const period = startDate === null || endDate === null
    ? '有効期間不明'
    : `${formatGtfsDate(startDate)}〜${formatGtfsDate(endDate)}`;
  const sources = manifest.sources ?? [];
  if (sources.length > 1) {
    const versions = sources
      .map(({ displayName, feedVersion }) => `${displayName} ${feedVersion}`)
      .join(' / ');
    return `feed_versions ${versions} / 共通有効期間 ${period}`;
  }
  return `feed_version ${manifest.feedVersion} / ${period}`;
}

function formatGtfsDate(date: string): string {
  return `${date.slice(0, 4)}/${date.slice(4, 6)}/${date.slice(6, 8)}`;
}
