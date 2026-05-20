import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import { getConversationById, insertConversation, setConversationState } from './messageThreads.js';

/**
 * Закрывает legacy open-диалог integrator и переносит сообщения в `webapp:platform:{platformUserId}`.
 */
export async function mergeIntegratorConversationToPlatformThread(
  db: DbPort,
  input: {
    platformConversationId: string;
    legacyConversationId: string;
    resource: string;
    externalId: string;
  },
): Promise<void> {
  if (input.platformConversationId === input.legacyConversationId) return;

  await db.tx(async (txDb) => {
    const legacy = await getConversationById(txDb, { id: input.legacyConversationId });
    if (!legacy) return;

    const platformExisting = await getConversationById(txDb, { id: input.platformConversationId });

    await setConversationState(txDb, {
      id: input.legacyConversationId,
      status: 'closed',
      closedAt: new Date().toISOString(),
      closeReason: 'merged_into_platform_thread',
    });

    if (!platformExisting) {
      await insertConversation(txDb, {
        id: input.platformConversationId,
        resource: input.resource,
        externalId: input.externalId,
        source: legacy.source,
        adminScope: legacy.admin_scope,
        status: legacy.status === 'closed' ? 'open' : legacy.status,
        openedAt: legacy.opened_at,
        lastMessageAt: legacy.last_message_at,
      });
    }

    await runIntegratorSql(txDb, sql`
      UPDATE conversation_messages
      SET conversation_id = ${input.platformConversationId}
      WHERE conversation_id = ${input.legacyConversationId}
    `);

    await runIntegratorSql(txDb, sql`
      UPDATE user_questions
      SET conversation_id = ${input.platformConversationId}
      WHERE conversation_id = ${input.legacyConversationId}
    `);

    await setConversationState(txDb, {
      id: input.platformConversationId,
      status: legacy.status === 'closed' ? 'open' : legacy.status,
      lastMessageAt: legacy.last_message_at,
    });
  });
}
