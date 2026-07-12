import {
  attachRaptorWorkerServer,
  type RaptorWorkerServerPort,
} from '@isochrone/raptor';

attachRaptorWorkerServer(globalThis as unknown as RaptorWorkerServerPort);
