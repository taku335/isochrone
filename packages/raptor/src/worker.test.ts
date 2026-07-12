import {
  type NormalizedGtfs,
  type NormalizedStopTime,
  type PrefixedId,
} from '@isochrone/gtfs-types';
import { buildBrowserDatasetFiles } from '@isochrone/pipeline';
import { describe, expect, it, vi } from 'vitest';

import {
  attachRaptorWorkerServer,
  type EarliestArrivalQuery,
  loadTimetable,
  type LoadedTimetable,
  RaptorWorkerClient,
  route,
  SupersededQueryError,
  type RaptorWorkerClientPort,
  type RaptorWorkerRequest,
  type RaptorWorkerResponse,
  type RaptorWorkerServerPort,
} from './index.js';

const data = loadTimetable(buildBrowserDatasetFiles(createMiniGtfs(), { feedVersion: 'worker' }));
const query = {
  kind: 'earliestArrival' as const,
  origins: [{ stopIndex: 0, departure: 479 }],
  serviceDate: '20260707',
  maxRounds: 2,
};

describe('RAPTOR worker protocol', () => {
  it('loads once and returns the same transferable result as synchronous routing', async () => {
    const ports = linkedPorts();
    const progress: string[] = [];
    attachRaptorWorkerServer(ports.server, {
      load: () => Promise.resolve(data),
      schedule: (task) => {
        queueMicrotask(task);
      },
    });
    const client = new RaptorWorkerClient(ports.client, {
      onProgress: (message) => progress.push(message.stage),
    });

    await expect(client.load('/data/manifest.json')).resolves.toEqual(data.loadStats);
    const asyncResult = await client.route(query);
    const syncResult = route(data, query);

    expect([...asyncResult.arrival]).toEqual([...syncResult.arrival]);
    expect(asyncResult.rounds).toBe(syncResult.rounds);
    expect(asyncResult.serviceLayers).toMatchObject([
      { date: '20260707', minuteOffset: 0, dayType: 'custom' },
      { date: '20260706', minuteOffset: 1440, dayType: 'custom' },
    ]);
    expect(asyncResult.polygons.layers).toHaveLength(2);
    expect(asyncResult.polygons.generationMs).toBeGreaterThanOrEqual(0);
    expect(progress).toEqual(['loading', 'routing']);
    const transferred = ports.transfers.filter((transfer) => transfer.length > 0);
    expect(transferred).toHaveLength(1);
    expect(transferred[0]).toHaveLength(1);
    client.dispose();
  });

  it('rejects an older query and only runs the latest queued query', async () => {
    const ports = linkedPorts();
    const scheduled: (() => void)[] = [];
    const runRoute = vi.fn((loaded: LoadedTimetable, nextQuery: EarliestArrivalQuery) =>
      route(loaded, nextQuery));
    attachRaptorWorkerServer(ports.server, {
      load: () => Promise.resolve(data),
      runRoute,
      schedule: (task) => {
        scheduled.push(task);
      },
    });
    const client = new RaptorWorkerClient(ports.client);
    await client.load('/data/manifest.json');

    const first = client.route(query);
    const secondQuery = { ...query, origins: [{ stopIndex: 0, departure: 499 }] };
    const second = client.route(secondQuery);
    await expect(first).rejects.toBeInstanceOf(SupersededQueryError);
    await flushMessages();
    scheduled.forEach((task) => {
      task();
    });
    await flushMessages();

    await expect(second).resolves.toMatchObject({ rounds: 1 });
    expect(runRoute).toHaveBeenCalledTimes(1);
    expect(runRoute.mock.calls[0]?.[1]).toEqual(secondQuery);
    client.dispose();
  });
});

interface LinkedPorts {
  readonly client: RaptorWorkerClientPort;
  readonly server: RaptorWorkerServerPort;
  readonly transfers: (readonly ArrayBuffer[])[];
}

function linkedPorts(): LinkedPorts {
  const clientListeners = new Set<(event: { readonly data: RaptorWorkerResponse }) => void>();
  const serverListeners = new Set<(event: { readonly data: RaptorWorkerRequest }) => void>();
  const transfers: (readonly ArrayBuffer[])[] = [];

  return {
    client: {
      postMessage(message) {
        queueMicrotask(() => {
          serverListeners.forEach((listener) => {
            listener({ data: message });
          });
        });
      },
      addEventListener(_type, listener) {
        clientListeners.add(listener);
      },
      removeEventListener(_type, listener) {
        clientListeners.delete(listener);
      },
    },
    server: {
      postMessage(message, transfer = []) {
        transfers.push(transfer);
        queueMicrotask(() => {
          clientListeners.forEach((listener) => {
            listener({ data: message });
          });
        });
      },
      addEventListener(_type, listener) {
        serverListeners.add(listener);
      },
    },
    transfers,
  };
}

async function flushMessages(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createMiniGtfs(): NormalizedGtfs {
  return {
    agencyId: 'mini',
    idPrefix: 'mini',
    stops: [
      { stopId: id('A'), stopName: 'A', stopLat: 35, stopLon: 136 },
      { stopId: id('B'), stopName: 'B', stopLat: 35.01, stopLon: 136.01 },
    ],
    routes: [{ routeId: id('R'), routeShortName: 'R', routeLongName: 'R', routeType: 3 }],
    trips: [{ tripId: id('T1'), routeId: id('R'), serviceId: id('WKD') }],
    stopTimes: [stopTime('A', 1, 480), stopTime('B', 2, 490)],
    calendar: [{
      serviceId: id('WKD'),
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
      startDate: '20260701',
      endDate: '20260731',
    }],
    calendarDates: [],
  };
}

function stopTime(stopId: string, stopSequence: number, minute: number): NormalizedStopTime {
  return {
    tripId: id('T1'),
    stopId: id(stopId),
    stopSequence,
    arrivalTime: minute,
    departureTime: minute,
  };
}

function id(value: string): PrefixedId {
  return `mini:${value}` as PrefixedId;
}
