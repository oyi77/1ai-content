/**
 * Correlation ID Utility
 *
 * Provides async-context-local correlation IDs for request tracing
 * across bot commands → services → queue jobs → workers.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { v4 as uuid } from "uuid";

const storage = new AsyncLocalStorage<{ correlationId: string }>();

export function getCorrelationId(): string {
  return storage.getStore()?.correlationId || "no-correlation";
}

export function runWithCorrelation<T>(fn: () => T, id?: string): T {
  return storage.run({ correlationId: id || uuid() }, fn);
}

export function setCorrelationId(id: string): void {
  const store = storage.getStore();
  if (store) store.correlationId = id;
}
