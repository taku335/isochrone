import { describe, expect, it } from 'vitest';

import { createDatasetIdentity } from './index.js';

describe('createDatasetIdentity', () => {
  it('keeps the agency id and feed version together', () => {
    expect(createDatasetIdentity('agency:nagoya-cbus', '202603_02')).toEqual({
      agencyId: 'agency:nagoya-cbus',
      feedVersion: '202603_02',
    });
  });
});
