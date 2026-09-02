/**
 * Support communication history repo: projection/backfill writes and shadow reads.
 * Idempotent by integrator_*_id; platform_user_id resolved from platform_users when present.
 *
 * Domain SQL as typed Drizzle fragments on `execute(sql)`; no direct `pool.query`.
 */

import { sql } from 'drizzle-orm';
import { getPool } from '@/infra/db/client';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { getWebappSqlDb, runWebappNamedRoot, runWebappSql } from '@/infra/db/runWebappSql';
import { FIO, USER_IDENTITY_FIO_JOIN } from '@/infra/repos/userIdentityFioSql';
import { formatDoctorFio } from '@/shared/lib/fio';
import { withPoolTransaction } from '@/infra/db/withClient';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
} from '@bersoncare/db-principal';
import { mergeLegacySupportConversationsForPlatformUser as runMergeLegacySupportConversations } from '@/infra/repos/mergeLegacySupportConversations';
import {
  webappOrganizationConversationId,
  webappPlatformConversationId,
} from '@/modules/messaging/supportConversationIds';
import type {
  AdminConversationListRow,
  SupportCommunicationPort,
  SupportConversationMessageRow,
  SupportConversationRelayInfo,
  SupportConversationRow,
  SupportQuestionMessageRow,
  SupportQuestionRow,
} from '@/modules/messaging/ports';

export type {
  AdminConversationListRow,
  SupportCommunicationPort,
  SupportConversationMessageRow,
  SupportConversationRelayInfo,
  SupportConversationRow,
  SupportQuestionMessageRow,
  SupportQuestionRow,
} from '@/modules/messaging/ports';

function mapMessageRow(m: Record<string, unknown>): SupportConversationMessageRow {
  return {
    id: String(m.id),
    organizationId: m.organization_id != null ? String(m.organization_id) : null,
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
  organization_id: string | null;
  integrator_conversation_id: string;
  platform_user_id: string | null;
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
    organizationId: row.organization_id,
    integratorConversationId: row.integrator_conversation_id,
    platformUserId: row.platform_user_id,
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

function currentWriteOrganizationId(...fallbacks: (string | null | undefined)[]): string | null {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  const fallbackOrganizationIds = fallbacks.filter((x): x is string => Boolean(x));
  const fallbackOrganizationId = fallbackOrganizationIds[0] ?? null;
  const hasFallbackMismatch = fallbackOrganizationIds.some((id) => id !== fallbackOrganizationId);
  if (
    hasFallbackMismatch ||
    (principalOrganizationId &&
      fallbackOrganizationId &&
      principalOrganizationId !== fallbackOrganizationId)
  ) {
    throw new Error('organization_principal_mismatch');
  }
  return principalOrganizationId ?? fallbackOrganizationId;
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

type AdminConversationListDbRow = {
  conversation_id: string;
  integrator_conversation_id: string;
  source: string;
  admin_scope: string;
  status: string;
  opened_at: string;
  last_message_at: string;
  closed_at: string | null;
  close_reason: string | null;
  platform_user_id: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  patronymic: string | null;
  phone_normalized: string | null;
  channel_external_id: string | null;
  last_message_text: string | null;
  last_sender_role: string | null;
  unread_from_user_count: number;
};

function mapAdminConversationListRow(row: AdminConversationListDbRow): AdminConversationListRow {
  return {
    conversationId: String(row.conversation_id),
    integratorConversationId: row.integrator_conversation_id,
    source: row.source,
    adminScope: row.admin_scope,
    status: row.status,
    openedAt: row.opened_at,
    lastMessageAt: row.last_message_at,
    closedAt: row.closed_at,
    closeReason: row.close_reason,
    platformUserId: row.platform_user_id,
    displayName: formatDoctorFio(
      { lastName: row.last_name, firstName: row.first_name, patronymic: row.patronymic },
      row.display_name ?? '',
    ),
    firstName: row.first_name,
    lastName: row.last_name,
    phoneNormalized: row.phone_normalized,
    channelExternalId: row.channel_external_id,
    lastMessageText: row.last_message_text,
    lastSenderRole: row.last_sender_role,
    unreadFromUserCount: Number(row.unread_from_user_count ?? 0),
  };
}

async function resolvePlatformUserId(channel?: {
  channelCode: string | null;
  channelExternalId: string | null;
}): Promise<string | null> {
  const channelCode = channel?.channelCode?.trim() ?? '';
  const channelExternalId = channel?.channelExternalId?.trim() ?? '';
  if (!channelCode || !channelExternalId) return null;

  const binding = await runWebappSql<{ user_id: string }>(
    getWebappSqlDb(),
    sql`SELECT ucb.user_id
     FROM user_channel_bindings ucb
     INNER JOIN platform_users pu ON pu.id = ucb.user_id
     WHERE ucb.channel_code = ${channelCode}
       AND ucb.external_id = ${channelExternalId}
       AND pu.merged_into_id IS NULL
     LIMIT 1`,
  );
  return binding.rows[0]?.user_id ?? null;
}

export function createPgSupportCommunicationPort(): SupportCommunicationPort {
  return {
    async upsertConversationFromProjection(params) {
      const platformUserId = await resolvePlatformUserId({
        channelCode: params.channelCode ?? null,
        channelExternalId: params.channelExternalId ?? null,
      });
      const r = await runWebappSql<{ id: string }>(
        getWebappSqlDb(),
        sql`INSERT INTO support_conversations (
          integrator_conversation_id, platform_user_id, source, admin_scope, status,
          opened_at, last_message_at, closed_at, close_reason, channel_code, channel_external_id
        ) VALUES (${params.integratorConversationId}, ${platformUserId}, ${params.source}, ${params.adminScope}, ${params.status}, ${params.openedAt}::timestamptz, ${params.lastMessageAt}::timestamptz, ${params.closedAt ?? null}::timestamptz, ${params.closeReason ?? null}, ${params.channelCode ?? null}, ${params.channelExternalId ?? null})
        ON CONFLICT (integrator_conversation_id) DO UPDATE SET
          platform_user_id = COALESCE(support_conversations.platform_user_id, EXCLUDED.platform_user_id),
          status = EXCLUDED.status,
          last_message_at = EXCLUDED.last_message_at,
          closed_at = EXCLUDED.closed_at,
          close_reason = EXCLUDED.close_reason,
          updated_at = now()
        RETURNING id`,
      );
      const convId = r.rows[0]!.id;
      if (platformUserId) {
        try {
          await runMergeLegacySupportConversations(getPool(), platformUserId);
        } catch (err) {
          console.error('[support] merge legacy conversations failed', { platformUserId, err });
        }
      }
      return { id: convId };
    },

    async appendConversationMessageFromProjection(params) {
      const conv = await runWebappSql<{ id: string }>(
        getWebappSqlDb(),
        sql`SELECT id FROM support_conversations WHERE integrator_conversation_id = ${params.integratorConversationId}`,
      );
      const conversationId = conv.rows[0]?.id;
      if (!conversationId) {
        const ins = await runWebappSql<{ id: string }>(
          getWebappSqlDb(),
          sql`INSERT INTO support_conversations (
            integrator_conversation_id, source, admin_scope, status, opened_at, last_message_at
          ) VALUES (${params.integratorConversationId}, ${params.source}, '', 'open', ${params.createdAt}::timestamptz, ${params.createdAt}::timestamptz)
          ON CONFLICT (integrator_conversation_id) DO UPDATE SET last_message_at = GREATEST(support_conversations.last_message_at, ${params.createdAt}::timestamptz)
          RETURNING id`,
        );
        const cid = ins.rows[0]!.id;
        const r = await runWebappSql<{ id: string }>(
          getWebappSqlDb(),
          sql`INSERT INTO support_conversation_messages (
            integrator_message_id, conversation_id, sender_role, message_type, text, source,
            external_chat_id, external_message_id, delivery_status, created_at
          ) VALUES (${params.integratorMessageId}, ${cid}, ${params.senderRole}, ${params.messageType ?? 'text'}, ${params.text}, ${params.source}, ${params.externalChatId ?? null}, ${params.externalMessageId ?? null}, ${params.deliveryStatus ?? null}, ${params.createdAt}::timestamptz)
          ON CONFLICT (integrator_message_id) DO UPDATE SET conversation_id = EXCLUDED.conversation_id
          RETURNING id`,
        );
        return { id: r.rows[0]!.id };
      }
      const r = await runWebappSql<{ id: string }>(
        getWebappSqlDb(),
        sql`INSERT INTO support_conversation_messages (
          integrator_message_id, conversation_id, sender_role, message_type, text, source,
          external_chat_id, external_message_id, delivery_status, created_at
        ) VALUES (${params.integratorMessageId}, ${conversationId}, ${params.senderRole}, ${params.messageType ?? 'text'}, ${params.text}, ${params.source}, ${params.externalChatId ?? null}, ${params.externalMessageId ?? null}, ${params.deliveryStatus ?? null}, ${params.createdAt}::timestamptz)
        ON CONFLICT (integrator_message_id) DO UPDATE SET conversation_id = EXCLUDED.conversation_id
        RETURNING id`,
      );
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE support_conversations SET last_message_at = GREATEST(last_message_at, ${params.createdAt}::timestamptz), updated_at = now() WHERE id = ${conversationId}`,
      );
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE support_conversations sc
         SET platform_user_id = ucb.user_id,
             updated_at = now()
         FROM user_channel_bindings ucb
         INNER JOIN platform_users pu ON pu.id = ucb.user_id
         WHERE sc.id = ${conversationId}::uuid
           AND sc.platform_user_id IS NULL
           AND sc.channel_code IS NOT NULL
           AND sc.channel_external_id IS NOT NULL
           AND ucb.channel_code = sc.channel_code
           AND ucb.external_id = sc.channel_external_id
           AND pu.merged_into_id IS NULL`,
      );
      const healed = await runWebappSql<{ platform_user_id: string | null }>(
        getWebappSqlDb(),
        sql`SELECT platform_user_id FROM support_conversations WHERE id = ${conversationId}::uuid`,
      );
      const healedUserId = healed.rows[0]?.platform_user_id ?? null;
      if (healedUserId) {
        try {
          await runMergeLegacySupportConversations(getPool(), healedUserId);
        } catch (err) {
          console.error('[support] merge legacy conversations failed', {
            platformUserId: healedUserId,
            err,
          });
        }
      }
      return { id: r.rows[0]!.id };
    },

    async setConversationStatusFromProjection(params) {
      const r = await runWebappSql<{ id: string }>(
        getWebappSqlDb(),
        sql`UPDATE support_conversations SET
          status = ${params.status},
          last_message_at = COALESCE(${params.lastMessageAt ?? null}::timestamptz, last_message_at),
          closed_at = COALESCE(${params.closedAt ?? null}::timestamptz, closed_at),
          close_reason = COALESCE(${params.closeReason ?? null}, close_reason),
          updated_at = now()
        WHERE integrator_conversation_id = ${params.integratorConversationId}
        RETURNING id`,
      );
      if (r.rowCount === 0) {
        await runWebappSql(
          getWebappSqlDb(),
          sql`INSERT INTO support_conversations (
            integrator_conversation_id, source, admin_scope, status, opened_at, last_message_at, closed_at, close_reason
          ) VALUES (${params.integratorConversationId}, 'ingest', '', ${params.status}, now(), ${params.lastMessageAt ?? new Date().toISOString()}::timestamptz, ${params.closedAt ?? null}::timestamptz, ${params.closeReason ?? null})
          ON CONFLICT (integrator_conversation_id) DO UPDATE SET
            status = EXCLUDED.status,
            last_message_at = COALESCE(EXCLUDED.last_message_at, support_conversations.last_message_at),
            closed_at = COALESCE(EXCLUDED.closed_at, support_conversations.closed_at),
            close_reason = COALESCE(EXCLUDED.close_reason, support_conversations.close_reason),
            updated_at = now()`,
        );
      }
    },

    async upsertQuestionFromProjection(params) {
      let conversationId: string | null = null;
      if (params.integratorConversationId) {
        const c = await runWebappSql<{ id: string }>(
          getWebappSqlDb(),
          sql`SELECT id FROM support_conversations WHERE integrator_conversation_id = ${params.integratorConversationId}`,
        );
        conversationId = c.rows[0]?.id ?? null;
      }
      const r = await runWebappSql<{ id: string }>(
        getWebappSqlDb(),
        sql`INSERT INTO support_questions (
          integrator_question_id, conversation_id, status, created_at, answered_at
        ) VALUES (${params.integratorQuestionId}, ${conversationId}, ${params.status}, ${params.createdAt}::timestamptz, ${params.answeredAt ?? null}::timestamptz)
        ON CONFLICT (integrator_question_id) DO UPDATE SET
          conversation_id = COALESCE(EXCLUDED.conversation_id, support_questions.conversation_id),
          status = EXCLUDED.status,
          answered_at = COALESCE(EXCLUDED.answered_at, support_questions.answered_at),
          updated_at = now()
        RETURNING id`,
      );
      return { id: r.rows[0]!.id };
    },

    async appendQuestionMessageFromProjection(params) {
      const q = await runWebappSql<{ id: string }>(
        getWebappSqlDb(),
        sql`SELECT id FROM support_questions WHERE integrator_question_id = ${params.integratorQuestionId}`,
      );
      const questionId = q.rows[0]?.id;
      if (!questionId) {
        const ins = await runWebappSql<{ id: string }>(
          getWebappSqlDb(),
          sql`INSERT INTO support_questions (integrator_question_id, conversation_id, status, created_at)
           VALUES (${params.integratorQuestionId}, NULL, 'open', ${params.createdAt}::timestamptz)
           ON CONFLICT (integrator_question_id) DO NOTHING
           RETURNING id`,
        );
        const qid = ins.rows[0]?.id;
        if (!qid) {
          const sel = await runWebappSql<{ id: string }>(
            getWebappSqlDb(),
            sql`SELECT id FROM support_questions WHERE integrator_question_id = ${params.integratorQuestionId}`,
          );
          const qid2 = sel.rows[0]?.id;
          if (!qid2)
            throw new Error(`support_questions row missing for ${params.integratorQuestionId}`);
          const r = await runWebappSql<{ id: string }>(
            getWebappSqlDb(),
            sql`INSERT INTO support_question_messages (
              integrator_question_message_id, question_id, sender_role, text, created_at
            ) VALUES (${params.integratorQuestionMessageId}, ${qid2}, ${params.senderRole}, ${params.text}, ${params.createdAt}::timestamptz)
            ON CONFLICT (integrator_question_message_id) DO NOTHING
            RETURNING id`,
          );
          return { id: r.rows[0]?.id ?? '' };
        }
        const r = await runWebappSql<{ id: string }>(
          getWebappSqlDb(),
          sql`INSERT INTO support_question_messages (
            integrator_question_message_id, question_id, sender_role, text, created_at
          ) VALUES (${params.integratorQuestionMessageId}, ${qid}, ${params.senderRole}, ${params.text}, ${params.createdAt}::timestamptz)
          ON CONFLICT (integrator_question_message_id) DO NOTHING
          RETURNING id`,
        );
        return { id: r.rows[0]?.id ?? '' };
      }
      const r = await runWebappSql<{ id: string }>(
        getWebappSqlDb(),
        sql`INSERT INTO support_question_messages (
          integrator_question_message_id, question_id, sender_role, text, created_at
        ) VALUES (${params.integratorQuestionMessageId}, ${questionId}, ${params.senderRole}, ${params.text}, ${params.createdAt}::timestamptz)
        ON CONFLICT (integrator_question_message_id) DO NOTHING
        RETURNING id`,
      );
      return { id: r.rows[0]?.id ?? '' };
    },

    async listConversationsByUser(platformUserId) {
      const r = await runWebappSql<SupportConversationDbRow>(
        getWebappSqlDb(),
        sql`SELECT id, organization_id, integrator_conversation_id, platform_user_id, source, admin_scope, status,
                opened_at::text, last_message_at::text, closed_at::text, close_reason, channel_code, channel_external_id,
                created_at::text, updated_at::text
         FROM support_conversations WHERE platform_user_id = ${platformUserId} ORDER BY last_message_at DESC`,
      );
      return r.rows.map(mapConversationRow);
    },

    async getConversationWithMessages(conversationId, organizationId) {
      const conv = await runWebappSql<SupportConversationDbRow>(
        getWebappSqlDb(),
        sql`SELECT id, organization_id, integrator_conversation_id, platform_user_id, source, admin_scope, status,
                opened_at::text, last_message_at::text, closed_at::text, close_reason, channel_code, channel_external_id,
                created_at::text, updated_at::text
         FROM support_conversations
         WHERE id = ${conversationId} AND (${organizationId ?? null}::uuid IS NULL OR organization_id = ${organizationId ?? null}::uuid)`,
      );
      if (conv.rows.length === 0) return null;
      const conversation = mapConversationRow(conv.rows[0]!);
      const msg = await runWebappSql<Record<string, unknown>>(
        getWebappSqlDb(),
        sql`SELECT id, organization_id, integrator_message_id, conversation_id, sender_role, message_type, text, source,
                external_chat_id, external_message_id, delivery_status, created_at::text,
                read_at::text, delivered_at::text, media_url, media_type
         FROM support_conversation_messages
         WHERE conversation_id = ${conversationId}
           AND (${organizationId ?? null}::uuid IS NULL OR organization_id = ${organizationId ?? null}::uuid)
         ORDER BY created_at ASC`,
      );
      const messages: SupportConversationMessageRow[] = msg.rows.map((m) => mapMessageRow(m));
      return { conversation, messages };
    },

    async listQuestionsByUser(platformUserId) {
      const r = await runWebappSql<SupportQuestionDbRow>(
        getWebappSqlDb(),
        sql`SELECT q.id, q.integrator_question_id, q.conversation_id, q.status, q.created_at::text, q.answered_at::text, q.updated_at::text
         FROM support_questions q
         JOIN support_conversations c ON c.id = q.conversation_id AND c.platform_user_id = ${platformUserId}
         ORDER BY q.created_at DESC`,
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

    async listOpenConversationsForAdmin(params) {
      const limit =
        typeof params.limit === 'number' && params.limit > 0 ? Math.min(params.limit, 100) : 20;
      const source =
        typeof params.source === 'string' && params.source.trim() ? params.source.trim() : null;
      const organizationId = params?.organizationId?.trim() ?? '';
      if (!organizationId) throw new Error('organization_id_required');
      const r = await runWebappSql<AdminConversationListDbRow>(
        getWebappSqlDb(),
        sql`SELECT
          sc.id AS conversation_id,
          sc.integrator_conversation_id,
          sc.source,
          sc.admin_scope,
          sc.status,
          sc.opened_at::text,
          COALESCE(last_personal.personal_msg_at, sc.created_at)::text AS last_message_at,
          sc.closed_at::text,
          sc.close_reason,
          sc.platform_user_id,
          ${sql.raw(FIO.displayName)} AS display_name,
          ${sql.raw(FIO.firstName)} AS first_name,
          ${sql.raw(FIO.lastName)} AS last_name,
          ${sql.raw(FIO.patronymic)} AS patronymic,
          (SELECT uc.value_normalized FROM user_contacts uc
           WHERE uc.platform_user_id = pu.id AND uc.contact_kind = 'phone' AND uc.is_primary = true LIMIT 1) AS phone_normalized,
          sc.channel_external_id,
          last_personal.last_msg_text AS last_message_text,
          last_personal.last_sender_role AS last_sender_role,
          COALESCE(unread.unread_from_user_count, 0)::int AS unread_from_user_count
         FROM support_conversations sc
         LEFT JOIN platform_users pu ON pu.id = sc.platform_user_id
         ${sql.raw(USER_IDENTITY_FIO_JOIN)}
         LEFT JOIN LATERAL (
           SELECT m.text AS last_msg_text, m.sender_role AS last_sender_role, m.created_at AS personal_msg_at
           FROM support_conversation_messages m
           WHERE m.conversation_id = sc.id
             AND NOT ${sql.raw(SUPPORT_NOTIFICATION_SQL)}
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
           AND (${source}::text IS NULL OR sc.source = ${source})
           AND (${params.unreadOnly === true}::boolean = false OR COALESCE(unread.unread_from_user_count, 0) > 0)
           AND sc.organization_id = ${organizationId}::uuid
           AND (
             ${params.visibilityActor.canManageAllSpecialists}::boolean = true
             OR (
               ${params.visibilityActor.specialistId}::uuid IS NOT NULL
               AND sc.platform_user_id IS NOT NULL
               AND EXISTS (
                 SELECT 1
                 FROM patient_specialist_links psl_visibility
                 WHERE psl_visibility.organization_id = sc.organization_id
                   AND psl_visibility.patient_user_id = sc.platform_user_id
                   AND psl_visibility.specialist_id = ${params.visibilityActor.specialistId}::uuid
                   AND psl_visibility.status = 'active'
               )
             )
           )
         ORDER BY (COALESCE(unread.unread_from_user_count, 0) > 0) DESC,
                  COALESCE(last_personal.personal_msg_at, sc.created_at) DESC
         LIMIT ${limit}`,
      );
      return r.rows.map(mapAdminConversationListRow);
    },

    async ensureWebappConversationForUser(platformUserId) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        const result = await runWebappNamedRoot<{ conversation: Record<string, unknown> }>(
          getWebappSqlDb(),
          'app.ensure_current_patient_support_conversation()',
          [],
          sql`SELECT app.ensure_current_patient_support_conversation() AS conversation`,
        );
        const row = result.rows[0]?.conversation;
        if (!row || typeof row.id !== 'string') {
          throw new Error('patient_support_conversation_rejected');
        }
        return {
          id: row.id,
          organizationId: typeof row.organization_id === 'string' ? row.organization_id : null,
        };
      }
      return runDrizzleMutationTransaction(async (tx) => {
        const principalOrganizationId = currentWriteOrganizationId();
        const integratorConversationId = principalOrganizationId
          ? webappOrganizationConversationId(principalOrganizationId, platformUserId)
          : webappPlatformConversationId(platformUserId);
        const existing = await runWebappSql<{ id: string; organization_id: string | null }>(
          tx,
          principalOrganizationId
            ? sql`SELECT id, organization_id
               FROM support_conversations
               WHERE organization_id = ${principalOrganizationId}::uuid
                 AND platform_user_id = ${platformUserId}::uuid
                 AND source = 'webapp'
                 AND admin_scope = 'support'
               ORDER BY (integrator_conversation_id = ${integratorConversationId}) DESC, created_at ASC
               LIMIT 1`
            : sql`SELECT id, organization_id
               FROM support_conversations
               WHERE integrator_conversation_id = ${integratorConversationId}
               LIMIT 1`,
        );
        const existingRow = existing.rows[0];
        if (existingRow) {
          currentWriteOrganizationId(existingRow.organization_id);
          return { id: existingRow.id, organizationId: existingRow.organization_id };
        }
        const r = await runWebappSql<{ id: string }>(
          tx,
          sql`INSERT INTO support_conversations (
            organization_id, integrator_conversation_id, platform_user_id, source, admin_scope, status,
            opened_at, last_message_at
          ) VALUES (${principalOrganizationId}::uuid, ${integratorConversationId}, ${platformUserId}::uuid, 'webapp', 'support', 'open', now(), now())
          ON CONFLICT (integrator_conversation_id) DO UPDATE SET
            organization_id = COALESCE(support_conversations.organization_id, EXCLUDED.organization_id),
            platform_user_id = COALESCE(EXCLUDED.platform_user_id, support_conversations.platform_user_id),
            updated_at = now()
          RETURNING id`,
        );
        return { id: r.rows[0]!.id, organizationId: principalOrganizationId };
      });
    },

    async mergeLegacySupportConversationsForPlatformUser(platformUserId) {
      // Organization-scoped threads are already canonical inside their tenant. The legacy merge
      // targets the pre-SaaS global `webapp:platform:*` thread and must never absorb another
      // organization's conversation for a shared patient.
      if (getCurrentDbPrincipalOrganizationId()) {
        return { mergedConversationCount: 0, movedMessageCount: 0 };
      }
      const pool = getPool();
      return withPoolTransaction(pool, (client) =>
        runMergeLegacySupportConversations(client, platformUserId),
      );
    },

    async appendWebappMessage(params) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        const args = [
          params.conversationId,
          params.integratorMessageId,
          params.text,
          params.source,
          params.createdAt,
          params.mediaUrl ?? null,
          params.mediaType ?? null,
        ] as const;
        const result = await runWebappNamedRoot<{ message: Record<string, unknown> }>(
          getWebappSqlDb(),
          'app.append_current_patient_support_message(uuid,text,text,text,timestamp with time zone,text,text)',
          args,
          sql`SELECT app.append_current_patient_support_message(
            ${params.conversationId}::uuid,
            ${params.integratorMessageId}::text,
            ${params.text}::text,
            ${params.source}::text,
            ${params.createdAt}::timestamptz,
            ${params.mediaUrl ?? null}::text,
            ${params.mediaType ?? null}::text
          ) AS message`,
        );
        const row = result.rows[0]?.message;
        if (!row || typeof row.id !== 'string') throw new Error('patient_support_message_rejected');
        return { id: row.id, created: true };
      }
      return runDrizzleMutationTransaction(async (tx) => {
        const patientWrite = getCurrentDbPrincipal()?.kind === 'patient';
        const conversation = await runWebappSql<{
          organization_id: string | null;
          status: string;
          closed_at: string | null;
        }>(
          tx,
          sql`SELECT organization_id, status, closed_at::text
           FROM support_conversations
           WHERE id = ${params.conversationId}::uuid AND (${params.organizationId ?? null}::uuid IS NULL OR organization_id = ${params.organizationId ?? null}::uuid)
           LIMIT 1`,
        );
        const conversationRow = conversation.rows[0];
        const organizationId = currentWriteOrganizationId(
          params.organizationId ?? conversationRow?.organization_id,
        );
        if (
          patientWrite &&
          (conversationRow?.status !== 'open' || conversationRow.closed_at !== null)
        ) {
          throw new Error('patient_support_conversation_inactive');
        }
        const r = await runWebappSql<{ id: string }>(
          tx,
          sql`INSERT INTO support_conversation_messages (
            organization_id, integrator_message_id, conversation_id, sender_role, message_type, text, source,
            external_chat_id, external_message_id, delivery_status, created_at, delivered_at,
            media_url, media_type
          ) VALUES (${organizationId}::uuid, ${params.integratorMessageId}, ${params.conversationId}::uuid, ${params.senderRole}, 'text', ${params.text}, ${params.source}, ${params.externalChatId ?? null}, ${params.externalMessageId ?? null}, NULL, ${params.createdAt}::timestamptz, ${params.createdAt}::timestamptz, ${params.mediaUrl ?? null}, ${params.mediaType ?? null})
          ON CONFLICT (integrator_message_id) DO NOTHING
          RETURNING id`,
        );
        if (r.rows[0]?.id) {
          if (patientWrite) {
            const touched = await runWebappSql<{ touched: boolean }>(
              tx,
              sql`SELECT app.touch_current_patient_support_conversation_activity(${r.rows[0].id}::uuid) AS touched`,
            );
            if (touched.rows[0]?.touched !== true) {
              throw new Error('patient_support_conversation_activity_rejected');
            }
          } else {
            await runWebappSql(
              tx,
              sql`UPDATE support_conversations
               SET last_message_at = GREATEST(last_message_at, ${params.createdAt}::timestamptz),
                   updated_at = now()
               WHERE id = ${params.conversationId}::uuid AND organization_id = ${organizationId}::uuid`,
            );
          }
          return { id: r.rows[0]!.id, created: true };
        }
        const ex = await runWebappSql<{ id: string; organization_id: string | null }>(
          tx,
          sql`SELECT id, organization_id FROM support_conversation_messages WHERE integrator_message_id = ${params.integratorMessageId}`,
        );
        currentWriteOrganizationId(organizationId, ex.rows[0]?.organization_id);
        return { id: ex.rows[0]?.id ?? '', created: false };
      });
    },

    async listMessagesSince(conversationId, params) {
      const lim = Math.min(Math.max(params.limit, 1), 200);
      if (params.sinceCreatedAt) {
        const r = await runWebappSql<Record<string, unknown>>(
          getWebappSqlDb(),
          sql`SELECT id, organization_id, integrator_message_id, conversation_id, sender_role, message_type, text, source,
                  external_chat_id, external_message_id, delivery_status, created_at::text,
                  read_at::text, delivered_at::text, media_url, media_type
           FROM support_conversation_messages
           WHERE conversation_id = ${conversationId}::uuid AND created_at > ${params.sinceCreatedAt}::timestamptz
             AND (${params.organizationId ?? null}::uuid IS NULL OR organization_id = ${params.organizationId ?? null}::uuid)
           ORDER BY created_at ASC
           LIMIT ${lim}`,
        );
        return r.rows.map((m) => mapMessageRow(m));
      }
      const r = await runWebappSql<Record<string, unknown>>(
        getWebappSqlDb(),
        sql`SELECT id, organization_id, integrator_message_id, conversation_id, sender_role, message_type, text, source,
                external_chat_id, external_message_id, delivery_status, created_at::text,
                read_at::text, delivered_at::text, media_url, media_type
         FROM (
           SELECT * FROM support_conversation_messages
           WHERE conversation_id = ${conversationId}::uuid
             AND (${params.organizationId ?? null}::uuid IS NULL OR organization_id = ${params.organizationId ?? null}::uuid)
           ORDER BY created_at DESC
           LIMIT ${lim}
         ) sub
         ORDER BY created_at ASC`,
      );
      return r.rows.map((m) => mapMessageRow(m));
    },

    async conversationExists(conversationId, organizationId) {
      const r = await runWebappSql<Record<string, unknown>>(
        getWebappSqlDb(),
        sql`SELECT 1 FROM support_conversations WHERE id = ${conversationId}::uuid AND (${organizationId ?? null}::uuid IS NULL OR organization_id = ${organizationId ?? null}::uuid) LIMIT 1`,
      );
      return r.rows.length > 0;
    },

    async getConversationRelayInfo(conversationId, organizationId) {
      const r = await runWebappSql<{
        id: string;
        organization_id: string | null;
        platform_user_id: string | null;
        channel_code: string | null;
        channel_external_id: string | null;
      }>(
        getWebappSqlDb(),
        sql`SELECT id, organization_id, platform_user_id, channel_code, channel_external_id
         FROM support_conversations
         WHERE id = ${conversationId}::uuid AND (${organizationId ?? null}::uuid IS NULL OR organization_id = ${organizationId ?? null}::uuid)
         LIMIT 1`,
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organization_id,
        platformUserId: row.platform_user_id,
        channelCode: row.channel_code,
        channelExternalId: row.channel_external_id,
      };
    },

    async getConversationIfOwnedByUser(conversationId, platformUserId) {
      const r = await runWebappSql<SupportConversationDbRow>(
        getWebappSqlDb(),
        sql`SELECT id, organization_id, integrator_conversation_id, platform_user_id, source, admin_scope, status,
                opened_at::text, last_message_at::text, closed_at::text, close_reason, channel_code, channel_external_id,
                created_at::text, updated_at::text
         FROM support_conversations WHERE id = ${conversationId}::uuid AND platform_user_id = ${platformUserId}::uuid`,
      );
      if (r.rows.length === 0) return null;
      return mapConversationRow(r.rows[0]!);
    },

    /**
     * Read receipt for ONE conversation. The `conversationId` argument used to be checked for
     * ownership and then thrown away: the UPDATE ran over `conversation_id IN (every conversation
     * of this user)`, so opening a single thread silently marked every other thread — closed ones
     * included — as read and the unread badge lied for anyone with more than one conversation.
     *
     * Scope predicate (same join shape as `markInboundMessagesReadForUser` right below):
     *   - `c.id = $1` — exactly the conversation that was opened, nothing else.
     *   - `c.platform_user_id = $2` — ownership; a foreign id updates zero rows (RLS policy
     *     `saas_org_dormant_p0_8_4` is the second, authoritative wall).
     * Deliberately NOT filtered by `status` / `closed_at` / `source` / `admin_scope`: the badge this
     * clears (`countUnreadForUser`) counts inbound messages across every conversation of the user
     * regardless of those columns, so narrowing here would strand unread counts that the patient
     * has no other way to clear.
     * Message predicate is left byte-identical to `countUnreadForUser` — inbound, non-notification,
     * still unread — so the two always agree. Notification-class messages keep their own counter
     * (`countUnreadNotificationsForUser`) and their own mark-read.
     */
    async markInboundReadForUser(conversationId, platformUserId) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        await runWebappNamedRoot(
          getWebappSqlDb(),
          'app.mark_current_patient_support_conversation_read(uuid)',
          [conversationId],
          sql`SELECT app.mark_current_patient_support_conversation_read(
            ${conversationId}::uuid
          ) AS affected`,
        );
        return;
      }
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE support_conversation_messages m
         SET read_at = COALESCE(m.read_at, now())
         FROM support_conversations c
         WHERE m.conversation_id = c.id
           AND c.id = ${conversationId}::uuid
           AND c.platform_user_id = ${platformUserId}::uuid
           AND m.sender_role <> 'user'
           AND NOT ${sql.raw(SUPPORT_NOTIFICATION_SQL)}
           AND m.read_at IS NULL`,
      );
    },

    async markInboundMessagesReadForUser(platformUserId, messageIds) {
      const ids = [...new Set(messageIds.map((id) => String(id).trim()).filter(Boolean))];
      if (ids.length === 0) return;
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        await runWebappNamedRoot(
          getWebappSqlDb(),
          'app.mark_current_patient_support_messages_read(text)',
          [JSON.stringify(ids)],
          sql`SELECT app.mark_current_patient_support_messages_read(
            ${JSON.stringify(ids)}::text
          ) AS affected`,
        );
        return;
      }
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE support_conversation_messages m
         SET read_at = COALESCE(m.read_at, now())
         FROM support_conversations c
         WHERE m.conversation_id = c.id
           AND c.platform_user_id = ${platformUserId}::uuid
           AND m.sender_role <> 'user'
           AND NOT ${sql.raw(SUPPORT_NOTIFICATION_SQL)}
           AND m.read_at IS NULL
           AND m.id = ANY(${sql.param(ids)}::uuid[])`,
      );
    },

    async markNotificationMessagesReadForUser(platformUserId) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        await runWebappNamedRoot(
          getWebappSqlDb(),
          'app.mark_current_patient_support_notifications_read()',
          [],
          sql`SELECT app.mark_current_patient_support_notifications_read() AS affected`,
        );
        return;
      }
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE support_conversation_messages m
         SET read_at = COALESCE(m.read_at, now())
         FROM support_conversations c
         WHERE m.conversation_id = c.id
           AND c.platform_user_id = ${platformUserId}::uuid
           AND m.sender_role <> 'user'
           AND ${sql.raw(SUPPORT_NOTIFICATION_SQL)}
           AND m.read_at IS NULL`,
      );
    },

    async markUserMessagesReadByAdmin(conversationId, requestedOrganizationId) {
      await runDrizzleMutationTransaction(async (tx) => {
        const conversation = await runWebappSql<{ organization_id: string | null }>(
          tx,
          sql`SELECT organization_id
           FROM support_conversations
           WHERE id = ${conversationId}::uuid AND (${requestedOrganizationId ?? null}::uuid IS NULL OR organization_id = ${requestedOrganizationId ?? null}::uuid)
           LIMIT 1`,
        );
        const organizationId = currentWriteOrganizationId(
          requestedOrganizationId ?? conversation.rows[0]?.organization_id,
        );
        if (!organizationId) return;
        // Mark first, then touch the parent only if something was actually marked. These two ran in
        // the opposite order, and the conversation touch carried no guard at all while its sibling
        // correctly carried `AND read_at IS NULL` — so every open of a doctor chat rewrote the
        // conversation row even when there was nothing unread in it. The doctor panel calls this on
        // mount, after each full message reload, and again whenever the parent re-renders, which made
        // a read-only action a steady stream of no-change row versions.
        const marked = await runWebappSql(
          tx,
          sql`UPDATE support_conversation_messages
           SET read_at = COALESCE(read_at, now())
           WHERE conversation_id = ${conversationId}::uuid AND organization_id = ${organizationId}::uuid
             AND sender_role = 'user' AND read_at IS NULL`,
        );
        if ((marked.rowCount ?? 0) === 0) return;
        await runWebappSql(
          tx,
          sql`UPDATE support_conversations
           SET updated_at = now()
           WHERE id = ${conversationId}::uuid AND organization_id = ${organizationId}::uuid`,
        );
      });
    },

    async countUnreadForUser(platformUserId) {
      const r = await runWebappSql<{ c: string }>(
        getWebappSqlDb(),
        sql`SELECT COUNT(*)::text AS c FROM support_conversation_messages m
         JOIN support_conversations c ON c.id = m.conversation_id
         WHERE c.platform_user_id = ${platformUserId}::uuid
           AND m.sender_role <> 'user'
           AND NOT ${sql.raw(SUPPORT_NOTIFICATION_SQL)}
           AND m.read_at IS NULL`,
      );
      return parseInt(r.rows[0]?.c ?? '0', 10);
    },

    async countUnreadNotificationsForUser(platformUserId) {
      const r = await runWebappSql<{ c: string }>(
        getWebappSqlDb(),
        sql`SELECT COUNT(*)::text AS c
         FROM support_conversation_messages m
         JOIN support_conversations c ON c.id = m.conversation_id
         WHERE c.platform_user_id = ${platformUserId}::uuid
           AND m.sender_role <> 'user'
           AND ${sql.raw(SUPPORT_NOTIFICATION_SQL)}
           AND m.read_at IS NULL`,
      );
      return parseInt(r.rows[0]?.c ?? '0', 10);
    },

    async listUnreadInboundAdminMessagesForUser(platformUserId, conversationId) {
      const r = await runWebappSql<{ id: string; text: string }>(
        getWebappSqlDb(),
        sql`SELECT m.id::text AS id, m.text
         FROM support_conversation_messages m
         JOIN support_conversations c ON c.id = m.conversation_id
         WHERE c.platform_user_id = ${platformUserId}::uuid
           AND c.id = ${conversationId}::uuid
           AND m.sender_role <> 'user'
           AND NOT ${sql.raw(SUPPORT_NOTIFICATION_SQL)}
           AND m.read_at IS NULL
         ORDER BY m.created_at ASC, m.id ASC`,
      );
      return r.rows.map((row) => ({ id: row.id, text: row.text }));
    },

    async listNotificationMessagesForUser(platformUserId, limit) {
      const lim = Math.min(Math.max(limit, 1), 200);
      const r = await runWebappSql<Record<string, unknown>>(
        getWebappSqlDb(),
        sql`SELECT id, organization_id, integrator_message_id, conversation_id, sender_role, message_type, text, source,
                external_chat_id, external_message_id, delivery_status, created_at::text,
                read_at::text, delivered_at::text, media_url, media_type
         FROM (
           SELECT m.*
           FROM support_conversation_messages m
           JOIN support_conversations c ON c.id = m.conversation_id
           WHERE c.platform_user_id = ${platformUserId}::uuid
             AND m.sender_role <> 'user'
             AND ${sql.raw(SUPPORT_NOTIFICATION_SQL)}
           ORDER BY m.created_at DESC
           LIMIT ${lim}
         ) sub
         ORDER BY created_at ASC`,
      );
      return r.rows.map((m) => mapMessageRow(m));
    },

    async countUnreadUserMessagesForAdmin(params) {
      const organizationId = params?.organizationId?.trim() ?? '';
      if (!organizationId) throw new Error('organization_id_required');
      const r = await runWebappSql<{ c: string }>(
        getWebappSqlDb(),
        sql`SELECT COUNT(*)::text AS c
         FROM support_conversation_messages m
         JOIN support_conversations c ON c.id = m.conversation_id
         WHERE m.sender_role = 'user'
           AND m.read_at IS NULL
           AND c.status <> 'closed'
           AND c.closed_at IS NULL
           AND c.organization_id = ${organizationId}::uuid
           AND (
             ${params.visibilityActor.canManageAllSpecialists}::boolean = true
             OR (
               ${params.visibilityActor.specialistId}::uuid IS NOT NULL
               AND c.platform_user_id IS NOT NULL
               AND EXISTS (
                 SELECT 1
                 FROM patient_specialist_links psl_visibility
                 WHERE psl_visibility.organization_id = c.organization_id
                   AND psl_visibility.patient_user_id = c.platform_user_id
                   AND psl_visibility.specialist_id = ${params.visibilityActor.specialistId}::uuid
                   AND psl_visibility.status = 'active'
               )
             )
           )`,
      );
      return parseInt(r.rows[0]?.c ?? '0', 10);
    },

    async countUnreadUserMessagesForAdminByConversation(conversationId) {
      const r = await runWebappSql<{ c: string }>(
        getWebappSqlDb(),
        sql`SELECT COUNT(*)::text AS c FROM support_conversation_messages m
         WHERE m.conversation_id = ${conversationId}::uuid AND m.sender_role = 'user' AND m.read_at IS NULL`,
      );
      return parseInt(r.rows[0]?.c ?? '0', 10);
    },

    async countUnreadUserMessagesForAdminByPatient(platformUserId, organizationId) {
      if (!organizationId?.trim()) throw new Error('organization_id_required');
      const r = await runWebappSql<{ c: string }>(
        getWebappSqlDb(),
        sql`SELECT COUNT(*)::text AS c
         FROM support_conversation_messages m
         JOIN support_conversations c ON c.id = m.conversation_id
         WHERE c.platform_user_id = ${platformUserId}::uuid
           AND c.organization_id = ${organizationId}::uuid
           AND m.sender_role = 'user'
           AND m.read_at IS NULL`,
      );
      return parseInt(r.rows[0]?.c ?? '0', 10);
    },
  };
}
