import { type PrefixedId } from '@isochrone/gtfs-types';

import { type LoadedCalendar } from './index.js';

export interface ServiceLayer {
  readonly date: string;
  readonly minuteOffset: ServiceMinuteOffset;
  readonly serviceIndices: Int32Array;
  readonly serviceIds: readonly PrefixedId[];
  readonly dayType: ServiceDayType;
  readonly displayName: string;
}

export type ServiceMinuteOffset = -1440 | 0 | 1440;
export type ServiceDayType = 'weekday' | 'saturday' | 'sunday_holiday' | 'custom' | 'none';

export function resolveServiceLayers(calendar: LoadedCalendar, date: string): readonly [ServiceLayer, ServiceLayer] {
  return resolveForwardServiceLayers(calendar, date);
}

export function resolveForwardServiceLayers(
  calendar: LoadedCalendar,
  date: string,
): readonly [ServiceLayer, ServiceLayer] {
  assertDateInFeedPeriod(calendar, date);
  const previousDate = addDays(date, -1);

  return [
    resolveServiceLayer(calendar, date, 0),
    isDateInFeedPeriod(calendar, previousDate)
      ? resolveServiceLayer(calendar, previousDate, 1440)
      : emptyServiceLayer(previousDate, 1440),
  ];
}

export function resolveReverseServiceLayers(
  calendar: LoadedCalendar,
  date: string,
): readonly [ServiceLayer, ServiceLayer] {
  assertDateInFeedPeriod(calendar, date);
  const nextDate = addDays(date, 1);

  return [
    resolveServiceLayer(calendar, date, 0),
    isDateInFeedPeriod(calendar, nextDate)
      ? resolveServiceLayer(calendar, nextDate, -1440)
      : emptyServiceLayer(nextDate, -1440),
  ];
}

export function resolveServiceLayer(
  calendar: LoadedCalendar,
  date: string,
  minuteOffset: ServiceMinuteOffset = 0,
): ServiceLayer {
  const active = new Set<number>();
  const weekdayBit = getWeekdayBit(date);

  calendar.serviceIds.forEach((_, serviceIndex) => {
    const startDate = calendar.startDates[serviceIndex];
    const endDate = calendar.endDates[serviceIndex];
    const mask = calendar.weekdayMasks[serviceIndex] ?? 0;

    if (
      startDate !== undefined &&
      endDate !== undefined &&
      date >= startDate &&
      date <= endDate &&
      (mask & weekdayBit) !== 0
    ) {
      active.add(serviceIndex);
    }
  });

  calendar.exceptions.dates.forEach((exceptionDate, index) => {
    if (exceptionDate !== date) {
      return;
    }

    const serviceIndex = calendar.exceptions.serviceIndices[index];
    const exceptionType = calendar.exceptions.types[index];
    if (serviceIndex === undefined || exceptionType === undefined) {
      return;
    }

    if (exceptionType === 1) {
      active.add(serviceIndex);
    } else if (exceptionType === 2) {
      active.delete(serviceIndex);
    }
  });

  return toServiceLayer(calendar, date, minuteOffset, [...active].sort((a, b) => a - b));
}

function toServiceLayer(
  calendar: LoadedCalendar,
  date: string,
  minuteOffset: ServiceMinuteOffset,
  serviceIndices: readonly number[],
): ServiceLayer {
  const serviceIds = serviceIndices.map((index) => {
    const serviceId = calendar.serviceIds[index];
    if (serviceId === undefined) {
      throw new Error(`Unknown service index: ${String(index)}`);
    }
    return serviceId;
  });
  const displayNames = serviceIds.map(getServiceDisplayName);
  const dayType = getServiceDayType(displayNames);

  return {
    date,
    minuteOffset,
    serviceIndices: Int32Array.from(serviceIndices),
    serviceIds,
    dayType,
    displayName: displayNames.length === 0 ? 'none' : displayNames.join(' + '),
  };
}

function emptyServiceLayer(date: string, minuteOffset: ServiceMinuteOffset): ServiceLayer {
  return {
    date,
    minuteOffset,
    serviceIndices: new Int32Array(),
    serviceIds: [],
    dayType: 'none',
    displayName: 'none',
  };
}

function getServiceDayType(displayNames: readonly string[]): ServiceDayType {
  if (displayNames.length === 0) {
    return 'none';
  }

  const hasWeekday = displayNames.some((name) => name.includes('平日') || name.toLowerCase().includes('weekday'));
  const hasSaturday = displayNames.some((name) => name.includes('土曜') || name.toLowerCase().includes('saturday'));
  const hasSundayHoliday = displayNames.some(
    (name) =>
      name.includes('日休') ||
      name.includes('休日') ||
      name.toLowerCase().includes('sunday') ||
      name.toLowerCase().includes('holiday'),
  );
  const kinds = [hasWeekday, hasSaturday, hasSundayHoliday].filter(Boolean).length;

  if (kinds !== 1) {
    return 'custom';
  }
  if (hasWeekday) {
    return 'weekday';
  }
  if (hasSaturday) {
    return 'saturday';
  }
  return 'sunday_holiday';
}

function getServiceDisplayName(serviceId: PrefixedId): string {
  return serviceId.slice(serviceId.indexOf(':') + 1);
}

function assertDateInFeedPeriod(calendar: LoadedCalendar, date: string): void {
  if (!/^\d{8}$/.test(date)) {
    throw new Error(`Invalid service date: ${date}`);
  }
  if (!isDateInFeedPeriod(calendar, date)) {
    const period = getFeedPeriod(calendar);
    throw new Error(`Service date ${date} is outside feed period ${period.startDate}-${period.endDate}.`);
  }
}

function isDateInFeedPeriod(calendar: LoadedCalendar, date: string): boolean {
  const period = getFeedPeriod(calendar);
  return date >= period.startDate && date <= period.endDate;
}

function getFeedPeriod(calendar: LoadedCalendar): { readonly startDate: string; readonly endDate: string } {
  const startDates = calendar.startDates.filter((date) => date.length > 0).sort();
  const endDates = calendar.endDates.filter((date) => date.length > 0).sort();
  const startDate = startDates[0];
  const endDate = endDates[endDates.length - 1];
  if (startDate === undefined || endDate === undefined) {
    throw new Error('Calendar has no service period.');
  }
  return { startDate, endDate };
}

function getWeekdayBit(date: string): number {
  const day = parseDate(date).getUTCDay();
  const bitIndex = day === 0 ? 6 : day - 1;
  return 1 << bitIndex;
}

function addDays(date: string, days: number): string {
  const parsed = parseDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatDate(parsed);
}

function parseDate(date: string): Date {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}
