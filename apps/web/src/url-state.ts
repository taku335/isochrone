export type ReachabilityView = 'polygons' | 'stops';

export interface AppUrlState {
  readonly origin: string | null;
  readonly date: string | null;
  readonly time: string | null;
  readonly view: ReachabilityView;
}

export function readAppUrlState(url: URL): AppUrlState {
  return {
    origin: readNonEmpty(url.searchParams.get('origin')),
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
  setOrDelete(updated.searchParams, 'origin', state.origin);
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
  return state.origin !== null && state.date !== null && state.time !== null;
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
