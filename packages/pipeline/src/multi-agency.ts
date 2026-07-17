import { createHash } from 'node:crypto';

import {
  type BrowserDatasetAttribution,
  type BrowserDatasetServicePeriod,
  type BrowserDatasetSource,
  type NormalizedGtfs,
  type PrefixedId,
} from '@isochrone/gtfs-types';

export interface NormalizedGtfsSource {
  readonly gtfs: NormalizedGtfs;
  readonly displayName: string;
  readonly feedVersion: string;
  readonly attribution?: BrowserDatasetAttribution;
}

export interface MergedNormalizedGtfs {
  readonly gtfs: NormalizedGtfs;
  readonly feedVersion: string;
  readonly sources: readonly BrowserDatasetSource[];
}

export class MultiAgencyMergeError extends Error {}

/**
 * Combines already-prefixed GTFS feeds into one routing dataset.
 *
 * Sources are sorted by agency id so the merged entity order and composite
 * feed version do not depend on caller ordering. Browser dataset generation
 * can then build walking transfers across every source from the merged stops.
 */
export function mergeNormalizedGtfs(
  datasetId: string,
  inputSources: readonly NormalizedGtfsSource[],
): MergedNormalizedGtfs {
  if (datasetId.trim().length === 0) {
    throw new MultiAgencyMergeError('Multi-agency dataset id must not be empty.');
  }
  if (inputSources.length < 2) {
    throw new MultiAgencyMergeError('Multi-agency merge requires at least two GTFS sources.');
  }

  const sources = [...inputSources].sort((a, b) => a.gtfs.agencyId.localeCompare(b.gtfs.agencyId));
  validateSources(sources);

  const gtfs: NormalizedGtfs = {
    agencyId: datasetId,
    idPrefix: datasetId,
    stops: sources.flatMap((source) => source.gtfs.stops),
    routes: sources.flatMap((source) => source.gtfs.routes),
    trips: sources.flatMap((source) => source.gtfs.trips),
    stopTimes: sources.flatMap((source) => source.gtfs.stopTimes),
    calendar: sources.flatMap((source) => source.gtfs.calendar),
    calendarDates: sources.flatMap((source) => source.gtfs.calendarDates),
  };

  validateCrossSourceIds(sources);

  const sourceMetadata = sources.map(createBrowserDatasetSource);
  return {
    gtfs,
    feedVersion: createCompositeFeedVersion(sourceMetadata),
    sources: sourceMetadata,
  };
}

export function getGtfsServicePeriod(gtfs: NormalizedGtfs): BrowserDatasetServicePeriod {
  const dates = [
    ...gtfs.calendar.flatMap((entry) => [entry.startDate, entry.endDate]),
    ...gtfs.calendarDates.map((entry) => entry.date),
  ].filter((date) => date.length > 0);

  if (dates.length === 0) {
    return { startDate: null, endDate: null };
  }

  dates.sort();
  return {
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
  };
}

export function getSharedServicePeriod(
  sources: readonly BrowserDatasetSource[],
): BrowserDatasetServicePeriod {
  const starts = sources.flatMap(({ servicePeriod }) =>
    servicePeriod.startDate === null ? [] : [servicePeriod.startDate],
  );
  const ends = sources.flatMap(({ servicePeriod }) =>
    servicePeriod.endDate === null ? [] : [servicePeriod.endDate],
  );
  if (starts.length !== sources.length || ends.length !== sources.length) {
    return { startDate: null, endDate: null };
  }

  starts.sort();
  ends.sort();
  const startDate = starts.at(-1) ?? null;
  const endDate = ends[0] ?? null;
  if (startDate === null || endDate === null || startDate > endDate) {
    return { startDate: null, endDate: null };
  }
  return { startDate, endDate };
}

function validateSources(sources: readonly NormalizedGtfsSource[]): void {
  validateUniqueValues(sources.map(({ gtfs }) => gtfs.agencyId), 'agency id');
  validateUniqueValues(sources.map(({ gtfs }) => gtfs.idPrefix), 'id prefix');

  for (const source of sources) {
    if (source.displayName.trim().length === 0) {
      throw new MultiAgencyMergeError(`Source ${source.gtfs.agencyId} has an empty display name.`);
    }
    if (source.feedVersion.trim().length === 0) {
      throw new MultiAgencyMergeError(`Source ${source.gtfs.agencyId} has an empty feed version.`);
    }
    validateSourceIdPrefixes(source);
  }
}

function validateSourceIdPrefixes(source: NormalizedGtfsSource): void {
  const expectedPrefix = `${source.gtfs.idPrefix}:`;
  const ids: readonly PrefixedId[] = [
    ...source.gtfs.stops.map(({ stopId }) => stopId),
    ...source.gtfs.routes.map(({ routeId }) => routeId),
    ...source.gtfs.trips.flatMap(({ tripId, routeId, serviceId }) => [tripId, routeId, serviceId]),
    ...source.gtfs.stopTimes.flatMap(({ tripId, stopId }) => [tripId, stopId]),
    ...source.gtfs.calendar.map(({ serviceId }) => serviceId),
    ...source.gtfs.calendarDates.map(({ serviceId }) => serviceId),
  ];
  const invalidId = ids.find((id) => !id.startsWith(expectedPrefix));
  if (invalidId !== undefined) {
    throw new MultiAgencyMergeError(
      `Source ${source.gtfs.agencyId} contains id outside prefix ${source.gtfs.idPrefix}: ${invalidId}`,
    );
  }
}

function validateUniqueValues(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new MultiAgencyMergeError(`Duplicate source ${label}: ${value}`);
    }
    seen.add(value);
  }
}

function validateCrossSourceIds(sources: readonly NormalizedGtfsSource[]): void {
  validateUniqueEntityIds('stop', sources, ({ gtfs }) => gtfs.stops.map(({ stopId }) => stopId));
  validateUniqueEntityIds('route', sources, ({ gtfs }) => gtfs.routes.map(({ routeId }) => routeId));
  validateUniqueEntityIds('trip', sources, ({ gtfs }) => gtfs.trips.map(({ tripId }) => tripId));
  validateUniqueEntityIds('service', sources, ({ gtfs }) => [
    ...gtfs.calendar.map(({ serviceId }) => serviceId),
    ...gtfs.calendarDates.map(({ serviceId }) => serviceId),
  ]);
}

function validateUniqueEntityIds(
  label: string,
  sources: readonly NormalizedGtfsSource[],
  readIds: (source: NormalizedGtfsSource) => readonly PrefixedId[],
): void {
  const seen = new Set<PrefixedId>();
  for (const source of sources) {
    const sourceIds = new Set(readIds(source));
    for (const id of sourceIds) {
      if (seen.has(id)) {
        throw new MultiAgencyMergeError(`Duplicate ${label} id across GTFS sources: ${id}`);
      }
      seen.add(id);
    }
  }
}

export function createBrowserDatasetSource(source: NormalizedGtfsSource): BrowserDatasetSource {
  return {
    agencyId: source.gtfs.agencyId,
    displayName: source.displayName,
    feedVersion: source.feedVersion,
    servicePeriod: getGtfsServicePeriod(source.gtfs),
    ...(source.attribution === undefined ? {} : { attribution: source.attribution }),
  };
}

function createCompositeFeedVersion(sources: readonly BrowserDatasetSource[]): string {
  const identity = sources.map(({ agencyId, feedVersion }) => [agencyId, feedVersion]);
  const digest = createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 16);
  return `multi-${digest}`;
}
