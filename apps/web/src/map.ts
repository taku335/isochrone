import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl';

import { type MapConfig } from './map-config.js';

const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>';

export function createMap(container: HTMLElement, config: MapConfig): MapLibreMap {
  const map = new MapLibreMap({
    container,
    style: config.styleUrl,
    center: [config.center[0], config.center[1]],
    zoom: config.zoom,
    minZoom: 9,
    maxZoom: 18,
    attributionControl: false,
    maplibreLogo: true,
  });

  map.addControl(new NavigationControl({ showCompass: true, showZoom: true }), 'top-right');
  map.addControl(
    new AttributionControl({ compact: false, customAttribution: OPENFREEMAP_ATTRIBUTION }),
    'bottom-right',
  );
  map.addControl(new ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

  return map;
}
