import type { IncomingEvent } from '../contracts/index.js';

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readIdentity(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Строит dedup-key на основе source/type/payload.
 * При отсутствии специфичных ключей использует `meta.eventId`.
 */
export function buildDedupKey(event: IncomingEvent): string {
  const source = event.meta.source;

  if (source === 'telegram') {
    const payload = event.payload as { updateId?: unknown; incoming?: { telegramId?: unknown } } | undefined;
    const updateId = readNumber(payload?.updateId);
    const telegramId = readIdentity(payload?.incoming?.telegramId);
    if (telegramId && updateId !== null) return `telegram:${telegramId}:${updateId}`;
  }

  if (source === 'rubitime') {
    const payload = event.payload as { body?: { event?: unknown; data?: { id?: unknown } } } | undefined;
    const eventName = readString(payload?.body?.event);
    const recordId = readString(payload?.body?.data?.id);
    if (eventName && recordId) return `rubitime:${eventName}:${recordId}`;
  }

  return `${source}:${event.type}:${event.meta.eventId}`;
}
