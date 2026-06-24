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
  PatientAppointmentItem,
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
      // Short-circuit: empty userIds means caller wants specific users but there are none.
      if (filters.userIds !== undefined && filters.userIds.length === 0) return [];

      const excluded = audience?.excludedUserIds ?? [];
      const archivedClause =
        filters.archivedOnly === true
          ? `COALESCE(is_archived, false) = true`
          : `COALESCE(is_archived, false) = false`;
      const listBase = `SELECT id, display_name, first_name, last_name, patronymic, phone_normalized, created_at, email, email_verified_at
         FROM platform_users pu
         WHERE pu.role = 'client' AND pu.merged_into_id IS NULL AND ${archivedClause}`;
      // Apply userIds restriction when caller provides a specific set (e.g. conversations route).
      const userIdsParams: unknown[] = [];
      let listBaseWithUserIds = listBase;
      if (filters.userIds !== undefined && filters.userIds.length > 0) {
        userIdsParams.push(filters.userIds);
        listBaseWithUserIds = `${listBase} AND pu.id = ANY($1::uuid[])`;
      }
      const listQ = appendSqlExcludeUserIds(listBaseWithUserIds, "pu.id", excluded, userIdsParams);
      const clientRows = await runWebappPgText<{
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        patronymic: string | null;
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
        noShowRows,
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
          // no_show_count from booking profile
          runWebappPgText<{ user_id: string; no_show_count: number }>(
            `SELECT
               platform_user_id::text AS user_id,
               COALESCE(no_show_count, 0)::int AS no_show_count
             FROM be_patient_booking_profiles
             WHERE platform_user_id = ANY($1::uuid[])`,
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
      const noShowByPatientId = new Map<string, number>(
        noShowRows.rows.map((row) => [row.user_id, Number(row.no_show_count ?? 0)]),
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
            firstName: r.first_name ?? null,
            lastName: r.last_name ?? null,
            patronymic: r.patronymic ?? null,
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
            noShowCount: noShowByPatientId.get(r.id) ?? 0,
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
      // New filters for Patients section
      if (filters.hasEmail === true) {
        list = list.filter((item) => item.hasEmail === true);
      }
      if (filters.hasPhone === true) {
        list = list.filter((item) => Boolean(item.phone?.trim()));
      }
      if (filters.hasMemberships === true) {
        list = list.filter((item) => item.hasMemberships === true);
      }
      if (filters.hasCancellations === true) {
        list = list.filter((item) => (item.cancellationCount30d ?? 0) > 0);
      }
      // TODO: isNew/isFormer/isSubscriberOnly — definitions need owner confirmation (see ports.ts)
      if (filters.isNew === true) {
        // «Новые» — есть будущая запись, но ещё не было прошедшего посещения
        list = list.filter(
          (item) => (item.activeAppointmentsCount ?? 0) > 0 && item.hasAppointmentHistory !== true,
        );
      }
      if (filters.isFormer === true) {
        // «Бывшие» — были посещения, но сейчас нет активной будущей записи
        list = list.filter(
          (item) => item.hasAppointmentHistory === true && (item.activeAppointmentsCount ?? 0) === 0,
        );
      }
      if (filters.isSubscriberOnly === true) {
        // «Подписчики» — никогда не было записи на приём
        list = list.filter(
          (item) => !item.hasAppointmentHistory && (item.activeAppointmentsCount ?? 0) === 0,
        );
      }
      return list;
    },

    async listPatientAppointments(userId: string): Promise<PatientAppointmentItem[]> {
      const pool = getPool();
      const canonicalId = (await resolveCanonicalUserId(pool, userId)) ?? userId;

      // Fetch appointment_records attributed to this user via the canonical join
      const rows = await runWebappPgText<{
        id: string;
        record_at: Date | null;
        status: string;
        last_event: string | null;
        payload_json: { service_title?: string; duration_minutes?: number } | null;
        branch_name: string | null;
      }>(
        `SELECT
           ar.integrator_record_id AS id,
           ar.record_at,
           ar.status,
           ar.last_event,
           ar.payload_json,
           b.name AS branch_name
         FROM platform_users pu
         LEFT JOIN appointment_records ar ON ${appointmentRecordsJoinPu("pu", "ar")}
         LEFT JOIN branches b ON ar.branch_id = b.id
         WHERE pu.id = $1::uuid
           AND ar.id IS NOT NULL
           AND ar.deleted_at IS NULL
           AND ar.last_event NOT IN ('event-remove-record', 'event-delete-record')
         ORDER BY ar.record_at DESC NULLS LAST`,
        [canonicalId],
      );

      const now = Date.now();

      return rows.rows.map((row): PatientAppointmentItem => {
        const recordAtMs = row.record_at ? new Date(row.record_at).getTime() : null;
        const isPast = recordAtMs !== null && recordAtMs < now;
        const payload = row.payload_json ?? {};

        let status: PatientAppointmentItem["status"];
        if (row.status === "canceled") {
          status = "canceled";
        } else if (row.status === "updated") {
          // «updated» = перенесённая запись — показываем актуальный слот
          status = isPast ? "completed" : "upcoming";
        } else {
          // «created»
          status = isPast ? "completed" : "upcoming";
        }

        const durationRaw = (payload as { duration_minutes?: unknown }).duration_minutes;
        const durationMin =
          typeof durationRaw === "number" && Number.isFinite(durationRaw)
            ? Math.round(durationRaw)
            : null;

        return {
          id: row.id,
          dateTime: row.record_at ? new Date(row.record_at).toISOString() : "",
          status,
          serviceName: (payload.service_title && payload.service_title.trim()) || null,
          location: row.branch_name ?? null,
          durationMin,
        };
      });
    },

    async getPatientCardHeader(userId: string) {
      // Resolve canonical user id
      const pool = getPool();
      const canonicalId = (await resolveCanonicalUserId(pool, userId)) ?? userId;

      // Fetch identity
      const userRow = await runWebappPgText<{
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        patronymic: string | null;
        phone_normalized: string | null;
        email: string | null;
        email_verified_at: string | null;
        is_blocked: boolean;
        is_archived: boolean;
        role: string;
        birth_date: string | null;
        gender: string | null;
      }>(
        `SELECT id, display_name, first_name, last_name, patronymic, phone_normalized, email, email_verified_at,
                COALESCE(is_blocked, false) AS is_blocked,
                COALESCE(is_archived, false) AS is_archived,
                role,
                birth_date::text AS birth_date,
                gender
         FROM platform_users WHERE id = $1::uuid`,
        [canonicalId],
      );
      const ur = userRow.rows[0];
      if (!ur || ur.role !== "client") return null;

      // Fetch channel bindings
      const bindingsRows = await runWebappPgText<{ channel_code: string; external_id: string; bot_blocked_at: string | null }>(
        `SELECT channel_code, external_id, bot_blocked_at FROM user_channel_bindings WHERE user_id = $1::uuid`,
        [canonicalId],
      );
      const bindings = rowToBindings(bindingsRows.rows);

      // Есть ли переписка: хотя бы одно сообщение в любой беседе пациента
      // (даёт открыть чат даже без привязанного Telegram/MAX-канала).
      const conversationRow = await runWebappPgText<{ has_conversation: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM support_conversations sc
           JOIN support_conversation_messages m ON m.conversation_id = sc.id
           WHERE sc.platform_user_id = $1::uuid
         ) AS has_conversation`,
        [canonicalId],
      );
      const hasConversation = conversationRow.rows[0]?.has_conversation ?? false;

      // Fetch support status
      const supportProfile = await getClientSupportProfile(canonicalId);

      // Lifetime no-show counter from booking profile
      const noShowRows = await runWebappPgText<{ no_show_count: string }>(
        `SELECT COALESCE(no_show_count, 0)::text AS no_show_count
         FROM be_patient_booking_profiles
         WHERE platform_user_id = $1::uuid
         LIMIT 1`,
        [canonicalId],
      );
      const noShowCount = parseInt(noShowRows.rows[0]?.no_show_count ?? "0", 10);

      // Fetch appointment stats
      const apptRows = await runWebappPgText<{
        total_visits: string;
        cancellations_count: string;
        reschedules_count: string;
        last_visit_at: string | null;
        next_appt_at: string | null;
        first_visit_at: string | null;
      }>(
        `SELECT
           COUNT(*) FILTER (
             WHERE ar.deleted_at IS NULL
               AND ar.status IN ('created','updated')
               AND ar.record_at IS NOT NULL
               AND ar.record_at < NOW()
           )::text AS total_visits,
           COUNT(*) FILTER (
             WHERE ar.deleted_at IS NULL
               AND ar.status = 'canceled'
               AND ar.last_event NOT IN ('event-remove-record','event-delete-record')
           )::text AS cancellations_count,
           COUNT(*) FILTER (
             WHERE ar.deleted_at IS NULL
               AND ar.status = 'updated'
           )::text AS reschedules_count,
           MAX(ar.record_at) FILTER (
             WHERE ar.deleted_at IS NULL
               AND ar.status IN ('created','updated')
               AND ar.record_at IS NOT NULL
               AND ar.record_at < NOW()
           ) AS last_visit_at,
           MIN(ar.record_at) FILTER (
             WHERE ar.deleted_at IS NULL
               AND ar.status IN ('created','updated')
               AND ar.record_at IS NOT NULL
               AND ar.record_at >= NOW()
           ) AS next_appt_at,
           MIN(ar.record_at) FILTER (
             WHERE ar.deleted_at IS NULL
               AND ar.status IN ('created','updated')
               AND ar.record_at IS NOT NULL
               AND ar.record_at < NOW()
           ) AS first_visit_at
         FROM platform_users pu
         LEFT JOIN appointment_records ar ON ${appointmentRecordsJoinPu("pu", "ar")}
         WHERE pu.id = $1::uuid`,
        [canonicalId],
      );
      const appt = apptRows.rows[0];

      const totalVisits = parseInt(appt?.total_visits ?? "0", 10);
      const cancellationsCount = parseInt(appt?.cancellations_count ?? "0", 10);
      const reschedulesCount = parseInt(appt?.reschedules_count ?? "0", 10);

      // Fetch latest clinical_visit for this patient (for visitType + city)
      const clinicalVisitRow = await runWebappPgText<{
        visited_at: string;
        visit_type: string;
        location: string | null;
      }>(
        `SELECT visited_at, visit_type, location
         FROM clinical_visit
         WHERE patient_user_id = $1::uuid
         ORDER BY visited_at DESC
         LIMIT 1`,
        [canonicalId],
      );
      const latestClinical = clinicalVisitRow.rows[0] ?? null;

      // Last visit: prefer clinical_visit (has visitType + city); fall back to appointment_records date
      let lastVisit: import("@/modules/doctor-clients/ports").PatientCardHeader["lastVisit"] = null;
      if (latestClinical) {
        lastVisit = {
          date: new Date(latestClinical.visited_at).toISOString(),
          visitType: latestClinical.visit_type === "first" ? "Первичный" : "Повторный",
          city: latestClinical.location ?? null,
        };
      } else if (appt?.last_visit_at) {
        lastVisit = {
          date: new Date(appt.last_visit_at).toISOString(),
          visitType: null,
          city: null,
        };
      }

      // Next appointment
      let nextAppointment: import("@/modules/doctor-clients/ports").PatientCardHeader["nextAppointment"] = null;
      if (appt?.next_appt_at) {
        const dt = new Date(appt.next_appt_at);
        const pad = (n: number) => String(n).padStart(2, "0");
        nextAppointment = {
          date: dt.toISOString(),
          time: `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`,
          city: null, // TODO: no city field in appointment_records
          appointmentType: null, // TODO: no appointmentType field in appointment_records
        };
      }

      // Support: precise start date + months on support (doctor_patient_support.support_started_at)
      const isOnSupport = supportProfile?.onSupport ?? false;
      const supportStartedAt: string | null =
        isOnSupport ? supportProfile?.supportStartedAt ?? null : null;
      let supportMonthsApprox: number | null = null;
      if (supportStartedAt) {
        const start = new Date(supportStartedAt);
        const now = new Date();
        let months =
          (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
          (now.getUTCMonth() - start.getUTCMonth());
        if (now.getUTCDate() < start.getUTCDate()) months--;
        supportMonthsApprox = months >= 0 ? months : 0;
      }

      // Compute age from birthDate
      const birthDateIso: string | null = ur.birth_date ?? null;
      let ageYears: number | null = null;
      if (birthDateIso) {
        const today = new Date();
        const bd = new Date(birthDateIso);
        let age = today.getUTCFullYear() - bd.getUTCFullYear();
        const m = today.getUTCMonth() - bd.getUTCMonth();
        if (m < 0 || (m === 0 && today.getUTCDate() < bd.getUTCDate())) {
          age--;
        }
        ageYears = age >= 0 ? age : null;
      }

      return {
        identity: {
          userId: ur.id,
          displayName: ur.display_name ?? "",
          firstName: ur.first_name,
          lastName: ur.last_name,
          patronymic: ur.patronymic ?? null,
          phone: ur.phone_normalized,
          email: ur.email,
          bindings,
          hasConversation,
          isArchived: ur.is_archived,
          isBlocked: ur.is_blocked,
          birthDate: birthDateIso,
          age: ageYears,
          gender:
            ur.gender === "male" || ur.gender === "female" ? ur.gender : null,
        },
        support: {
          isOnSupport,
          startedAt: supportStartedAt,
          supportMonthsApprox,
        },
        lastVisit,
        nextAppointment,
        totalVisits,
        cancellationsCount,
        reschedulesCount,
        noShowCount,
        firstVisitDate: appt?.first_visit_at ? new Date(appt.first_visit_at).toISOString() : null,
      };
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

      // «С программой»: хотя бы одна активная treatment_program_instances (doctor-assigned)
      const withProgramBase = `SELECT COUNT(DISTINCT pu.id)::text AS c
           FROM platform_users pu
           INNER JOIN treatment_program_instances tpi ON tpi.patient_user_id = pu.id
           WHERE pu.role = 'client'
             AND pu.merged_into_id IS NULL
             AND COALESCE(pu.is_archived, false) = false
             AND tpi.status = 'active'
             AND tpi.assignment_source = 'doctor'`;
      const withProgramQ = appendSqlExcludeUserIds(withProgramBase, "pu.id", excluded, []);

      // «С абонементами»: активный или ожидающий оплаты пакет
      const membershipsBase = `SELECT COUNT(DISTINCT pu.id)::text AS c
           FROM platform_users pu
           INNER JOIN be_patient_packages pp ON pp.platform_user_id = pu.id
           WHERE pu.role = 'client'
             AND pu.merged_into_id IS NULL
             AND COALESCE(pu.is_archived, false) = false
             AND pp.status IN ('active', 'awaiting_payment')`;
      const membershipsQ = appendSqlExcludeUserIds(membershipsBase, "pu.id", excluded, []);

      // Подсчёт агрегатов истории записей одним запросом для «Новые» / «Бывшие» / «Подписчики» / «С отменами»
      // Один агрегирующий запрос на платформных клиентов
      const aggBase = `SELECT
           pu.id,
           COUNT(ar.id) FILTER (
             WHERE ar.deleted_at IS NULL
               AND ar.status IN ('created', 'updated')
               AND ar.record_at IS NOT NULL
               AND ar.record_at < NOW()
           )::int AS past_count,
           COUNT(ar.id) FILTER (
             WHERE ar.deleted_at IS NULL
               AND ar.status IN ('created', 'updated')
               AND ar.record_at IS NOT NULL
               AND ar.record_at >= NOW()
           )::int AS future_count,
           COUNT(ar.id) FILTER (
             WHERE ar.deleted_at IS NULL
               AND ar.status = 'canceled'
               AND ar.last_event NOT IN ('event-remove-record', 'event-delete-record')
               AND ar.updated_at >= NOW() - INTERVAL '30 days'
           )::int AS cancellations_30d
         FROM platform_users pu
         LEFT JOIN appointment_records ar ON ${appointmentRecordsJoinPu("pu", "ar")}
         WHERE pu.role = 'client'
           AND pu.merged_into_id IS NULL
           AND COALESCE(pu.is_archived, false) = false`;
      const aggQ = appendSqlExcludeUserIds(aggBase, "pu.id", excluded, []);

      const [totalR, supportR, visitedR, withProgramR, membershipsR, aggR] = await Promise.all([
        runWebappPgText<{ c: string }>(totalQ.sql, totalQ.params),
        runWebappPgText<{ c: string }>(supportQ.sql, supportQ.params),
        runWebappPgText<{ c: string }>(visitedQ.sql, visitedQ.params),
        runWebappPgText<{ c: string }>(withProgramQ.sql, withProgramQ.params),
        runWebappPgText<{ c: string }>(membershipsQ.sql, membershipsQ.params),
        runWebappPgText<{ id: string; past_count: number; future_count: number; cancellations_30d: number }>(
          `${aggQ.sql} GROUP BY pu.id`,
          aggQ.params,
        ),
      ]);

      let newCount = 0;
      let formerCount = 0;
      let subscriberCount = 0;
      let cancellationsCount = 0;
      for (const row of aggR.rows) {
        const past = Number(row.past_count ?? 0);
        const future = Number(row.future_count ?? 0);
        const cancels = Number(row.cancellations_30d ?? 0);
        // «Новые»: есть будущая запись, но ещё не было прошедшего посещения
        if (future > 0 && past === 0) newCount++;
        // «Бывшие»: были посещения, нет будущей записи
        else if (past > 0 && future === 0) formerCount++;
        // «Подписчики»: никогда не было ни одной записи
        else if (past === 0 && future === 0) subscriberCount++;
        if (cancels > 0) cancellationsCount++;
      }

      return {
        totalClients: parseInt(totalR.rows[0]?.c ?? "0", 10),
        onSupportCount: parseInt(supportR.rows[0]?.c ?? "0", 10),
        visitedThisCalendarMonthCount: parseInt(visitedR.rows[0]?.c ?? "0", 10),
        withProgramCount: parseInt(withProgramR.rows[0]?.c ?? "0", 10),
        membershipsCount: parseInt(membershipsR.rows[0]?.c ?? "0", 10),
        newCount,
        formerCount,
        subscriberCount,
        cancellationsCount,
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

    async setPatientBirthDate(userId: string, birthDate: string | null): Promise<void> {
      await runWebappPgText(
        `UPDATE platform_users SET birth_date = $2::date, updated_at = now()
         WHERE id = $1::uuid AND role = 'client'`,
        [userId, birthDate],
      );
    },

    async setPatientGender(userId: string, gender: "male" | "female" | null): Promise<void> {
      await runWebappPgText(
        `UPDATE platform_users SET gender = $2, updated_at = now()
         WHERE id = $1::uuid AND role = 'client'`,
        [userId, gender],
      );
    },

    async setPatientNames(
      userId: string,
      names: { displayName?: string; firstName?: string | null; lastName?: string | null; patronymic?: string | null },
    ): Promise<void> {
      const sets: string[] = [];
      const params: unknown[] = [userId];
      if (names.displayName !== undefined) {
        params.push(names.displayName);
        sets.push(`display_name = $${params.length}`);
      }
      if (names.firstName !== undefined) {
        params.push(names.firstName);
        sets.push(`first_name = $${params.length}`);
      }
      if (names.lastName !== undefined) {
        params.push(names.lastName);
        sets.push(`last_name = $${params.length}`);
      }
      if (names.patronymic !== undefined) {
        params.push(names.patronymic);
        sets.push(`patronymic = $${params.length}`);
      }
      if (sets.length === 0) return;
      await runWebappPgText(
        `UPDATE platform_users SET ${sets.join(", ")}, updated_at = now()
         WHERE id = $1::uuid AND role = 'client'`,
        params,
      );
    },

    async getPatientPhysical(userId: string) {
      const result = await runWebappPgText<{ height_cm: number | null; weight_kg: number | null }>(
        `SELECT height_cm, weight_kg FROM platform_users WHERE id = $1::uuid AND role = 'client'`,
        [userId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return { heightCm: row.height_cm ?? null, weightKg: row.weight_kg ?? null };
    },

    async setPatientPhysical(
      userId: string,
      params: { heightCm?: number | null; weightKg?: number | null },
    ): Promise<void> {
      const sets: string[] = ["updated_at = now()"];
      const values: unknown[] = [userId];
      if ("heightCm" in params) {
        values.push(params.heightCm ?? null);
        sets.push(`height_cm = $${values.length}::integer`);
      }
      if ("weightKg" in params) {
        values.push(params.weightKg ?? null);
        sets.push(`weight_kg = $${values.length}::integer`);
      }
      if (sets.length <= 1) return; // only updated_at, nothing to do
      await runWebappPgText(
        `UPDATE platform_users SET ${sets.join(", ")} WHERE id = $1::uuid AND role = 'client'`,
        values,
      );
    },

    async getClientContactBreakdown(audience?: { excludedUserIds?: string[] }) {
      const excluded = audience?.excludedUserIds ?? [];
      const base = `SELECT
           ${sqlActiveTelegramBinding("pu.id")} AS has_telegram,
           ${sqlActiveMaxBinding("pu.id")} AS has_max,
           ${sqlMessengerBotBlocked("pu.id", "telegram")} AS telegram_bot_blocked,
           ${sqlMessengerBotBlocked("pu.id", "max")} AS max_bot_blocked,
           (pu.email_verified_at IS NOT NULL) AS has_verified_email,
           (pu.phone_normalized IS NOT NULL AND btrim(pu.phone_normalized) <> '') AS has_phone,
           EXISTS(SELECT 1 FROM appointment_records ar WHERE ar.platform_user_id = pu.id) AS has_appointment
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
        has_appointment: boolean;
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
        if (row.has_appointment) breakdown.patientsCount += 1;
        else breakdown.subscribersOnlyCount += 1;
      }
      return breakdown;
    },
  };
}
