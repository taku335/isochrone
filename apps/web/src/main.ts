import { getAppName } from './index.js';
import {
  CC_BY_4_URL,
  DATASET_SOURCE_URL,
  formatDatasetSummary,
} from './about.js';
import {
  buildReachableStopCollection,
  buildLatestDepartureStopCollection,
  countReachableStops,
  formatServiceLayers,
  formatTimeInputValue,
  getDefaultDeparture,
  parseDeparture,
  parseArrival,
} from './departure-search.js';
import { resolveMapConfig } from './map-config.js';
import { createMap } from './map.js';
import {
  loadStopDatasetWithManifest,
  resolveDatasetManifestUrl,
} from './stop-data.js';
import { buildStopGroups, type StopGroup } from './stop-search.js';
import {
  initializeStopSearchUi,
  type StopSearchUiController,
} from './stop-search-ui.js';
import { createRaptorWorkerClient } from './raptor-client.js';
import {
  clearReachabilityLayers,
  initializeReachabilityLayers,
  REACHABILITY_COLORS,
  updateReachabilityLayers,
  updateLatestDepartureLayer,
} from './reachability-map.js';
import {
  hasRunnableUrlState,
  readAppUrlState,
  writeAppUrlState,
  type ReachabilityView,
  type SearchMode,
} from './url-state.js';
import { type BrowserStopsDataset } from '@isochrone/gtfs-types';
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
      <div class="topbar-actions">
        <p class="map-status" role="status">地図を読み込み中</p>
        <button class="about-open" type="button" aria-label="このサービスについて" title="このサービスについて">i</button>
      </div>
    </header>
    <div class="map-stage">
      <div id="map" class="map" aria-label="名古屋市の地図"></div>
      <section class="stop-search-panel" aria-label="出発停留所">
        <div class="search-mode" role="group" aria-label="探索方法">
          <button type="button" data-search-mode="depart" aria-pressed="true">出発時刻から</button>
          <button type="button" data-search-mode="arrive" aria-pressed="false">到着時刻まで</button>
        </div>
        <label class="stop-search-label" for="stop-search"><span class="stop-role-label">出発停留所</span></label>
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
        <div class="data-load-feedback" role="status" aria-live="polite">
          <progress class="data-load-progress" aria-label="時刻表データを読み込み中"></progress>
          <p class="stop-search-loading">時刻表データを読み込んでいます</p>
          <button class="data-retry" type="button" hidden>再読み込み</button>
        </div>
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
              <span class="date-role-label">出発日</span>
              <input class="departure-date" type="date" />
            </label>
            <label>
              <span class="time-role-label">出発時刻</span>
              <input class="departure-time" type="time" step="60" />
            </label>
          </div>
          <div class="time-slider-control">
            <label for="departure-time-slider">
              <span>出発時刻</span>
              <output class="time-slider-output" for="departure-time-slider">--:--</output>
            </label>
            <input
              id="departure-time-slider"
              class="departure-time-slider"
              type="range"
              min="0"
              max="1435"
              step="5"
              value="480"
              disabled
            />
            <div class="time-slider-ticks" aria-hidden="true">
              <span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
            </div>
          </div>
          <p class="late-night-note" hidden>
            0〜2時台は指定日と前日深夜（24時以降）のダイヤを合わせて探索します
          </p>
          <button class="run-search" type="button" disabled>到達範囲を探索</button>
          <p class="route-status" role="status">出発停留所を選択してください</p>
          <p class="service-day" hidden></p>
          <p class="scope-note">市バスのみ（地下鉄・他社線は含みません）</p>
          <div class="reachability-legend" hidden aria-label="到達時間の凡例">
            <span><i data-layer="30"></i>30分圏</span>
            <span><i data-layer="60"></i>60分圏</span>
            <span><i data-layer="origin"></i><span class="marker-role-label">出発地</span></span>
          </div>
          <div class="latest-departure-legend" hidden aria-label="最遅出発時刻の凡例">
            <span><i></i>出発可能な停留所</span>
            <span>地図を拡大すると最遅出発時刻を表示</span>
          </div>
        </div>
      </section>
      <footer class="data-footer">
        <a href="${DATASET_SOURCE_URL}" target="_blank" rel="noopener">出典: 名古屋市交通局 市バス GTFS-JP</a>
        <a href="${CC_BY_4_URL}" target="_blank" rel="noopener">CC BY 4.0</a>
        <span class="dataset-summary">データ情報を読み込み中</span>
      </footer>
    </div>
  </main>
  <dialog class="about-dialog" aria-labelledby="about-title">
    <header>
      <h2 id="about-title">このサービスについて</h2>
      <button class="about-close" type="button" aria-label="閉じる" title="閉じる">×</button>
    </header>
    <div class="about-content">
      <section>
        <h3>対象データ</h3>
        <p><a href="${DATASET_SOURCE_URL}" target="_blank" rel="noopener">名古屋市交通局 市バス GTFS-JP</a>を<a href="${CC_BY_4_URL}" target="_blank" rel="noopener">CC BY 4.0</a>に基づいて利用しています。</p>
        <p class="about-dataset-summary">データ情報を読み込み中</p>
        <p>市バスのみを対象とし、地下鉄・他社線は含みません。</p>
      </section>
      <section>
        <h3>算出方法</h3>
        <p>時刻表探索にはRAPTORを使用しています。徒歩乗換は停留所から300m以内、歩行速度80m/分として計算します。</p>
      </section>
      <section>
        <h3>ご利用にあたって</h3>
        <p>表示結果は時刻表データに基づく目安です。遅延・運休・道路状況などにより、実際の運行や所要時間と異なる場合があります。</p>
      </section>
    </div>
  </dialog>
`;

const mapContainer = requireElement(document.querySelector<HTMLDivElement>('#map'), '#map');
const mapStatus = requireElement(
  document.querySelector<HTMLParagraphElement>('.map-status'),
  '.map-status',
);

const map = createMap(mapContainer, resolveMapConfig());
const searchPanel = requireElement(document.querySelector<HTMLElement>('.stop-search-panel'), '.stop-search-panel');
const searchLoading = requireElement(document.querySelector<HTMLParagraphElement>('.stop-search-loading'), '.stop-search-loading');
const loadFeedback = requireElement(document.querySelector<HTMLElement>('.data-load-feedback'), '.data-load-feedback');
const loadProgress = requireElement(document.querySelector<HTMLProgressElement>('.data-load-progress'), '.data-load-progress');
const dataRetryButton = requireElement(document.querySelector<HTMLButtonElement>('.data-retry'), '.data-retry');

const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-search-mode]');
const stopRoleLabel = requireElement(document.querySelector<HTMLElement>('.stop-role-label'), '.stop-role-label');
const dateRoleLabel = requireElement(document.querySelector<HTMLElement>('.date-role-label'), '.date-role-label');
const timeRoleLabel = requireElement(document.querySelector<HTMLElement>('.time-role-label'), '.time-role-label');
const dateInput = requireElement(document.querySelector<HTMLInputElement>('.departure-date'), '.departure-date');
const timeInput = requireElement(document.querySelector<HTMLInputElement>('.departure-time'), '.departure-time');
const timeSliderControl = requireElement(
  document.querySelector<HTMLElement>('.time-slider-control'),
  '.time-slider-control',
);
const timeSlider = requireElement(
  document.querySelector<HTMLInputElement>('.departure-time-slider'),
  '.departure-time-slider',
);
const timeSliderOutput = requireElement(
  document.querySelector<HTMLOutputElement>('.time-slider-output'),
  '.time-slider-output',
);
const lateNightNote = requireElement(document.querySelector<HTMLParagraphElement>('.late-night-note'), '.late-night-note');
const runButton = requireElement(document.querySelector<HTMLButtonElement>('.run-search'), '.run-search');
const routeStatus = requireElement(document.querySelector<HTMLParagraphElement>('.route-status'), '.route-status');
const serviceDay = requireElement(document.querySelector<HTMLParagraphElement>('.service-day'), '.service-day');
const legend = requireElement(document.querySelector<HTMLElement>('.reachability-legend'), '.reachability-legend');
const latestDepartureLegend = requireElement(
  document.querySelector<HTMLElement>('.latest-departure-legend'),
  '.latest-departure-legend',
);
const datasetSummaries = document.querySelectorAll<HTMLElement>(
  '.dataset-summary, .about-dataset-summary',
);
const aboutDialog = requireElement(document.querySelector<HTMLDialogElement>('.about-dialog'), '.about-dialog');
const aboutOpen = requireElement(document.querySelector<HTMLButtonElement>('.about-open'), '.about-open');
const aboutClose = requireElement(document.querySelector<HTMLButtonElement>('.about-close'), '.about-close');
const runSearchButton = runButton;
const retryDataButton = dataRetryButton;
aboutOpen.addEventListener('click', () => {
  aboutDialog.showModal();
});
aboutClose.addEventListener('click', () => {
  aboutDialog.close();
});

const pageUrl = new URL(window.location.href);
const initialUrlState = readAppUrlState(pageUrl);
let searchMode: SearchMode = initialUrlState.mode;
const defaults = getDefaultDeparture();
dateInput.value = initialUrlState.date ?? defaults.date;
timeInput.value = initialUrlState.time ?? defaults.time;
const reachabilityView: ReachabilityView = initialUrlState.view;
const showReachableStopDots = reachabilityView === 'stops';
document.documentElement.style.setProperty('--reachability-30', REACHABILITY_COLORS[30]);
document.documentElement.style.setProperty('--reachability-60', REACHABILITY_COLORS[60]);
document.documentElement.style.setProperty('--origin-color', REACHABILITY_COLORS.origin);
document.documentElement.style.setProperty('--latest-departure-color', REACHABILITY_COLORS.latestDeparture);

const manifestUrl = resolveDatasetManifestUrl();
const absoluteManifestUrl = new URL(manifestUrl, window.location.href).href;
const raptorClient = createRaptorWorkerClient({
  onProgress: ({ stage }) => {
    if (stage === 'loading') {
      searchLoading.textContent = '時刻表データを展開しています';
    } else {
      routeStatus.dataset.state = 'loading';
      routeStatus.textContent = searchMode === 'depart'
        ? '到達範囲を計算しています'
        : '最遅出発時刻を計算しています';
    }
  },
});
let stopDataset: BrowserStopsDataset | null = null;
const LIVE_SEARCH_DELAY_MS = 180;
let timetableLoaded = false;
let routeRunning = false;
let routeRequestVersion = 0;
let liveSearchTimer: ReturnType<typeof setTimeout> | null = null;
let dataLoadRunning = false;
let stopSearchUi: StopSearchUiController | null = null;
let stopGroups: readonly StopGroup[] = [];
let selectedStopName: string | null = null;
let selectedStopGroup: StopGroup | null = null;
let autoRunPending = hasRunnableUrlState(initialUrlState);
let urlRestoreAttempted = false;

let selectedStopIndices: readonly number[] = [];
let stopMarker: Marker | null = null;
const selectStopGroup = (group: StopGroup): void => {
  invalidateRouteSearch();
  selectedStopName = group.name;
  selectedStopGroup = group;
  selectedStopIndices = group.stopIndices;
  searchPanel.dataset.selectionCount = String(selectedStopIndices.length);
  renderStopMarker();
  map.easeTo({ center: [group.center[0], group.center[1]], zoom: 14.5, duration: 700 });
  clearReachabilityLayers(map);
  legend.hidden = true;
  latestDepartureLegend.hidden = true;
  serviceDay.hidden = true;
  delete routeStatus.dataset.state;
  routeStatus.textContent = '日時を確認して探索してください';
  updateSearchModeUi();
  syncUrlState();
  updateRunAvailability();
};

const clearStopGroup = (): void => {
  invalidateRouteSearch();
  selectedStopName = null;
  selectedStopGroup = null;
  selectedStopIndices = [];
  delete searchPanel.dataset.selectionCount;
  stopMarker?.remove();
  stopMarker = null;
  clearReachabilityLayers(map);
  legend.hidden = true;
  latestDepartureLegend.hidden = true;
  serviceDay.hidden = true;
  delete routeStatus.dataset.state;
  routeStatus.textContent = searchMode === 'depart'
    ? '出発停留所を選択してください'
    : '到着停留所を選択してください';
  syncUrlState();
  updateRunAvailability();
};

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.searchMode;
    if ((mode === 'depart' || mode === 'arrive') && mode !== searchMode) {
      invalidateRouteSearch();
      searchMode = mode;
      clearReachabilityLayers(map);
      legend.hidden = true;
      latestDepartureLegend.hidden = true;
      serviceDay.hidden = true;
      delete routeStatus.dataset.state;
      routeStatus.textContent = selectedStopName === null
        ? mode === 'depart' ? '出発停留所を選択してください' : '到着停留所を選択してください'
        : '日時を確認して探索してください';
      renderStopMarker();
      updateSearchModeUi();
      updateLateNightNote();
      syncUrlState();
      updateRunAvailability();
    }
  });
});

retryDataButton.addEventListener('click', () => {
  void loadApplicationData();
});
void loadApplicationData();

const updateLateNightNote = (): void => {
  if (searchMode === 'arrive') {
    lateNightNote.hidden = true;
    return;
  }
  try {
    lateNightNote.hidden = !parseDeparture(dateInput.value, timeInput.value).isLateNight;
  } catch {
    lateNightNote.hidden = true;
  }
};
dateInput.addEventListener('change', () => {
  invalidateRouteSearch();
  updateLateNightNote();
  syncUrlState();
  updateRunAvailability();
});
timeInput.addEventListener('change', () => {
  invalidateRouteSearch();
  syncTimeSlider();
  updateLateNightNote();
  syncUrlState();
  updateRunAvailability();
});
timeSlider.addEventListener('input', () => {
  invalidateRouteSearch();
  timeInput.value = formatTimeInputValue(timeSlider.valueAsNumber);
  timeSliderOutput.value = timeInput.value;
  updateLateNightNote();
  syncUrlState();
  scheduleLiveSearch();
});
syncTimeSlider();
updateLateNightNote();
updateSearchModeUi();

runSearchButton.addEventListener('click', () => {
  void runRouteSearch();
});

async function runRouteSearch(): Promise<void> {
  const dataset = stopDataset;
  if (dataset === null || selectedStopIndices.length === 0) {
    return;
  }

  const requestVersion = routeRequestVersion + 1;
  routeRequestVersion = requestVersion;
  syncUrlState();
  routeRunning = true;
  routeStatus.dataset.state = 'loading';
  routeStatus.textContent = '探索しています';
  clearReachabilityLayers(map);
  legend.hidden = true;
  latestDepartureLegend.hidden = true;
  serviceDay.hidden = true;
  updateRunAvailability();
  try {
    if (searchMode === 'depart') {
      const selection = parseDeparture(dateInput.value, timeInput.value);
      const result = await raptorClient.route({
        kind: 'earliestArrival',
        serviceDate: selection.serviceDate,
        origins: selectedStopIndices.map((stopIndex) => ({
          stopIndex,
          departure: selection.departure,
        })),
      });
      if (requestVersion !== routeRequestVersion) {
        return;
      }
      const collection = buildReachableStopCollection(dataset, result.arrival, selection.departure);
      const reachableStops = countReachableStops(result.arrival);
      updateReachabilityLayers(map, result.polygons, collection);
      routeStatus.dataset.state = 'success';
      routeStatus.textContent = reachableStops <= selectedStopIndices.length
        ? 'この条件では出発地以外の到達停留所が見つかりませんでした'
        : `到達 ${String(reachableStops)}停留所（60分以内 ${String(collection.features.length)}地点）/ ポリゴン ${String(Math.round(result.polygons.generationMs))}ms`;
      serviceDay.textContent = `適用ダイヤ: ${formatServiceLayers(result.serviceLayers, selection.isLateNight)}`;
      legend.hidden = false;
    } else {
      const selection = parseArrival(dateInput.value, timeInput.value);
      const result = await raptorClient.route({
        kind: 'latestDeparture',
        serviceDate: selection.serviceDate,
        destinations: selectedStopIndices.map((stopIndex) => ({
          stopIndex,
          arrival: selection.arrival,
        })),
      });
      if (requestVersion !== routeRequestVersion) {
        return;
      }
      const collection = buildLatestDepartureStopCollection(
        dataset,
        result.departure,
        selection.arrival,
      );
      const reachableStops = countReachableStops(result.departure);
      updateLatestDepartureLayer(map, collection);
      routeStatus.dataset.state = 'success';
      routeStatus.textContent = reachableStops <= selectedStopIndices.length
        ? 'この条件では到着停留所以外の出発可能な停留所が見つかりませんでした'
        : `出発可能 ${String(reachableStops)}停留所。地図を拡大すると最遅出発時刻を確認できます`;
      serviceDay.textContent = `適用ダイヤ: ${formatServiceLayers(result.serviceLayers, false, 'reverse')}`;
      latestDepartureLegend.hidden = false;
    }
    serviceDay.hidden = false;
  } catch (error) {
    if (requestVersion !== routeRequestVersion) {
      return;
    }
    routeStatus.dataset.state = 'error';
    routeStatus.textContent = formatRouteError(error);
  } finally {
    if (requestVersion === routeRequestVersion) {
      routeRunning = false;
      updateRunAvailability();
    }
  }
}

let mapLoaded = false;
void map.once('load', () => {
  mapLoaded = true;
  initializeReachabilityLayers(map, showReachableStopDots);
  mapStatus.hidden = true;
  map.resize();
  updateRunAvailability();
  maybeRunSharedSearch();
});
map.on('error', () => {
  if (mapLoaded) {
    return;
  }
  mapStatus.hidden = false;
  mapStatus.dataset.state = 'error';
  mapStatus.textContent = '地図を読み込めません。ページを再読み込みしてください';
});

window.addEventListener('beforeunload', () => {
  if (liveSearchTimer !== null) {
    clearTimeout(liveSearchTimer);
  }
  raptorClient.dispose();
});

function updateRunAvailability(): void {
  const ready =
    mapLoaded &&
    timetableLoaded &&
    stopDataset !== null &&
    selectedStopIndices.length > 0;
  runSearchButton.disabled =
    routeRunning ||
    !ready;
  timeSlider.disabled = searchMode !== 'depart' || !ready;
}

async function loadApplicationData(): Promise<void> {
  if (dataLoadRunning) {
    return;
  }
  dataLoadRunning = true;
  timetableLoaded = false;
  searchPanel.setAttribute('aria-busy', 'true');
  loadFeedback.hidden = false;
  loadProgress.hidden = false;
  retryDataButton.hidden = true;
  delete searchLoading.dataset.state;
  searchLoading.textContent = '時刻表データを読み込んでいます';
  updateRunAvailability();

  try {
    const stopDataPromise = stopDataset === null
      ? loadStopDatasetWithManifest(manifestUrl)
      : Promise.resolve(null);
    const [loadedStopData] = await Promise.all([
      stopDataPromise,
      raptorClient.load(absoluteManifestUrl),
    ]);

    if (loadedStopData !== null) {
      stopDataset = loadedStopData.stops;
      stopGroups = buildStopGroups(loadedStopData.stops);
      const datasetSummary = formatDatasetSummary(loadedStopData.manifest);
      datasetSummaries.forEach((element) => {
        element.textContent = datasetSummary;
      });
      if (loadedStopData.manifest.servicePeriod.startDate !== null) {
        dateInput.min = toDateInputValue(loadedStopData.manifest.servicePeriod.startDate);
      }
      if (loadedStopData.manifest.servicePeriod.endDate !== null) {
        dateInput.max = toDateInputValue(loadedStopData.manifest.servicePeriod.endDate);
      }
    }
    if (stopSearchUi === null) {
      stopSearchUi = initializeStopSearchUi({
        root: searchPanel,
        groups: stopGroups,
        onSelect: selectStopGroup,
        onClear: clearStopGroup,
      });
    }
    timetableLoaded = true;
    loadFeedback.hidden = true;
    searchPanel.removeAttribute('aria-busy');
    restoreUrlSelection();
    updateRunAvailability();
    maybeRunSharedSearch();
  } catch {
    searchLoading.dataset.state = 'error';
    searchLoading.textContent = 'データを読み込めませんでした。通信状態を確認して再読み込みしてください';
    loadProgress.hidden = true;
    retryDataButton.hidden = false;
    searchPanel.removeAttribute('aria-busy');
  } finally {
    dataLoadRunning = false;
  }
}

function restoreUrlSelection(): void {
  if (urlRestoreAttempted) {
    return;
  }
  urlRestoreAttempted = true;
  const stopName = initialUrlState.mode === 'depart'
    ? initialUrlState.origin
    : initialUrlState.destination;
  if (stopName === null) {
    return;
  }
  const group = stopGroups.find(({ name }) => name === stopName);
  if (group === undefined || stopSearchUi === null) {
    autoRunPending = false;
    routeStatus.dataset.state = 'error';
    routeStatus.textContent = `共有URLの${searchMode === 'depart' ? '出発' : '到着'}停留所が見つかりません。停留所を検索し直してください`;
    return;
  }
  stopSearchUi.select(group);
}

function maybeRunSharedSearch(): void {
  if (
    !autoRunPending ||
    !mapLoaded ||
    !timetableLoaded ||
    stopDataset === null ||
    selectedStopIndices.length === 0
  ) {
    return;
  }
  autoRunPending = false;
  void runRouteSearch();
}

function syncUrlState(): void {
  const updated = writeAppUrlState(pageUrl, {
    mode: searchMode,
    origin: searchMode === 'depart' ? selectedStopName : null,
    destination: searchMode === 'arrive' ? selectedStopName : null,
    date: dateInput.value.length === 0 ? null : dateInput.value,
    time: timeInput.value.length === 0 ? null : timeInput.value,
    view: reachabilityView,
  });
  window.history.replaceState(null, '', updated);
}

function syncTimeSlider(): void {
  try {
    const minute = parseDeparture(dateInput.value, timeInput.value).departure;
    const sliderMinute = Math.min(1435, Math.round(minute / 5) * 5);
    timeSlider.value = String(sliderMinute);
    timeSliderOutput.value = timeInput.value;
  } catch {
    timeSliderOutput.value = '--:--';
  }
}

function scheduleLiveSearch(): void {
  if (liveSearchTimer !== null) {
    clearTimeout(liveSearchTimer);
  }
  if (
    searchMode !== 'depart' ||
    !mapLoaded ||
    !timetableLoaded ||
    stopDataset === null ||
    selectedStopIndices.length === 0
  ) {
    liveSearchTimer = null;
    return;
  }
  liveSearchTimer = setTimeout(() => {
    liveSearchTimer = null;
    void runRouteSearch();
  }, LIVE_SEARCH_DELAY_MS);
}

function invalidateRouteSearch(): void {
  routeRequestVersion += 1;
  routeRunning = false;
  if (liveSearchTimer !== null) {
    clearTimeout(liveSearchTimer);
    liveSearchTimer = null;
  }
}

function renderStopMarker(): void {
  stopMarker?.remove();
  stopMarker = null;
  if (selectedStopGroup === null) {
    return;
  }
  stopMarker = new Marker({
    color: searchMode === 'depart'
      ? REACHABILITY_COLORS.origin
      : REACHABILITY_COLORS.destination,
  })
    .setLngLat([selectedStopGroup.center[0], selectedStopGroup.center[1]])
    .addTo(map);
}

function updateSearchModeUi(): void {
  const isDepart = searchMode === 'depart';
  modeButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.searchMode === searchMode));
  });
  searchPanel.setAttribute('aria-label', isDepart ? '出発停留所' : '到着停留所');
  stopRoleLabel.textContent = isDepart ? '出発停留所' : '到着停留所';
  dateRoleLabel.textContent = isDepart ? '出発日' : '到着日';
  timeRoleLabel.textContent = isDepart ? '出発時刻' : '到着時刻';
  runSearchButton.textContent = isDepart ? '到達範囲を探索' : '最遅出発時刻を探索';
  timeSliderControl.hidden = !isDepart;
  const markerRoleLabel = document.querySelector<HTMLElement>('.marker-role-label');
  if (markerRoleLabel !== null) {
    markerRoleLabel.textContent = isDepart ? '出発地' : '到着地';
  }
  const selection = document.querySelector<HTMLElement>('.stop-selection');
  if (selection !== null && selectedStopGroup !== null) {
    selection.textContent = `${String(selectedStopGroup.stopIndices.length)}のりばを${isDepart ? '出発地' : '到着地'}に設定`;
  }
}

function formatRouteError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('指定してください') || message.includes('正しくありません')) {
    return message;
  }
  if (message.includes('outside feed period')) {
    return '指定日がデータの有効期間外です。日付を変更して再度探索してください';
  }
  return '探索に失敗しました。日時を確認して、もう一度探索してください';
}

function toDateInputValue(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function requireElement<T extends Element>(element: T | null, selector: string): T {
  if (element === null) {
    throw new Error(`Required element was not found: ${selector}`);
  }
  return element;
}
