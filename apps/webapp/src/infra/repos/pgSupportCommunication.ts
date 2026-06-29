/**
 * Support communication history repo: projection/backfill writes and shadow reads.
 * Idempotent by integrator_*_id; platform_user_id resolved from platform_users when present.
 *
 * Wave 3 phase 14A — domain SQL via `runWebappPgText` (Drizzle `execute(sql)`); no direct `pool.query`.
 */

import { getPool } from "@/infra/db/client";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import { mergeLegacySupportConversationsForPlatformUser as runMergeLegacySupportConversations } from "@/infra/repos/mergeLegacySupportConversations";

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
  unreadFromUserCount: number;
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
  listOpenConversationsForAdmin(params: { source?: string; limit?: number; unreadOnly?: boolean }): Promise<AdminConversationListRow[]>;
  getConversationByIntegratorId(integratorConversationId: string): Promise<AdminConversationDetailRow | null>;
  listUnansweredQuestionsForAdmin(params: { limit?: number }): Promise<AdminQuestionListRow[]>;
  getQuestionByIntegratorConversationId(integratorConversationId: string): Promise<{ id: string; answered: boolean } | null>;
  /** Один диалог webapp на пользователя: `integrator_conversation_id = webapp:platform:{uuid}`. */
  ensureWebappConversationForUser(platformUserId: string): Promise<{ id: string }>;
  /** Слияние legacy UUID-диалогов projection в канонический webapp-thread. */
  mergeLegacySupportConversationsForPlatformUser?(platformUserId: string): Promise<{
    mergedConversationCount: number;
    movedMessageCount: number;
  }>;
  appendWebappMessage(params: {
    conversationId: string;
    integratorMessageId: string;
    senderRole: string;
    text: string;
    source: string;
    createdAt: string;
    mediaUrl?: string | null;
    mediaType?: string | null;
  }): Promise<{ id: string; created: boolean }>;
  listMessagesSince(conversationId: string, params: { sinceCreatedAt?: string | null; limit: number }): Promise<SupportConversationMessageRow[]>;
  conversationExists(conversationId: string): Promise<boolean>;
  getConversationRelayInfo(conversationId: string): Promise<SupportConversationRelayInfo | null>;
  getConversationIfOwnedByUser(conversationId: string, platformUserId: string): Promise<SupportConversationRow | null>;
  markInboundReadForUser(conversationId: string, platformUserId: string): Promise<void>;
  markInboundMessagesReadForUser(
    platformUserId: string,
    messageIds: string[],
  ): Promise<void>;
  markNotificationMessagesReadForUser(platformUserId: string): Promise<void>;
  markUserMessagesReadByAdmin(conversationId: string): Promise<void>;
  countUnreadForUser(platformUserId: string): Promise<number>;
  countUnreadNotificationsForUser(platformUserId: string): Promise<number>;
  listUnreadInboundAdminMessagesForUser(
    platformUserId: string,
  ): Promise<Array<{ id: string; text: string }>>;
  listNotificationMessagesForUser(platformUserId: string, limit: number): Promise<SupportConversationMessageRow[]>;
  /** Непрочитанные от пациентов (роль `user`) в **открытых** диалогах — согласовано с `listOpenConversationsForAdmin`. */
  countUnreadUserMessagesForAdmin(): Promise<number>;
  countUnreadUserMessagesForAdminByConversation(conversationId: string): Promise<number>;
  countUnreadUserMessagesForAdminByPatient(platformUserId: string): Promise<number>;
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

const SUPPORT_NOTIFICATION_SQL = `(
  m.source IN ('doctor_broadcast', 'appointment_lifecycle')
  OR m.integrator_message_id LIKE 'broadcast:%'
  OR m.integrator_message_id LIKE 'booking-created:%'
  OR m.integrator_message_id LIKE 'booking-cancelled:%'
  OR m.integrator_message_id LIKE 'booking-rescheduled:%'
)`;

type SupportConversationDbRow = {
  id: string;
  integrator_conversation_id: string;
  platform_user_id: string | null;
  integrator_user_id: string | null;
  source: string;
  admin_scope: string;
  status: string;
  opened_at: string;
  last_message_at: string;
  closed_at: string | null;
  close_reason: string | null;
  channel_code: string | null;
  channel_external_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapConversationRow(row: SupportConversationDbRow): SupportConversationRow {
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
}

type SupportQuestionDbRow = {
  id: string;
  integrator_question_id: string;
  conversation_id: string | null;
  status: string;
  created_at: string;
  answered_at: string | null;
  updated_at: string;
};

type SupportDeliveryEventDbRow = {
  id: string;
  conversation_message_id: string | null;
  integrator_intent_event_id: string | null;
  correlation_id: string | null;
  channel_code: string;
  status: string;
  attempt: number;
  reason: string | null;
  payload_json: Record<string, unknown>;
  occurred_at: string;
};

type AdminConversationListDbRow = {
  conversation_id: string;
  integrator_conversation_id: string;
  source: string;
  integrator_user_id: string | null;
  admin_scope: string;
  status: string;
  opened_at: string;
  last_message_at: string;
  closed_at: string | null;
  close_reason: string | null;
  display_name: string;
  phone_normalized: string | null;
  channel_external_id: string | null;
  last_message_text: string | null;
  last_sender_role: string | null;
  unread_from_user_count: number;
};

type AdminConversationDetailDbRow = AdminConversationListDbRow & {
  user_chat_id: string | null;
};

type AdminQuestionListDbRow = {
  integrator_question_id: string;
  integrator_conversation_id: string | null;
  text: string;
  created_at: string;
  answered: boolean;
  answered_at: string | null;
  display_name: string;
  phone_normalized: string | null;
  channel_external_id: string | null;
};

function mapAdminConversationListRow(row: AdminConversationListDbRow): AdminConversationListRow {
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
    unreadFromUserCount: Number(row.unread_from_user_count ?? 0),
  };
}

async function resolvePlatformUserId(
  integratorUserId: string | null,
  channel?: { channelCode: string | null; channelExternalId: string | null },
): Promise<string | null> {
  if (integratorUserId != null && integratorUserId !== "") {
    const r = await runWebappPgText<{ id: string }>(
      `SELECT id FROM platform_users
       WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL
       ORDER BY created_at ASC
       LIMIT 3`,
      [integratorUserId],
    );
    if (r.rows.length === 0) {
      /* fall through to channel binding */
    } else if (r.rows.length > 1) {
      console.error("[canonical] multiple canonical rows for integrator_user_id", {
        integratorUserId,
        ids: r.rows.map((x) => x.id),
      });
    } else {
      return r.rows[0]!.id;
    }
  }

  const channelCode = channel?.channelCode?.trim() ?? "";
  const channelExternalId = channel?.channelExternalId?.trim() ?? "";
  if (!channelCode || !channelExternalId) return null;

  const binding = await runWebappPgText<{ user_id: string }>(
    `SELECT ucb.user_id
     FROM user_channel_bindings ucb
     INNER JOIN platform_users pu ON pu.id = ucb.user_id
     WHERE ucb.channel_code = $1
       AND ucb.external_id = $2
       AND pu.merged_into_id IS NULL
     LIMIT 1`,
    [channelCode, channelExternalId],
  );
  return binding.rows[0]?.user_id ?? null;
}

export function createPgSupportCommunicationPort(): SupportCommunicationPort {
  return {
    async upsertConversationFromProjection(params) {
      const platformUserId = await resolvePlatformUserId(params.integratorUserId, {
        channelCode: params.channelCode ?? null,
        channelExternalId: params.channelExternalId ?? null,
      });
      const r = await runWebappPgText<{ id: string }>(
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
      const convId = r.rows[0]!.id;
      if (platformUserId) {
        try {
          await runMergeLegacySupportConversations(getPool(), platformUserId);
        } catch (err) {
          console.error("[support] merge legacy conversations failed", { platformUserId, err });
        }
      }
      return { id: convId };
    },

    async appendConversationMessageFromProjection(params) {
      const conv = await runWebappPgText<{ id: string }>(
        "SELECT id FROM support_conversations WHERE integrator_conversation_id = $1",
        [params.integratorConversationId]
      );
      const conversationId = conv.rows[0]?.id;
      if (!conversationId) {
        const ins = await runWebappPgText<{ id: string }>(
          `INSERT INTO support_conversations (
            integrator_conversation_id, integrator_user_id, source, admin_scope, status, opened_at, last_message_at
          ) VALUES ($1, NULL, $2, '', 'open', $3::timestamptz, $3::timestamptz)
          ON CONFLICT (integrator_conversation_id) DO UPDATE SET last_message_at = GREATEST(support_conversations.last_message_at, $3::timestamptz)
          RETURNING id`,
          [params.integratorConversationId, params.source, params.createdAt]
        );
        const cid = ins.rows[0]!.id;
        const r = await runWebappPgText<{ id: string }>(
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
        return { id: r.rows[0]!.id };
      }
      const r = await runWebappPgText<{ id: string }>(
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
      await runWebappPgText(
        `UPDATE support_conversations SET last_message_at = GREATEST(last_message_at, $2::timestamptz), updated_at = now() WHERE id = $1`,
        [conversationId, params.createdAt]
      );
      await runWebappPgText(
        `UPDATE support_conversations sc
         SET platform_user_id = ucb.user_id,
             updated_at = now()
         FROM user_channel_bindings ucb
         INNER JOIN platform_users pu ON pu.id = ucb.user_id
         WHERE sc.id = $1::uuid
           AND sc.platform_user_id IS NULL
           AND sc.channel_code IS NOT NULL
           AND sc.channel_external_id IS NOT NULL
           AND ucb.channel_code = sc.channel_code
           AND ucb.external_id = sc.channel_external_id
           AND pu.merged_into_id IS NULL`,
        [conversationId],
      );
      const healed = await runWebappPgText<{ platform_user_id: string | null }>(
        `SELECT platform_user_id FROM support_conversations WHERE id = $1::uuid`,
        [conversationId],
      );
      const healedUserId = healed.rows[0]?.platform_user_id ?? null;
      if (healedUserId) {
        try {
          await runMergeLegacySupportConversations(getPool(), healedUserId);
        } catch (err) {
          console.error("[support] merge legacy conversations failed", { platformUserId: healedUserId, err });
        }
      }
      return { id: r.rows[0]!.id };
    },

    async setConversationStatusFromProjection(params) {
      const r = await runWebappPgText<{ id: string }>(
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
        await runWebappPgText(
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
      let conversationId: string | null = null;
      if (params.integratorConversationId) {
        const c = await runWebappPgText<{ id: string }>(
          "SELECT id FROM support_conversations WHERE integrator_conversation_id = $1",
          [params.integratorConversationId]
        );
        conversationId = c.rows[0]?.id ?? null;
      }
      const r = await runWebappPgText<{ id: string }>(
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
      return { id: r.rows[0]!.id };
    },

    async appendQuestionMessageFromProjection(params) {
      const q = await runWebappPgText<{ id: string }>(
        "SELECT id FROM support_questions WHERE integrator_question_id = $1",
        [params.integratorQuestionId]
      );
      const questionId = q.rows[0]?.id;
      if (!questionId) {
        const ins = await runWebappPgText<{ id: string }>(
          `INSERT INTO support_questions (integrator_question_id, conversation_id, status, created_at)
           VALUES ($1, NULL, 'open', $2::timestamptz)
           ON CONFLICT (integrator_question_id) DO NOTHING
           RETURNING id`,
          [params.integratorQuestionId, params.createdAt]
        );
        const qid = ins.rows[0]?.id;
        if (!qid) {
          const sel = await runWebappPgText<{ id: string }>(
            "SELECT id FROM support_questions WHERE integrator_question_id = $1",
            [params.integratorQuestionId]
          );
          const qid2 = sel.rows[0]?.id;
          if (!qid2) throw new Error(`support_questions row missing for ${params.integratorQuestionId}`);
          const r = await runWebappPgText<{ id: string }>(
            `INSERT INTO support_question_messages (
              integrator_question_message_id, question_id, sender_role, text, created_at
            ) VALUES ($1, $2, $3, $4, $5::timestamptz)
            ON CONFLICT (integrator_question_message_id) DO NOTHING
            RETURNING id`,
            [params.integratorQuestionMessageId, qid2, params.senderRole, params.text, params.createdAt]
          );
          return { id: r.rows[0]?.id ?? "" };
        }
        const r = await runWebappPgText<{ id: string }>(
          `INSERT INTO support_question_messages (
            integrator_question_message_id, question_id, sender_role, text, created_at
          ) VALUES ($1, $2, $3, $4, $5::timestamptz)
          ON CONFLICT (integrator_question_message_id) DO NOTHING
          RETURNING id`,
          [params.integratorQuestionMessageId, qid, params.senderRole, params.text, params.createdAt]
        );
        return { id: r.rows[0]?.id ?? "" };
      }
      const r = await runWebappPgText<{ id: string }>(
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
      const r = await runWebappPgText<{ id: string }>(
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
      const r = await runWebappPgText<SupportConversationDbRow>(
        `SELECT id, integrator_conversation_id, platform_user_id, integrator_user_id::text, source, admin_scope, status,
                opened_at::text, last_message_at::text, closed_at::text, close_reason, channel_code, channel_external_id,
                created_at::text, updated_at::text
         FROM support_conversations WHERE platform_user_id = $1 ORDER BY last_message_at DESC`,
        [platformUserId]
      );
      return r.rows.map(mapConversationRow);
    },

    async getConversationWithMessages(conversationId) {
      const conv = await runWebappPgText<SupportConversationDbRow>(
        `SELECT id, integrator_conversation_id, platform_user_id, integrator_user_id::text, source, admin_scope, status,
                opened_at::text, last_message_at::text, closed_at::text, close_reason, channel_code, channel_external_id,
                created_at::text, updated_at::text
         FROM support_conversations WHERE id = $1`,
        [conversationId]
      );
      if (conv.rows.length === 0) return null;
      const conversation = mapConversationRow(conv.rows[0]!);
      const msg = await runWebappPgText<Record<string, unknown>>(
        `SELECT id, integrator_message_id, conversation_id, sender_role, message_type, text, source,
                external_chat_id, external_message_id, delivery_status, created_at::text,
                read_at::text, delivered_at::text, media_url, media_type
         FROM support_conversation_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [conversationId]
      );
      const messages: SupportConversationMessageRow[] = msg.rows.map((m) => mapMessageRow(m));
      return { conversation, messages };
    },

    async listQuestionsByUser(platformUserId) {
      const r = await runWebappPgText<SupportQuestionDbRow>(
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
      const r = await runWebappPgText<SupportDeliveryEventDbRow>(
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
        payloadJson: row.payload_json ?? {},
        occurredAt: row.occurred_at,
      }));
    },

    async listOpenConversationsForAdmin(params) {
      const limit = typeof params.limit === "number" && params.limit > 0 ? Math.min(params.limit, 100) : 20;
      const source = typeof params.source === "string" && params.source.trim() ? params.source.trim() : null;
      const r = await runWebappPgText<AdminConversationListDbRow>(
        `SELECT
          sc.id AS conversation_id,
          sc.integrator_conversation_id,
          sc.source,
          sc.integrator_user_id::text,
          sc.admin_scope,
          sc.status,
          sc.opened_at::text,
          COALESCE(last_personal.personal_msg_at, sc.created_at)::text AS last_message_at,
          sc.closed_at::text,
          sc.close_reason,
          COALESCE(pu.display_name, '') AS display_name,
          pu.phone_normalized,
          sc.channel_external_id,
          last_personal.last_msg_text AS last_message_text,
          last_personal.last_sender_role AS last_sender_role,
          COALESCE(unread.unread_from_user_count, 0)::int AS unread_from_user_count
         FROM support_conversations sc
         LEFT JOIN platform_users pu ON pu.id = sc.platform_user_id
         LEFT JOIN LATERAL (
           SELECT m.text AS last_msg_text, m.sender_role AS last_sender_role, m.created_at AS personal_msg_at
           FROM support_conversation_messages m
           WHERE m.conversation_id = sc.id
             AND NOT ${SUPPORT_NOTIFICATION_SQL}
           ORDER BY m.created_at DESC
           LIMIT 1
         ) last_personal ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS unread_from_user_count
           FROM support_conversation_messages m
           WHERE m.conversation_id = sc.id
             AND m.sender_role = 'user'
             AND m.read_at IS NULL
         ) unread ON true
         WHERE sc.status <> 'closed'
           AND sc.closed_at IS NULL
           AND last_personal.personal_msg_at IS NOT NULL
           AND ($1::text IS NULL OR sc.source = $1)
           AND ($3::boolean = false OR COALESCE(unread.unread_from_user_count, 0) > 0)
         ORDER BY (COALESCE(unread.unread_from_user_count, 0) > 0) DESC,
                  COALESCE(last_personal.personal_msg_at, sc.created_at) DESC
         LIMIT $2`,
        [source, limit, params.unreadOnly === true]
      );
      return r.rows.map(mapAdminConversationListRow);
    },

    async getConversationByIntegratorId(integratorConversationId) {
      const r = await runWebappPgText<AdminConversationDetailDbRow>(
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
          COALESCE(unread.unread_from_user_count, 0)::int AS unread_from_user_count,
          user_chat.external_chat_id AS user_chat_id
         FROM support_conversations sc
         LEFT JOIN platform_users pu ON pu.id = sc.platform_user_id
         LEFT JOIN LATERAL (
           SELECT m.text, m.sender_role
           FROM support_conversation_messages m
           WHERE m.conversation_id = sc.id
             AND NOT ${SUPPORT_NOTIFICATION_SQL}
           ORDER BY m.created_at DESC
           LIMIT 1
         ) lm ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS unread_from_user_count
           FROM support_conversation_messages m
           WHERE m.conversation_id = sc.id
             AND m.sender_role = 'user'
             AND m.read_at IS NULL
         ) unread ON true
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
      return { ...mapAdminConversationListRow(row), userChatId: row.user_chat_id };
    },

    async listUnansweredQuestionsForAdmin(params) {
      const limit = typeof params.limit === "number" && params.limit > 0 ? Math.min(params.limit, 100) : 50;
      const r = await runWebappPgText<AdminQuestionListDbRow>(
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
      const r = await runWebappPgText<{ integrator_question_id: string; status: string }>(
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
      const integratorConversationId = `webapp:platform:${platformUserId}`;
      const r = await runWebappPgText<{ id: string }>(
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

    async mergeLegacySupportConversationsForPlatformUser(platformUserId) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await runMergeLegacySupportConversations(client, platformUserId);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },

    async appendWebappMessage(params) {
      const r = await runWebappPgText<{ id: string }>(
        `INSERT INTO support_conversation_messages (
          integrator_message_id, conversation_id, sender_role, message_type, text, source,
          external_chat_id, external_message_id, delivery_status, created_at, delivered_at,
          media_url, media_type
        ) VALUES ($1, $2::uuid, $3, 'text', $4, $5, NULL, NULL, NULL, $6::timestamptz, $6::timestamptz, $7, $8)
        ON CONFLICT (integrator_message_id) DO NOTHING
        RETURNING id`,
        [
          params.integratorMessageId,
          params.conversationId,
          params.senderRole,
          params.text,
          params.source,
          params.createdAt,
          params.mediaUrl ?? null,
          params.mediaType ?? null,
        ]
      );
      if (r.rows[0]?.id) {
        await runWebappPgText(
          `UPDATE support_conversations SET last_message_at = GREATEST(last_message_at, $2::timestamptz), updated_at = now() WHERE id = $1::uuid`,
          [params.conversationId, params.createdAt]
        );
        return { id: r.rows[0]!.id, created: true };
      }
      const ex = await runWebappPgText<{ id: string }>(
        "SELECT id FROM support_conversation_messages WHERE integrator_message_id = $1",
        [params.integratorMessageId]
      );
      return { id: ex.rows[0]?.id ?? "", created: false };
    },

    async listMessagesSince(conversationId, params) {
      const lim = Math.min(Math.max(params.limit, 1), 200);
      if (params.sinceCreatedAt) {
        const r = await runWebappPgText<Record<string, unknown>>(
          `SELECT id, integrator_message_id, conversation_id, sender_role, message_type, text, source,
                  external_chat_id, external_message_id, delivery_status, created_at::text,
                  read_at::text, delivered_at::text, media_url, media_type
           FROM support_conversation_messages
           WHERE conversation_id = $1::uuid AND created_at > $2::timestamptz
           ORDER BY created_at ASC
           LIMIT $3`,
          [conversationId, params.sinceCreatedAt, lim]
        );
        return r.rows.map((m) => mapMessageRow(m));
      }
      const r = await runWebappPgText<Record<string, unknown>>(
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
      return r.rows.map((m) => mapMessageRow(m));
    },

    async conversationExists(conversationId) {
      const r = await runWebappPgText<Record<string, unknown>>(
        "SELECT 1 FROM support_conversations WHERE id = $1::uuid LIMIT 1",
        [conversationId],
      );
      return r.rows.length > 0;
    },

    async getConversationRelayInfo(conversationId) {
      const r = await runWebappPgText<{
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
      const r = await runWebappPgText<SupportConversationDbRow>(
        `SELECT id, integrator_conversation_id, platform_user_id, integrator_user_id::text, source, admin_scope, status,
                opened_at::text, last_message_at::text, closed_at::text, close_reason, channel_code, channel_external_id,
                created_at::text, updated_at::text
         FROM support_conversations WHERE id = $1::uuid AND platform_user_id = $2::uuid`,
        [conversationId, platformUserId]
      );
      if (r.rows.length === 0) return null;
      return mapConversationRow(r.rows[0]!);
    },

    async markInboundReadForUser(conversationId, platformUserId) {
      const ok = await runWebappPgText<Record<string, unknown>>(
        `SELECT 1 FROM support_conversations WHERE id = $1::uuid AND platform_user_id = $2::uuid`,
        [conversationId, platformUserId]
      );
      if (ok.rows.length === 0) return;
      await runWebappPgText(
        `UPDATE support_conversation_messages m
         SET read_at = COALESCE(m.read_at, now())
         WHERE conversation_id IN (
           SELECT id FROM support_conversations WHERE platform_user_id = $1::uuid
         )
         AND m.sender_role <> 'user'
         AND NOT ${SUPPORT_NOTIFICATION_SQL}
         AND m.read_at IS NULL`,
        [platformUserId]
      );
    },

    async markInboundMessagesReadForUser(platformUserId, messageIds) {
      const ids = [...new Set(messageIds.map((id) => String(id).trim()).filter(Boolean))];
      if (ids.length === 0) return;
      await runWebappPgText(
        `UPDATE support_conversation_messages m
         SET read_at = COALESCE(m.read_at, now())
         FROM support_conversations c
         WHERE m.conversation_id = c.id
           AND c.platform_user_id = $1::uuid
           AND m.sender_role <> 'user'
           AND NOT ${SUPPORT_NOTIFICATION_SQL}
           AND m.read_at IS NULL
           AND m.id = ANY($2::uuid[])`,
        [platformUserId, ids],
      );
    },

    async markNotificationMessagesReadForUser(platformUserId) {
      await runWebappPgText(
        `UPDATE support_conversation_messages m
         SET read_at = COALESCE(m.read_at, now())
         FROM support_conversations c
         WHERE m.conversation_id = c.id
           AND c.platform_user_id = $1::uuid
           AND m.sender_role <> 'user'
           AND ${SUPPORT_NOTIFICATION_SQL}
           AND m.read_at IS NULL`,
        [platformUserId],
      );
    },

    async markUserMessagesReadByAdmin(conversationId) {
      await runWebappPgText(
        `UPDATE support_conversation_messages SET read_at = COALESCE(read_at, now())
         WHERE conversation_id = $1::uuid AND sender_role = 'user' AND read_at IS NULL`,
        [conversationId]
      );
    },

    async countUnreadForUser(platformUserId) {
      const r = await runWebappPgText<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM support_conversation_messages m
         JOIN support_conversations c ON c.id = m.conversation_id
         WHERE c.platform_user_id = $1::uuid
           AND m.sender_role <> 'user'
           AND NOT ${SUPPORT_NOTIFICATION_SQL}
           AND m.read_at IS NULL`,
        [platformUserId]
      );
      return parseInt(r.rows[0]?.c ?? "0", 10);
    },

    async countUnreadNotificationsForUser(platformUserId) {
      const r = await runWebappPgText<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM support_conversation_messages m
         JOIN support_conversations c ON c.id = m.conversation_id
         WHERE c.platform_user_id = $1::uuid
           AND m.sender_role <> 'user'
           AND ${SUPPORT_NOTIFICATION_SQL}
           AND m.read_at IS NULL`,
        [platformUserId],
      );
      return parseInt(r.rows[0]?.c ?? "0", 10);
    },

    async listUnreadInboundAdminMessagesForUser(platformUserId) {
      const r = await runWebappPgText<{ id: string; text: string }>(
        `SELECT m.id::text AS id, m.text
         FROM support_conversation_messages m
         JOIN support_conversations c ON c.id = m.conversation_id
         WHERE c.platform_user_id = $1::uuid
           AND m.sender_role <> 'user'
           AND NOT ${SUPPORT_NOTIFICATION_SQL}
           AND m.read_at IS NULL
         ORDER BY m.created_at ASC, m.id ASC`,
        [platformUserId],
      );
      return r.rows.map((row) => ({ id: row.id, text: row.text }));
    },

    async listNotificationMessagesForUser(platformUserId, limit) {
      const lim = Math.min(Math.max(limit, 1), 200);
      const r = await runWebappPgText<Record<string, unknown>>(
        `SELECT id, integrator_message_id, conversation_id, sender_role, message_type, text, source,
                external_chat_id, external_message_id, delivery_status, created_at::text,
                read_at::text, delivered_at::text, media_url, media_type
         FROM (
           SELECT m.*
           FROM support_conversation_messages m
           JOIN support_conversations c ON c.id = m.conversation_id
           WHERE c.platform_user_id = $1::uuid
             AND m.sender_role <> 'user'
             AND ${SUPPORT_NOTIFICATION_SQL}
           ORDER BY m.created_at DESC
           LIMIT $2
         ) sub
         ORDER BY created_at ASC`,
        [platformUserId, lim],
      );
      return r.rows.map((m) => mapMessageRow(m));
    },

    async countUnreadUserMessagesForAdmin() {
      const r = await runWebappPgText<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM support_conversation_messages m
         JOIN support_conversations c ON c.id = m.conversation_id
         WHERE m.sender_role = 'user'
           AND m.read_at IS NULL
           AND c.status <> 'closed'
           AND c.closed_at IS NULL`
      );
      return parseInt(r.rows[0]?.c ?? "0", 10);
    },

    async countUnreadUserMessagesForAdminByConversation(conversationId) {
      const r = await runWebappPgText<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM support_conversation_messages m
         WHERE m.conversation_id = $1::uuid AND m.sender_role = 'user' AND m.read_at IS NULL`,
        [conversationId]
      );
      return parseInt(r.rows[0]?.c ?? "0", 10);
    },

    async countUnreadUserMessagesForAdminByPatient(platformUserId) {
      const r = await runWebappPgText<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM support_conversation_messages m
         JOIN support_conversations c ON c.id = m.conversation_id
         WHERE c.platform_user_id = $1::uuid
           AND m.sender_role = 'user'
           AND m.read_at IS NULL`,
        [platformUserId]
      );
      return parseInt(r.rows[0]?.c ?? "0", 10);
    },
  };
}
