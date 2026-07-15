import { type Query } from './core.js';
import { type LoadedTimetableStats } from './index.js';
import { type ReachabilityPolygonsResult } from './reachability.js';
import { type ServiceDayType } from './service-days.js';

export type RaptorWorkerRequest = LoadRequest | QueryRequest | CancelRequest;

export interface LoadRequest {
  readonly type: 'load';
  readonly requestId: number;
  readonly manifestUrl: string;
}

export interface QueryRequest {
  readonly type: 'query';
  readonly requestId: number;
  readonly query: Query;
}

export interface CancelRequest {
  readonly type: 'cancel';
  readonly requestId: number;
}

export type RaptorWorkerResponse =
  | ProgressResponse
  | LoadedResponse
  | RouteResultResponse
  | WorkerErrorResponse;

export interface ProgressResponse {
  readonly type: 'progress';
  readonly requestId: number;
  readonly stage: 'loading' | 'routing';
}

export interface LoadedResponse {
  readonly type: 'loaded';
  readonly requestId: number;
  readonly stats: LoadedTimetableStats;
}

export type RouteResultResponse = EarliestArrivalResultResponse | LatestDepartureResultResponse;

interface RouteResultResponseBase {
  readonly type: 'result';
  readonly requestId: number;
  readonly rounds: number;
  readonly serviceLayers: readonly WorkerServiceLayer[];
}

export interface EarliestArrivalResultResponse extends RouteResultResponseBase {
  readonly kind: 'earliestArrival';
  readonly arrival: ArrayBuffer;
  readonly polygons: ReachabilityPolygonsResult;
}

export interface LatestDepartureResultResponse extends RouteResultResponseBase {
  readonly kind: 'latestDeparture';
  readonly departure: ArrayBuffer;
}

export interface WorkerServiceLayer {
  readonly date: string;
  readonly minuteOffset: -1440 | 0 | 1440;
  readonly dayType: ServiceDayType;
  readonly displayName: string;
}

export interface WorkerErrorResponse {
  readonly type: 'error';
  readonly requestId: number;
  readonly message: string;
}

export interface RaptorWorkerClientPort {
  postMessage(message: RaptorWorkerRequest): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEventLike<RaptorWorkerResponse>) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEventLike<RaptorWorkerResponse>) => void,
  ): void;
  terminate?(): void;
}

export interface RaptorWorkerServerPort {
  postMessage(message: RaptorWorkerResponse, transfer?: readonly ArrayBuffer[]): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEventLike<RaptorWorkerRequest>) => void,
  ): void;
}

export interface MessageEventLike<T> {
  readonly data: T;
}
