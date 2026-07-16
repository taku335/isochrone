import { type BrowserStopsDataset } from '@isochrone/gtfs-types';

const EARTH_METERS_PER_DEGREE = 111_320;
export const POINT_ORIGIN_RADIUS_METERS = 800;
export const POINT_ORIGIN_WALK_METERS_PER_MINUTE = 80;
export const POINT_ORIGIN_BUFFER_MINUTES = 1;

export interface PointOriginStop {
  readonly stopIndex: number;
  readonly distanceMeters: number;
  readonly walkMinutes: number;
}

export interface PointOriginSelection {
  readonly lon: number;
  readonly lat: number;
  readonly stops: readonly PointOriginStop[];
}

interface IndexedStop {
  readonly stopIndex: number;
  readonly x: number;
  readonly y: number;
}

export interface PointOriginIndex {
  readonly select: (lon: number, lat: number) => PointOriginSelection;
}

export function buildPointOriginIndex(dataset: BrowserStopsDataset): PointOriginIndex {
  const meanLat = dataset.stops.lats.reduce((sum, lat) => sum + lat, 0) /
    Math.max(dataset.stops.lats.length, 1);
  const metersPerDegreeLon = EARTH_METERS_PER_DEGREE * Math.cos(toRadians(meanLat));
  const cells = new Map<string, IndexedStop[]>();

  dataset.stops.lats.forEach((lat, stopIndex) => {
    const lon = dataset.stops.lons[stopIndex];
    if (lon === undefined) {
      return;
    }
    const indexed = { stopIndex, x: lon * metersPerDegreeLon, y: lat * EARTH_METERS_PER_DEGREE };
    const key = cellKey(indexed.x, indexed.y);
    const cell = cells.get(key);
    if (cell === undefined) {
      cells.set(key, [indexed]);
    } else {
      cell.push(indexed);
    }
  });

  return {
    select(lon, lat) {
      assertCoordinate(lon, lat);
      const x = lon * metersPerDegreeLon;
      const y = lat * EARTH_METERS_PER_DEGREE;
      const centerX = Math.floor(x / POINT_ORIGIN_RADIUS_METERS);
      const centerY = Math.floor(y / POINT_ORIGIN_RADIUS_METERS);
      const stops: PointOriginStop[] = [];
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const candidates = cells.get(`${String(centerX + offsetX)},${String(centerY + offsetY)}`) ?? [];
          for (const candidate of candidates) {
            const distanceMeters = Math.hypot(candidate.x - x, candidate.y - y);
            if (distanceMeters <= POINT_ORIGIN_RADIUS_METERS) {
              stops.push({
                stopIndex: candidate.stopIndex,
                distanceMeters,
                walkMinutes: Math.ceil(
                  distanceMeters / POINT_ORIGIN_WALK_METERS_PER_MINUTE +
                    POINT_ORIGIN_BUFFER_MINUTES,
                ),
              });
            }
          }
        }
      }
      stops.sort((left, right) =>
        left.distanceMeters - right.distanceMeters || left.stopIndex - right.stopIndex);
      return { lon, lat, stops };
    },
  };
}

function cellKey(x: number, y: number): string {
  return `${String(Math.floor(x / POINT_ORIGIN_RADIUS_METERS))},${String(Math.floor(y / POINT_ORIGIN_RADIUS_METERS))}`;
}

function assertCoordinate(lon: number, lat: number): void {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new Error(`Invalid origin coordinate: ${String(lon)},${String(lat)}`);
  }
}

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}
