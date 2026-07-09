import { type AgencyId, createDatasetIdentity } from '@isochrone/gtfs-types';

export * from './agencies.js';
export * from './downloader.js';
export * from './gtfs-parser.js';

export function describePipelineDataset(agencyId: AgencyId, feedVersion: string): string {
  const dataset = createDatasetIdentity(agencyId, feedVersion);
  return `${dataset.agencyId}@${dataset.feedVersion}`;
}
