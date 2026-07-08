import { describe, expect, it } from 'vitest';

import { describePipelineDataset } from './index.js';

describe('describePipelineDataset', () => {
  it('uses the shared gtfs-types workspace package', () => {
    expect(describePipelineDataset('agency:nagoya-cbus', '202603_02')).toBe(
      'agency:nagoya-cbus@202603_02',
    );
  });
});
