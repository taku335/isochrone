import {
  RaptorWorkerClient,
  type RaptorWorkerClientOptions,
} from '@isochrone/raptor';

export function createRaptorWorkerClient(
  options: RaptorWorkerClientOptions = {},
): RaptorWorkerClient {
  const worker = new Worker(new URL('./raptor-worker.ts', import.meta.url), { type: 'module' });
  return new RaptorWorkerClient(worker, options);
}
