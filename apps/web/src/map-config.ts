export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const NAGOYA_MAP_CENTER = [136.9066, 35.1815] as const;
export const NAGOYA_MAP_ZOOM = 11.8;

export interface MapConfig {
  readonly styleUrl: string;
  readonly center: readonly [number, number];
  readonly zoom: number;
}

export function resolveMapConfig(
  environment: Readonly<Record<string, string | undefined>> = import.meta.env,
): MapConfig {
  const configuredStyleUrl = environment.VITE_MAP_STYLE_URL?.trim();
  return {
    styleUrl:
      configuredStyleUrl === undefined || configuredStyleUrl.length === 0
        ? DEFAULT_MAP_STYLE_URL
        : configuredStyleUrl,
    center: NAGOYA_MAP_CENTER,
    zoom: NAGOYA_MAP_ZOOM,
  };
}
