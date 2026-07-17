import { describe, expect, it } from 'vitest';

import { parseAgenciesConfig } from './agencies.js';

describe('parseAgenciesConfig', () => {
  it('parses source attribution metadata', () => {
    const config = parseAgenciesConfig({
      agencies: [
        {
          id: 'nagoya-cbus',
          displayName: '名古屋市交通局 市バス',
          ckanEndpoint: 'https://example.test/api',
          packageId: 'bus-gtfs',
          resourceSelector: { format: 'ZIP' },
          idPrefix: 'nagoya-cbus',
          attribution: {
            datasetUrl: 'https://example.test/dataset',
            licenseName: 'CC BY 4.0',
            licenseUrl: 'https://example.test/license',
          },
        },
      ],
    });

    expect(config.agencies[0]?.attribution).toEqual({
      datasetUrl: 'https://example.test/dataset',
      licenseName: 'CC BY 4.0',
      licenseUrl: 'https://example.test/license',
    });
  });
});
