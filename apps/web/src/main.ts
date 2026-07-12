import { getAppName } from './index.js';
import {
  buildReachableStopCollection,
  countReachableStops,
  formatServiceLayers,
  getDefaultDeparture,
  parseDeparture,
} from './departure-search.js';
import { resolveMapConfig } from './map-config.js';
import { createMap } from './map.js';
import {
  loadStopDatasetWithManifest,
  resolveDatasetManifestUrl,
} from './stop-data.js';
import { buildStopGroups, type StopGroup } from './stop-search.js';
import { initializeStopSearchUi } from './stop-search-ui.js';
import { createRaptorWorkerClient } from './raptor-client.js';
import { type BrowserStopsDataset } from '@isochrone/gtfs-types';
import { GeoJSONSource, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (app === null) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <div>
          <p class="brand-kicker">Nagoya City Bus</p>
          <h1>${getAppName()}</h1>
        </div>
      </div>
      <p class="map-status" role="status">地図を読み込み中</p>
    </header>
    <div class="map-stage">
      <div id="map" class="map" aria-label="名古屋市の地図"></div>
      <section class="stop-search-panel" aria-label="出発停留所">
        <label class="stop-search-label" for="stop-search">出発停留所</label>
        <div class="stop-search-field">
          <input
            id="stop-search"
            class="stop-search-input"
            type="search"
            placeholder="停留所名"
            autocomplete="off"
            disabled
            role="combobox"
            aria-autocomplete="list"
            aria-controls="stop-search-results"
            aria-expanded="false"
          />
          <button class="stop-search-clear" type="button" aria-label="検索をクリア" hidden>×</button>
        </div>
        <p class="stop-search-loading" role="status">停留所を読み込み中</p>
        <p class="stop-selection" hidden></p>
        <div
          id="stop-search-results"
          class="stop-search-results"
          role="listbox"
          aria-label="停留所の候補"
          hidden
        ></div>
        <div class="departure-controls">
          <div class="departure-fields">
            <label>
              <span>出発日</span>
              <input class="departure-date" type="date" />
            </label>
            <label>
              <span>出発時刻</span>
              <input class="departure-time" type="time" step="60" />
            </label>
          </div>
          <p class="late-night-note" hidden>
            0〜2時台は指定日と前日深夜（24時以降）のダイヤを合わせて探索します
          </p>
          <button class="run-search" type="button" disabled>到達範囲を探索</button>
          <p class="route-status" role="status">出発停留所を選択してください</p>
          <p class="service-day" hidden></p>
          <div class="reachability-legend" hidden aria-label="到達時間の凡例">
            <span><i data-band="30"></i>30分以内</span>
            <span><i data-band="60"></i>60分以内</span>
          </div>
        </div>
      </section>
    </div>
  </main>
`;

const mapContainer = document.querySelector<HTMLDivElement>('#map');
const mapStatus = document.querySelector<HTMLParagraphElement>('.map-status');
if (mapContainer === null || mapStatus === null) {
  throw new Error('Map container was not found.');
}

const map = createMap(mapContainer, resolveMapConfig());
const searchPanel = document.querySelector<HTMLElement>('.stop-search-panel');
const searchLoading = document.querySelector<HTMLParagraphElement>('.stop-search-loading');
if (searchPanel === null || searchLoading === null) {
  throw new Error('Stop search panel was not found.');
}

const dateInput = document.querySelector<HTMLInputElement>('.departure-date');
const timeInput = document.querySelector<HTMLInputElement>('.departure-time');
const lateNightNote = document.querySelector<HTMLParagraphElement>('.late-night-note');
const runButton = document.querySelector<HTMLButtonElement>('.run-search');
const routeStatus = document.querySelector<HTMLParagraphElement>('.route-status');
const serviceDay = document.querySelector<HTMLParagraphElement>('.service-day');
const legend = document.querySelector<HTMLElement>('.reachability-legend');
if (
  dateInput === null ||
  timeInput === null ||
  lateNightNote === null ||
  runButton === null ||
  routeStatus === null ||
  serviceDay === null ||
  legend === null
) {
  throw new Error('Departure controls were not found.');
}
const runSearchButton = runButton;

const defaults = getDefaultDeparture();
dateInput.value = defaults.date;
timeInput.value = defaults.time;

const pageUrl = new URL(window.location.href);
if (!pageUrl.searchParams.has('debug')) {
  pageUrl.searchParams.set('debug', 'stops');
  window.history.replaceState(null, '', pageUrl);
}
const showReachableStopDots = pageUrl.searchParams.get('debug') === 'stops';

const manifestUrl = resolveDatasetManifestUrl();
const absoluteManifestUrl = new URL(manifestUrl, window.location.href).href;
const raptorClient = createRaptorWorkerClient();
let stopDataset: BrowserStopsDataset | null = null;
let timetableLoaded = false;
let routeRunning = false;

let selectedOriginStopIndices: readonly number[] = [];
let stopMarker: Marker | null = null;
const selectStopGroup = (group: StopGroup): void => {
  selectedOriginStopIndices = group.stopIndices;
  searchPanel.dataset.originCount = String(selectedOriginStopIndices.length);
  stopMarker?.remove();
  stopMarker = new Marker({ color: '#d9473d' })
    .setLngLat([group.center[0], group.center[1]])
    .addTo(map);
  map.easeTo({ center: [group.center[0], group.center[1]], zoom: 14.5, duration: 700 });
  routeStatus.textContent = '日時を確認して探索してください';
  updateRunAvailability();
};

void loadStopDatasetWithManifest(manifestUrl)
  .then(({ manifest, stops }) => {
    stopDataset = stops;
    const groups = buildStopGroups(stops);
    searchLoading.hidden = true;
    initializeStopSearchUi({ root: searchPanel, groups, onSelect: selectStopGroup });
    if (manifest.servicePeriod.startDate !== null) {
      dateInput.min = toDateInputValue(manifest.servicePeriod.startDate);
    }
    if (manifest.servicePeriod.endDate !== null) {
      dateInput.max = toDateInputValue(manifest.servicePeriod.endDate);
    }
    updateRunAvailability();
  })
  .catch(() => {
    searchLoading.dataset.state = 'error';
    searchLoading.textContent = '停留所を読み込めませんでした';
  });

void raptorClient.load(absoluteManifestUrl).then(
  () => {
    timetableLoaded = true;
    updateRunAvailability();
  },
  () => {
    routeStatus.dataset.state = 'error';
    routeStatus.textContent = '時刻表を読み込めませんでした';
  },
);

const updateLateNightNote = (): void => {
  try {
    lateNightNote.hidden = !parseDeparture(dateInput.value, timeInput.value).isLateNight;
  } catch {
    lateNightNote.hidden = true;
  }
};
dateInput.addEventListener('change', updateLateNightNote);
timeInput.addEventListener('change', updateLateNightNote);
updateLateNightNote();

runSearchButton.addEventListener('click', () => {
  const dataset = stopDataset;
  if (dataset === null || selectedOriginStopIndices.length === 0 || routeRunning) {
    return;
  }

  let selection: ReturnType<typeof parseDeparture>;
  try {
    selection = parseDeparture(dateInput.value, timeInput.value);
  } catch (error) {
    routeStatus.dataset.state = 'error';
    routeStatus.textContent = error instanceof Error ? error.message : String(error);
    return;
  }

  routeRunning = true;
  routeStatus.dataset.state = 'loading';
  routeStatus.textContent = '探索しています';
  serviceDay.hidden = true;
  updateRunAvailability();
  void raptorClient.route({
    kind: 'earliestArrival',
    serviceDate: selection.serviceDate,
    origins: selectedOriginStopIndices.map((stopIndex) => ({
      stopIndex,
      departure: selection.departure,
    })),
  }).then(
    (result) => {
      const collection = buildReachableStopCollection(dataset, result.arrival, selection.departure);
      const source = map.getSource<GeoJSONSource>('reachable-stops');
      source?.setData(collection);
      routeStatus.dataset.state = 'success';
      routeStatus.textContent = `到達 ${String(countReachableStops(result.arrival))}停留所（60分以内 ${String(collection.features.length)}地点）/ ポリゴン ${String(Math.round(result.polygons.generationMs))}ms`;
      serviceDay.textContent = `適用ダイヤ: ${formatServiceLayers(result.serviceLayers, selection.isLateNight)}`;
      serviceDay.hidden = false;
      legend.hidden = false;
      routeRunning = false;
      updateRunAvailability();
    },
    (error: unknown) => {
      routeStatus.dataset.state = 'error';
      routeStatus.textContent = error instanceof Error ? error.message : '探索に失敗しました';
      routeRunning = false;
      updateRunAvailability();
    },
  );
});

let mapLoaded = false;
void map.once('load', () => {
  mapLoaded = true;
  map.addSource('reachable-stops', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'reachable-stops-60',
    type: 'circle',
    source: 'reachable-stops',
    filter: ['==', ['get', 'band'], 60],
    layout: { visibility: showReachableStopDots ? 'visible' : 'none' },
    paint: {
      'circle-color': '#e19a26',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 6],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
      'circle-opacity': 0.9,
    },
  });
  map.addLayer({
    id: 'reachable-stops-30',
    type: 'circle',
    source: 'reachable-stops',
    filter: ['==', ['get', 'band'], 30],
    layout: { visibility: showReachableStopDots ? 'visible' : 'none' },
    paint: {
      'circle-color': '#16825f',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 15, 6.5],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
      'circle-opacity': 0.92,
    },
  });
  mapStatus.hidden = true;
  map.resize();
  updateRunAvailability();
});
map.on('error', () => {
  if (mapLoaded) {
    return;
  }
  mapStatus.hidden = false;
  mapStatus.dataset.state = 'error';
  mapStatus.textContent = '地図を読み込めませんでした';
});

window.addEventListener('beforeunload', () => {
  raptorClient.dispose();
});

function updateRunAvailability(): void {
  runSearchButton.disabled =
    routeRunning ||
    !mapLoaded ||
    !timetableLoaded ||
    stopDataset === null ||
    selectedOriginStopIndices.length === 0;
}

function toDateInputValue(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}
