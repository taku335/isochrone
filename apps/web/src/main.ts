import { getAppName } from './index.js';
import { resolveMapConfig } from './map-config.js';
import { createMap } from './map.js';
import { loadStopDataset, resolveDatasetManifestUrl } from './stop-data.js';
import { buildStopGroups, type StopGroup } from './stop-search.js';
import { initializeStopSearchUi } from './stop-search-ui.js';
import { Marker } from 'maplibre-gl';
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
};

void loadStopDataset(resolveDatasetManifestUrl())
  .then((dataset) => {
    const groups = buildStopGroups(dataset);
    searchLoading.hidden = true;
    initializeStopSearchUi({ root: searchPanel, groups, onSelect: selectStopGroup });
  })
  .catch(() => {
    searchLoading.dataset.state = 'error';
    searchLoading.textContent = '停留所を読み込めませんでした';
  });

let mapLoaded = false;
void map.once('load', () => {
  mapLoaded = true;
  mapStatus.hidden = true;
  map.resize();
});
map.on('error', () => {
  if (mapLoaded) {
    return;
  }
  mapStatus.hidden = false;
  mapStatus.dataset.state = 'error';
  mapStatus.textContent = '地図を読み込めませんでした';
});
