import {
  type ReachabilityPolygonsResult,
} from '@isochrone/raptor';
import { GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';

import { type ReachableStopCollection } from './departure-search.js';

export const REACHABILITY_COLORS = {
  30: '#087e8b',
  60: '#4c78c2',
  origin: '#d9473d',
} as const;

const POLYGON_SOURCE_ID = 'reachability-polygons';
const STOP_SOURCE_ID = 'reachable-stops';

interface PolygonFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: NonNullable<ReachabilityPolygonsResult['layers'][number]['feature']>[];
}

export function initializeReachabilityLayers(map: MapLibreMap, showStopDots: boolean): void {
  map.addSource(POLYGON_SOURCE_ID, { type: 'geojson', data: emptyCollection() });
  map.addLayer({
    id: 'reachability-fill-60',
    type: 'fill',
    source: POLYGON_SOURCE_ID,
    filter: ['==', ['get', 'limitMinutes'], 60],
    paint: { 'fill-color': REACHABILITY_COLORS[60], 'fill-opacity': 0.2 },
  });
  map.addLayer({
    id: 'reachability-line-60',
    type: 'line',
    source: POLYGON_SOURCE_ID,
    filter: ['==', ['get', 'limitMinutes'], 60],
    paint: { 'line-color': REACHABILITY_COLORS[60], 'line-width': 1.5, 'line-opacity': 0.85 },
  });
  map.addLayer({
    id: 'reachability-fill-30',
    type: 'fill',
    source: POLYGON_SOURCE_ID,
    filter: ['==', ['get', 'limitMinutes'], 30],
    paint: { 'fill-color': REACHABILITY_COLORS[30], 'fill-opacity': 0.3 },
  });
  map.addLayer({
    id: 'reachability-line-30',
    type: 'line',
    source: POLYGON_SOURCE_ID,
    filter: ['==', ['get', 'limitMinutes'], 30],
    paint: { 'line-color': REACHABILITY_COLORS[30], 'line-width': 1.75, 'line-opacity': 0.95 },
  });

  map.addSource(STOP_SOURCE_ID, { type: 'geojson', data: emptyCollection() });
  addStopLayer(map, 60, showStopDots);
  addStopLayer(map, 30, showStopDots);
}

export function updateReachabilityLayers(
  map: MapLibreMap,
  polygons: ReachabilityPolygonsResult,
  stops: ReachableStopCollection,
): void {
  map.getSource<GeoJSONSource>(POLYGON_SOURCE_ID)?.setData(toPolygonCollection(polygons));
  map.getSource<GeoJSONSource>(STOP_SOURCE_ID)?.setData(stops);
}

export function clearReachabilityLayers(map: MapLibreMap): void {
  map.getSource<GeoJSONSource>(POLYGON_SOURCE_ID)?.setData(emptyCollection());
  map.getSource<GeoJSONSource>(STOP_SOURCE_ID)?.setData(emptyCollection());
}

export function toPolygonCollection(polygons: ReachabilityPolygonsResult): PolygonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [60, 30].flatMap((limitMinutes) => {
      const feature = polygons.layers.find((layer) => layer.limitMinutes === limitMinutes)?.feature;
      return feature === null || feature === undefined ? [] : [feature];
    }),
  };
}

function addStopLayer(map: MapLibreMap, limitMinutes: 30 | 60, visible: boolean): void {
  map.addLayer({
    id: `reachable-stops-${String(limitMinutes)}`,
    type: 'circle',
    source: STOP_SOURCE_ID,
    filter: ['==', ['get', 'band'], limitMinutes],
    layout: { visibility: visible ? 'visible' : 'none' },
    paint: {
      'circle-color': REACHABILITY_COLORS[limitMinutes],
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'], 10, limitMinutes === 30 ? 3.5 : 3, 15,
        limitMinutes === 30 ? 6.5 : 6,
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
      'circle-opacity': 0.92,
    },
  });
}

function emptyCollection(): { readonly type: 'FeatureCollection'; readonly features: [] } {
  return { type: 'FeatureCollection', features: [] };
}
