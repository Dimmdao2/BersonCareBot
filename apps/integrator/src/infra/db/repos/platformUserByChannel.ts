import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

/**
 * Канонический `platform_users.id` по привязке мессенджера (public.user_channel_bindings).
 */
export async function resolveCanonicalPlatformUserIdByChannel(
  db: DbPort,
  input: { channelCode: string; externalId: string },
): Promise<string | null> {
  const res = await runIntegratorSql<{ platform_user_id: string }>(db, sql`
    WITH RECURSIVE pu_chain AS (
      SELECT pu.id, pu.merged_into_id
      FROM public.user_channel_bindings ucb
      INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
      WHERE ucb.channel_code = ${input.channelCode}
        AND ucb.external_id = ${input.externalId}
      UNION ALL
      SELECT p.id, p.merged_into_id
      FROM public.platform_users p
      INNER JOIN pu_chain c ON p.id = c.merged_into_id
    )
    SELECT id::text AS platform_user_id
    FROM pu_chain
    WHERE merged_into_id IS NULL
    LIMIT 1
  `);
  const row = res.rows[0];
  return row?.platform_user_id?.trim() ? row.platform_user_id.trim() : null;
}
