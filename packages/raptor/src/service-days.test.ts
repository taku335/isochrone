import { type PrefixedId } from '@isochrone/gtfs-types';
import { describe, expect, it } from 'vitest';

import { type LoadedCalendar } from './index.js';
import { resolveServiceLayers } from './service-days.js';

interface ExceptionRow {
  readonly serviceId: PrefixedId;
  readonly date: string;
  readonly type: 1 | 2;
}

describe('resolveServiceLayers', () => {
  it('resolves normal weekday, saturday, and sunday services', () => {
    expect(resolveServiceLayers(realCalendar, '20260707')[0]).toMatchObject({
      date: '20260707',
      minuteOffset: 0,
      serviceIds: [sid('平日'), sid('平日メーグル')],
      dayType: 'weekday',
      displayName: '平日 + 平日メーグル',
    });
    expect(resolveServiceLayers(realCalendar, '20260704')[0]).toMatchObject({
      serviceIds: [sid('土曜'), sid('土曜メーグル')],
      dayType: 'saturday',
    });
    expect(resolveServiceLayers(realCalendar, '20260705')[0]).toMatchObject({
      serviceIds: [sid('日休'), sid('日休メーグル')],
      dayType: 'sunday_holiday',
    });
  });

  it('applies holiday calendar_dates to the active service set', () => {
    const [layer] = resolveServiceLayers(realCalendar, '20260720');

    expect(layer.serviceIds).toEqual([sid('日休'), sid('日休メーグル')]);
    expect(layer.dayType).toBe('sunday_holiday');
  });

  it('returns a previous-day layer with +1440 minute offset', () => {
    const [, previousLayer] = resolveServiceLayers(realCalendar, '20260706');

    expect(previousLayer).toMatchObject({
      date: '20260705',
      minuteOffset: 1440,
      serviceIds: [sid('日休'), sid('日休メーグル')],
      dayType: 'sunday_holiday',
    });
  });

  it('rejects dates outside the feed period', () => {
    expect(() => resolveServiceLayers(realCalendar, '20260327')).toThrow(
      'Service date 20260327 is outside feed period 20260328-20270430.',
    );
  });

  it('applies all 96 real-feed calendar_dates rows', () => {
    expect(exceptionRows).toHaveLength(96);

    for (const row of exceptionRows) {
      const [layer] = resolveServiceLayers(realCalendar, row.date);
      if (row.type === 1) {
        expect(layer.serviceIds, `${row.date} should add ${row.serviceId}`).toContain(row.serviceId);
      } else {
        expect(layer.serviceIds, `${row.date} should remove ${row.serviceId}`).not.toContain(row.serviceId);
      }
    }
  });
});

const weekdayRemovedDates = [
  '20260429',
  '20260504',
  '20260505',
  '20260506',
  '20260720',
  '20260811',
  '20260813',
  '20260814',
  '20260921',
  '20260922',
  '20260923',
  '20261012',
  '20261103',
  '20261123',
  '20261229',
  '20261230',
  '20261231',
  '20270101',
  '20270111',
  '20270211',
  '20270223',
  '20270322',
  '20270429',
] as const;

const saturdayRemovedDates = ['20260815', '20270102'] as const;

const sundayAddedDates = [
  '20260429',
  '20260504',
  '20260505',
  '20260506',
  '20260720',
  '20260811',
  '20260813',
  '20260814',
  '20260815',
  '20260921',
  '20260922',
  '20260923',
  '20261012',
  '20261103',
  '20261123',
  '20261229',
  '20261230',
  '20261231',
  '20270101',
  '20270102',
  '20270111',
  '20270211',
  '20270223',
  '20270322',
  '20270429',
] as const;

const weekdayMeguruRemovedDates = [
  '20260429',
  '20260505',
  '20260506',
  '20260507',
  '20260721',
  '20260811',
  '20260813',
  '20260814',
  '20260922',
  '20260923',
  '20260924',
  '20261013',
  '20261103',
  '20261124',
  '20261229',
  '20261230',
  '20261231',
  '20270101',
  '20270112',
  '20270211',
  '20270223',
  '20270323',
  '20270429',
] as const;

const sundayMeguruAddedDates = [
  '20260429',
  '20260504',
  '20260505',
  '20260506',
  '20260720',
  '20260811',
  '20260813',
  '20260814',
  '20260815',
  '20260921',
  '20260922',
  '20260923',
  '20261012',
  '20261103',
  '20261123',
  '20270111',
  '20270211',
  '20270223',
  '20270322',
  '20270429',
] as const;

const exceptionRows: readonly ExceptionRow[] = [
  ...rows('平日', weekdayRemovedDates, 2),
  ...rows('土曜', saturdayRemovedDates, 2),
  ...rows('日休', sundayAddedDates, 1),
  ...rows('平日メーグル', weekdayMeguruRemovedDates, 2),
  ...rows('土曜メーグル', saturdayRemovedDates, 2),
  ...rows('日休メーグル', sundayMeguruAddedDates, 1),
  { serviceId: sid('日休メーグル'), date: '20270103', type: 2 },
];

const serviceIds = [
  sid('平日'),
  sid('土曜'),
  sid('日休'),
  sid('平日メーグル'),
  sid('土曜メーグル'),
  sid('日休メーグル'),
  sid('終車延長'),
  sid('キントレ'),
  sid('平日深夜'),
] as const;

const realCalendar: LoadedCalendar = {
  serviceIds,
  weekdayMasks: Uint8Array.from([
    0b0011111,
    0b0100000,
    0b1000000,
    0b0011110,
    0b0100000,
    0b1000000,
    0,
    0,
    0,
  ]),
  startDates: serviceIds.map(() => '20260328'),
  endDates: serviceIds.map(() => '20270430'),
  exceptions: {
    serviceIndices: Int32Array.from(exceptionRows.map((row) => readServiceIndex(row.serviceId))),
    dates: exceptionRows.map((row) => row.date),
    types: Uint8Array.from(exceptionRows.map((row) => row.type)),
  },
};

function rows(serviceName: string, dates: readonly string[], type: 1 | 2): ExceptionRow[] {
  return dates.map((date) => ({
    serviceId: sid(serviceName),
    date,
    type,
  }));
}

function readServiceIndex(serviceId: PrefixedId): number {
  const index = serviceIds.indexOf(serviceId);
  if (index === -1) {
    throw new Error(`Unknown service id in fixture: ${serviceId}`);
  }
  return index;
}

function sid(name: string): PrefixedId {
  return `nagoya-cbus:${name}` as PrefixedId;
}
