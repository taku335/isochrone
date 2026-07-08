export type AgencyId = `agency:${string}`;

export interface DatasetIdentity {
  readonly agencyId: AgencyId;
  readonly feedVersion: string;
}

export function createDatasetIdentity(agencyId: AgencyId, feedVersion: string): DatasetIdentity {
  return { agencyId, feedVersion };
}
