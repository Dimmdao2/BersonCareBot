import type { IncomingEvent } from '../contracts/index.js';

/**
 * Строит dedup-key на основе source/type/payload.
 * При отсутствии специфичных ключей использует `meta.eventId`.
 */
export function buildDedupKey(event: IncomingEvent): string {
  const source = event.meta.source;
  if (event.meta.dedupKey) return event.meta.dedupKey;
  return `${source}:${event.type}:${event.meta.eventId}`;
}
