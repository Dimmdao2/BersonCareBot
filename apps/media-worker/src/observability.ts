import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage<Record<string, string>>();
export function runWithObservabilityContext<T>(values: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  return context.run(values, fn);
}
export function getCurrentObservabilityContext(): Record<string, string> {
  return context.getStore() ?? {};
}
