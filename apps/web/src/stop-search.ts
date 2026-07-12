import { type BrowserStopsDataset } from '@isochrone/gtfs-types';

export interface StopGroup {
  readonly name: string;
  readonly kana: string | null;
  readonly stopIndices: readonly number[];
  readonly center: readonly [number, number];
}

interface SearchableStopGroup extends StopGroup {
  readonly normalizedName: string;
  readonly normalizedKana: string;
}

export function buildStopGroups(dataset: BrowserStopsDataset): readonly StopGroup[] {
  const stopIndexById = new Map(dataset.stops.ids.map((id, index) => [id, index]));
  return dataset.footpaths.sameNameGroups.map((group) => {
    const stopIndices = group.stopIds.map((stopId) => {
      const stopIndex = stopIndexById.get(stopId);
      if (stopIndex === undefined) {
        throw new Error(`Unknown stop in same-name group: ${stopId}`);
      }
      return stopIndex;
    });
    const kana = stopIndices
      .map((stopIndex) => dataset.stops.nameKanas[stopIndex])
      .find((value): value is string => value !== null && value !== undefined) ?? null;
    const center = getCenter(dataset, stopIndices);
    return { name: group.name, kana, stopIndices, center };
  });
}

export function searchStopGroups(
  groups: readonly StopGroup[],
  query: string,
  limit = 8,
): readonly StopGroup[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0 || limit <= 0) {
    return [];
  }

  return groups
    .map(toSearchableGroup)
    .map((group) => ({ group, score: getMatchScore(group, normalizedQuery) }))
    .filter((match): match is { readonly group: SearchableStopGroup; readonly score: number } =>
      match.score !== null)
    .sort((a, b) => a.score - b.score || a.group.name.localeCompare(b.group.name, 'ja'))
    .slice(0, limit)
    .map(({ group }) => group);
}

export function normalizeSearchText(value: string): string {
  return Array.from(value.normalize('NFKC').toLowerCase())
    .map((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : character;
    })
    .join('')
    .replaceAll(/\s/g, '');
}

function toSearchableGroup(group: StopGroup): SearchableStopGroup {
  return {
    ...group,
    normalizedName: normalizeSearchText(group.name),
    normalizedKana: normalizeSearchText(group.kana ?? ''),
  };
}

function getMatchScore(group: SearchableStopGroup, query: string): number | null {
  if (group.normalizedName === query || group.normalizedKana === query) {
    return 0;
  }
  if (group.normalizedName.startsWith(query) || group.normalizedKana.startsWith(query)) {
    return 1;
  }
  if (group.normalizedName.includes(query) || group.normalizedKana.includes(query)) {
    return 2;
  }
  return null;
}

function getCenter(
  dataset: BrowserStopsDataset,
  stopIndices: readonly number[],
): readonly [number, number] {
  if (stopIndices.length === 0) {
    throw new Error('Same-name stop group must not be empty.');
  }
  const totals = stopIndices.reduce(
    (sum, stopIndex) => ({
      lon: sum.lon + (dataset.stops.lons[stopIndex] ?? 0),
      lat: sum.lat + (dataset.stops.lats[stopIndex] ?? 0),
    }),
    { lon: 0, lat: 0 },
  );
  return [totals.lon / stopIndices.length, totals.lat / stopIndices.length];
}
