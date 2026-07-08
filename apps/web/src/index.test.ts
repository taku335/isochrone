import { describe, expect, it } from 'vitest';

import { getAppName } from './index.js';

describe('getAppName', () => {
  it('returns the application name', () => {
    expect(getAppName()).toBe('isochrone');
  });
});
