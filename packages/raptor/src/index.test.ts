import { describe, expect, it } from 'vitest';

import { formatRaptorDatasetLabel } from './index.js';

describe('formatRaptorDatasetLabel', () => {
  it('uses the shared gtfs-types workspace package', () => {
    expect(
      formatRaptorDatasetLabel({
        agencyId: 'agency:nagoya-cbus',
        feedVersion: '202603_02',
      }),
    ).toBe('agency:nagoya-cbus:202603_02');
  });
});
