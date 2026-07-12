import { type EarliestArrivalQuery, type OneToAllResult } from './core.js';
import { type LoadedTimetableStats } from './index.js';
import {
  type ProgressResponse,
  type RaptorWorkerClientPort,
  type RaptorWorkerResponse,
  type WorkerServiceLayer,
} from './worker-protocol.js';

export interface RaptorWorkerClientOptions {
  readonly onProgress?: (progress: ProgressResponse) => void;
}

interface PendingRequest {
  readonly kind: 'load' | 'query';
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
}

export interface RaptorWorkerRouteResult extends OneToAllResult {
  readonly serviceLayers: readonly WorkerServiceLayer[];
}

export class SupersededQueryError extends Error {
  public constructor() {
    super('RAPTOR query was superseded by a newer query.');
    this.name = 'SupersededQueryError';
  }
}

export class RaptorWorkerClient {
  readonly #port: RaptorWorkerClientPort;
  readonly #onProgress: ((progress: ProgressResponse) => void) | undefined;
  readonly #pending = new Map<number, PendingRequest>();
  readonly #handleMessage = (event: { readonly data: RaptorWorkerResponse }): void => {
    this.handleResponse(event.data);
  };
  #nextRequestId = 1;
  #activeQueryId: number | null = null;
  #loadPromise: Promise<LoadedTimetableStats> | null = null;
  #loadedStats: LoadedTimetableStats | null = null;

  public constructor(port: RaptorWorkerClientPort, options: RaptorWorkerClientOptions = {}) {
    this.#port = port;
    this.#onProgress = options.onProgress;
    port.addEventListener('message', this.#handleMessage);
  }

  public load(manifestUrl: string): Promise<LoadedTimetableStats> {
    if (this.#loadedStats !== null) {
      return Promise.resolve(this.#loadedStats);
    }
    if (this.#loadPromise !== null) {
      return this.#loadPromise;
    }

    const requestId = this.nextRequestId();
    this.#loadPromise = new Promise<LoadedTimetableStats>((resolve, reject) => {
      this.#pending.set(requestId, {
        kind: 'load',
        resolve: (value) => {
          resolve(value as LoadedTimetableStats);
        },
        reject,
      });
      this.#port.postMessage({ type: 'load', requestId, manifestUrl });
    }).catch((error: unknown) => {
      this.#loadPromise = null;
      throw error;
    });
    return this.#loadPromise;
  }

  public route(query: EarliestArrivalQuery): Promise<RaptorWorkerRouteResult> {
    if (this.#activeQueryId !== null) {
      const previousId = this.#activeQueryId;
      this.#pending.get(previousId)?.reject(new SupersededQueryError());
      this.#pending.delete(previousId);
      this.#port.postMessage({ type: 'cancel', requestId: previousId });
    }

    const requestId = this.nextRequestId();
    this.#activeQueryId = requestId;
    return new Promise<RaptorWorkerRouteResult>((resolve, reject) => {
      this.#pending.set(requestId, {
        kind: 'query',
        resolve: (value) => {
          resolve(value as RaptorWorkerRouteResult);
        },
        reject,
      });
      this.#port.postMessage({ type: 'query', requestId, query });
    });
  }

  public dispose(): void {
    for (const pending of this.#pending.values()) {
      pending.reject(new Error('RAPTOR worker client was disposed.'));
    }
    this.#pending.clear();
    this.#activeQueryId = null;
    this.#port.removeEventListener('message', this.#handleMessage);
    this.#port.terminate?.();
  }

  private handleResponse(response: RaptorWorkerResponse): void {
    if (response.type === 'progress') {
      this.#onProgress?.(response);
      return;
    }

    const pending = this.#pending.get(response.requestId);
    if (pending === undefined) {
      return;
    }
    this.#pending.delete(response.requestId);

    if (response.type === 'error') {
      if (this.#activeQueryId === response.requestId) {
        this.#activeQueryId = null;
      }
      pending.reject(new Error(response.message));
      return;
    }

    if (response.type === 'loaded' && pending.kind === 'load') {
      this.#loadedStats = response.stats;
      pending.resolve(response.stats);
      return;
    }

    if (response.type === 'result' && pending.kind === 'query') {
      if (this.#activeQueryId === response.requestId) {
        this.#activeQueryId = null;
      }
      pending.resolve({
        arrival: new Uint16Array(response.arrival),
        rounds: response.rounds,
        serviceLayers: response.serviceLayers,
      });
      return;
    }

    pending.reject(new Error(`Unexpected worker response: ${response.type}`));
  }

  private nextRequestId(): number {
    const requestId = this.#nextRequestId;
    this.#nextRequestId += 1;
    return requestId;
  }
}
