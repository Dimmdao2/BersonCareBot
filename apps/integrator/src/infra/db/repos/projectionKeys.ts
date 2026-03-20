import { createHash } from 'node:crypto';

/**
 * Builds a deterministic idempotency key for projection events.
 * Same business event always produces the same key; different data produces a different key.
 */
export function projectionIdempotencyKey(
  eventType: string,
  stableIdentifier: string,
  payloadFingerprint?: string,
): string {
  const base = payloadFingerprint
    ? `${eventType}:${stableIdentifier}:${payloadFingerprint}`
    : `${eventType}:${stableIdentifier}`;
  if (base.length <= 200) return base;
  return `${eventType}:${createHash('sha256').update(base).digest('hex').slice(0, 32)}`;
}

export function hashPayload(payload: Record<string, unknown>): string {
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(sorted).digest('hex').slice(0, 16);
}
