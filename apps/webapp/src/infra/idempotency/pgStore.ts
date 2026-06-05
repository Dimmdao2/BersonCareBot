/**
 * PostgreSQL-backed idempotency store for integrator webhooks.
 * Atomic get/set; safe for multiple instances and restarts.
 */
import { z } from "zod";
import { runWebappPgText } from "@/infra/db/runWebappSql";

const TTL_SEC = 24 * 60 * 60; // 24 hours
const MAX_KEY_LENGTH = 256;

const idempotencyResponseBodySchema = z.record(z.string(), z.unknown());

function parseIdempotencyResponseBody(raw: unknown): Record<string, unknown> {
  const parsed = idempotencyResponseBodySchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export function isKeyValid(key: string): boolean {
  return typeof key === "string" && key.length > 0 && key.length <= MAX_KEY_LENGTH;
}

export type CachedResponseHit =
  | { hit: true; status: number; body: Record<string, unknown> }
  | { hit: false }
  | { hit: true; mismatch: true; storedRequestHash: string };

export async function getCachedResponse(
  key: string,
  requestHash: string,
): Promise<CachedResponseHit> {
  const res = await runWebappPgText<{
    request_hash: string;
    status: number;
    response_body: unknown;
  }>(
    `SELECT request_hash, status, response_body
     FROM idempotency_keys
     WHERE key = $1 AND expires_at > now()`,
    [key],
  );
  const row = res.rows[0];
  if (!row) return { hit: false };
  if (row.request_hash !== requestHash) {
    return { hit: true, mismatch: true, storedRequestHash: row.request_hash };
  }
  return {
    hit: true,
    status: row.status,
    body: parseIdempotencyResponseBody(row.response_body),
  };
}

/**
 * Stores the response for the idempotency key.
 * Only writes if key is absent or expired or same request_hash (replay).
 * @returns true if we wrote; false if key already stored with different hash (caller should re-get and return 409 or cached)
 */
export async function setCachedResponse(
  key: string,
  requestHash: string,
  status: number,
  responseBody: Record<string, unknown>,
): Promise<boolean> {
  const res = await runWebappPgText<{ key: string }>(
    `INSERT INTO idempotency_keys (key, request_hash, status, response_body, expires_at)
     VALUES ($1, $2, $3, $4, now() + $5 * interval '1 second')
     ON CONFLICT (key) DO UPDATE SET
       request_hash = EXCLUDED.request_hash,
       status = EXCLUDED.status,
       response_body = EXCLUDED.response_body,
       expires_at = EXCLUDED.expires_at
     WHERE idempotency_keys.expires_at < now() OR idempotency_keys.request_hash = EXCLUDED.request_hash
     RETURNING key`,
    [key, requestHash, status, JSON.stringify(responseBody), TTL_SEC],
  );
  return (res.rowCount ?? 0) > 0;
}
