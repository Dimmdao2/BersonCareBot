import type { DbPort } from '../../../kernel/contracts/index.js';

/** One identity row per user (preferred telegram over max). */
export async function listMorningPingRecipients(
  db: DbPort,
  limit: number,
): Promise<Array<{ userId: string; resource: string; externalId: string }>> {
  const res = await db.query<{ user_id: string; resource: string; external_id: string }>(
    `SELECT DISTINCT ON (i.user_id)
       i.user_id::text AS user_id,
       i.resource,
       i.external_id::text AS external_id
     FROM identities i
     INNER JOIN users u ON u.id = i.user_id
     WHERE i.resource IN ('telegram', 'max')
     ORDER BY i.user_id, CASE WHEN i.resource = 'telegram' THEN 0 ELSE 1 END, i.external_id
     LIMIT $1`,
    [Math.max(1, Math.min(limit, 200))],
  );
  return res.rows.map((r) => ({
    userId: r.user_id,
    resource: r.resource,
    externalId: r.external_id,
  }));
}

export async function hasPublishedDailyWarmupContentPage(db: DbPort): Promise<boolean> {
  const res = await db.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM public.patient_home_block_items phi
     INNER JOIN public.patient_home_blocks phb ON phb.code = phi.block_code
     INNER JOIN public.content_pages cp ON cp.slug = phi.target_ref
     WHERE phi.block_code = 'daily_warmup'
       AND phi.target_type = 'content_page'
       AND phi.is_visible = true
       AND phb.is_visible = true
       AND cp.is_published = true
       AND cp.deleted_at IS NULL
     ORDER BY phi.sort_order ASC
     LIMIT 1`,
  );
  return res.rows.length > 0;
}

export async function tryAcquireMorningPingKey(db: DbPort, key: string): Promise<boolean> {
  const res = await db.query<{ key: string }>(
    `INSERT INTO idempotency_keys (key, request_hash, status, response_body, expires_at)
     VALUES ($1, '__morning_warmup_ping__', 200, '{}'::jsonb, now() + interval '48 hours')
     ON CONFLICT (key) DO NOTHING
     RETURNING key`,
    [key],
  );
  return (res.rowCount ?? 0) > 0;
}
