import { type EarliestArrivalQuery } from './core.js';
import { type LoadedTimetableStats } from './index.js';

export type RaptorWorkerRequest = LoadRequest | QueryRequest | CancelRequest;

export interface LoadRequest {
  readonly type: 'load';
  readonly requestId: number;
  readonly manifestUrl: string;
}

export interface QueryRequest {
  readonly type: 'query';
  readonly requestId: number;
  readonly query: EarliestArrivalQuery;
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

export interface RouteResultResponse {
  readonly type: 'result';
  readonly requestId: number;
  readonly arrival: ArrayBuffer;
  readonly rounds: number;
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
