import { route, type Query, type RouteResult } from './core.js';
import { loadTimetableFromManifestUrl, type LoadedTimetable } from './index.js';
import { generateReachabilityPolygons } from './reachability.js';
import { resolveReverseServiceLayers, resolveServiceLayers } from './service-days.js';
import {
  type RaptorWorkerRequest,
  type RaptorWorkerServerPort,
  type WorkerErrorResponse,
} from './worker-protocol.js';

export interface RaptorWorkerServerDependencies {
  readonly load?: (manifestUrl: string) => Promise<LoadedTimetable>;
  readonly runRoute?: (data: LoadedTimetable, query: Query) => RouteResult;
  readonly schedule?: (task: () => void) => void;
  readonly generatePolygons?: typeof generateReachabilityPolygons;
}

export function attachRaptorWorkerServer(
  port: RaptorWorkerServerPort,
  dependencies: RaptorWorkerServerDependencies = {},
): void {
  const load = dependencies.load ?? loadTimetableFromManifestUrl;
  const runRoute = dependencies.runRoute ?? route;
  const schedule = dependencies.schedule ?? ((task: () => void) => setTimeout(task, 0));
  const generatePolygons = dependencies.generatePolygons ?? generateReachabilityPolygons;
  let data: LoadedTimetable | null = null;
  let loading = false;
  let latestQueryId: number | null = null;

  port.addEventListener('message', (event) => {
    const request = event.data;
    if (request.type === 'load') {
      if (loading || data !== null) {
        postError(port, request, 'Timetable data has already been loaded or is loading.');
        return;
      }
      loading = true;
      port.postMessage({ type: 'progress', requestId: request.requestId, stage: 'loading' });
      void load(request.manifestUrl).then(
        (loaded) => {
          data = loaded;
          loading = false;
          port.postMessage({
            type: 'loaded',
            requestId: request.requestId,
            stats: loaded.loadStats,
          });
        },
        (error: unknown) => {
          loading = false;
          postError(port, request, toErrorMessage(error));
        },
      );
      return;
    }

    if (request.type === 'cancel') {
      if (latestQueryId === request.requestId) {
        latestQueryId = null;
      }
      return;
    }

    if (data === null) {
      postError(port, request, 'Timetable data is not loaded.');
      return;
    }

    latestQueryId = request.requestId;
    port.postMessage({ type: 'progress', requestId: request.requestId, stage: 'routing' });
    schedule(() => {
      if (latestQueryId !== request.requestId || data === null) {
        return;
      }
      try {
        const result = runRoute(data, request.query);
        if (latestQueryId !== request.requestId) {
          return;
        }
        const serviceDate = request.query.serviceDate.replaceAll('-', '');
        const layers = request.query.kind === 'earliestArrival'
          ? resolveServiceLayers(data.calendar, serviceDate)
          : resolveReverseServiceLayers(data.calendar, serviceDate);
        const serviceLayers = layers.map(
          ({ date, minuteOffset, dayType, displayName }) => ({
            date,
            minuteOffset,
            dayType,
            displayName,
          }),
        );
        if (result.kind === 'earliestArrival' && request.query.kind === 'earliestArrival') {
          const arrival = result.arrival.buffer as ArrayBuffer;
          const departure = request.query.originPoint?.departure ?? request.query.origins.reduce(
            (earliest, origin) => Math.min(earliest, origin.departure),
            Number.POSITIVE_INFINITY,
          );
          const polygons = generatePolygons(
            data.stopLats,
            data.stopLons,
            result.arrival,
            departure,
            request.query.originPoint === undefined
              ? {}
              : {
                  originPoint: {
                    lon: request.query.originPoint.lon,
                    lat: request.query.originPoint.lat,
                  },
                },
          );
          port.postMessage(
            {
              type: 'result',
              requestId: request.requestId,
              kind: result.kind,
              arrival,
              rounds: result.rounds,
              serviceLayers,
              polygons,
            },
            [arrival],
          );
          return;
        }
        if (result.kind === 'latestDeparture' && request.query.kind === 'latestDeparture') {
          const departure = result.departure.buffer as ArrayBuffer;
          port.postMessage(
            {
              type: 'result',
              requestId: request.requestId,
              kind: result.kind,
              departure,
              rounds: result.rounds,
              serviceLayers,
            },
            [departure],
          );
          return;
        }
        throw new Error('RAPTOR result kind did not match the query kind.');
      } catch (error) {
        postError(port, request, toErrorMessage(error));
      }
    });
  });
}

function postError(
  port: RaptorWorkerServerPort,
  request: RaptorWorkerRequest,
  message: string,
): void {
  const response: WorkerErrorResponse = {
    type: 'error',
    requestId: request.requestId,
    message,
  };
  port.postMessage(response);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
