import type { Pool, PoolClient } from "pg";
import { getWebappSqlFromPgClient, runWebappPgText } from "@/infra/db/runWebappSql";
import { webappPlatformConversationId } from "@/modules/messaging/supportConversationIds";

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
 * Переносит историю из legacy projection-диалогов (UUID integrator) в канон `webapp:platform:{platformUserId}`.
 * Legacy-строки закрываются с `close_reason = merged_into_platform_thread`.
 */
export async function mergeLegacySupportConversationsForPlatformUser(
  client: Pool | PoolClient,
  platformUserId: string,
): Promise<MergeLegacySupportResult> {
  const canonicalKey = webappPlatformConversationId(platformUserId);

  const canonRow = await mergeSqlOnClient<{ id: string }>(
    client,
    `INSERT INTO support_conversations (
      integrator_conversation_id, platform_user_id, integrator_user_id, source, admin_scope, status,
      opened_at, last_message_at
    ) VALUES ($1, $2::uuid, NULL, 'webapp', 'support', 'open', now(), now())
    ON CONFLICT (integrator_conversation_id) DO UPDATE SET
      platform_user_id = COALESCE(EXCLUDED.platform_user_id, support_conversations.platform_user_id),
      updated_at = now()
    RETURNING id`,
    [canonicalKey, platformUserId],
  );
  const canonicalId = canonRow.rows[0]?.id;
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
