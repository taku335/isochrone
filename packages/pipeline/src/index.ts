import { type AgencyId, createDatasetIdentity } from '@isochrone/gtfs-types';

export * from './agencies.js';
export * from './dataset.js';
export * from './downloader.js';
export * from './footpaths.js';
export * from './gtfs-parser.js';
export * from './patterns.js';
export * from './validation.js';

export function describePipelineDataset(agencyId: AgencyId, feedVersion: string): string {
  const dataset = createDatasetIdentity(agencyId, feedVersion);
  return `${dataset.agencyId}@${dataset.feedVersion}`;
}
