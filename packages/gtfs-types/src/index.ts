export type AgencyId = `agency:${string}`;

export interface DatasetIdentity {
  readonly agencyId: AgencyId;
  readonly feedVersion: string;
}

export function createDatasetIdentity(agencyId: AgencyId, feedVersion: string): DatasetIdentity {
  return { agencyId, feedVersion };
}

export type PrefixedId = `${string}:${string}`;

export type MinutesSinceServiceDayStart = number;

export interface NormalizedGtfs {
  readonly agencyId: string;
  readonly idPrefix: string;
  readonly stops: readonly NormalizedStop[];
  readonly routes: readonly NormalizedRoute[];
  readonly trips: readonly NormalizedTrip[];
  readonly stopTimes: readonly NormalizedStopTime[];
  readonly calendar: readonly NormalizedCalendar[];
  readonly calendarDates: readonly NormalizedCalendarDate[];
}

export interface NormalizedStop {
  readonly stopId: PrefixedId;
  readonly stopName: string;
  readonly stopLat: number;
  readonly stopLon: number;
  readonly stopCode?: string;
  readonly stopNameKana?: string;
}

export interface NormalizedRoute {
  readonly routeId: PrefixedId;
  readonly routeShortName: string;
  readonly routeLongName: string;
  readonly routeType: number;
}

export interface NormalizedTrip {
  readonly tripId: PrefixedId;
  readonly routeId: PrefixedId;
  readonly serviceId: PrefixedId;
  readonly tripHeadsign?: string;
  readonly directionId?: number;
}

export interface NormalizedStopTime {
  readonly tripId: PrefixedId;
  readonly stopId: PrefixedId;
  readonly stopSequence: number;
  readonly arrivalTime: MinutesSinceServiceDayStart;
  readonly departureTime: MinutesSinceServiceDayStart;
}

export interface NormalizedCalendar {
  readonly serviceId: PrefixedId;
  readonly monday: boolean;
  readonly tuesday: boolean;
  readonly wednesday: boolean;
  readonly thursday: boolean;
  readonly friday: boolean;
  readonly saturday: boolean;
  readonly sunday: boolean;
  readonly startDate: string;
  readonly endDate: string;
}

export interface NormalizedCalendarDate {
  readonly serviceId: PrefixedId;
  readonly date: string;
  readonly exceptionType: 1 | 2;
}

export interface CompactTimetable {
  readonly patternStopOffsets: readonly number[];
  readonly patternStopIds: readonly PrefixedId[];
  readonly patternTripOffsets: readonly number[];
  readonly tripIds: readonly PrefixedId[];
  readonly tripServiceIds: readonly PrefixedId[];
  readonly tripTimeOffsets: readonly number[];
  readonly tripTimeDeltas: readonly number[];
  readonly stopPatternOffsets: readonly number[];
  readonly stopPatternStopIds: readonly PrefixedId[];
  readonly stopPatternIndices: readonly number[];
  readonly warnings: readonly string[];
}

export interface FootpathCsr {
  readonly stopIds: readonly PrefixedId[];
  readonly offsets: readonly number[];
  readonly targetStopIds: readonly PrefixedId[];
  readonly durations: readonly number[];
  readonly sameNameGroups: readonly StopNameGroup[];
}

export interface StopNameGroup {
  readonly name: string;
  readonly stopIds: readonly PrefixedId[];
}

export interface BrowserDatasetFile {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly gzipBytes: number;
}

export interface BrowserDatasetManifest {
  readonly formatVersion: 1;
  readonly agencyId: string;
  readonly feedVersion: string;
  readonly servicePeriod: BrowserDatasetServicePeriod;
  readonly files: {
    readonly stops: BrowserDatasetFile;
    readonly timetable: BrowserDatasetFile;
  };
  readonly sizeGate: {
    readonly limitBytes: number;
    readonly dataGzipBytes: number;
  };
}

export interface BrowserDatasetServicePeriod {
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export interface BrowserStopsDataset {
  readonly formatVersion: 1;
  readonly agencyId: string;
  readonly stops: {
    readonly ids: readonly PrefixedId[];
    readonly names: readonly string[];
    readonly nameKanas: readonly (string | null)[];
    readonly codes: readonly (string | null)[];
    readonly lats: readonly number[];
    readonly lons: readonly number[];
  };
  readonly footpaths: FootpathCsr;
}

export interface BrowserTimetableDataset {
  readonly formatVersion: 1;
  readonly agencyId: string;
  readonly routes: {
    readonly ids: readonly PrefixedId[];
    readonly shortNames: readonly string[];
    readonly longNames: readonly string[];
    readonly types: readonly number[];
  };
  readonly patterns: {
    readonly stopOffsets: readonly number[];
    readonly stopIds: readonly PrefixedId[];
    readonly tripOffsets: readonly number[];
  };
  readonly trips: {
    readonly ids: readonly PrefixedId[];
    readonly routeIds: readonly PrefixedId[];
    readonly serviceIds: readonly PrefixedId[];
    readonly timeOffsets: readonly number[];
    readonly timeDeltas: readonly number[];
  };
  readonly stopPatternIndex: {
    readonly stopOffsets: readonly number[];
    readonly stopIds: readonly PrefixedId[];
    readonly patternIndices: readonly number[];
  };
  readonly calendar: {
    readonly serviceIds: readonly PrefixedId[];
    readonly weekdayMasks: readonly number[];
    readonly startDates: readonly string[];
    readonly endDates: readonly string[];
    readonly exceptions: {
      readonly serviceIds: readonly PrefixedId[];
      readonly dates: readonly string[];
      readonly types: readonly (1 | 2)[];
    };
  };
  readonly warnings: readonly string[];
}
