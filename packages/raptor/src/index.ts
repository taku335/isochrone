import { type DatasetIdentity } from '@isochrone/gtfs-types';

export function formatRaptorDatasetLabel(dataset: DatasetIdentity): string {
  return `${dataset.agencyId}:${dataset.feedVersion}`;
}
