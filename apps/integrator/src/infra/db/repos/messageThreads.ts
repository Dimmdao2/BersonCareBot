import type { DbPort } from '../../../kernel/contracts/index.js';
import { sql } from 'drizzle-orm';
import { runIntegratorSql } from '../runIntegratorSql.js';

export type ActiveDraftRow = {
  id: string;
  identity_id: string;
  source: string;
  external_chat_id: string | null;
  external_message_id: string | null;
  draft_text_current: string;
  state: string;
  created_at: string;
  updated_at: string;
  channel_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_normalized: string | null;
};

export type ConversationRow = {
  id: string;
  source: string;
  user_identity_id: string;
  admin_scope: string;
  status: string;
  opened_at: string;
  last_message_at: string;
  closed_at: string | null;
  close_reason: string | null;
  user_channel_id: string;
  /** For MAX: chat_id to send replies (from last user message). Falls back to user_channel_id. */
  user_chat_id: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_normalized: string | null;
};

export type ConversationListRow = ConversationRow & {
  last_message_text: string | null;
  last_sender_role: string | null;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function getActiveDraftByIdentity(
  db: DbPort,
  input: { resource: string; externalId: string; source?: string },
): Promise<ActiveDraftRow | null> {
  const res = await runIntegratorSql<ActiveDraftRow>(db, sql`
    SELECT
      md.id,
      md.identity_id::text,
      md.source,
      md.external_chat_id,
      md.external_message_id,
      md.draft_text_current,
      md.state,
      md.created_at::text,
      md.updated_at::text,
      i.external_id::text AS channel_id,
      ts.username,
      ts.first_name,
      ts.last_name,
      cp.phone AS phone_normalized
    FROM identities i
    JOIN message_drafts md
      ON md.identity_id = i.id
    LEFT JOIN telegram_state ts
      ON ts.identity_id = i.id AND i.resource = 'telegram'
    LEFT JOIN LATERAL (
      SELECT c.value_normalized AS phone
      FROM contacts c
      WHERE c.user_id = i.user_id AND c.type = 'phone'
      ORDER BY c.is_primary DESC NULLS LAST, c.id ASC
      LIMIT 1
    ) cp ON true
    WHERE i.resource = ${input.resource}
      AND i.external_id = ${input.externalId}
      AND (${input.source ?? null}::text IS NULL OR md.source = ${input.source ?? null})
    LIMIT 1
  `);
  return res.rows[0] ?? null;
}

export async function upsertDraftByIdentity(
  db: DbPort,
  input: {
    id: string;
    resource: string;
    externalId: string;
    source: string;
    externalChatId?: string | null;
    externalMessageId?: string | null;
    draftTextCurrent: string;
    state?: string;
  },
): Promise<void> {
  await runIntegratorSql(db, sql`
    WITH target_identity AS (
      SELECT i.id
      FROM identities i
      WHERE i.resource = ${input.resource}
        AND i.external_id = ${input.externalId}
      LIMIT 1
    )
    INSERT INTO message_drafts (
      id,
      identity_id,
      source,
      external_chat_id,
      external_message_id,
      draft_text_current,
      state,
      created_at,
      updated_at
    )
    SELECT
      ${input.id},
      ti.id,
      ${input.source},
      ${input.externalChatId ?? null},
      ${input.externalMessageId ?? null},
      ${input.draftTextCurrent},
      ${input.state ?? 'pending_confirmation'},
      now(),
      now()
    FROM target_identity ti
    ON CONFLICT (identity_id, source)
    DO UPDATE SET
      external_chat_id = EXCLUDED.external_chat_id,
      external_message_id = EXCLUDED.external_message_id,
      draft_text_current = EXCLUDED.draft_text_current,
      state = EXCLUDED.state,
      updated_at = now()
  `);
}

export async function cancelDraftByIdentity(
  db: DbPort,
  input: { resource: string; externalId: string; source?: string },
): Promise<void> {
  await runIntegratorSql(db, sql`
    DELETE FROM message_drafts md
    USING identities i
    WHERE md.identity_id = i.id
      AND i.resource = ${input.resource}
      AND i.external_id = ${input.externalId}
      AND (${input.source ?? null}::text IS NULL OR md.source = ${input.source ?? null})
  `);
}

export async function insertConversation(
  db: DbPort,
  input: {
    id: string;
    source: string;
    resource: string;
    externalId: string;
    adminScope: string;
    status: string;
    openedAt: string;
    lastMessageAt: string;
  },
): Promise<void> {
  await runIntegratorSql(db, sql`
    WITH target_identity AS (
      SELECT i.id
      FROM identities i
      WHERE i.resource = ${input.resource}
        AND i.external_id = ${input.externalId}
      LIMIT 1
    )
    INSERT INTO conversations (
      id,
      source,
      user_identity_id,
      admin_scope,
      status,
      opened_at,
      last_message_at
    )
    SELECT
      ${input.id},
      ${input.source},
      ti.id,
      ${input.adminScope},
      ${input.status},
      ${input.openedAt}::timestamptz,
      ${input.lastMessageAt}::timestamptz
    FROM target_identity ti
  `);
}

export async function insertConversationMessage(
  db: DbPort,
  input: {
    id: string;
    conversationId: string;
    senderRole: string;
    text: string;
    source: string;
    externalChatId?: string | null;
    externalMessageId?: string | null;
    createdAt: string;
  },
): Promise<void> {
  await runIntegratorSql(db, sql`
    INSERT INTO conversation_messages (
      id,
      conversation_id,
      sender_role,
      text,
      source,
      external_chat_id,
      external_message_id,
      created_at
    )
    VALUES (
      ${input.id},
      ${input.conversationId},
      ${input.senderRole},
      ${input.text},
      ${input.source},
      ${input.externalChatId ?? null},
      ${input.externalMessageId ?? null},
      ${input.createdAt}::timestamptz
    )
  `);
}

export async function setConversationState(
  db: DbPort,
  input: {
    id: string;
    status: string;
    lastMessageAt?: string | null;
    closedAt?: string | null;
    closeReason?: string | null;
  },
): Promise<void> {
  await runIntegratorSql(db, sql`
    UPDATE conversations
    SET
      status = ${input.status},
      last_message_at = COALESCE(${input.lastMessageAt ?? null}::timestamptz, last_message_at),
      closed_at = ${input.closedAt ?? null}::timestamptz,
      close_reason = ${input.closeReason ?? null}
    WHERE id = ${input.id}
  `);
}

/**
 * Ensures an identity exists for a messenger (e.g. max). Creates user and identity if missing.
 * Used so conversation.open can succeed for channels that don't use Telegram's upsertUser.
 */
export async function ensureIdentityForMessenger(
  db: DbPort,
  input: { resource: string; externalId: string },
): Promise<void> {
  if (input.resource !== 'max' || !input.externalId.trim()) return;
  await runIntegratorSql(db, sql`
    WITH existing AS (
      SELECT id FROM identities
      WHERE resource = ${input.resource} AND external_id = ${input.externalId.trim()}
      LIMIT 1
    ),
    new_user AS (
      INSERT INTO users (created_at, updated_at)
      SELECT now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id
    ),
    user_id AS (
      SELECT id FROM new_user
      UNION ALL
      SELECT i.user_id FROM identities i
      WHERE i.resource = ${input.resource} AND i.external_id = ${input.externalId.trim()}
      LIMIT 1
    ),
    ins AS (
      INSERT INTO identities (user_id, resource, external_id, created_at, updated_at)
      SELECT (SELECT id FROM user_id LIMIT 1), ${input.resource}, ${input.externalId.trim()}, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      ON CONFLICT (resource, external_id) DO UPDATE SET updated_at = now()
    )
    SELECT 1
  `);
}

export async function getOpenConversationByIdentity(
  db: DbPort,
  input: { resource: string; externalId: string; source?: string },
): Promise<ConversationRow | null> {
  const res = await runIntegratorSql<ConversationRow>(db, sql`
    SELECT
      c.id,
      c.source,
      c.user_identity_id::text,
      c.admin_scope,
      c.status,
      c.opened_at::text,
      c.last_message_at::text,
      c.closed_at::text,
      c.close_reason,
      i.external_id::text AS user_channel_id,
      (
        SELECT cm.external_chat_id
        FROM conversation_messages cm
        WHERE cm.conversation_id = c.id AND cm.sender_role = 'user' AND cm.external_chat_id IS NOT NULL
        ORDER BY cm.created_at DESC, cm.id DESC
        LIMIT 1
      ) AS user_chat_id,
      ts.username,
      ts.first_name,
      ts.last_name,
      cp.phone AS phone_normalized
    FROM identities i
    JOIN conversations c
      ON c.user_identity_id = i.id
    LEFT JOIN telegram_state ts
      ON ts.identity_id = i.id AND i.resource = 'telegram'
    LEFT JOIN LATERAL (
      SELECT c2.value_normalized AS phone
      FROM contacts c2
      WHERE c2.user_id = i.user_id AND c2.type = 'phone'
      ORDER BY c2.is_primary DESC NULLS LAST, c2.id ASC
      LIMIT 1
    ) cp ON true
    WHERE i.resource = ${input.resource}
      AND i.external_id = ${input.externalId}
      AND c.closed_at IS NULL
      AND c.status <> 'closed'
      AND (${input.source ?? null}::text IS NULL OR c.source = ${input.source ?? null})
    ORDER BY c.last_message_at DESC
    LIMIT 1
  `);
  return res.rows[0] ?? null;
}

export async function getConversationById(
  db: DbPort,
  input: { id: string },
): Promise<ConversationRow | null> {
  const res = await runIntegratorSql<ConversationRow>(db, sql`
    SELECT
      c.id,
      c.source,
      c.user_identity_id::text,
      c.admin_scope,
      c.status,
      c.opened_at::text,
      c.last_message_at::text,
      c.closed_at::text,
      c.close_reason,
      i.external_id::text AS user_channel_id,
      (
        SELECT cm.external_chat_id
        FROM conversation_messages cm
        WHERE cm.conversation_id = c.id AND cm.sender_role = 'user' AND cm.external_chat_id IS NOT NULL
        ORDER BY cm.created_at DESC, cm.id DESC
        LIMIT 1
      ) AS user_chat_id,
      ts.username,
      ts.first_name,
      ts.last_name,
      cp.phone AS phone_normalized
    FROM conversations c
    JOIN identities i
      ON i.id = c.user_identity_id
    LEFT JOIN telegram_state ts
      ON ts.identity_id = i.id AND i.resource = 'telegram'
    LEFT JOIN LATERAL (
      SELECT c2.value_normalized AS phone
      FROM contacts c2
      WHERE c2.user_id = i.user_id AND c2.type = 'phone'
      ORDER BY c2.is_primary DESC NULLS LAST, c2.id ASC
      LIMIT 1
    ) cp ON true
    WHERE c.id = ${input.id}
    LIMIT 1
  `);
  return res.rows[0] ?? null;
}

export async function listOpenConversations(
  db: DbPort,
  input: { source?: string; limit?: number },
): Promise<ConversationListRow[]> {
  const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.max(1, Math.trunc(input.limit)) : 20;
  const sourceParam = asNonEmptyString(input.source);
  const res = await runIntegratorSql<ConversationListRow>(db, sql`
    SELECT
      c.id,
      c.source,
      c.user_identity_id::text,
      c.admin_scope,
      c.status,
      c.opened_at::text,
      c.last_message_at::text,
      c.closed_at::text,
      c.close_reason,
      i.external_id::text AS user_channel_id,
      NULL::text AS user_chat_id,
      ts.username,
      ts.first_name,
      ts.last_name,
      cp.phone AS phone_normalized,
      lm.text AS last_message_text,
      lm.sender_role AS last_sender_role
    FROM conversations c
    JOIN identities i
      ON i.id = c.user_identity_id
    LEFT JOIN telegram_state ts
      ON ts.identity_id = i.id AND i.resource = 'telegram'
    LEFT JOIN LATERAL (
      SELECT c2.value_normalized AS phone
      FROM contacts c2
      WHERE c2.user_id = i.user_id AND c2.type = 'phone'
      ORDER BY c2.is_primary DESC NULLS LAST, c2.id ASC
      LIMIT 1
    ) cp ON true
    LEFT JOIN LATERAL (
      SELECT cm.text, cm.sender_role
      FROM conversation_messages cm
      WHERE cm.conversation_id = c.id
      ORDER BY cm.created_at DESC, cm.id DESC
      LIMIT 1
    ) lm ON true
    WHERE c.closed_at IS NULL
      AND c.status <> 'closed'
      AND (${sourceParam}::text IS NULL OR c.source = ${sourceParam})
    ORDER BY c.last_message_at DESC
    LIMIT ${limit}
  `);
  return res.rows;
}

/** Open conversations with last_message_at strictly before given ISO time (for auto-close). */
export async function listOpenConversationsOlderThan(
  db: DbPort,
  input: { olderThanIso: string; source?: string; limit?: number },
): Promise<ConversationListRow[]> {
  const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.max(1, Math.trunc(input.limit)) : 100;
  const sourceParam = asNonEmptyString(input.source);
  const res = await runIntegratorSql<ConversationListRow>(db, sql`
    SELECT
      c.id,
      c.source,
      c.user_identity_id::text,
      c.admin_scope,
      c.status,
      c.opened_at::text,
      c.last_message_at::text,
      c.closed_at::text,
      c.close_reason,
      i.external_id::text AS user_channel_id,
      ts.username,
      ts.first_name,
      ts.last_name,
      cp.phone AS phone_normalized,
      lm.text AS last_message_text,
      lm.sender_role AS last_sender_role
    FROM conversations c
    JOIN identities i ON i.id = c.user_identity_id
    LEFT JOIN telegram_state ts ON ts.identity_id = i.id AND i.resource = 'telegram'
    LEFT JOIN LATERAL (
      SELECT c2.value_normalized AS phone
      FROM contacts c2
      WHERE c2.user_id = i.user_id AND c2.type = 'phone'
      ORDER BY c2.is_primary DESC NULLS LAST, c2.id ASC
      LIMIT 1
    ) cp ON true
    LEFT JOIN LATERAL (
      SELECT cm.text, cm.sender_role
      FROM conversation_messages cm
      WHERE cm.conversation_id = c.id
      ORDER BY cm.created_at DESC, cm.id DESC
      LIMIT 1
    ) lm ON true
    WHERE c.closed_at IS NULL
      AND c.status <> 'closed'
      AND c.last_message_at IS NOT NULL
      AND c.last_message_at < ${input.olderThanIso}::timestamptz
      AND (${sourceParam}::text IS NULL OR c.source = ${sourceParam})
    ORDER BY c.last_message_at ASC
    LIMIT ${limit}
  `);
  return res.rows;
}

// --- user_questions & question_messages (answered / unanswered list) ---

export type UserQuestionRow = {
  id: string;
  user_identity_id: string;
  conversation_id: string | null;
  telegram_message_id: string | null;
  text: string;
  created_at: string;
  answered: boolean;
  answered_at: string | null;
  user_channel_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};

export async function insertUserQuestion(
  db: DbPort,
  input: {
    id: string;
    userIdentityId: string;
    conversationId: string | null;
    telegramMessageId?: string | null;
    text: string;
    createdAt: string;
  },
): Promise<void> {
  await runIntegratorSql(db, sql`
    INSERT INTO user_questions (id, user_identity_id, conversation_id, telegram_message_id, text, created_at)
    VALUES (
      ${input.id},
      ${input.userIdentityId}::bigint,
      ${input.conversationId},
      ${input.telegramMessageId ?? null},
      ${input.text},
      ${input.createdAt}::timestamptz
    )
  `);
}

export async function insertQuestionMessage(
  db: DbPort,
  input: {
    id: string;
    questionId: string;
    senderType: 'user' | 'admin';
    messageText: string;
    createdAt: string;
  },
): Promise<void> {
  await runIntegratorSql(db, sql`
    INSERT INTO question_messages (id, question_id, sender_type, message_text, created_at)
    VALUES (${input.id}, ${input.questionId}, ${input.senderType}, ${input.messageText}, ${input.createdAt}::timestamptz)
  `);
}

export async function setQuestionAnswered(
  db: DbPort,
  input: { questionId: string; answeredAt: string },
): Promise<void> {
  await runIntegratorSql(db, sql`
    UPDATE user_questions
    SET answered = true, answered_at = ${input.answeredAt}::timestamptz
    WHERE id = ${input.questionId}
  `);
}

export async function getQuestionByConversationId(
  db: DbPort,
  input: { conversationId: string },
): Promise<{ id: string; answered: boolean } | null> {
  const res = await runIntegratorSql<{ id: string; answered: boolean }>(db, sql`
    SELECT id, answered
    FROM user_questions
    WHERE conversation_id = ${input.conversationId}
    LIMIT 1
  `);
  return res.rows[0] ?? null;
}

export async function listUnansweredQuestions(
  db: DbPort,
  input: { limit?: number },
): Promise<UserQuestionRow[]> {
  const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.max(1, Math.trunc(input.limit)) : 50;
  const res = await runIntegratorSql<UserQuestionRow>(db, sql`
    SELECT
      uq.id,
      uq.user_identity_id::text,
      uq.conversation_id,
      uq.telegram_message_id,
      uq.text,
      uq.created_at::text,
      uq.answered,
      uq.answered_at::text,
      i.external_id::text AS user_channel_id,
      ts.username,
      ts.first_name,
      ts.last_name
    FROM user_questions uq
    JOIN identities i ON i.id = uq.user_identity_id
    LEFT JOIN telegram_state ts ON ts.identity_id = i.id AND i.resource = 'telegram'
    WHERE uq.answered = false
    ORDER BY uq.created_at DESC
    LIMIT ${limit}
  `);
  return res.rows;
}
