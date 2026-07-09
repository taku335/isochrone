import { describe, expect, it } from 'vitest';

import { PIPELINE_HELP, runPipelineCli } from './cli.js';

describe('runPipelineCli', () => {
  it('prints help for --help', async () => {
    const output: string[] = [];

    await expect(runPipelineCli(['--help'], (message) => output.push(message))).resolves.toBe(0);
    expect(output).toEqual([PIPELINE_HELP]);
  });
});
