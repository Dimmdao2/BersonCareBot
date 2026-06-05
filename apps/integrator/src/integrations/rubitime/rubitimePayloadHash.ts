import { createHash } from 'node:crypto';
import type { RubitimeIncomingPayload } from './connector.js';

/** Stable hash of inbound record payload for dedup fingerprint (payload-only changes must not drop). */
export function hashRubitimeRecordPayload(record: Record<string, unknown>): string {
  const keys = Object.keys(record).sort();
  const normalized: Record<string, unknown> = {};
  for (const k of keys) {
    normalized[k] = record[k];
  }
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 32);
}

export function buildRubitimeDedupFingerprint(
  incoming: RubitimeIncomingPayload,
): Record<string, string | number | boolean | null> {
  const record =
    typeof incoming.record === 'object' && incoming.record !== null
      ? (incoming.record as Record<string, unknown>)
      : {};
  return {
    entity: incoming.entity,
    action: incoming.action,
    recordId: incoming.recordId ?? null,
    status: incoming.status ?? null,
    recordAt: incoming.recordAt ?? null,
    updatedAt: incoming.updatedAt ?? null,
    payloadHash: hashRubitimeRecordPayload(record),
  };
}
