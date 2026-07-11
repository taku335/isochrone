import { pathToFileURL } from 'node:url';

import { dirname, resolve } from 'node:path';

import { type AgencyConfig, findAgency, findAgenciesConfigPath, loadAgenciesConfig } from './agencies.js';
import { buildBrowserDatasetFiles, writeBrowserDataset } from './dataset.js';
import { downloadGtfsZip, readDownloadManifest } from './downloader.js';
import { buildFootpaths, DEFAULT_FOOTPATH_CONFIG, getFootpathStats } from './footpaths.js';
import { getGtfsStats, parseGtfsZipFile } from './gtfs-parser.js';
import { buildCompactTimetable, getCompactTimetableStats } from './patterns.js';
import { validateBrowserDataset } from './validation.js';

export const PIPELINE_HELP = `Usage: docker compose run --rm pipeline <command> [options]

Commands:
  download <agency-id>    Download and cache a GTFS-JP zip
  inspect <agency-id>     Parse the cached GTFS-JP zip and print counts
  compact <agency-id>     Build compact timetable stats from the cached zip
  footpaths <agency-id>   Generate footpath CSR stats from the cached zip
  dataset <agency-id>     Write browser dataset files and enforce the size gate
  validate <agency-id>    Validate generated browser dataset quality

Options:
  --cache-dir <path>      Cache directory (default: .cache/gtfs)
  --config <path>         Agencies config path (default: config/agencies.json)
  --out-dir <path>        Dataset output directory (default: .cache/web-data/<agency-id>)
  --size-limit-bytes <n>  Dataset gzip size limit (default: 1500000)
  -h, --help              Show this help message

Examples:
  pipeline download nagoya-cbus
  pipeline inspect nagoya-cbus
  pipeline compact nagoya-cbus
  pipeline footpaths nagoya-cbus
  pipeline dataset nagoya-cbus
  pipeline validate nagoya-cbus
  docker compose run --rm pipeline download nagoya-cbus`;

export async function runPipelineCli(
  args: readonly string[] = process.argv.slice(2),
  write: (message: string) => void = console.log,
  writeError: (message: string) => void = console.error,
): Promise<number> {
  const shouldShowHelp = args.length === 0 || args.includes('--help') || args.includes('-h');

  if (shouldShowHelp) {
    write(PIPELINE_HELP);
    return 0;
  }

  const [command, ...rest] = args;

  try {
    if (command === 'download') {
      const options = parseAgencyCommandArgs(rest, 'download');
      const configPath = options.configPath ?? findAgenciesConfigPath();
      const config = await loadAgenciesConfig(configPath);
      const agency = findAgency(config, options.agencyId);
      const cacheDir = resolve(options.cacheDir ?? resolve(dirname(configPath), '..', '.cache', 'gtfs'));
      const result = await downloadGtfsZip({ agency, cacheDir });
      write(`${result.status}: ${result.manifest.zipPath}`);
      write(`last_modified: ${result.manifest.lastModified}`);
      return 0;
    }

    if (command === 'inspect') {
      const options = parseAgencyCommandArgs(rest, 'inspect');
      const { agency, manifest } = await loadCachedAgencyManifest(options);
      const stats = getGtfsStats(await parseGtfsZipFile(manifest.zipPath, toParseOptions(agency)));
      write(JSON.stringify(stats, null, 2));
      return 0;
    }

    if (command === 'compact') {
      const options = parseAgencyCommandArgs(rest, 'compact');
      const { agency, manifest } = await loadCachedAgencyManifest(options);
      const gtfs = await parseGtfsZipFile(manifest.zipPath, toParseOptions(agency));
      const timetable = buildCompactTimetable(gtfs);
      write(JSON.stringify(getCompactTimetableStats(gtfs, timetable), null, 2));
      for (const warning of timetable.warnings) {
        writeError(`warning: ${warning}`);
      }
      return 0;
    }

    if (command === 'footpaths') {
      const options = parseAgencyCommandArgs(rest, 'footpaths');
      const { agency, manifest } = await loadCachedAgencyManifest(options);
      const gtfs = await parseGtfsZipFile(manifest.zipPath, toParseOptions(agency));
      const footpaths = buildFootpaths(gtfs.stops, agency.footpaths ?? DEFAULT_FOOTPATH_CONFIG);
      write(JSON.stringify(getFootpathStats(footpaths), null, 2));
      return 0;
    }

    if (command === 'dataset') {
      const options = parseDatasetCommandArgs(rest);
      const configPath = options.configPath ?? findAgenciesConfigPath();
      const { agency, manifest } = await loadCachedAgencyManifest(options, configPath);
      const gtfs = await parseGtfsZipFile(manifest.zipPath, toParseOptions(agency));
      const outDir = resolve(
        options.outDir ?? resolve(dirname(configPath), '..', '.cache', 'web-data', agency.id),
      );
      const result = await writeBrowserDataset(gtfs, {
        outDir,
        feedVersion: manifest.lastModified,
        footpathConfig: agency.footpaths ?? DEFAULT_FOOTPATH_CONFIG,
        ...(options.sizeLimitBytes === undefined ? {} : { sizeLimitBytes: options.sizeLimitBytes }),
      });
      write(JSON.stringify({
        outDir: result.outDir,
        manifest: result.manifestPath,
        stops: result.manifest.files.stops.path,
        timetable: result.manifest.files.timetable.path,
        gzipBytes: {
          manifest: result.manifestGzipBytes,
          stops: result.manifest.files.stops.gzipBytes,
          timetable: result.manifest.files.timetable.gzipBytes,
          total: result.totalGzipBytes,
          limit: result.manifest.sizeGate.limitBytes,
        },
      }, null, 2));
      return 0;
    }

    if (command === 'validate') {
      const options = parseAgencyCommandArgs(rest, 'validate');
      const { agency, manifest } = await loadCachedAgencyManifest(options);
      const gtfs = await parseGtfsZipFile(manifest.zipPath, toParseOptions(agency));
      const files = buildBrowserDatasetFiles(gtfs, {
        feedVersion: manifest.lastModified,
        footpathConfig: agency.footpaths ?? DEFAULT_FOOTPATH_CONFIG,
      });
      const result = validateBrowserDataset(files);
      write(JSON.stringify(result, null, 2));
      for (const issue of result.issues) {
        writeError(`${issue.code}: ${issue.path}: ${issue.message}`);
      }
      return result.ok ? 0 : 1;
    }

    writeError(`Unknown pipeline command: ${command ?? ''}`);
    write(PIPELINE_HELP);
    return 1;
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runPipelineCli();
}

interface AgencyCommandCliOptions {
  readonly agencyId: string;
  readonly cacheDir?: string;
  readonly configPath?: string;
}

interface DatasetCommandCliOptions extends AgencyCommandCliOptions {
  readonly outDir?: string;
  readonly sizeLimitBytes?: number;
}

interface CachedAgencyManifest {
  readonly agency: AgencyConfig;
  readonly manifest: {
    readonly zipPath: string;
    readonly lastModified: string;
  };
}

async function loadCachedAgencyManifest(
  options: AgencyCommandCliOptions,
  resolvedConfigPath?: string,
): Promise<CachedAgencyManifest> {
  const configPath = resolvedConfigPath ?? options.configPath ?? findAgenciesConfigPath();
  const config = await loadAgenciesConfig(configPath);
  const agencyConfig = findAgency(config, options.agencyId);
  const cacheDir = resolve(options.cacheDir ?? resolve(dirname(configPath), '..', '.cache', 'gtfs'));
  const manifest = await readDownloadManifest(resolve(cacheDir, agencyConfig.id, 'manifest.json'));
  if (manifest === null) {
    throw new Error(`No cached GTFS manifest found for ${agencyConfig.id}. Run download first.`);
  }

  return {
    agency: agencyConfig,
    manifest,
  };
}

function parseAgencyCommandArgs(args: readonly string[], command: string): AgencyCommandCliOptions {
  const [agencyId, ...rest] = args;
  if (agencyId === undefined || agencyId.startsWith('-')) {
    throw new Error(`Usage error: ${command} requires an agency id.`);
  }

  let cacheDir: string | undefined;
  let configPath: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const value = rest[index + 1];

    if (arg === '--cache-dir' && value !== undefined) {
      cacheDir = value;
      index += 1;
    } else if (arg === '--config' && value !== undefined) {
      configPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown ${command} option: ${arg ?? ''}`);
    }
  }

  return {
    agencyId,
    ...(cacheDir === undefined ? {} : { cacheDir }),
    ...(configPath === undefined ? {} : { configPath }),
  };
}

function parseDatasetCommandArgs(args: readonly string[]): DatasetCommandCliOptions {
  const [agencyId, ...rest] = args;
  if (agencyId === undefined || agencyId.startsWith('-')) {
    throw new Error('Usage error: dataset requires an agency id.');
  }

  let cacheDir: string | undefined;
  let configPath: string | undefined;
  let outDir: string | undefined;
  let sizeLimitBytes: number | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const value = rest[index + 1];

    if (arg === '--cache-dir' && value !== undefined) {
      cacheDir = value;
      index += 1;
    } else if (arg === '--config' && value !== undefined) {
      configPath = value;
      index += 1;
    } else if (arg === '--out-dir' && value !== undefined) {
      outDir = value;
      index += 1;
    } else if (arg === '--size-limit-bytes' && value !== undefined) {
      sizeLimitBytes = parsePositiveInteger(value, '--size-limit-bytes');
      index += 1;
    } else {
      throw new Error(`Unknown dataset option: ${arg ?? ''}`);
    }
  }

  return {
    agencyId,
    ...(cacheDir === undefined ? {} : { cacheDir }),
    ...(configPath === undefined ? {} : { configPath }),
    ...(outDir === undefined ? {} : { outDir }),
    ...(sizeLimitBytes === undefined ? {} : { sizeLimitBytes }),
  };
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function toParseOptions(agency: AgencyConfig): { readonly agencyId: string; readonly idPrefix: string } {
  return {
    agencyId: agency.id,
    idPrefix: agency.idPrefix,
  };
}
