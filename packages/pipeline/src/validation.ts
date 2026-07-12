import {
  type BrowserDatasetManifest,
  type BrowserStopsDataset,
  type BrowserTimetableDataset,
  type PrefixedId,
} from '@isochrone/gtfs-types';

export interface BrowserDatasetValidationInput {
  readonly manifest: BrowserDatasetManifest;
  readonly stops: BrowserStopsDataset;
  readonly timetable: BrowserTimetableDataset;
}

export interface BrowserDatasetValidationOptions {
  readonly ranges?: BrowserDatasetValidationRanges;
  readonly goldenStats?: Partial<BrowserDatasetValidationStats>;
}

export interface BrowserDatasetValidationRanges {
  readonly stops: CountRange;
  readonly patterns: CountRange;
  readonly trips: CountRange;
}

export interface CountRange {
  readonly min: number;
  readonly max: number;
}

export interface BrowserDatasetValidationStats {
  readonly stops: number;
  readonly directedFootpaths: number;
  readonly sameNameGroups: number;
  readonly routes: number;
  readonly patterns: number;
  readonly trips: number;
  readonly services: number;
  readonly calendarDates: number;
  readonly warnings: number;
}

export interface BrowserDatasetValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface BrowserDatasetValidationResult {
  readonly ok: boolean;
  readonly stats: BrowserDatasetValidationStats;
  readonly issues: readonly BrowserDatasetValidationIssue[];
}

export const DEFAULT_VALIDATION_RANGES: BrowserDatasetValidationRanges = {
  stops: { min: 1_000, max: 10_000 },
  patterns: { min: 100, max: 5_000 },
  trips: { min: 10_000, max: 100_000 },
};

export function validateBrowserDataset(
  input: BrowserDatasetValidationInput,
  options: BrowserDatasetValidationOptions = {},
): BrowserDatasetValidationResult {
  const issues: BrowserDatasetValidationIssue[] = [];
  const stopIds = new Set(input.stops.stops.ids);
  const routeIds = new Set(input.timetable.routes.ids);
  const serviceIds = new Set([
    ...input.timetable.calendar.serviceIds,
    ...input.timetable.calendar.exceptions.serviceIds,
  ]);
  const patternCount = Math.max(input.timetable.patterns.stopOffsets.length - 1, 0);
  const stats = getValidationStats(input, patternCount, serviceIds.size);

  validateAgencyIds(input, issues);
  validateStops(input.stops, stopIds, issues);
  validateFootpaths(input.stops, stopIds, issues);
  validateRoutes(input.timetable, issues);
  validatePatterns(input.timetable, stopIds, patternCount, issues);
  validateTrips(input.timetable, routeIds, serviceIds, patternCount, issues);
  validateStopPatternIndex(input.timetable, stopIds, patternCount, issues);
  validateCalendar(input.timetable, issues);
  validateRanges(stats, options.ranges ?? DEFAULT_VALIDATION_RANGES, issues);
  validateGoldenStats(stats, options.goldenStats, issues);

  for (const [index, warning] of input.timetable.warnings.entries()) {
    issues.push({
      code: 'timetable-warning',
      path: `timetable.warnings[${String(index)}]`,
      message: warning,
    });
  }

  return {
    ok: issues.length === 0,
    stats,
    issues,
  };
}

function validateAgencyIds(
  input: BrowserDatasetValidationInput,
  issues: BrowserDatasetValidationIssue[],
): void {
  if (input.stops.agencyId !== input.manifest.agencyId) {
    addIssue(issues, 'agency-mismatch', 'stops.agencyId', 'Stops agencyId must match manifest.');
  }
  if (input.timetable.agencyId !== input.manifest.agencyId) {
    addIssue(issues, 'agency-mismatch', 'timetable.agencyId', 'Timetable agencyId must match manifest.');
  }
}

function validateStops(
  stops: BrowserStopsDataset,
  stopIds: ReadonlySet<PrefixedId>,
  issues: BrowserDatasetValidationIssue[],
): void {
  const expected = stops.stops.ids.length;
  validateSameLength('stops.stops', expected, issues, {
    names: stops.stops.names,
    nameKanas: stops.stops.nameKanas,
    codes: stops.stops.codes,
    lats: stops.stops.lats,
    lons: stops.stops.lons,
  });
  validateUnique('stops.stops.ids', stops.stops.ids, issues);

  if (stopIds.size !== expected) {
    addIssue(issues, 'duplicate-stop-id', 'stops.stops.ids', 'Stop ids must be unique.');
  }

  stops.stops.lats.forEach((lat, index) => {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      addIssue(issues, 'invalid-coordinate', `stops.stops.lats[${String(index)}]`, 'Latitude is out of range.');
    }
  });
  stops.stops.lons.forEach((lon, index) => {
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      addIssue(issues, 'invalid-coordinate', `stops.stops.lons[${String(index)}]`, 'Longitude is out of range.');
    }
  });
}

function validateFootpaths(
  stops: BrowserStopsDataset,
  stopIds: ReadonlySet<PrefixedId>,
  issues: BrowserDatasetValidationIssue[],
): void {
  const footpaths = stops.footpaths;
  validateOffsets('stops.footpaths.offsets', footpaths.offsets, footpaths.targetStopIds.length, issues);
  validateSameLength('stops.footpaths', footpaths.targetStopIds.length, issues, {
    durations: footpaths.durations,
  });

  if (footpaths.offsets.length !== footpaths.stopIds.length + 1) {
    addIssue(issues, 'invalid-offsets', 'stops.footpaths.offsets', 'Footpath offsets must be stopIds length + 1.');
  }

  for (const [index, stopId] of footpaths.stopIds.entries()) {
    if (!stopIds.has(stopId)) {
      addIssue(issues, 'missing-stop-ref', `stops.footpaths.stopIds[${String(index)}]`, `Unknown stop: ${stopId}`);
    }
  }

  for (const [index, targetStopId] of footpaths.targetStopIds.entries()) {
    if (!stopIds.has(targetStopId)) {
      addIssue(
        issues,
        'missing-stop-ref',
        `stops.footpaths.targetStopIds[${String(index)}]`,
        `Unknown footpath target stop: ${targetStopId}`,
      );
    }
  }

  for (const [index, duration] of footpaths.durations.entries()) {
    if (!Number.isInteger(duration) || duration <= 0) {
      addIssue(
        issues,
        'invalid-footpath-duration',
        `stops.footpaths.durations[${String(index)}]`,
        'Footpath duration must be a positive integer.',
      );
    }
  }

  footpaths.sameNameGroups.forEach((group, groupIndex) => {
    group.stopIds.forEach((stopId, stopIndex) => {
      if (!stopIds.has(stopId)) {
        addIssue(
          issues,
          'missing-stop-ref',
          `stops.footpaths.sameNameGroups[${String(groupIndex)}].stopIds[${String(stopIndex)}]`,
          `Unknown same-name group stop: ${stopId}`,
        );
      }
    });
  });
}

function validateRoutes(
  timetable: BrowserTimetableDataset,
  issues: BrowserDatasetValidationIssue[],
): void {
  validateSameLength('timetable.routes', timetable.routes.ids.length, issues, {
    shortNames: timetable.routes.shortNames,
    longNames: timetable.routes.longNames,
    types: timetable.routes.types,
  });
  validateUnique('timetable.routes.ids', timetable.routes.ids, issues);
}

function validatePatterns(
  timetable: BrowserTimetableDataset,
  stopIds: ReadonlySet<PrefixedId>,
  patternCount: number,
  issues: BrowserDatasetValidationIssue[],
): void {
  validateOffsets(
    'timetable.patterns.stopOffsets',
    timetable.patterns.stopOffsets,
    timetable.patterns.stopIds.length,
    issues,
  );
  validateOffsets(
    'timetable.patterns.tripOffsets',
    timetable.patterns.tripOffsets,
    timetable.trips.ids.length,
    issues,
  );

  if (timetable.patterns.tripOffsets.length !== patternCount + 1) {
    addIssue(
      issues,
      'invalid-offsets',
      'timetable.patterns.tripOffsets',
      'Pattern trip offsets must be pattern count + 1.',
    );
  }

  for (const [index, stopId] of timetable.patterns.stopIds.entries()) {
    if (!stopIds.has(stopId)) {
      addIssue(
        issues,
        'missing-stop-ref',
        `timetable.patterns.stopIds[${String(index)}]`,
        `Unknown pattern stop: ${stopId}`,
      );
    }
  }
}

function validateTrips(
  timetable: BrowserTimetableDataset,
  routeIds: ReadonlySet<PrefixedId>,
  serviceIds: ReadonlySet<PrefixedId>,
  patternCount: number,
  issues: BrowserDatasetValidationIssue[],
): void {
  validateSameLength('timetable.trips', timetable.trips.ids.length, issues, {
    routeIds: timetable.trips.routeIds,
    serviceIds: timetable.trips.serviceIds,
  });
  validateUnique('timetable.trips.ids', timetable.trips.ids, issues);
  validateOffsets('timetable.trips.timeOffsets', timetable.trips.timeOffsets, timetable.trips.timeDeltas.length, issues);

  if (timetable.trips.timeOffsets.length !== timetable.trips.ids.length + 1) {
    addIssue(issues, 'invalid-offsets', 'timetable.trips.timeOffsets', 'Trip time offsets must be trip count + 1.');
  }

  timetable.trips.routeIds.forEach((routeId, index) => {
    if (!routeIds.has(routeId)) {
      addIssue(issues, 'missing-route-ref', `timetable.trips.routeIds[${String(index)}]`, `Unknown route: ${routeId}`);
    }
  });

  timetable.trips.serviceIds.forEach((serviceId, index) => {
    if (!serviceIds.has(serviceId)) {
      addIssue(
        issues,
        'missing-service-ref',
        `timetable.trips.serviceIds[${String(index)}]`,
        `Unknown service: ${serviceId}`,
      );
    }
  });

  for (let tripIndex = 0; tripIndex < timetable.trips.ids.length; tripIndex += 1) {
    validateTripTimes(timetable, tripIndex, issues);
  }

  if (patternCount > 0 && timetable.patterns.tripOffsets.at(-1) !== timetable.trips.ids.length) {
    addIssue(
      issues,
      'invalid-pattern-trip-index',
      'timetable.patterns.tripOffsets',
      'Pattern trip offsets must cover every trip.',
    );
  }
}

function validateStopPatternIndex(
  timetable: BrowserTimetableDataset,
  stopIds: ReadonlySet<PrefixedId>,
  patternCount: number,
  issues: BrowserDatasetValidationIssue[],
): void {
  const index = timetable.stopPatternIndex;
  validateOffsets('timetable.stopPatternIndex.stopOffsets', index.stopOffsets, index.patternIndices.length, issues);

  if (index.stopOffsets.length !== index.stopIds.length + 1) {
    addIssue(
      issues,
      'invalid-offsets',
      'timetable.stopPatternIndex.stopOffsets',
      'Stop-pattern offsets must be stopIds length + 1.',
    );
  }

  index.stopIds.forEach((stopId, stopIndex) => {
    if (!stopIds.has(stopId)) {
      addIssue(
        issues,
        'missing-stop-ref',
        `timetable.stopPatternIndex.stopIds[${String(stopIndex)}]`,
        `Unknown stop-pattern stop: ${stopId}`,
      );
    }
  });

  index.patternIndices.forEach((patternIndex, itemIndex) => {
    if (!Number.isInteger(patternIndex) || patternIndex < 0 || patternIndex >= patternCount) {
      addIssue(
        issues,
        'missing-pattern-ref',
        `timetable.stopPatternIndex.patternIndices[${String(itemIndex)}]`,
        `Unknown pattern index: ${String(patternIndex)}`,
      );
    }
  });
}

function validateCalendar(
  timetable: BrowserTimetableDataset,
  issues: BrowserDatasetValidationIssue[],
): void {
  validateSameLength('timetable.calendar', timetable.calendar.serviceIds.length, issues, {
    weekdayMasks: timetable.calendar.weekdayMasks,
    startDates: timetable.calendar.startDates,
    endDates: timetable.calendar.endDates,
  });
  timetable.calendar.weekdayMasks.forEach((mask, index) => {
    if (!Number.isInteger(mask) || mask < 0 || mask > 127) {
      addIssue(
        issues,
        'invalid-weekday-mask',
        `timetable.calendar.weekdayMasks[${String(index)}]`,
        'Weekday mask must fit in seven bits.',
      );
    }
  });
  validateSameLength(
    'timetable.calendar.exceptions',
    timetable.calendar.exceptions.serviceIds.length,
    issues,
    {
      dates: timetable.calendar.exceptions.dates,
      types: timetable.calendar.exceptions.types,
    },
  );
}

function validateTripTimes(
  timetable: BrowserTimetableDataset,
  tripIndex: number,
  issues: BrowserDatasetValidationIssue[],
): void {
  const start = timetable.trips.timeOffsets[tripIndex];
  const end = timetable.trips.timeOffsets[tripIndex + 1];
  if (start === undefined || end === undefined) {
    return;
  }

  let previous: number | undefined;
  for (let index = start; index < end; index += 1) {
    const delta = timetable.trips.timeDeltas[index];
    if (delta === undefined) {
      continue;
    }
    const current = previous === undefined ? delta : previous + delta;
    if (previous !== undefined && current < previous) {
      addIssue(
        issues,
        'decreasing-trip-time',
        `timetable.trips.timeDeltas[${String(index)}]`,
        `Trip ${timetable.trips.ids[tripIndex] ?? String(tripIndex)} has decreasing times.`,
      );
      return;
    }
    previous = current;
  }
}

function validateRanges(
  stats: BrowserDatasetValidationStats,
  ranges: BrowserDatasetValidationRanges,
  issues: BrowserDatasetValidationIssue[],
): void {
  validateRange('stats.stops', stats.stops, ranges.stops, issues);
  validateRange('stats.patterns', stats.patterns, ranges.patterns, issues);
  validateRange('stats.trips', stats.trips, ranges.trips, issues);
}

function validateGoldenStats(
  stats: BrowserDatasetValidationStats,
  goldenStats: Partial<BrowserDatasetValidationStats> | undefined,
  issues: BrowserDatasetValidationIssue[],
): void {
  if (goldenStats === undefined) {
    return;
  }

  for (const key of Object.keys(goldenStats) as (keyof BrowserDatasetValidationStats)[]) {
    if (goldenStats[key] !== undefined && stats[key] !== goldenStats[key]) {
      addIssue(
        issues,
        'golden-stat-mismatch',
        `stats.${key}`,
        `Expected ${key} to be ${String(goldenStats[key])}, got ${String(stats[key])}.`,
      );
    }
  }
}

function validateRange(
  path: string,
  value: number,
  range: CountRange,
  issues: BrowserDatasetValidationIssue[],
): void {
  if (value < range.min || value > range.max) {
    addIssue(
      issues,
      'stat-out-of-range',
      path,
      `Expected ${path} to be between ${String(range.min)} and ${String(range.max)}, got ${String(value)}.`,
    );
  }
}

function validateOffsets(
  path: string,
  offsets: readonly number[],
  valuesLength: number,
  issues: BrowserDatasetValidationIssue[],
): void {
  if (offsets[0] !== 0) {
    addIssue(issues, 'invalid-offsets', `${path}[0]`, 'Offsets must start at 0.');
  }

  let previous = offsets[0] ?? 0;
  offsets.forEach((offset, index) => {
    if (!Number.isInteger(offset) || offset < 0 || offset < previous || offset > valuesLength) {
      addIssue(issues, 'invalid-offsets', `${path}[${String(index)}]`, 'Offsets must be monotonic integers.');
    }
    previous = offset;
  });

  if (offsets.at(-1) !== valuesLength) {
    addIssue(issues, 'invalid-offsets', path, 'Last offset must equal values length.');
  }
}

function validateSameLength(
  path: string,
  expected: number,
  issues: BrowserDatasetValidationIssue[],
  arrays: Readonly<Record<string, readonly unknown[]>>,
): void {
  for (const [key, values] of Object.entries(arrays)) {
    if (values.length !== expected) {
      addIssue(
        issues,
        'array-length-mismatch',
        `${path}.${key}`,
        `Expected length ${String(expected)}, got ${String(values.length)}.`,
      );
    }
  }
}

function validateUnique(
  path: string,
  values: readonly string[],
  issues: BrowserDatasetValidationIssue[],
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      addIssue(issues, 'duplicate-id', `${path}[${String(index)}]`, `Duplicate id: ${value}`);
    }
    seen.add(value);
  });
}

function getValidationStats(
  input: BrowserDatasetValidationInput,
  patternCount: number,
  serviceCount: number,
): BrowserDatasetValidationStats {
  return {
    stops: input.stops.stops.ids.length,
    directedFootpaths: input.stops.footpaths.targetStopIds.length,
    sameNameGroups: input.stops.footpaths.sameNameGroups.filter((group) => group.stopIds.length > 1).length,
    routes: input.timetable.routes.ids.length,
    patterns: patternCount,
    trips: input.timetable.trips.ids.length,
    services: serviceCount,
    calendarDates: input.timetable.calendar.exceptions.dates.length,
    warnings: input.timetable.warnings.length,
  };
}

function addIssue(
  issues: BrowserDatasetValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}
