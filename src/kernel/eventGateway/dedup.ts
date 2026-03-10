import type { IncomingEvent } from '../contracts/index.js';

function serializeFingerprintValue(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  return String(value);
}

function buildCanonicalFingerprint(event: IncomingEvent): string | null {
  const fingerprint = event.meta.dedupFingerprint;
  if (!fingerprint) return null;

  const entries = Object.entries(fingerprint)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return null;

  const serialized = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(serializeFingerprintValue(value))}`)
    .join(':');
  return `${event.meta.source}:${event.type}:${serialized}`;
}

/**
 * Строит dedup-key из канонического fingerprint нормализованного события.
 * При отсутствии fingerprint использует fallback `source:type:eventId`.
 */
export function buildDedupKey(event: IncomingEvent): string {
  return buildCanonicalFingerprint(event) ?? `${event.meta.source}:${event.type}:${event.meta.eventId}`;
}
