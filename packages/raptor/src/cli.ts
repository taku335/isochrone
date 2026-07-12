import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  type BrowserDatasetManifest,
  type BrowserStopsDataset,
  type BrowserTimetableDataset,
} from '@isochrone/gtfs-types';

import { route, UNREACHED } from './core.js';
import { loadTimetable, type LoadedTimetable } from './index.js';

const DEFAULT_RUNS = 10;
const DEFAULT_WARMUP_RUNS = 2;
const PERFORMANCE_TARGET_MS = 200;
const DEFAULT_REPRESENTATIVES = ['栄', '名古屋駅', '金山'] as const;

export const RAPTOR_CLI_HELP = `Usage: raptor-cli <stop-name> <date> <time> [options]

Arguments:
  stop-name                 Exact origin stop name (all matching poles are used)
  date                      Service date (YYYYMMDD or YYYY-MM-DD)
  time                      Departure time (HH:MM)

Options:
  --data-dir <path>         Browser dataset directory
  --representative <name>   Report the earliest arrival for this stop name (repeatable)
  --runs <n>                Measured runs after warmup (default: 10)
  --warmup <n>              Warmup runs (default: 2)
  --max-rounds <n>          Maximum transit rounds (default: 5)
  -h, --help                Show this help message

Example:
  raptor-cli 栄 20260707 08:00 --representative 名古屋駅`;

export interface SmokeBenchmarkOptions {
  readonly stopName: string;
  readonly serviceDate: string;
  readonly departure: number;
  readonly representativeStopNames?: readonly string[];
  readonly runs?: number;
  readonly warmupRuns?: number;
  readonly maxRounds?: number;
  readonly now?: () => number;
}

export interface SmokeBenchmarkResult {
  readonly query: {
    readonly stopName: string;
    readonly originStopCount: number;
    readonly serviceDate: string;
    readonly departure: string;
    readonly maxRounds: number;
  };
  readonly dataset: {
    readonly feedVersion: string;
    readonly stops: number;
    readonly trips: number;
  };
  readonly result: {
    readonly reachableStops: number;
    readonly representatives: readonly RepresentativeArrival[];
  };
  readonly performance: {
    readonly warmupRuns: number;
    readonly measuredRuns: number;
    readonly durationsMs: readonly number[];
    readonly medianMs: number;
    readonly targetMs: number;
    readonly withinTarget: boolean;
  };
  readonly sanity: {
    readonly ok: boolean;
    readonly issues: readonly string[];
  };
}

export interface RepresentativeArrival {
  readonly stopName: string;
  readonly stopCount: number;
  readonly arrival: string | null;
  readonly arrivalMinute: number | null;
}

interface RaptorCliDependencies {
  readonly loadData?: (dataDir: string) => Promise<LoadedTimetable>;
  readonly now?: () => number;
}

interface ParsedCliOptions {
  readonly stopName: string;
  readonly serviceDate: string;
  readonly departure: number;
  readonly dataDir: string;
  readonly representativeStopNames: readonly string[];
  readonly runs: number;
  readonly warmupRuns: number;
  readonly maxRounds: number;
}

export async function runRaptorCli(
  args: readonly string[] = process.argv.slice(2),
  write: (message: string) => void = console.log,
  writeError: (message: string) => void = console.error,
  dependencies: RaptorCliDependencies = {},
): Promise<number> {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
  if (
    normalizedArgs.length === 0 ||
    normalizedArgs.includes('--help') ||
    normalizedArgs.includes('-h')
  ) {
    write(RAPTOR_CLI_HELP);
    return 0;
  }

  try {
    const options = parseCliOptions(normalizedArgs);
    const data = await (dependencies.loadData ?? loadTimetableFromDirectory)(options.dataDir);
    const result = benchmarkRaptor(data, {
      ...options,
      ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
    });
    write(JSON.stringify(result, null, 2));
    return result.sanity.ok ? 0 : 1;
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function benchmarkRaptor(
  data: LoadedTimetable,
  options: SmokeBenchmarkOptions,
): SmokeBenchmarkResult {
  const originIndices = findStopsByName(data, options.stopName);
  if (originIndices.length === 0) {
    throw new Error(`No stops found with exact name: ${options.stopName}`);
  }

  const runs = options.runs ?? DEFAULT_RUNS;
  const warmupRuns = options.warmupRuns ?? DEFAULT_WARMUP_RUNS;
  const maxRounds = options.maxRounds ?? 5;
  assertNonNegativeInteger(warmupRuns, '--warmup');
  assertPositiveInteger(runs, '--runs');
  assertNonNegativeInteger(maxRounds, '--max-rounds');
  const query = {
    kind: 'earliestArrival' as const,
    origins: originIndices.map((stopIndex) => ({ stopIndex, departure: options.departure })),
    serviceDate: options.serviceDate,
    maxRounds,
  };

  for (let index = 0; index < warmupRuns; index += 1) {
    route(data, query);
  }

  const now = options.now ?? (() => performance.now());
  const durations: number[] = [];
  let arrival: Uint16Array = new Uint16Array(data.stopIds.length);
  arrival.fill(UNREACHED);
  for (let index = 0; index < runs; index += 1) {
    const startedAt = now();
    arrival = route(data, query).arrival;
    durations.push(now() - startedAt);
  }

  const reachableStops = arrival.reduce(
    (count, reachedAt) => count + (reachedAt === UNREACHED ? 0 : 1),
    0,
  );
  const representativeStopNames =
    options.representativeStopNames ?? DEFAULT_REPRESENTATIVES;
  const representatives = representativeStopNames.map((stopName) =>
    summarizeRepresentative(data, arrival, stopName),
  );
  const medianMs = median(durations);
  const sanityIssues = getSanityIssues(arrival, originIndices, options.departure, reachableStops);

  return {
    query: {
      stopName: options.stopName,
      originStopCount: originIndices.length,
      serviceDate: options.serviceDate,
      departure: formatMinute(options.departure),
      maxRounds,
    },
    dataset: {
      feedVersion: data.manifest.feedVersion,
      stops: data.loadStats.stops,
      trips: data.loadStats.trips,
    },
    result: { reachableStops, representatives },
    performance: {
      warmupRuns,
      measuredRuns: runs,
      durationsMs: durations,
      medianMs,
      targetMs: PERFORMANCE_TARGET_MS,
      withinTarget: medianMs < PERFORMANCE_TARGET_MS,
    },
    sanity: {
      ok: sanityIssues.length === 0,
      issues: sanityIssues,
    },
  };
}

export async function loadTimetableFromDirectory(dataDir: string): Promise<LoadedTimetable> {
  const manifest = await readJson<BrowserDatasetManifest>(resolve(dataDir, 'manifest.json'));
  const [stops, timetable] = await Promise.all([
    readJson<BrowserStopsDataset>(resolve(dataDir, manifest.files.stops.path)),
    readJson<BrowserTimetableDataset>(resolve(dataDir, manifest.files.timetable.path)),
  ]);
  return loadTimetable({ manifest, stops, timetable });
}

function parseCliOptions(args: readonly string[]): ParsedCliOptions {
  const [stopName, serviceDate, time, ...rest] = args;
  if (stopName === undefined || serviceDate === undefined || time === undefined) {
    throw new Error('Usage error: stop name, date, and time are required.');
  }

  let dataDir = defaultDataDir();
  const representativeStopNames: string[] = [];
  let runs = DEFAULT_RUNS;
  let warmupRuns = DEFAULT_WARMUP_RUNS;
  let maxRounds = 5;

  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    const value = rest[index + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${option ?? 'option'}.`);
    }
    if (option === '--data-dir') {
      dataDir = resolve(value);
    } else if (option === '--representative') {
      representativeStopNames.push(value);
    } else if (option === '--runs') {
      runs = parsePositiveInteger(value, option);
    } else if (option === '--warmup') {
      warmupRuns = parseNonNegativeInteger(value, option);
    } else if (option === '--max-rounds') {
      maxRounds = parseNonNegativeInteger(value, option);
    } else {
      throw new Error(`Unknown option: ${option ?? ''}`);
    }
    index += 1;
  }

  return {
    stopName,
    serviceDate,
    departure: parseTime(time),
    dataDir,
    representativeStopNames:
      representativeStopNames.length === 0 ? DEFAULT_REPRESENTATIVES : representativeStopNames,
    runs,
    warmupRuns,
    maxRounds,
  };
}

function summarizeRepresentative(
  data: LoadedTimetable,
  arrival: Uint16Array,
  stopName: string,
): RepresentativeArrival {
  const indices = findStopsByName(data, stopName);
  const arrivalMinute = indices.reduce<number>(
    (best, stopIndex) => Math.min(best, arrival[stopIndex] ?? UNREACHED),
    UNREACHED,
  );
  return {
    stopName,
    stopCount: indices.length,
    arrival: arrivalMinute === UNREACHED ? null : formatMinute(arrivalMinute),
    arrivalMinute: arrivalMinute === UNREACHED ? null : arrivalMinute,
  };
}

function getSanityIssues(
  arrival: Uint16Array,
  originIndices: readonly number[],
  departure: number,
  reachableStops: number,
): string[] {
  const issues: string[] = [];
  if (reachableStops <= originIndices.length) {
    issues.push('No stops beyond the origin poles are reachable.');
  }
  const originSet = new Set(originIndices);
  const nonOriginArrivals = [...arrival].filter(
    (reachedAt, stopIndex) => !originSet.has(stopIndex) && reachedAt !== UNREACHED,
  );
  if (
    nonOriginArrivals.length > 0 &&
    nonOriginArrivals.every((reachedAt) => reachedAt === departure)
  ) {
    issues.push('Every non-origin stop has zero travel time.');
  }
  return issues;
}

function findStopsByName(data: LoadedTimetable, stopName: string): number[] {
  const indices: number[] = [];
  data.stopNames.forEach((name, index) => {
    if (name === stopName) {
      indices.push(index);
    }
  });
  return indices;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function parseTime(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  const hours = Number(match?.[1]);
  const minutes = Number(match?.[2]);
  const value = hours * 60 + minutes;
  if (match === null || minutes >= 60 || value >= UNREACHED) {
    throw new Error(`Invalid departure time: ${time}`);
  }
  return value;
}

function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  assertPositiveInteger(parsed, option);
  return parsed;
}

function parseNonNegativeInteger(value: string, option: string): number {
  const parsed = Number(value);
  assertNonNegativeInteger(parsed, option);
  return parsed;
}

function assertPositiveInteger(value: number, option: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${option} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value: number, option: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${option} must be a non-negative integer.`);
  }
}

function defaultDataDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.cache', 'web-data', 'nagoya-cbus');
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runRaptorCli();
}
