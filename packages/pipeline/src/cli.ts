import { pathToFileURL } from 'node:url';

export const PIPELINE_HELP = `Usage: docker compose run --rm pipeline [options]

Options:
  -h, --help    Show this help message

The GTFS data generation commands will be added in later issues.`;

export function runPipelineCli(
  args: readonly string[] = process.argv.slice(2),
  write: (message: string) => void = console.log,
): number {
  const shouldShowHelp = args.length === 0 || args.includes('--help') || args.includes('-h');

  if (shouldShowHelp) {
    write(PIPELINE_HELP);
    return 0;
  }

  write(`Unknown pipeline command: ${args.join(' ')}`);
  write(PIPELINE_HELP);
  return 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runPipelineCli();
}
