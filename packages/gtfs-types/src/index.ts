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
