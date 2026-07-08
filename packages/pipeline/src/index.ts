import { type AgencyId, createDatasetIdentity } from '@isochrone/gtfs-types';

export function describePipelineDataset(agencyId: AgencyId, feedVersion: string): string {
  const dataset = createDatasetIdentity(agencyId, feedVersion);
  return `${dataset.agencyId}@${dataset.feedVersion}`;
}
