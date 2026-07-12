import { getAppName } from './index.js';
import { resolveMapConfig } from './map-config.js';
import { createMap } from './map.js';
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
    </div>
  </main>
`;

const mapContainer = document.querySelector<HTMLDivElement>('#map');
const mapStatus = document.querySelector<HTMLParagraphElement>('.map-status');
if (mapContainer === null || mapStatus === null) {
  throw new Error('Map container was not found.');
}

const map = createMap(mapContainer, resolveMapConfig());
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
