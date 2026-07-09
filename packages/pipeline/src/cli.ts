import { pathToFileURL } from 'node:url';

import { dirname, resolve } from 'node:path';

import { findAgency, findAgenciesConfigPath, loadAgenciesConfig } from './agencies.js';
import { downloadGtfsZip } from './downloader.js';

export const PIPELINE_HELP = `Usage: docker compose run --rm pipeline <command> [options]

Commands:
  download <agency-id>    Download and cache a GTFS-JP zip

Options:
  --cache-dir <path>      Cache directory (default: .cache/gtfs)
  --config <path>         Agencies config path (default: config/agencies.json)
  -h, --help              Show this help message

Examples:
  pipeline download nagoya-cbus
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
      const options = parseDownloadArgs(rest);
      const configPath = options.configPath ?? findAgenciesConfigPath();
      const config = await loadAgenciesConfig(configPath);
      const agency = findAgency(config, options.agencyId);
      const cacheDir = resolve(options.cacheDir ?? resolve(dirname(configPath), '..', '.cache', 'gtfs'));
      const result = await downloadGtfsZip({ agency, cacheDir });
      write(`${result.status}: ${result.manifest.zipPath}`);
      write(`last_modified: ${result.manifest.lastModified}`);
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

interface DownloadCliOptions {
  readonly agencyId: string;
  readonly cacheDir?: string;
  readonly configPath?: string;
}

function parseDownloadArgs(args: readonly string[]): DownloadCliOptions {
  const [agencyId, ...rest] = args;
  if (agencyId === undefined || agencyId.startsWith('-')) {
    throw new Error('Usage error: download requires an agency id.');
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
      throw new Error(`Unknown download option: ${arg ?? ''}`);
    }
  }

  return {
    agencyId,
    ...(cacheDir === undefined ? {} : { cacheDir }),
    ...(configPath === undefined ? {} : { configPath }),
  };
}
