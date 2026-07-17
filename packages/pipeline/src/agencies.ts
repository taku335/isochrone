import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { type BrowserDatasetAttribution } from '@isochrone/gtfs-types';

export interface ResourceSelectorConfig {
  readonly format?: string;
  readonly nameIncludes?: readonly string[];
  readonly preferLatest?: boolean;
}

export interface AgencyConfig {
  readonly id: string;
  readonly displayName: string;
  readonly ckanEndpoint: string;
  readonly packageId: string;
  readonly resourceSelector: ResourceSelectorConfig;
  readonly idPrefix: string;
  readonly attribution?: BrowserDatasetAttribution;
  readonly footpaths?: FootpathConfig;
}

export interface FootpathConfig {
  readonly radiusMeters: number;
  readonly sameNameRadiusMeters: number;
  readonly walkMetersPerMinute: number;
  readonly bufferMinutes: number;
  readonly gridCellMeters: number;
}

export interface AgenciesConfig {
  readonly agencies: readonly AgencyConfig[];
}

export async function loadAgenciesConfig(configPath = findAgenciesConfigPath()): Promise<AgenciesConfig> {
  const raw = await readFile(configPath, 'utf8');
  return parseAgenciesConfig(JSON.parse(raw));
}

export function findAgency(config: AgenciesConfig, agencyId: string): AgencyConfig {
  const agency = config.agencies.find((item) => item.id === agencyId);
  if (agency === undefined) {
    throw new Error(`Unknown agency: ${agencyId}`);
  }
  return agency;
}

export function parseAgenciesConfig(value: unknown): AgenciesConfig {
  if (!isRecord(value) || !Array.isArray(value.agencies)) {
    throw new Error('Invalid agencies config: expected agencies array.');
  }

  return {
    agencies: value.agencies.map(parseAgencyConfig),
  };
}

export function findAgenciesConfigPath(startDirectory = process.cwd()): string {
  let current = resolve(startDirectory);

  while (current !== dirname(current)) {
    const candidate = join(current, 'config', 'agencies.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    current = dirname(current);
  }

  return join(current, 'config', 'agencies.json');
}

function parseAgencyConfig(value: unknown): AgencyConfig {
  if (!isRecord(value)) {
    throw new Error('Invalid agency config entry.');
  }

  const id = readString(value, 'id');
  const displayName = readString(value, 'displayName');
  const ckanEndpoint = readString(value, 'ckanEndpoint');
  const packageId = readString(value, 'packageId');
  const idPrefix = readString(value, 'idPrefix');
  const resourceSelector = parseResourceSelector(value.resourceSelector);
  const attribution = value.attribution === undefined
    ? undefined
    : parseAttribution(value.attribution);
  const footpaths = value.footpaths === undefined ? undefined : parseFootpathConfig(value.footpaths);

  return {
    id,
    displayName,
    ckanEndpoint,
    packageId,
    resourceSelector,
    idPrefix,
    ...(attribution === undefined ? {} : { attribution }),
    ...(footpaths === undefined ? {} : { footpaths }),
  };
}

function parseAttribution(value: unknown): BrowserDatasetAttribution {
  if (!isRecord(value)) {
    throw new Error('Invalid agency attribution config.');
  }
  return {
    datasetUrl: readString(value, 'datasetUrl'),
    licenseName: readString(value, 'licenseName'),
    licenseUrl: readString(value, 'licenseUrl'),
  };
}

function parseResourceSelector(value: unknown): ResourceSelectorConfig {
  if (!isRecord(value)) {
    throw new Error('Invalid resource selector config.');
  }

  const selector: ResourceSelectorConfig = {};

  if (typeof value.format === 'string') {
    Object.assign(selector, { format: value.format });
  }

  if (Array.isArray(value.nameIncludes)) {
    Object.assign(selector, {
      nameIncludes: value.nameIncludes.map((item) => {
        if (typeof item !== 'string') {
          throw new Error('Invalid resource selector config: nameIncludes must contain strings.');
        }
        return item;
      }),
    });
  }

  if (typeof value.preferLatest === 'boolean') {
    Object.assign(selector, { preferLatest: value.preferLatest });
  }

  return selector;
}

function readString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid agencies config: expected non-empty string at ${key}.`);
  }
  return value;
}

function parseFootpathConfig(value: unknown): FootpathConfig {
  if (!isRecord(value)) {
    throw new Error('Invalid footpath config.');
  }

  return {
    radiusMeters: readNumber(value, 'radiusMeters'),
    sameNameRadiusMeters: readNumber(value, 'sameNameRadiusMeters'),
    walkMetersPerMinute: readNumber(value, 'walkMetersPerMinute'),
    bufferMinutes: readNumber(value, 'bufferMinutes'),
    gridCellMeters: readNumber(value, 'gridCellMeters'),
  };
}

function readNumber(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid agencies config: expected finite number at ${key}.`);
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
