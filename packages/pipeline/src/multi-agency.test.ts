import { type PrefixedId } from '@isochrone/gtfs-types';
import { describe, expect, it } from 'vitest';

import { buildBrowserDatasetFiles } from './dataset.js';
import {
  mergeNormalizedGtfs,
  MultiAgencyMergeError,
  type NormalizedGtfsSource,
} from './multi-agency.js';

describe('mergeNormalizedGtfs', () => {
  it('merges prefixed feeds deterministically with source metadata', () => {
    const first = mergeNormalizedGtfs('nagoya-transit', [subwaySource, busSource]);
    const second = mergeNormalizedGtfs('nagoya-transit', [busSource, subwaySource]);

    expect(first).toEqual(second);
    expect(first.gtfs.agencyId).toBe('nagoya-transit');
    expect(first.gtfs.stops.map(({ stopId }) => stopId)).toEqual([
      'nagoya-cbus:SAKAE',
      'nagoya-subway:SAKAE',
    ]);
    expect(first.feedVersion).toMatch(/^multi-[0-9a-f]{16}$/);
    expect(first.sources).toEqual([
      {
        agencyId: 'nagoya-cbus',
        displayName: '名古屋市交通局 市バス',
        feedVersion: 'bus-v1',
        servicePeriod: { startDate: '20260701', endDate: '20260731' },
      },
      {
        agencyId: 'nagoya-subway',
        displayName: '名古屋市交通局 地下鉄',
        feedVersion: 'subway-v2',
        servicePeriod: { startDate: '20260715', endDate: '20260831' },
      },
    ]);
  });

  it('generates cross-agency walking transfers and shared coverage metadata', () => {
    const merged = mergeNormalizedGtfs('nagoya-transit', [busSource, subwaySource]);
    const files = buildBrowserDatasetFiles(merged.gtfs, {
      feedVersion: merged.feedVersion,
      sources: merged.sources,
    });

    expect(files.manifest.sources).toEqual(merged.sources);
    expect(files.manifest.servicePeriod).toEqual({ startDate: '20260715', endDate: '20260731' });
    expect(targetsFor(files.stops, 'nagoya-cbus:SAKAE')).toContain('nagoya-subway:SAKAE');
    expect(targetsFor(files.stops, 'nagoya-subway:SAKAE')).toContain('nagoya-cbus:SAKAE');
  });

  it('rejects duplicate prefixes before entities can collide', () => {
    const conflictingSource: NormalizedGtfsSource = {
      ...subwaySource,
      gtfs: { ...subwaySource.gtfs, idPrefix: busSource.gtfs.idPrefix },
    };

    expect(() => mergeNormalizedGtfs('nagoya-transit', [busSource, conflictingSource]))
      .toThrowError(new MultiAgencyMergeError('Duplicate source id prefix: nagoya-cbus'));
  });

  it('rejects entity ids outside the source prefix', () => {
    const conflictingSource: NormalizedGtfsSource = {
      ...subwaySource,
      gtfs: {
        ...subwaySource.gtfs,
        stops: subwaySource.gtfs.stops.map((stop) => ({
          ...stop,
          stopId: 'nagoya-cbus:SAKAE',
        })),
      },
    };

    expect(() => mergeNormalizedGtfs('nagoya-transit', [busSource, conflictingSource]))
      .toThrowError(
        'Source nagoya-subway contains id outside prefix nagoya-subway: nagoya-cbus:SAKAE',
      );
  });
});

const busSource = source({
  agencyId: 'nagoya-cbus',
  displayName: '名古屋市交通局 市バス',
  feedVersion: 'bus-v1',
  startDate: '20260701',
  endDate: '20260731',
  stopId: 'SAKAE',
  stopLat: 35.1709,
  routeType: 3,
});

const subwaySource = source({
  agencyId: 'nagoya-subway',
  displayName: '名古屋市交通局 地下鉄',
  feedVersion: 'subway-v2',
  startDate: '20260715',
  endDate: '20260831',
  stopId: 'SAKAE',
  stopLat: 35.171,
  routeType: 1,
});

interface SourceFixtureOptions {
  readonly agencyId: string;
  readonly displayName: string;
  readonly feedVersion: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly stopId: string;
  readonly stopLat: number;
  readonly routeType: number;
}

function source(options: SourceFixtureOptions): NormalizedGtfsSource {
  const prefix = options.agencyId;
  return {
    displayName: options.displayName,
    feedVersion: options.feedVersion,
    gtfs: {
      agencyId: options.agencyId,
      idPrefix: prefix,
      stops: [
        {
          stopId: `${prefix}:${options.stopId}`,
          stopName: '栄',
          stopLat: options.stopLat,
          stopLon: 136.908,
        },
      ],
      routes: [
        {
          routeId: `${prefix}:R1`,
          routeShortName: 'R1',
          routeLongName: 'Route 1',
          routeType: options.routeType,
        },
      ],
      trips: [
        {
          tripId: `${prefix}:T1`,
          routeId: `${prefix}:R1`,
          serviceId: `${prefix}:WKD`,
        },
      ],
      stopTimes: [
        {
          tripId: `${prefix}:T1`,
          stopId: `${prefix}:${options.stopId}`,
          stopSequence: 1,
          arrivalTime: 480,
          departureTime: 480,
        },
      ],
      calendar: [
        {
          serviceId: `${prefix}:WKD`,
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: false,
          sunday: false,
          startDate: options.startDate,
          endDate: options.endDate,
        },
      ],
      calendarDates: [],
    },
  };
}

function targetsFor(
  stops: ReturnType<typeof buildBrowserDatasetFiles>['stops'],
  stopId: PrefixedId,
): readonly PrefixedId[] {
  const index = stops.footpaths.stopIds.indexOf(stopId);
  const start = stops.footpaths.offsets[index] ?? 0;
  const end = stops.footpaths.offsets[index + 1] ?? start;
  return stops.footpaths.targetStopIds.slice(start, end);
}
