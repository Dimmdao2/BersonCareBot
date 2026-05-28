import { createHash } from 'node:crypto';
import { jsonStableStringify } from '../../adapters/jsonStableStringify.js';

/**
 * HTTP `X-Bersoncare-Idempotency-Key` must be a ByteString (Latin-1 only).
 * `correlationId` and other stable ids may contain Cyrillic — hash them deterministically.
 */
export function asciiSafeProjectionStableIdentifier(stableIdentifier: string): string {
  for (let i = 0; i < stableIdentifier.length; i++) {
    if (stableIdentifier.charCodeAt(i) > 0xff) {
      return `u-${createHash('sha256').update(stableIdentifier, 'utf8').digest('hex').slice(0, 32)}`;
    }
  }
  return stableIdentifier;
}

/**
 * Builds a deterministic idempotency key for projection events.
 * Same business event always produces the same key; different data produces a different key.
 */
export function projectionIdempotencyKey(
  eventType: string,
  stableIdentifier: string,
  payloadFingerprint?: string,
): string {
  const safeId = asciiSafeProjectionStableIdentifier(stableIdentifier);
  const base = payloadFingerprint
    ? `${eventType}:${safeId}:${payloadFingerprint}`
    : `${eventType}:${safeId}`;
  if (base.length <= 200) return base;
  return `${eventType}:${createHash('sha256').update(base).digest('hex').slice(0, 32)}`;
}

export function hashPayload(payload: Record<string, unknown>): string {
  return createHash('sha256').update(jsonStableStringify(payload)).digest('hex').slice(0, 16);
}

/**
 * Fingerprint for projection idempotency when `integratorUserId` is derived (identity→user→canonical)
 * and must not affect the key — same business event keeps one outbox row even if representation changes.
 */
export function hashPayloadExcludingKeys(
  payload: Record<string, unknown>,
  exclude: readonly string[],
): string {
  const copy: Record<string, unknown> = { ...payload };
  for (const key of exclude) {
    delete copy[key];
  }
  return hashPayload(copy);
}
