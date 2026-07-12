import { route, type EarliestArrivalQuery } from './core.js';
import { loadTimetableFromManifestUrl, type LoadedTimetable } from './index.js';
import { resolveServiceLayers } from './service-days.js';
import {
  type RaptorWorkerRequest,
  type RaptorWorkerServerPort,
  type WorkerErrorResponse,
} from './worker-protocol.js';

export interface RaptorWorkerServerDependencies {
  readonly load?: (manifestUrl: string) => Promise<LoadedTimetable>;
  readonly runRoute?: (data: LoadedTimetable, query: EarliestArrivalQuery) => ReturnType<typeof route>;
  readonly schedule?: (task: () => void) => void;
}

export function attachRaptorWorkerServer(
  port: RaptorWorkerServerPort,
  dependencies: RaptorWorkerServerDependencies = {},
): void {
  const load = dependencies.load ?? loadTimetableFromManifestUrl;
  const runRoute = dependencies.runRoute ?? route;
  const schedule = dependencies.schedule ?? ((task: () => void) => setTimeout(task, 0));
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
        const arrival = result.arrival.buffer as ArrayBuffer;
        const serviceLayers = resolveServiceLayers(data.calendar, request.query.serviceDate).map(
          ({ date, minuteOffset, dayType, displayName }) => ({
            date,
            minuteOffset,
            dayType,
            displayName,
          }),
        );
        port.postMessage(
          {
            type: 'result',
            requestId: request.requestId,
            arrival,
            rounds: result.rounds,
            serviceLayers,
          },
          [arrival],
        );
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
