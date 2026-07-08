import { describe, expect, it } from 'vitest';

import { PIPELINE_HELP, runPipelineCli } from './cli.js';

describe('runPipelineCli', () => {
  it('prints help for --help', () => {
    const output: string[] = [];

    expect(runPipelineCli(['--help'], (message) => output.push(message))).toBe(0);
    expect(output).toEqual([PIPELINE_HELP]);
  });
});
