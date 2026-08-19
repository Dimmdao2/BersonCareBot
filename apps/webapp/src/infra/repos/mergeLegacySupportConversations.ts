import type { Pool, PoolClient } from 'pg';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';
import { webappPlatformConversationId } from '@/modules/messaging/supportConversationIds';

export type MergeLegacySupportResult = {
  mergedConversationCount: number;
  movedMessageCount: number;
};

function mergeSqlOnClient<T>(
  client: Pool | PoolClient,
  queryText: string,
  values: readonly unknown[] = [],
) {
  return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client as PoolClient));
}

/**
 * Finds the canonical conversation row, creating it only the first time.
 *
 * This used to be an `INSERT … ON CONFLICT DO UPDATE SET platform_user_id = COALESCE(EXCLUDED…, …),
 * updated_at = now() RETURNING id`, written that way purely so `RETURNING` produced a row on the
 * conflict branch. But `platform_user_id` is where the conversation key itself comes from, so on an
 * existing row the SET assigned the value already stored and only `updated_at` moved — and there are
 * no idle UPDATEs in PostgreSQL: each one writes a new tuple plus its WAL and leaves the old one for
 * autovacuum. The caller is the patient unread-message badge, which polls every 20 seconds per open
 * tab, so a table of one row per patient was being rewritten continuously for no change at all.
 *
 * The ordinary path is now a single primary-key read and no write whatsoever. The insert keeps
 * `ON CONFLICT DO NOTHING` for the race between two first-time callers; DO NOTHING returns no row, so
 * the loser simply reads again and sees the winner's row. The one case the old COALESCE genuinely
 * repaired — an existing row whose `platform_user_id` is NULL — is still repaired, but by a statement
 * that only runs when the column is actually NULL instead of on every poll.
 */
async function resolveCanonicalConversationId(
  client: Pool | PoolClient,
  canonicalKey: string,
  platformUserId: string,
): Promise<string | undefined> {
  const read = async () =>
    (
      await mergeSqlOnClient<{ id: string }>(
        client,
        `SELECT id FROM support_conversations WHERE integrator_conversation_id = $1`,
        [canonicalKey],
      )
    ).rows[0]?.id;

  const existing = await read();
  if (existing) {
    await mergeSqlOnClient(
      client,
      `UPDATE support_conversations SET platform_user_id = $2::uuid, updated_at = now()
       WHERE integrator_conversation_id = $1 AND platform_user_id IS NULL`,
      [canonicalKey, platformUserId],
    );
    return existing;
  }

  const inserted = await mergeSqlOnClient<{ id: string }>(
    client,
    `INSERT INTO support_conversations (
      integrator_conversation_id, platform_user_id, integrator_user_id, source, admin_scope, status,
      opened_at, last_message_at
    ) VALUES ($1, $2::uuid, NULL, 'webapp', 'support', 'open', now(), now())
    ON CONFLICT (integrator_conversation_id) DO NOTHING
    RETURNING id`,
    [canonicalKey, platformUserId],
  );
  return inserted.rows[0]?.id ?? (await read());
}

/**
 * Переносит историю из legacy projection-диалогов (UUID integrator) в канон `webapp:platform:{platformUserId}`.
 * Legacy-строки закрываются с `close_reason = merged_into_platform_thread`.
 */
export async function mergeLegacySupportConversationsForPlatformUser(
  client: Pool | PoolClient,
  platformUserId: string,
): Promise<MergeLegacySupportResult> {
  const canonicalKey = webappPlatformConversationId(platformUserId);

  const canonicalId = await resolveCanonicalConversationId(client, canonicalKey, platformUserId);
  if (!canonicalId) {
    return { mergedConversationCount: 0, movedMessageCount: 0 };
  }

  const legacyRows = await mergeSqlOnClient<{ id: string }>(
    client,
    `SELECT sc.id FROM support_conversations sc
     WHERE sc.integrator_conversation_id <> $2
       AND (
         sc.platform_user_id = $1::uuid
         OR sc.integrator_user_id = (
           SELECT pu.integrator_user_id FROM platform_users pu
           WHERE pu.id = $1::uuid AND pu.integrator_user_id IS NOT NULL
         )
         OR EXISTS (
           SELECT 1 FROM user_channel_bindings ucb
           WHERE ucb.user_id = $1::uuid
             AND sc.channel_code IS NOT NULL
             AND sc.channel_external_id IS NOT NULL
             AND ucb.channel_code = sc.channel_code
             AND ucb.external_id = sc.channel_external_id
         )
       )`,
    [platformUserId, canonicalKey],
  );

  if (legacyRows.rows.length === 0) {
    return { mergedConversationCount: 0, movedMessageCount: 0 };
  }

  let movedMessageCount = 0;
  for (const legacy of legacyRows.rows) {
    const move = await mergeSqlOnClient<{ id: string }>(
      client,
      `UPDATE support_conversation_messages
       SET conversation_id = $1::uuid
       WHERE conversation_id = $2::uuid
       RETURNING id`,
      [canonicalId, legacy.id],
    );
    movedMessageCount += move.rowCount ?? move.rows.length;

    await mergeSqlOnClient(
      client,
      `UPDATE support_questions
       SET conversation_id = $1::uuid, updated_at = now()
       WHERE conversation_id = $2::uuid`,
      [canonicalId, legacy.id],
    );

    await mergeSqlOnClient(
      client,
      `UPDATE support_conversations
       SET status = 'closed',
           closed_at = COALESCE(closed_at, now()),
           close_reason = 'merged_into_platform_thread',
           updated_at = now()
       WHERE id = $1::uuid`,
      [legacy.id],
    );
  }

  await mergeSqlOnClient(
    client,
    `UPDATE support_conversations sc
     SET last_message_at = GREATEST(
           sc.last_message_at,
           COALESCE((SELECT MAX(m.created_at) FROM support_conversation_messages m WHERE m.conversation_id = sc.id), sc.last_message_at)
         ),
         status = 'open',
         closed_at = NULL,
         close_reason = NULL,
         updated_at = now()
     WHERE sc.id = $1::uuid
       AND EXISTS (SELECT 1 FROM support_conversation_messages m WHERE m.conversation_id = sc.id)`,
    [canonicalId],
  );

  return {
    mergedConversationCount: legacyRows.rows.length,
    movedMessageCount,
  };
}
