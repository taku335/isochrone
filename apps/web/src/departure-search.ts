import { type BrowserStopsDataset } from '@isochrone/gtfs-types';
import { UNREACHED, type WorkerServiceLayer } from '@isochrone/raptor';

export interface DepartureSelection {
  readonly serviceDate: string;
  readonly departure: number;
  readonly isLateNight: boolean;
}

export interface ReachableStopProperties {
  readonly stopIndex: number;
  readonly name: string;
  readonly arrival: number;
  readonly elapsed: number;
  readonly band: 30 | 60;
}

export interface ReachableStopFeature {
  readonly type: 'Feature';
  readonly geometry: {
    readonly type: 'Point';
    readonly coordinates: [number, number];
  };
  readonly properties: ReachableStopProperties;
}

export interface ReachableStopCollection {
  readonly type: 'FeatureCollection';
  readonly features: ReachableStopFeature[];
}

export function getDefaultDeparture(now = new Date()): { readonly date: string; readonly time: string } {
  return {
    date: `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  };
}

export function parseDeparture(date: string, time: string): DepartureSelection {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('日付を指定してください');
  }
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (match === null) {
    throw new Error('出発時刻を指定してください');
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new Error('出発時刻が正しくありません');
  }
  const departure = hour * 60 + minute;
  return { serviceDate: date.replaceAll('-', ''), departure, isLateNight: departure < 180 };
}

export function buildReachableStopCollection(
  dataset: BrowserStopsDataset,
  arrival: Uint16Array,
  departure: number,
  limitMinutes = 60,
): ReachableStopCollection {
  const features: ReachableStopFeature[] = [];
  arrival.forEach((arrivalMinute, stopIndex) => {
    const elapsed = arrivalMinute - departure;
    const lon = dataset.stops.lons[stopIndex];
    const lat = dataset.stops.lats[stopIndex];
    const name = dataset.stops.names[stopIndex];
    if (
      arrivalMinute === UNREACHED ||
      elapsed < 0 ||
      elapsed > limitMinutes ||
      lon === undefined ||
      lat === undefined ||
      name === undefined
    ) {
      return;
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        stopIndex,
        name,
        arrival: arrivalMinute,
        elapsed,
        band: elapsed <= 30 ? 30 : 60,
      },
    });
  });
  return { type: 'FeatureCollection', features };
}

export function countReachableStops(arrival: Uint16Array): number {
  return arrival.reduce((count, minute) => count + (minute === UNREACHED ? 0 : 1), 0);
}

export function formatServiceLayers(
  layers: readonly WorkerServiceLayer[],
  isLateNight: boolean,
): string {
  const visible = isLateNight ? layers : layers.filter((layer) => layer.minuteOffset === 0);
  return visible
    .map((layer) => {
      const prefix = layer.minuteOffset === 0 ? '指定日' : '前日深夜';
      return `${prefix}: ${formatDayType(layer.dayType)}`;
    })
    .join(' / ');
}

function formatDayType(dayType: WorkerServiceLayer['dayType']): string {
  switch (dayType) {
    case 'weekday': return '平日';
    case 'saturday': return '土曜';
    case 'sunday_holiday': return '日曜・休日';
    case 'none': return '運行なし';
    default: return '特別ダイヤ';
  }
}
