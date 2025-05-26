/**
 * BaseEvent interface for all event classes.
 * T is the payload type.
 */
export interface BaseEvent<T> {
  readonly initiatorService: string;
  readonly type: string;
  readonly payload: T;
  readonly key: string;
}