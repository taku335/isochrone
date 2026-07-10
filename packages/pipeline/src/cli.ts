import { pathToFileURL } from 'node:url';

import { dirname, resolve } from 'node:path';

import { findAgency, findAgenciesConfigPath, loadAgenciesConfig } from './agencies.js';
import { downloadGtfsZip, readDownloadManifest } from './downloader.js';
import { getGtfsStats, parseGtfsZipFile } from './gtfs-parser.js';
import { buildCompactTimetable, getCompactTimetableStats } from './patterns.js';

export const PIPELINE_HELP = `Usage: docker compose run --rm pipeline <command> [options]

Commands:
  download <agency-id>    Download and cache a GTFS-JP zip
  inspect <agency-id>     Parse the cached GTFS-JP zip and print counts
  compact <agency-id>     Build compact timetable stats from the cached zip

Options:
  --cache-dir <path>      Cache directory (default: .cache/gtfs)
  --config <path>         Agencies config path (default: config/agencies.json)
  -h, --help              Show this help message

Examples:
  pipeline download nagoya-cbus
  pipeline inspect nagoya-cbus
  pipeline compact nagoya-cbus
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
      const stats = getGtfsStats(await parseGtfsZipFile(manifest.zipPath, agency));
      write(JSON.stringify(stats, null, 2));
      return 0;
    }

    if (command === 'compact') {
      const options = parseAgencyCommandArgs(rest, 'compact');
      const { agency, manifest } = await loadCachedAgencyManifest(options);
      const gtfs = await parseGtfsZipFile(manifest.zipPath, agency);
      const timetable = buildCompactTimetable(gtfs);
      write(JSON.stringify(getCompactTimetableStats(gtfs, timetable), null, 2));
      for (const warning of timetable.warnings) {
        writeError(`warning: ${warning}`);
      }
      return 0;
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

interface CachedAgencyManifest {
  readonly agency: {
    readonly agencyId: string;
    readonly idPrefix: string;
  };
  readonly manifest: {
    readonly zipPath: string;
  };
}

async function loadCachedAgencyManifest(options: AgencyCommandCliOptions): Promise<CachedAgencyManifest> {
  const configPath = options.configPath ?? findAgenciesConfigPath();
  const config = await loadAgenciesConfig(configPath);
  const agencyConfig = findAgency(config, options.agencyId);
  const cacheDir = resolve(options.cacheDir ?? resolve(dirname(configPath), '..', '.cache', 'gtfs'));
  const manifest = await readDownloadManifest(resolve(cacheDir, agencyConfig.id, 'manifest.json'));
  if (manifest === null) {
    throw new Error(`No cached GTFS manifest found for ${agencyConfig.id}. Run download first.`);
  }

  return {
    agency: {
      agencyId: agencyConfig.id,
      idPrefix: agencyConfig.idPrefix,
    },
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
