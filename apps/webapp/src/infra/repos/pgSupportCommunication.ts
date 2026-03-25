/**
 * Support communication history repo: projection/backfill writes and shadow reads.
 * Idempotent by integrator_*_id; platform_user_id resolved from platform_users when present.
 */

import { getPool } from "@/infra/db/client";

export type SupportConversationRow = {
  id: string;
  integratorConversationId: string;
  platformUserId: string | null;
  integratorUserId: string | null;
  source: string;
  adminScope: string;
  status: string;
  openedAt: string;
  lastMessageAt: string;
  closedAt: string | null;
  closeReason: string | null;
  channelCode: string | null;
  channelExternalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportConversationRelayInfo = Pick<
  SupportConversationRow,
  "id" | "platformUserId" | "channelCode" | "channelExternalId"
>;

export type SupportConversationMessageRow = {
  id: string;
  integratorMessageId: string;
  conversationId: string;
  senderRole: string;
  messageType: string;
  text: string;
  source: string;
  externalChatId: string | null;
  externalMessageId: string | null;
  deliveryStatus: string | null;
  createdAt: string;
  readAt: string | null;
  deliveredAt: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
};

export type SupportQuestionRow = {
  id: string;
  integratorQuestionId: string;
  conversationId: string | null;
  status: string;
  createdAt: string;
  answeredAt: string | null;
  updatedAt: string;
};

export type SupportQuestionMessageRow = {
  id: string;
  integratorQuestionMessageId: string;
  questionId: string;
  senderRole: string;
  text: string;
  createdAt: string;
};

export type SupportDeliveryEventRow = {
  id: string;
  conversationMessageId: string | null;
  integratorIntentEventId: string | null;
  correlationId: string | null;
  channelCode: string;
  status: string;
  attempt: number;
  reason: string | null;
  payloadJson: Record<string, unknown>;
  occurredAt: string;
};

export type AdminConversationListRow = {
  /** Internal UUID `support_conversations.id` (этап 8) */
  conversationId: string;
  integratorConversationId: string;
  source: string;
  integratorUserId: string | null;
  adminScope: string;
  status: string;
  openedAt: string;
  lastMessageAt: string;
  closedAt: string | null;
  closeReason: string | null;
  displayName: string;
  phoneNormalized: string | null;
  channelExternalId: string | null;
  lastMessageText: string | null;
  lastSenderRole: string | null;
};

export type AdminConversationDetailRow = AdminConversationListRow & {
  userChatId: string | null;
};

export type AdminQuestionListRow = {
  integratorQuestionId: string;
  integratorConversationId: string | null;
  text: string;
  createdAt: string;
  answered: boolean;
  answeredAt: string | null;
  displayName: string;
  phoneNormalized: string | null;
  channelExternalId: string | null;
};

export type SupportCommunicationPort = {
  upsertConversationFromProjection(params: {
    integratorConversationId: string;
    integratorUserId: string | null;
    source: string;
    adminScope: string;
    status: string;
    openedAt: string;
    lastMessageAt: string;
    closedAt?: string | null;
    closeReason?: string | null;
    channelCode?: string | null;
    channelExternalId?: string | null;
  }): Promise<{ id: string }>;
  appendConversationMessageFromProjection(params: {
    integratorMessageId: string;
    integratorConversationId: string;
    senderRole: string;
    messageType?: string;
    text: string;
    source: string;
    externalChatId?: string | null;
    externalMessageId?: string | null;
    deliveryStatus?: string | null;
    createdAt: string;
  }): Promise<{ id: string }>;
  setConversationStatusFromProjection(params: {
    integratorConversationId: string;
    status: string;
    lastMessageAt?: string | null;
    closedAt?: string | null;
    closeReason?: string | null;
  }): Promise<void>;
  upsertQuestionFromProjection(params: {
    integratorQuestionId: string;
    integratorConversationId: string | null;
    status: string;
    createdAt: string;
    answeredAt?: string | null;
  }): Promise<{ id: string }>;
  appendQuestionMessageFromProjection(params: {
    integratorQuestionMessageId: string;
    integratorQuestionId: string;
    senderRole: string;
    text: string;
    createdAt: string;
  }): Promise<{ id: string }>;
  appendDeliveryEventFromProjection(params: {
    conversationMessageId: string | null;
    integratorIntentEventId: string | null;
    correlationId: string | null;
    channelCode: string;
    status: string;
    attempt: number;
    reason: string | null;
    payloadJson: Record<string, unknown>;
    occurredAt: string;
  }): Promise<{ id: string }>;
  listConversationsByUser(platformUserId: string): Promise<SupportConversationRow[]>;
  getConversationWithMessages(conversationId: string): Promise<{
    conversation: SupportConversationRow;
    messages: SupportConversationMessageRow[];
  } | null>;
  listQuestionsByUser(platformUserId: string): Promise<SupportQuestionRow[]>;
  listRecentDeliveryTrailForConversation(conversationId: string, limit?: number): Promise<SupportDeliveryEventRow[]>;
  listOpenConversationsForAdmin(params: { source?: string; limit?: number }): Promise<AdminConversationListRow[]>;
  getConversationByIntegratorId(integratorConversationId: string): Promise<AdminConversationDetailRow | null>;
  listUnansweredQuestionsForAdmin(params: { limit?: number }): Promise<AdminQuestionListRow[]>;
  getQuestionByIntegratorConversationId(integratorConversationId: string): Promise<{ id: string; answered: boolean } | null>;
  /** Один диалог webapp на пользователя: `integrator_conversation_id = webapp:platform:{uuid}`. */
  ensureWebappConversationForUser(platformUserId: string): Promise<{ id: string }>;
  appendWebappMessage(params: {
    conversationId: string;
    integratorMessageId: string;
    senderRole: string;
    text: string;
    source: string;
    createdAt: string;
  }): Promise<{ id: string }>;
  listMessagesSince(conversationId: string, params: { sinceCreatedAt?: string | null; limit: number }): Promise<SupportConversationMessageRow[]>;
  conversationExists(conversationId: string): Promise<boolean>;
  getConversationRelayInfo(conversationId: string): Promise<SupportConversationRelayInfo | null>;
  getConversationIfOwnedByUser(conversationId: string, platformUserId: string): Promise<SupportConversationRow | null>;
  markInboundReadForUser(conversationId: string, platformUserId: string): Promise<void>;
  markUserMessagesReadByAdmin(conversationId: string): Promise<void>;
  countUnreadForUser(platformUserId: string): Promise<number>;
  countUnreadUserMessagesForAdmin(): Promise<number>;
};

function mapMessageRow(m: Record<string, unknown>): SupportConversationMessageRow {
  return {
    id: String(m.id),
    integratorMessageId: String(m.integrator_message_id),
    conversationId: String(m.conversation_id),
    senderRole: String(m.sender_role),
    messageType: String(m.message_type),
    text: String(m.text),
    source: String(m.source),
    externalChatId: m.external_chat_id != null ? String(m.external_chat_id) : null,
    externalMessageId: m.external_message_id != null ? String(m.external_message_id) : null,
    deliveryStatus: m.delivery_status != null ? String(m.delivery_status) : null,
    createdAt: String(m.created_at),
    readAt: m.read_at != null ? String(m.read_at) : null,
    deliveredAt: m.delivered_at != null ? String(m.delivered_at) : null,
    mediaUrl: m.media_url != null ? String(m.media_url) : null,
    mediaType: m.media_type != null ? String(m.media_type) : null,
  };
}

function resolvePlatformUserId(pool: Awaited<ReturnType<typeof getPool>>, integratorUserId: string | null): Promise<string | null> {
  if (integratorUserId == null || integratorUserId === "") return Promise.resolve(null);
  return pool
    .query<{ id: string }>("SELECT id FROM platform_users WHERE integrator_user_id = $1", [integratorUserId])
    .then((r) => (r.rows.length > 0 ? r.rows[0].id : null));
}

export function createPgSupportCommunicationPort(): SupportCommunicationPort {
  return {
    async upsertConversationFromProjection(params) {
      const pool = getPool();
      const platformUserId = await resolvePlatformUserId(pool, params.integratorUserId);
      const r = await pool.query<{ id: string }>(
        `INSERT INTO support_conversations (
          integrator_conversation_id, platform_user_id, integrator_user_id, source, admin_scope, status,
          opened_at, last_message_at, closed_at, close_reason, channel_code, channel_external_id
        ) VALUES ($1, $2, $3::bigint, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz, $10, $11, $12)
        ON CONFLICT (integrator_conversation_id) DO UPDATE SET
          platform_user_id = COALESCE(EXCLUDED.platform_user_id, support_conversations.platform_user_id),
          integrator_user_id = COALESCE(EXCLUDED.integrator_user_id, support_conversations.integrator_user_id),
          status = EXCLUDED.status,
          last_message_at = EXCLUDED.last_message_at,
          closed_at = EXCLUDED.closed_at,
          close_reason = EXCLUDED.close_reason,
          updated_at = now()
        RETURNING id`,
        [
          params.integratorConversationId,
          platformUserId,
          params.integratorUserId ?? null,
          params.source,
          params.adminScope,
          params.status,
          params.openedAt,
          params.lastMessageAt,
          params.closedAt ?? null,
          params.closeReason ?? null,
          params.channelCode ?? null,
          params.channelExternalId ?? null,
        ]
      );
      return { id: r.rows[0].id };
    },

    async appendConversationMessageFromProjection(params) {
      const pool = getPool();
      const conv = await pool.query<{ id: string }>(
        "SELECT id FROM support_conversations WHERE integrator_conversation_id = $1",
        [params.integratorConversationId]
      );
      const conversationId = conv.rows[0]?.id;
      if (!conversationId) {
        const ins = await pool.query<{ id: string }>(
          `INSERT INTO support_conversations (
            integrator_conversation_id, integrator_user_id, source, admin_scope, status, opened_at, last_message_at
          ) VALUES ($1, NULL, $2, '', 'open', $3::timestamptz, $3::timestamptz)
          ON CONFLICT (integrator_conversation_id) DO UPDATE SET last_message_at = GREATEST(support_conversations.last_message_at, $3::timestamptz)
          RETURNING id`,
          [params.integratorConversationId, params.source, params.createdAt]
        );
        const cid = ins.rows[0].id;
        const r = await pool.query<{ id: string }>(
          `INSERT INTO support_conversation_messages (
            integrator_message_id, conversation_id, sender_role, message_type, text, source,
            external_chat_id, external_message_id, delivery_status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)
          ON CONFLICT (integrator_message_id) DO UPDATE SET conversation_id = EXCLUDED.conversation_id
          RETURNING id`,
          [
            params.integratorMessageId,
            cid,
            params.senderRole,
            params.messageType ?? "text",
            params.text,
            params.source,
            params.externalChatId ?? null,
            params.externalMessageId ?? null,
            params.deliveryStatus ?? null,
            params.createdAt,
          ]
        );
        return { id: r.rows[0].id };
      }
      const r = await pool.query<{ id: string }>(
        `INSERT INTO support_conversation_messages (
          integrator_message_id, conversation_id, sender_role, message_type, text, source,
          external_chat_id, external_message_id, delivery_status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)
        ON CONFLICT (integrator_message_id) DO UPDATE SET conversation_id = EXCLUDED.conversation_id
        RETURNING id`,
        [
          params.integratorMessageId,
          conversationId,
          params.senderRole,
          params.messageType ?? "text",
          params.text,
          params.source,
          params.externalChatId ?? null,
          params.externalMessageId ?? null,
          params.deliveryStatus ?? null,
          params.createdAt,
        ]
      );
      await pool.query(
        `UPDATE support_conversations SET last_message_at = GREATEST(last_message_at, $2::timestamptz), updated_at = now() WHERE id = $1`,
        [conversationId, params.createdAt]
      );
      return { id: r.rows[0].id };
    },

    async setConversationStatusFromProjection(params) {
      const pool = getPool();
      const r = await pool.query<{ id: string }>(
        `UPDATE support_conversations SET
          status = $2,
          last_message_at = COALESCE($3::timestamptz, last_message_at),
          closed_at = COALESCE($4::timestamptz, closed_at),
          close_reason = COALESCE($5, close_reason),
          updated_at = now()
        WHERE integrator_conversation_id = $1
        RETURNING id`,
        [
          params.integratorConversationId,
          params.status,
          params.lastMessageAt ?? null,
          params.closedAt ?? null,
          params.closeReason ?? null,
        ]
      );
      if (r.rowCount === 0) {
        await pool.query(
          `INSERT INTO support_conversations (
            integrator_conversation_id, source, admin_scope, status, opened_at, last_message_at, closed_at, close_reason
          ) VALUES ($1, 'ingest', '', $2, now(), $3::timestamptz, $4::timestamptz, $5)
          ON CONFLICT (integrator_conversation_id) DO UPDATE SET
            status = EXCLUDED.status,
            last_message_at = COALESCE(EXCLUDED.last_message_at, support_conversations.last_message_at),
            closed_at = COALESCE(EXCLUDED.closed_at, support_conversations.closed_at),
            close_reason = COALESCE(EXCLUDED.close_reason, support_conversations.close_reason),
            updated_at = now()`,
          [
            params.integratorConversationId,
            params.status,
            params.lastMessageAt ?? new Date().toISOString(),
            params.closedAt ?? null,
            params.closeReason ?? null,
          ]
        );
      }
    },

    async upsertQuestionFromProjection(params) {
      const pool = getPool();
      let conversationId: string | null = null;
      if (params.integratorConversationId) {
        const c = await pool.query<{ id: string }>(
          "SELECT id FROM support_conversations WHERE integrator_conversation_id = $1",
          [params.integratorConversationId]
        );
        conversationId = c.rows[0]?.id ?? null;
      }
      const r = await pool.query<{ id: string }>(
        `INSERT INTO support_questions (
          integrator_question_id, conversation_id, status, created_at, answered_at
        ) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)
        ON CONFLICT (integrator_question_id) DO UPDATE SET
          conversation_id = COALESCE(EXCLUDED.conversation_id, support_questions.conversation_id),
          status = EXCLUDED.status,
          answered_at = COALESCE(EXCLUDED.answered_at, support_questions.answered_at),
          updated_at = now()
        RETURNING id`,
        [
          params.integratorQuestionId,
          conversationId,
          params.status,
          params.createdAt,
          params.answeredAt ?? null,
        ]
      );
      return { id: r.rows[0].id };
    },

    async appendQuestionMessageFromProjection(params) {
      const pool = getPool();
      const q = await pool.query<{ id: string }>(
        "SELECT id FROM support_questions WHERE integrator_question_id = $1",
        [params.integratorQuestionId]
      );
      const questionId = q.rows[0]?.id;
      if (!questionId) {
        const ins = await pool.query<{ id: string }>(
          `INSERT INTO support_questions (integrator_question_id, conversation_id, status, created_at)
           VALUES ($1, NULL, 'open', $2::timestamptz)
           ON CONFLICT (integrator_question_id) DO NOTHING
           RETURNING id`,
          [params.integratorQuestionId, params.createdAt]
        );
        const qid = ins.rows[0]?.id;
        if (!qid) {
          const sel = await pool.query<{ id: string }>(
            "SELECT id FROM support_questions WHERE integrator_question_id = $1",
            [params.integratorQuestionId]
          );
          const qid2 = sel.rows[0]?.id;
          if (!qid2) throw new Error(`support_questions row missing for ${params.integratorQuestionId}`);
          const r = await pool.query<{ id: string }>(
            `INSERT INTO support_question_messages (
              integrator_question_message_id, question_id, sender_role, text, created_at
            ) VALUES ($1, $2, $3, $4, $5::timestamptz)
            ON CONFLICT (integrator_question_message_id) DO NOTHING
            RETURNING id`,
            [params.integratorQuestionMessageId, qid2, params.senderRole, params.text, params.createdAt]
          );
          return { id: r.rows[0]?.id ?? "" };
        }
        const r = await pool.query<{ id: string }>(
          `INSERT INTO support_question_messages (
            integrator_question_message_id, question_id, sender_role, text, created_at
          ) VALUES ($1, $2, $3, $4, $5::timestamptz)
          ON CONFLICT (integrator_question_message_id) DO NOTHING
          RETURNING id`,
          [params.integratorQuestionMessageId, qid, params.senderRole, params.text, params.createdAt]
        );
        return { id: r.rows[0]?.id ?? "" };
      }
      const r = await pool.query<{ id: string }>(
        `INSERT INTO support_question_messages (
          integrator_question_message_id, question_id, sender_role, text, created_at
        ) VALUES ($1, $2, $3, $4, $5::timestamptz)
        ON CONFLICT (integrator_question_message_id) DO NOTHING
        RETURNING id`,
        [params.integratorQuestionMessageId, questionId, params.senderRole, params.text, params.createdAt]
      );
      return { id: r.rows[0]?.id ?? "" };
    },

    async appendDeliveryEventFromProjection(params) {
      const pool = getPool();
      const r = await pool.query<{ id: string }>(
        `INSERT INTO support_delivery_events (
          conversation_message_id, integrator_intent_event_id, correlation_id,
          channel_code, status, attempt, reason, payload_json, occurred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz)
        ON CONFLICT (integrator_intent_event_id)
          WHERE integrator_intent_event_id IS NOT NULL
        DO NOTHING
        RETURNING id`,
        [
          params.conversationMessageId,
          params.integratorIntentEventId,
          params.correlationId,
          params.channelCode,
          params.status,
          params.attempt,
          params.reason,
          JSON.stringify(params.payloadJson ?? {}),
          params.occurredAt,
        ]
      );
      return { id: r.rows[0]?.id ?? '' };
    },

    async listConversationsByUser(platformUserId) {
      const pool = getPool();
      const r = await pool.query(
        `SELECT id, integrator_conversation_id, platform_user_id, integrator_user_id::text, source, admin_scope, status,
                opened_at::text, last_message_at::text, closed_at::text, close_reason, channel_code, channel_external_id,
                created_at::text, updated_at::text
         FROM support_conversations WHERE platform_user_id = $1 ORDER BY last_message_at DESC`,
        [platformUserId]
      );
      return r.rows.map((row) => ({
        id: row.id,
        integratorConversationId: row.integrator_conversation_id,
        platformUserId: row.platform_user_id,
        integratorUserId: row.integrator_user_id,
        source: row.source,
        adminScope: row.admin_scope,
        status: row.status,
        openedAt: row.opened_at,
        lastMessageAt: row.last_message_at,
        closedAt: row.closed_at,
        closeReason: row.close_reason,
        channelCode: row.channel_code,
        channelExternalId: row.channel_external_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },

    async getConversationWithMessages(conversationId) {
      const pool = getPool();
      const conv = await pool.query(
        `SELECT id, integrator_conversation_id, platform_user_id, integrator_user_id::text, source, admin_scope, status,
                opened_at::text, last_message_at::text, closed_at::text, close_reason, channel_code, channel_external_id,
                created_at::text, updated_at::text
         FROM support_conversations WHERE id = $1`,
        [conversationId]
      );
      if (conv.rows.length === 0) return null;
      const row = conv.rows[0];
      const conversation: SupportConversationRow = {
        id: row.id,
        integratorConversationId: row.integrator_conversation_id,
        platformUserId: row.platform_user_id,
        integratorUserId: row.integrator_user_id,
        source: row.source,
        adminScope: row.admin_scope,
        status: row.status,
        openedAt: row.opened_at,
        lastMessageAt: row.last_message_at,
        closedAt: row.closed_at,
        closeReason: row.close_reason,
        channelCode: row.channel_code,
        channelExternalId: row.channel_external_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      const msg = await pool.query(
        `SELECT id, integrator_message_id, conversation_id, sender_role, message_type, text, source,
                external_chat_id, external_message_id, delivery_status, created_at::text,
                read_at::text, delivered_at::text, media_url, media_type
         FROM support_conversation_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [conversationId]
      );
      const messages: SupportConversationMessageRow[] = msg.rows.map((m) => mapMessageRow(m as Record<string, unknown>));
      return { conversation, messages };
    },

    async listQuestionsByUser(platformUserId) {
      const pool = getPool();
      const r = await pool.query(
        `SELECT q.id, q.integrator_question_id, q.conversation_id, q.status, q.created_at::text, q.answered_at::text, q.updated_at::text
         FROM support_questions q
         JOIN support_conversations c ON c.id = q.conversation_id AND c.platform_user_id = $1
         ORDER BY q.created_at DESC`,
        [platformUserId]
      );
      return r.rows.map((row) => ({
        id: row.id,
        integratorQuestionId: row.integrator_question_id,
        conversationId: row.conversation_id,
        status: row.status,
        createdAt: row.created_at,
        answeredAt: row.answered_at,
        updatedAt: row.updated_at,
      }));
    },

    async listRecentDeliveryTrailForConversation(conversationId, limit = 50) {
      const pool = getPool();
      const r = await pool.query(
        `SELECT e.id, e.conversation_message_id, e.integrator_intent_event_id, e.correlation_id,
                e.channel_code, e.status, e.attempt, e.reason, e.payload_json, e.occurred_at::text
         FROM support_delivery_events e
         JOIN support_conversation_messages m ON m.id = e.conversation_message_id AND m.conversation_id = $1
         ORDER BY e.occurred_at DESC LIMIT $2`,
        [conversationId, limit]
      );
      return r.rows.map((row) => ({
        id: row.id,
        conversationMessageId: row.conversation_message_id,
        integratorIntentEventId: row.integrator_intent_event_id,
        correlationId: row.correlation_id,
        channelCode: row.channel_code,
        status: row.status,
        attempt: row.attempt,
        reason: row.reason,
        payloadJson: (row.payload_json as Record<string, unknown>) ?? {},
        occurredAt: row.occurred_at,
      }));
    },

    async listOpenConversationsForAdmin(params) {
      const pool = getPool();
      const limit = typeof params.limit === "number" && params.limit > 0 ? Math.min(params.limit, 100) : 20;
      const source = typeof params.source === "string" && params.source.trim() ? params.source.trim() : null;
      const r = await pool.query(
        `SELECT
          sc.id AS conversation_id,
          sc.integrator_conversation_id,
          sc.source,
          sc.integrator_user_id::text,
          sc.admin_scope,
          sc.status,
          sc.opened_at::text,
          sc.last_message_at::text,
          sc.closed_at::text,
          sc.close_reason,
          COALESCE(pu.display_name, '') AS display_name,
          pu.phone_normalized,
          sc.channel_external_id,
          lm.text AS last_message_text,
          lm.sender_role AS last_sender_role
         FROM support_conversations sc
         LEFT JOIN platform_users pu ON pu.id = sc.platform_user_id
         LEFT JOIN LATERAL (
           SELECT m.text, m.sender_role
           FROM support_conversation_messages m
           WHERE m.conversation_id = sc.id
           ORDER BY m.created_at DESC
           LIMIT 1
         ) lm ON true
         WHERE sc.status <> 'closed'
           AND sc.closed_at IS NULL
           AND ($1::text IS NULL OR sc.source = $1)
         ORDER BY sc.last_message_at DESC
         LIMIT $2`,
        [source, limit]
      );
      return r.rows.map((row) => ({
        conversationId: String(row.conversation_id),
        integratorConversationId: row.integrator_conversation_id,
        source: row.source,
        integratorUserId: row.integrator_user_id,
        adminScope: row.admin_scope,
        status: row.status,
        openedAt: row.opened_at,
        lastMessageAt: row.last_message_at,
        closedAt: row.closed_at,
        closeReason: row.close_reason,
        displayName: row.display_name ?? "",
        phoneNormalized: row.phone_normalized,
        channelExternalId: row.channel_external_id,
        lastMessageText: row.last_message_text,
        lastSenderRole: row.last_sender_role,
      }));
    },

    async getConversationByIntegratorId(integratorConversationId) {
      const pool = getPool();
      const r = await pool.query(
        `SELECT
          sc.id AS conversation_id,
          sc.integrator_conversation_id,
          sc.source,
          sc.integrator_user_id::text,
          sc.admin_scope,
          sc.status,
          sc.opened_at::text,
          sc.last_message_at::text,
          sc.closed_at::text,
          sc.close_reason,
          COALESCE(pu.display_name, '') AS display_name,
          pu.phone_normalized,
          sc.channel_external_id,
          lm.text AS last_message_text,
          lm.sender_role AS last_sender_role,
          user_chat.external_chat_id AS user_chat_id
         FROM support_conversations sc
         LEFT JOIN platform_users pu ON pu.id = sc.platform_user_id
         LEFT JOIN LATERAL (
           SELECT m.text, m.sender_role
           FROM support_conversation_messages m
           WHERE m.conversation_id = sc.id
           ORDER BY m.created_at DESC
           LIMIT 1
         ) lm ON true
         LEFT JOIN LATERAL (
           SELECT m2.external_chat_id
           FROM support_conversation_messages m2
           WHERE m2.conversation_id = sc.id AND m2.sender_role = 'user' AND m2.external_chat_id IS NOT NULL
           ORDER BY m2.created_at DESC
           LIMIT 1
         ) user_chat ON true
         WHERE sc.integrator_conversation_id = $1
         LIMIT 1`,
        [integratorConversationId]
      );
      if (r.rows.length === 0) return null;
      const row = r.rows[0]!;
      return {
        conversationId: String(row.conversation_id),
        integratorConversationId: row.integrator_conversation_id,
        source: row.source,
        integratorUserId: row.integrator_user_id,
        adminScope: row.admin_scope,
        status: row.status,
        openedAt: row.opened_at,
        lastMessageAt: row.last_message_at,
        closedAt: row.closed_at,
        closeReason: row.close_reason,
        displayName: row.display_name ?? "",
        phoneNormalized: row.phone_normalized,
        channelExternalId: row.channel_external_id,
        lastMessageText: row.last_message_text,
        lastSenderRole: row.last_sender_role,
        userChatId: row.user_chat_id,
      };
    },

    async listUnansweredQuestionsForAdmin(params) {
      const pool = getPool();
      const limit = typeof params.limit === "number" && params.limit > 0 ? Math.min(params.limit, 100) : 50;
      const r = await pool.query(
        `SELECT
          sq.integrator_question_id,
          sc.integrator_conversation_id AS integrator_conversation_id,
          COALESCE(qm.text, '') AS text,
          sq.created_at::text,
          (sq.status = 'answered') AS answered,
          sq.answered_at::text,
          COALESCE(pu.display_name, '') AS display_name,
          pu.phone_normalized,
          sc.channel_external_id
         FROM support_questions sq
         LEFT JOIN support_conversations sc ON sc.id = sq.conversation_id
         LEFT JOIN platform_users pu ON pu.id = sc.platform_user_id
         LEFT JOIN LATERAL (
           SELECT qm2.text
           FROM support_question_messages qm2
           WHERE qm2.question_id = sq.id
           ORDER BY qm2.created_at ASC
           LIMIT 1
         ) qm ON true
         WHERE (sq.status IS NULL OR sq.status <> 'answered')
         ORDER BY sq.created_at DESC
         LIMIT $1`,
        [limit]
      );
      return r.rows.map((row) => ({
        integratorQuestionId: row.integrator_question_id,
        integratorConversationId: row.integrator_conversation_id,
        text: row.text ?? "",
        createdAt: row.created_at,
        answered: Boolean(row.answered),
        answeredAt: row.answered_at,
        displayName: row.display_name ?? "",
        phoneNormalized: row.phone_normalized,
        channelExternalId: row.channel_external_id,
      }));
    },

    async getQuestionByIntegratorConversationId(integratorConversationId) {
      const pool = getPool();
      const r = await pool.query(
        `SELECT sq.integrator_question_id, sq.status
         FROM support_questions sq
         JOIN support_conversations sc ON sc.id = sq.conversation_id
         WHERE sc.integrator_conversation_id = $1
         ORDER BY sq.created_at DESC
         LIMIT 1`,
        [integratorConversationId]
      );
      if (r.rows.length === 0) return null;
      const row = r.rows[0]!;
      return {
        id: row.integrator_question_id,
        answered: row.status === "answered",
      };
    },

    async ensureWebappConversationForUser(platformUserId) {
      const pool = getPool();
      const integratorConversationId = `webapp:platform:${platformUserId}`;
      const r = await pool.query<{ id: string }>(
        `INSERT INTO support_conversations (
          integrator_conversation_id, platform_user_id, integrator_user_id, source, admin_scope, status,
          opened_at, last_message_at
        ) VALUES ($1, $2::uuid, NULL, 'webapp', 'support', 'open', now(), now())
        ON CONFLICT (integrator_conversation_id) DO UPDATE SET
          platform_user_id = COALESCE(EXCLUDED.platform_user_id, support_conversations.platform_user_id),
          updated_at = now()
        RETURNING id`,
        [integratorConversationId, platformUserId]
      );
      return { id: r.rows[0]!.id };
    },

    async appendWebappMessage(params) {
      const pool = getPool();
      const r = await pool.query<{ id: string }>(
        `INSERT INTO support_conversation_messages (
          integrator_message_id, conversation_id, sender_role, message_type, text, source,
          external_chat_id, external_message_id, delivery_status, created_at, delivered_at
        ) VALUES ($1, $2::uuid, $3, 'text', $4, $5, NULL, NULL, NULL, $6::timestamptz, $6::timestamptz)
        ON CONFLICT (integrator_message_id) DO NOTHING
        RETURNING id`,
        [
          params.integratorMessageId,
          params.conversationId,
          params.senderRole,
          params.text,
          params.source,
          params.createdAt,
        ]
      );
      if (r.rows[0]?.id) {
        await pool.query(
          `UPDATE support_conversations SET last_message_at = GREATEST(last_message_at, $2::timestamptz), updated_at = now() WHERE id = $1::uuid`,
          [params.conversationId, params.createdAt]
        );
        return { id: r.rows[0].id };
      }
      const ex = await pool.query<{ id: string }>(
        "SELECT id FROM support_conversation_messages WHERE integrator_message_id = $1",
        [params.integratorMessageId]
      );
      return { id: ex.rows[0]?.id ?? "" };
    },

    async listMessagesSince(conversationId, params) {
      const pool = getPool();
      const lim = Math.min(Math.max(params.limit, 1), 200);
      if (params.sinceCreatedAt) {
        const r = await pool.query(
          `SELECT id, integrator_message_id, conversation_id, sender_role, message_type, text, source,
                  external_chat_id, external_message_id, delivery_status, created_at::text,
                  read_at::text, delivered_at::text, media_url, media_type
           FROM support_conversation_messages
           WHERE conversation_id = $1::uuid AND created_at > $2::timestamptz
           ORDER BY created_at ASC
           LIMIT $3`,
          [conversationId, params.sinceCreatedAt, lim]
        );
        return r.rows.map((m) => mapMessageRow(m as Record<string, unknown>));
      }
      const r = await pool.query(
        `SELECT id, integrator_message_id, conversation_id, sender_role, message_type, text, source,
                external_chat_id, external_message_id, delivery_status, created_at::text,
                read_at::text, delivered_at::text, media_url, media_type
         FROM (
           SELECT * FROM support_conversation_messages
           WHERE conversation_id = $1::uuid
           ORDER BY created_at DESC
           LIMIT $2
         ) sub
         ORDER BY created_at ASC`,
        [conversationId, lim]
      );
      return r.rows.map((m) => mapMessageRow(m as Record<string, unknown>));
    },

    async conversationExists(conversationId) {
      const pool = getPool();
      const r = await pool.query("SELECT 1 FROM support_conversations WHERE id = $1::uuid LIMIT 1", [conversationId]);
      return r.rows.length > 0;
    },

    async getConversationRelayInfo(conversationId) {
      const pool = getPool();
      const r = await pool.query<{
        id: string;
        platform_user_id: string | null;
        channel_code: string | null;
        channel_external_id: string | null;
      }>(
        `SELECT id, platform_user_id, channel_code, channel_external_id
         FROM support_conversations
         WHERE id = $1::uuid
         LIMIT 1`,
        [conversationId]
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        platformUserId: row.platform_user_id,
        channelCode: row.channel_code,
        channelExternalId: row.channel_external_id,
      };
    },

    async getConversationIfOwnedByUser(conversationId, platformUserId) {
      const pool = getPool();
      const r = await pool.query(
        `SELECT id, integrator_conversation_id, platform_user_id, integrator_user_id::text, source, admin_scope, status,
                opened_at::text, last_message_at::text, closed_at::text, close_reason, channel_code, channel_external_id,
                created_at::text, updated_at::text
         FROM support_conversations WHERE id = $1::uuid AND platform_user_id = $2::uuid`,
        [conversationId, platformUserId]
      );
      if (r.rows.length === 0) return null;
      const row = r.rows[0]!;
      return {
        id: row.id,
        integratorConversationId: row.integrator_conversation_id,
        platformUserId: row.platform_user_id,
        integratorUserId: row.integrator_user_id,
        source: row.source,
        adminScope: row.admin_scope,
        status: row.status,
        openedAt: row.opened_at,
        lastMessageAt: row.last_message_at,
        closedAt: row.closed_at,
        closeReason: row.close_reason,
        channelCode: row.channel_code,
        channelExternalId: row.channel_external_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    async markInboundReadForUser(conversationId, platformUserId) {
      const pool = getPool();
      const ok = await pool.query(
        `SELECT 1 FROM support_conversations WHERE id = $1::uuid AND platform_user_id = $2::uuid`,
        [conversationId, platformUserId]
      );
      if (ok.rows.length === 0) return;
      await pool.query(
        `UPDATE support_conversation_messages SET read_at = COALESCE(read_at, now())
         WHERE conversation_id = $1::uuid AND sender_role <> 'user' AND read_at IS NULL`,
        [conversationId]
      );
    },

    async markUserMessagesReadByAdmin(conversationId) {
      const pool = getPool();
      await pool.query(
        `UPDATE support_conversation_messages SET read_at = COALESCE(read_at, now())
         WHERE conversation_id = $1::uuid AND sender_role = 'user' AND read_at IS NULL`,
        [conversationId]
      );
    },

    async countUnreadForUser(platformUserId) {
      const pool = getPool();
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM support_conversation_messages m
         JOIN support_conversations c ON c.id = m.conversation_id
         WHERE c.platform_user_id = $1::uuid AND m.sender_role <> 'user' AND m.read_at IS NULL`,
        [platformUserId]
      );
      return parseInt(r.rows[0]?.c ?? "0", 10);
    },

    async countUnreadUserMessagesForAdmin() {
      const pool = getPool();
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM support_conversation_messages m
         WHERE m.sender_role = 'user' AND m.read_at IS NULL`
      );
      return parseInt(r.rows[0]?.c ?? "0", 10);
    },
  };
}
