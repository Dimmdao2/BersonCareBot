/**
 * PostgreSQL-backed idempotency store for integrator webhooks.
 * Atomic get/set; safe for multiple instances and restarts.
 */
import { z } from 'zod';
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  webappSqlFromPgText,
} from '@/infra/db/runWebappSql';

const TTL_SEC = 24 * 60 * 60; // 24 hours
const MAX_KEY_LENGTH = 256;

const idempotencyResponseBodySchema = z.record(z.string(), z.unknown());

function parseIdempotencyResponseBody(raw: unknown): Record<string, unknown> {
  const parsed = idempotencyResponseBodySchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export function isKeyValid(key: string): boolean {
  return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LENGTH;
}

export type CachedResponseHit =
  | { hit: true; status: number; body: Record<string, unknown> }
  | { hit: false }
  | { hit: true; mismatch: true; storedRequestHash: string };

export async function getCachedResponse(
  key: string,
  requestHash: string,
): Promise<CachedResponseHit> {
  const res = await runWithDbBootstrapPrincipal(
    { source: 'integrator-event-idempotency-read' },
    () => runWebappNamedRoot<{
    request_hash: string;
    status: number;
    response_body: unknown;
    }>(
      getWebappSqlDb(),
      'app.integrator_event_idempotency_read(text)',
      [key],
      webappSqlFromPgText(
        'SELECT * FROM app.integrator_event_idempotency_read($1::text)',
        [key],
      ),
    ),
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
  const bodyJson = JSON.stringify(responseBody);
  const res = await runWithDbBootstrapPrincipal(
    { source: 'integrator-event-idempotency-store' },
    () => runWebappNamedRoot<{ stored: boolean }>(
      getWebappSqlDb(),
      'app.integrator_event_idempotency_store(text,text,integer,text,integer)',
      [key, requestHash, status, bodyJson, TTL_SEC],
      webappSqlFromPgText(
        'SELECT app.integrator_event_idempotency_store($1::text,$2::text,$3::integer,$4::text,$5::integer) AS stored',
        [key, requestHash, status, bodyJson, TTL_SEC],
      ),
    ),
  );
  return res.rows[0]?.stored === true;
}
