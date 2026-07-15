export type ReachabilityView = 'polygons' | 'stops';
export type SearchMode = 'depart' | 'arrive';

export interface AppUrlState {
  readonly mode: SearchMode;
  readonly origin: string | null;
  readonly destination: string | null;
  readonly date: string | null;
  readonly time: string | null;
  readonly view: ReachabilityView;
}

export function readAppUrlState(url: URL): AppUrlState {
  return {
    mode: url.searchParams.get('mode') === 'arrive' ? 'arrive' : 'depart',
    origin: readNonEmpty(url.searchParams.get('origin')),
    destination: readNonEmpty(url.searchParams.get('destination')),
    date: readDate(url.searchParams.get('date')),
    time: readTime(url.searchParams.get('time')),
    view:
      url.searchParams.get('view') === 'stops' || url.searchParams.get('debug') === 'stops'
        ? 'stops'
        : 'polygons',
  };
}

export function writeAppUrlState(url: URL, state: AppUrlState): URL {
  const updated = new URL(url);
  updated.searchParams.set('mode', state.mode);
  setOrDelete(updated.searchParams, 'origin', state.origin);
  setOrDelete(updated.searchParams, 'destination', state.destination);
  setOrDelete(updated.searchParams, 'date', state.date);
  setOrDelete(updated.searchParams, 'time', state.time);
  if (state.view === 'stops') {
    updated.searchParams.set('view', 'stops');
  } else {
    updated.searchParams.delete('view');
  }
  updated.searchParams.delete('debug');
  return updated;
}

export function hasRunnableUrlState(state: AppUrlState): boolean {
  const stop = state.mode === 'depart' ? state.origin : state.destination;
  return stop !== null && state.date !== null && state.time !== null;
}

function readNonEmpty(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
}

function readDate(value: string | null): string | null {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function readTime(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return null;
  }
  return value;
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value === null) {
    params.delete(key);
  } else {
    params.set(key, value);
  }
}
