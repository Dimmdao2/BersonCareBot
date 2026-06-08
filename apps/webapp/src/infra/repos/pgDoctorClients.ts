/**
 * Wave 3 phase 13C — domain SQL via `runWebappPgText`; canonical helpers still accept `getPool()`.
 */
import { getPool } from "@/infra/db/client";
import { toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import { resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
import type { ChannelBindings } from "@/shared/types/session";
import type {
  ClientIdentity,
  ClientListItem,
  DoctorClientsFilters,
  DoctorClientsPort,
  DoctorDashboardPatientMetrics,
} from "@/modules/doctor-clients/ports";
import {
  accumulateClientContactBreakdown,
  emptyClientContactBreakdown,
} from "@/modules/doctor-clients/clientContactSegments";
import { matchesDoctorClientSearch } from "@/modules/doctor-clients/clientSearchMatch";
import {
  getClientSupportProfile,
  listOnSupportPatientUserIds,
  upsertClientSupportProfile,
} from "@/infra/repos/pgDoctorPatientSupport";
import { appendSqlExcludeUserIds } from "@/modules/analytics/analyticsAudience";
import {
  sqlActiveMaxBinding,
  sqlActiveTelegramBinding,
  sqlMessengerBotBlocked,
} from "@/modules/doctor-clients/activeMessengerBindingSql";

function rowToBindings(
  rows: { channel_code: string; external_id: string; bot_blocked_at?: string | null }[],
): ChannelBindings {
  const bindings: ChannelBindings = {};
  for (const row of rows) {
    if (row.channel_code === "telegram") {
      bindings.telegramId = row.external_id;
      if (row.bot_blocked_at) bindings.telegramBotBlocked = true;
      continue;
    }
    if (row.channel_code === "max") {
      bindings.maxId = row.external_id;
      if (row.bot_blocked_at) bindings.maxBotBlocked = true;
      continue;
    }
    if (row.channel_code === "vk") {
      bindings.vkId = row.external_id;
    }
  }
  return bindings;
}

/** Exported for join semantics tests; keep in sync with `appointment_records` ↔ `platform_users` attribution rules. */
export function appointmentRecordsJoinPu(puAlias: string, arAlias: string): string {
  const arAt = `COALESCE(${arAlias}.record_at, ${arAlias}.created_at)`;
  return `(
      ${arAlias}.platform_user_id = ${puAlias}.id
      OR (
        ${arAlias}.platform_user_id IS NULL
        AND ${arAlias}.phone_normalized IS NOT NULL
        AND ${puAlias}.phone_normalized IS NOT NULL
        AND ${puAlias}.phone_normalized = ${arAlias}.phone_normalized
        AND NOT EXISTS (
          SELECT 1 FROM user_phone_history h_other_claim
          WHERE h_other_claim.phone_normalized = ${arAlias}.phone_normalized
            AND h_other_claim.platform_user_id <> ${puAlias}.id
            AND h_other_claim.valid_from <= ${arAt}
            AND (h_other_claim.valid_to IS NULL OR h_other_claim.valid_to > ${arAt})
        )
      )
      OR (
        ${arAlias}.platform_user_id IS NULL
        AND ${arAlias}.phone_normalized IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM user_phone_history h
          WHERE h.platform_user_id = ${puAlias}.id
            AND h.phone_normalized = ${arAlias}.phone_normalized
            AND h.valid_from <= ${arAt}
            AND (h.valid_to IS NULL OR h.valid_to > ${arAt})
        )
      )
    )`;
}

export function createPgDoctorClientsPort(): DoctorClientsPort {
  return {
    async listClients(
      filters: DoctorClientsFilters,
      audience?: { excludedUserIds?: string[] },
    ): Promise<ClientListItem[]> {
      const excluded = audience?.excludedUserIds ?? [];
      const archivedClause =
        filters.archivedOnly === true
          ? `COALESCE(is_archived, false) = true`
          : `COALESCE(is_archived, false) = false`;
      const listBase = `SELECT id, display_name, phone_normalized, created_at, email, email_verified_at
         FROM platform_users pu
         WHERE pu.role = 'client' AND pu.merged_into_id IS NULL AND ${archivedClause}`;
      const listQ = appendSqlExcludeUserIds(listBase, "pu.id", excluded, []);
      const clientRows = await runWebappPgText<{
        id: string;
        display_name: string | null;
        phone_normalized: string | null;
        created_at: string;
        email: string | null;
        email_verified_at: string | null;
      }>(
        `${listQ.sql}
         ORDER BY display_name, id`,
        listQ.params,
      );
      if (clientRows.rows.length === 0) return [];

      const userIds = clientRows.rows.map((r) => r.id);
      const bindingsRows = await runWebappPgText(
        `SELECT user_id, channel_code, external_id, bot_blocked_at FROM user_channel_bindings WHERE user_id = ANY($1::uuid[])`,
        [userIds]
      );
      const bindingsByUser = new Map<string | number, { channel_code: string; external_id: string }[]>();
      for (const row of bindingsRows.rows as { user_id: string; channel_code: string; external_id: string }[]) {
        const list = bindingsByUser.get(row.user_id) ?? [];
        list.push({ channel_code: row.channel_code, external_id: row.external_id });
        bindingsByUser.set(row.user_id, list);
      }

      const [
        appointmentAggRows,
        supportConversationRows,
        activeProgramPatients,
        onSupportIds,
        unreadExerciseCommentRows,
        membershipRows,
      ] = await Promise.all([
        runWebappPgText<{
            user_id: string;
            history_count: number;
            active_count: number;
            cancellation_count_30d: number;
            reschedule_count_30d: number;
            visited_month_count: number;
          }>(
            `SELECT
               pu.id::text AS user_id,
               COUNT(ar.id) FILTER (
                 WHERE ar.deleted_at IS NULL
                   AND ar.status IN ('created', 'updated')
               )::int AS history_count,
               COUNT(*) FILTER (
                 WHERE ar.deleted_at IS NULL
                   AND ar.status IN ('created', 'updated')
                   AND ar.record_at IS NOT NULL
                   AND ar.record_at >= NOW()
               )::int AS active_count,
               COUNT(*) FILTER (
                 WHERE ar.deleted_at IS NULL
                   AND ar.status = 'canceled'
                   AND ar.last_event NOT IN ('event-remove-record', 'event-delete-record')
                   AND ar.updated_at >= NOW() - INTERVAL '30 days'
               )::int AS cancellation_count_30d,
               COUNT(*) FILTER (
                 WHERE ar.deleted_at IS NULL
                   AND ar.status = 'updated'
                   AND ar.updated_at >= NOW() - INTERVAL '30 days'
               )::int AS reschedule_count_30d,
               COUNT(*) FILTER (
                 WHERE ar.deleted_at IS NULL
                   AND ar.record_at IS NOT NULL
                   AND ar.record_at >= date_trunc('month', NOW())
                   AND ar.record_at < date_trunc('month', NOW()) + interval '1 month'
                   AND ar.record_at < NOW()
                   AND ar.status IN ('created', 'updated')
               )::int AS visited_month_count
             FROM platform_users pu
             LEFT JOIN appointment_records ar ON ${appointmentRecordsJoinPu("pu", "ar")}
             WHERE pu.id = ANY($1::uuid[])
             GROUP BY pu.id`,
            [userIds],
          ),
          runWebappPgText<{
            user_id: string;
            conversation_count: number;
            unread_count: number;
          }>(
            `SELECT
               sc.platform_user_id::text AS user_id,
               COUNT(DISTINCT sc.id)::int AS conversation_count,
               COUNT(m.id) FILTER (
                 WHERE m.sender_role = 'user'
                   AND m.read_at IS NULL
               )::int AS unread_count
             FROM support_conversations sc
             LEFT JOIN support_conversation_messages m ON m.conversation_id = sc.id
             WHERE sc.platform_user_id = ANY($1::uuid[])
             GROUP BY sc.platform_user_id`,
            [userIds],
          ),
          runWebappPgText<{ patient_user_id: string; instance_id: string }>(
            `SELECT DISTINCT ON (patient_user_id)
               patient_user_id,
               id AS instance_id
             FROM treatment_program_instances
             WHERE status = 'active' AND assignment_source = 'doctor'
             ORDER BY patient_user_id, updated_at DESC NULLS LAST`,
          ),
          listOnSupportPatientUserIds(),
          filters.viewerUserId
            ? runWebappPgText<{ patient_user_id: string; unread_comments_count: number }>(
                `WITH active_items AS (
                   SELECT
                     tpi.patient_user_id,
                     tpsi.id AS stage_item_id
                   FROM treatment_program_instances tpi
                   INNER JOIN treatment_program_instance_stages tps ON tps.instance_id = tpi.id
                   INNER JOIN treatment_program_instance_stage_items tpsi ON tpsi.stage_id = tps.id
                   WHERE tpi.status = 'active'
                     AND tpi.assignment_source = 'doctor'
                     AND tpi.patient_user_id = ANY($1::uuid[])
                     AND tpsi.status = 'active'
                     AND tpsi.item_type = 'exercise'
                 ),
                 latest_by_item AS (
                   SELECT DISTINCT ON (m.instance_stage_item_id)
                     m.instance_stage_item_id,
                     m.created_at,
                     m.sender_role,
                     m.media_file_id
                   FROM program_item_discussion_messages m
                   INNER JOIN active_items ai ON ai.stage_item_id = m.instance_stage_item_id
                   ORDER BY m.instance_stage_item_id, m.created_at DESC, m.id DESC
                 )
                 SELECT
                   ai.patient_user_id::text AS patient_user_id,
                   COUNT(*) FILTER (
                     WHERE latest_by_item.sender_role = 'patient'
                       AND latest_by_item.media_file_id IS NULL
                       AND (r.last_read_at IS NULL OR latest_by_item.created_at > r.last_read_at)
                   )::int AS unread_comments_count
                 FROM active_items ai
                 INNER JOIN latest_by_item ON latest_by_item.instance_stage_item_id = ai.stage_item_id
                 LEFT JOIN program_item_discussion_reads r
                   ON r.instance_stage_item_id = ai.stage_item_id
                  AND r.patient_user_id = $2::uuid
                 GROUP BY ai.patient_user_id`,
                [userIds, filters.viewerUserId],
              )
            : Promise.resolve({ rows: [] as { patient_user_id: string; unread_comments_count: number }[] }),
          runWebappPgText<{ user_id: string; memberships_count: number }>(
            `SELECT
               pp.platform_user_id::text AS user_id,
               COUNT(*) FILTER (
                 WHERE pp.status IN ('active', 'awaiting_payment')
               )::int AS memberships_count
             FROM be_patient_packages pp
             WHERE pp.platform_user_id = ANY($1::uuid[])
             GROUP BY pp.platform_user_id`,
            [userIds],
          ),
        ]);

      const appointmentAggByUserId = new Map(
        appointmentAggRows.rows.map((row) => [
          row.user_id,
          {
            hasHistory: Number(row.history_count ?? 0) > 0,
            activeCount: Number(row.active_count ?? 0),
            cancellationCount30d: Number(row.cancellation_count_30d ?? 0),
            rescheduleCount30d: Number(row.reschedule_count_30d ?? 0),
            visitedThisCalendarMonth: Number(row.visited_month_count ?? 0) > 0,
          },
        ]),
      );
      const supportConversationByUserId = new Map(
        supportConversationRows.rows.map((row) => [
          row.user_id,
          {
            hasConversation: Number(row.conversation_count ?? 0) > 0,
            unreadCount: Number(row.unread_count ?? 0),
          },
        ]),
      );
      const activeProgramInstanceByPatient = new Map<string, string>(
        activeProgramPatients.rows.map((row) => [row.patient_user_id, row.instance_id]),
      );
      const unreadExerciseCommentsByPatientId = new Map<string, number>(
        unreadExerciseCommentRows.rows.map((row) => [row.patient_user_id, Number(row.unread_comments_count ?? 0)]),
      );
      const membershipsByPatientId = new Map<string, number>(
        membershipRows.rows.map((row) => [row.user_id, Number(row.memberships_count ?? 0)]),
      );

      let list: ClientListItem[] = clientRows.rows.map((r) => {
          const bindings = rowToBindings(bindingsByUser.get(r.id) ?? []);
          const phone = r.phone_normalized;
          const appointmentAgg = appointmentAggByUserId.get(r.id);
          const supportConversation = supportConversationByUserId.get(r.id);
          const activeAppointmentsCount = appointmentAgg?.activeCount ?? 0;
          const activeInstanceId = activeProgramInstanceByPatient.get(r.id) ?? null;
          const email = r.email?.trim() ?? "";
          return {
            userId: r.id,
            displayName: r.display_name ?? "",
            phone,
            bindings,
            hasEmail: Boolean(email) || Boolean(r.email_verified_at),
            hasApp: true,
            nextAppointmentLabel: activeAppointmentsCount > 0 ? "Есть запись" : null,
            hasAppointmentHistory: appointmentAgg?.hasHistory ?? false,
            activeAppointmentsCount,
            activeTreatmentProgram: activeInstanceId != null,
            activeTreatmentProgramInstanceId: activeInstanceId,
            cancellationCount30d: appointmentAgg?.cancellationCount30d ?? 0,
            rescheduleCount30d: appointmentAgg?.rescheduleCount30d ?? 0,
            visitedThisCalendarMonth: appointmentAgg?.visitedThisCalendarMonth ?? false,
            hasConversation: supportConversation?.hasConversation ?? false,
            unreadMessagesCount: supportConversation?.unreadCount ?? 0,
            unreadExerciseCommentsCount: unreadExerciseCommentsByPatientId.get(r.id) ?? 0,
            isOnSupport: onSupportIds.has(r.id),
            hasMemberships: (membershipsByPatientId.get(r.id) ?? 0) > 0,
          };
        });

      if (filters.search?.trim()) {
        const s = filters.search.trim();
        list = list.filter((item) => matchesDoctorClientSearch(item, s));
      }
      if (filters.hasTelegram === true) {
        list = list.filter((item) => Boolean(item.bindings.telegramId?.trim()));
      }
      if (filters.hasMax === true) {
        list = list.filter((item) => Boolean(item.bindings.maxId?.trim()));
      }
      if (filters.hasUpcomingAppointment === true) {
        list = list.filter((item) => (item.activeAppointmentsCount ?? 0) > 0);
      }
      if (filters.hasActiveTreatmentProgram === true) {
        list = list.filter((item) => item.activeTreatmentProgram);
      }
      if (filters.onlyWithAppointmentRecords === true && !filters.archivedOnly) {
        list = list.filter((item) => item.hasAppointmentHistory === true);
      }
      if (filters.visitedThisCalendarMonth === true && !filters.archivedOnly) {
        list = list.filter((item) => item.visitedThisCalendarMonth === true);
      }
      if (filters.supportStatus === "on") {
        list = list.filter((item) => item.isOnSupport === true);
      }
      if (filters.supportStatus === "programWithoutSupport") {
        list = list.filter(
          (item) => item.activeTreatmentProgram && item.isOnSupport !== true,
        );
      }
      return list;
    },

    async getDashboardPatientMetrics(audience?: {
      excludedUserIds?: string[];
    }): Promise<DoctorDashboardPatientMetrics> {
      const excluded = audience?.excludedUserIds ?? [];
      const totalBase = `SELECT COUNT(*)::text AS c FROM platform_users pu WHERE pu.role = 'client' AND pu.merged_into_id IS NULL AND COALESCE(pu.is_archived, false) = false`;
      const totalQ = appendSqlExcludeUserIds(totalBase, "pu.id", excluded, []);
      const supportBase = `SELECT COUNT(*)::text AS c
           FROM doctor_patient_support dps
           INNER JOIN platform_users pu ON pu.id = dps.patient_user_id
           WHERE dps.on_support = true
             AND pu.role = 'client'
             AND pu.merged_into_id IS NULL
             AND COALESCE(pu.is_archived, false) = false`;
      const supportQ = appendSqlExcludeUserIds(supportBase, "pu.id", excluded, []);
      const visitedBase = `SELECT COUNT(DISTINCT pu.id)::text AS c
           FROM platform_users pu
           INNER JOIN appointment_records ar ON ${appointmentRecordsJoinPu("pu", "ar")}
           WHERE pu.role = 'client'
             AND pu.merged_into_id IS NULL
             AND COALESCE(pu.is_archived, false) = false
             AND ar.record_at IS NOT NULL
             AND ar.record_at >= date_trunc('month', NOW())
             AND ar.record_at < date_trunc('month', NOW()) + interval '1 month'
             AND ar.record_at < NOW()
             AND ar.status IN ('created', 'updated')
             AND ar.deleted_at IS NULL`;
      const visitedQ = appendSqlExcludeUserIds(visitedBase, "pu.id", excluded, []);
      const [totalR, supportR, visitedR] = await Promise.all([
        runWebappPgText<{ c: string }>(totalQ.sql, totalQ.params),
        runWebappPgText<{ c: string }>(supportQ.sql, supportQ.params),
        runWebappPgText<{ c: string }>(visitedQ.sql, visitedQ.params),
      ]);
      return {
        totalClients: parseInt(totalR.rows[0]?.c ?? "0", 10),
        onSupportCount: parseInt(supportR.rows[0]?.c ?? "0", 10),
        visitedThisCalendarMonthCount: parseInt(visitedR.rows[0]?.c ?? "0", 10),
      };
    },

    async getPatientClientIdentity(userId: string): Promise<ClientIdentity | null> {
      const pool = getPool();
      const canonicalId = (await resolveCanonicalUserId(pool, userId)) ?? userId;
      const roleRow = await runWebappPgText<{ role: string }>(
        `SELECT role FROM platform_users WHERE id = $1::uuid`,
        [canonicalId],
      );
      if (!roleRow.rows[0] || roleRow.rows[0].role !== "client") return null;
      return this.getClientIdentity(userId);
    },

    async getClientIdentity(userId: string): Promise<ClientIdentity | null> {
      const pool = getPool();
      const canonicalId = (await resolveCanonicalUserId(pool, userId)) ?? userId;
      const userRow = await runWebappPgText(
        `SELECT id, display_name, phone_normalized, created_at,
                first_name, last_name, email, email_verified_at,
                COALESCE(is_blocked, false) AS is_blocked,
                blocked_reason,
                COALESCE(is_archived, false) AS is_archived
         FROM platform_users WHERE id = $1`,
        [canonicalId],
      );
      if (userRow.rows.length === 0) return null;
      const r = userRow.rows[0] as {
        id: string;
        display_name: string;
        phone_normalized: string | null;
        created_at: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        email_verified_at: Date | null;
        is_blocked: boolean;
        blocked_reason: string | null;
        is_archived: boolean;
      };
      const bindingsRows = await runWebappPgText(
        "SELECT channel_code, external_id, created_at FROM user_channel_bindings WHERE user_id = $1",
        [canonicalId],
      );
      const bindings = rowToBindings(
        bindingsRows.rows as { channel_code: string; external_id: string }[],
      );
      const channelBindingDates: Record<string, string> = {};
      for (const br of bindingsRows.rows as {
        channel_code: string;
        created_at: Date;
      }[]) {
        channelBindingDates[br.channel_code] =
          br.created_at instanceof Date ? toIsoStringSafe(br.created_at) : String(br.created_at);
      }
      return {
        userId: r.id,
        displayName: r.display_name ?? "",
        phone: r.phone_normalized,
        bindings,
        createdAt: r.created_at,
        isBlocked: r.is_blocked,
        blockedReason: r.blocked_reason,
        isArchived: r.is_archived,
        channelBindingDates,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        emailVerifiedAt: r.email_verified_at
          ? r.email_verified_at instanceof Date
            ? toIsoStringSafe(r.email_verified_at)
            : String(r.email_verified_at)
          : null,
      };
    },

    async isClientMessagingBlocked(userId: string): Promise<boolean> {
      const r = await runWebappPgText<{ b: boolean }>(
        `SELECT COALESCE(is_blocked, false) AS b FROM platform_users WHERE id = $1`,
        [userId]
      );
      return Boolean(r.rows[0]?.b);
    },

    async setClientBlocked(params: {
      userId: string;
      blocked: boolean;
      reason: string | null;
      actorId: string;
    }): Promise<void> {
      if (params.blocked) {
        await runWebappPgText(
          `UPDATE platform_users SET
             is_blocked = true,
             blocked_at = now(),
             blocked_reason = $2,
             blocked_by = $3::uuid,
             updated_at = now()
           WHERE id = $1::uuid AND role = 'client'`,
          [params.userId, params.reason, params.actorId]
        );
      } else {
        await runWebappPgText(
          `UPDATE platform_users SET
             is_blocked = false,
             blocked_at = NULL,
             blocked_reason = NULL,
             blocked_by = NULL,
             updated_at = now()
           WHERE id = $1::uuid AND role = 'client'`,
          [params.userId]
        );
      }
    },

    async setUserArchived(userId: string, archived: boolean): Promise<void> {
      await runWebappPgText(
        `UPDATE platform_users SET is_archived = $2, updated_at = now()
         WHERE id = $1::uuid AND role = 'client'`,
        [userId, archived]
      );
    },

    async getClientSupport(patientUserId: string) {
      return getClientSupportProfile(patientUserId);
    },

    async updateClientSupport(params) {
      const { actorId, ...rest } = params;
      return upsertClientSupportProfile({ ...rest, updatedBy: actorId });
    },

    async getClientContactBreakdown(audience?: { excludedUserIds?: string[] }) {
      const excluded = audience?.excludedUserIds ?? [];
      const base = `SELECT
           ${sqlActiveTelegramBinding("pu.id")} AS has_telegram,
           ${sqlActiveMaxBinding("pu.id")} AS has_max,
           ${sqlMessengerBotBlocked("pu.id", "telegram")} AS telegram_bot_blocked,
           ${sqlMessengerBotBlocked("pu.id", "max")} AS max_bot_blocked,
           (pu.email_verified_at IS NOT NULL) AS has_verified_email,
           (pu.phone_normalized IS NOT NULL AND btrim(pu.phone_normalized) <> '') AS has_phone
         FROM platform_users pu
         WHERE pu.role = 'client'
           AND pu.merged_into_id IS NULL
           AND COALESCE(pu.is_archived, false) = false`;
      const q = appendSqlExcludeUserIds(base, "pu.id", excluded, []);
      const rows = await runWebappPgText<{
        has_telegram: boolean;
        has_max: boolean;
        telegram_bot_blocked: boolean;
        max_bot_blocked: boolean;
        has_verified_email: boolean;
        has_phone: boolean;
      }>(q.sql, q.params);
      const breakdown = emptyClientContactBreakdown();
      for (const row of rows.rows) {
        accumulateClientContactBreakdown(breakdown, {
          hasTelegram: row.has_telegram,
          hasMax: row.has_max,
          hasVerifiedEmail: row.has_verified_email,
          hasPhone: row.has_phone,
        });
        if (row.telegram_bot_blocked) breakdown.messengerBotBlocked.telegram += 1;
        if (row.max_bot_blocked) breakdown.messengerBotBlocked.max += 1;
      }
      return breakdown;
    },
  };
}
