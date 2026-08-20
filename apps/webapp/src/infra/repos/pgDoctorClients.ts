/**
 * Wave 3 phase 13C — domain SQL via `runWebappPgText`; canonical helpers still accept `getPool()`.
 */
import { getPool } from '@/infra/db/client';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import { getWebappSqlDb, runWebappPgText, runWebappTransaction } from '@/infra/db/runWebappSql';
import { and, countDistinct, eq, inArray, isNull } from 'drizzle-orm';
import { resolveCanonicalUserId } from '@/infra/repos/pgCanonicalPlatformUser';
import type { ChannelBindings } from '@/shared/types/session';
import type {
  ClientIdentity,
  ClientListItem,
  DoctorClientsFilters,
  DoctorClientsPort,
  DoctorDashboardPatientMetrics,
  PatientAppointmentItem,
} from '@/modules/doctor-clients/ports';
import {
  accumulateClientContactBreakdown,
  emptyClientContactBreakdown,
} from '@/modules/doctor-clients/clientContactSegments';
import { matchesDoctorClientSearch } from '@/modules/doctor-clients/clientSearchMatch';
import {
  getClientSupportProfile,
  listOnSupportPatientUserIds,
  upsertClientSupportProfile,
} from '@/infra/repos/pgDoctorPatientSupport';
import { appendSqlExcludeUserIds } from '@/modules/analytics/analyticsAudience';
import { buildPatientVisibilityPredicate } from '@/infra/repos/patientVisibilityPredicateSql';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';
import {
  FIO,
  FIO_SELECT,
  syncUserIdentityFioMirrorWebapp,
  USER_IDENTITY_FIO_JOIN,
} from '@/infra/repos/userIdentityFioSql';
import {
  CONTACTS,
  CONTACTS_HAS_PHONE,
  primaryPhoneSubqueryFor,
  USER_CONTACTS_PRIMARY_LATERALS,
  USER_CONTACTS_PRIMARY_PHONE_LATERAL,
} from '@/infra/repos/userContactsSql';
import {
  sqlActiveMaxBinding,
  sqlActiveTelegramBinding,
  sqlMessengerBotBlocked,
} from '@/modules/doctor-clients/activeMessengerBindingSql';
import { beAppointments } from '../../../db/schema/bookingEngine';
import { bePatientPackages } from '../../../db/schema/bookingMemberships';
import { beAppointmentReschedules } from '../../../db/schema/bookingPolicies';

function rowToBindings(
  rows: { channel_code: string; external_id: string; bot_blocked_at?: string | null }[],
): ChannelBindings {
  const bindings: ChannelBindings = {};
  for (const row of rows) {
    if (row.channel_code === 'telegram') {
      bindings.telegramId = row.external_id;
      if (row.bot_blocked_at) bindings.telegramBotBlocked = true;
      continue;
    }
    if (row.channel_code === 'max') {
      bindings.maxId = row.external_id;
      if (row.bot_blocked_at) bindings.maxBotBlocked = true;
      continue;
    }
    if (row.channel_code === 'vk') {
      bindings.vkId = row.external_id;
    }
  }
  return bindings;
}

function appendSqlOrganizationEnrollment(
  input: { sql: string; params: unknown[] },
  userColumn: string,
  organizationId?: string,
): { sql: string; params: unknown[] } {
  if (!organizationId) return input;
  const params = [...input.params, organizationId];
  return {
    sql: `${input.sql}
      AND EXISTS (
        SELECT 1
        FROM org_enrollments oe_scope
        WHERE oe_scope.platform_user_id = ${userColumn}
          AND oe_scope.organization_id = $${params.length}::uuid
          AND oe_scope.status = 'active'
      )`,
    params,
  };
}

function appendSqlOrganizationColumn(
  input: { sql: string; params: unknown[] },
  columnSql: string,
  organizationId?: string,
): { sql: string; params: unknown[] } {
  if (!organizationId) return input;
  const params = [...input.params, organizationId];
  return {
    sql: `${input.sql} AND ${columnSql} = $${params.length}::uuid`,
    params,
  };
}

function appendSqlPatientVisibility(
  input: { sql: string; params: unknown[] },
  userColumn: string,
  organizationId: string | undefined,
  actor: PatientVisibilityActor | undefined,
): { sql: string; params: unknown[] } {
  if (!organizationId) return input;
  if (!actor) throw new Error('patient_visibility_actor_required');
  return buildPatientVisibilityPredicate(input, userColumn, organizationId, actor);
}

const CANONICAL_CANCELLED_STATUS_SQL =
  "'cancelled_by_patient', 'cancelled_by_specialist', 'late_cancellation', 'no_show'";
const CANONICAL_CANCELLED_STATUSES = [
  'cancelled_by_patient',
  'cancelled_by_specialist',
  'late_cancellation',
  'no_show',
] as const;

type ClientEventMetrics = {
  userId: string;
  cancellationsCount: number;
  reschedulesCount: number;
};

type ClientMembershipMetrics = {
  userId: string;
  purchasedMembershipsCount: number;
  activeMembershipsCount: number;
  expiredMembershipsCount: number;
};

async function loadClientEventMetrics(
  userIds: string[],
  organizationId: string | null,
): Promise<ClientEventMetrics[]> {
  if (userIds.length === 0) return [];
  const db = getDrizzle();
  const appointmentOrganizationFilter = organizationId
    ? eq(beAppointments.organizationId, organizationId)
    : undefined;
  const rescheduleOrganizationFilter = organizationId
    ? eq(beAppointmentReschedules.organizationId, organizationId)
    : undefined;

  const [cancellationRows, rescheduleRows] = await Promise.all([
    db
      .select({
        userId: beAppointments.platformUserId,
        cancellationsCount: countDistinct(beAppointments.id),
      })
      .from(beAppointments)
      .where(
        and(
          inArray(beAppointments.platformUserId, userIds),
          appointmentOrganizationFilter,
          isNull(beAppointments.deletedAt),
          inArray(beAppointments.status, [...CANONICAL_CANCELLED_STATUSES]),
        ),
      )
      .groupBy(beAppointments.platformUserId),
    db
      .select({
        userId: beAppointments.platformUserId,
        reschedulesCount: countDistinct(beAppointmentReschedules.id),
      })
      .from(beAppointmentReschedules)
      .innerJoin(beAppointments, eq(beAppointments.id, beAppointmentReschedules.appointmentId))
      .where(
        and(
          inArray(beAppointments.platformUserId, userIds),
          appointmentOrganizationFilter,
          rescheduleOrganizationFilter,
        ),
      )
      .groupBy(beAppointments.platformUserId),
  ]);

  const metricsByUserId = new Map<string, ClientEventMetrics>();
  for (const row of cancellationRows) {
    if (!row.userId) continue;
    metricsByUserId.set(row.userId, {
      userId: row.userId,
      cancellationsCount: Number(row.cancellationsCount ?? 0),
      reschedulesCount: 0,
    });
  }
  for (const row of rescheduleRows) {
    if (!row.userId) continue;
    const current = metricsByUserId.get(row.userId);
    metricsByUserId.set(row.userId, {
      userId: row.userId,
      cancellationsCount: current?.cancellationsCount ?? 0,
      reschedulesCount: Number(row.reschedulesCount ?? 0),
    });
  }
  return [...metricsByUserId.values()];
}

async function loadClientMembershipMetrics(
  userIds: string[],
  organizationId: string | null,
): Promise<ClientMembershipMetrics[]> {
  if (userIds.length === 0) return [];
  const db = getDrizzle();
  const rows = await db
    .select({
      userId: bePatientPackages.platformUserId,
      status: bePatientPackages.status,
      membershipsCount: countDistinct(bePatientPackages.id),
    })
    .from(bePatientPackages)
    .where(
      and(
        inArray(bePatientPackages.platformUserId, userIds),
        organizationId ? eq(bePatientPackages.organizationId, organizationId) : undefined,
        inArray(bePatientPackages.status, ['active', 'awaiting_payment', 'expired']),
      ),
    )
    .groupBy(bePatientPackages.platformUserId, bePatientPackages.status);

  const metricsByUserId = new Map<string, ClientMembershipMetrics>();
  for (const row of rows) {
    const current = metricsByUserId.get(row.userId) ?? {
      userId: row.userId,
      purchasedMembershipsCount: 0,
      activeMembershipsCount: 0,
      expiredMembershipsCount: 0,
    };
    const membershipsCount = Number(row.membershipsCount ?? 0);
    if (row.status === 'active') {
      current.purchasedMembershipsCount += membershipsCount;
      current.activeMembershipsCount += membershipsCount;
    } else if (row.status === 'awaiting_payment') {
      current.purchasedMembershipsCount += membershipsCount;
    } else if (row.status === 'expired') {
      current.expiredMembershipsCount += membershipsCount;
    }
    metricsByUserId.set(row.userId, current);
  }
  return [...metricsByUserId.values()];
}

/**
 * `${alias}.organization_id = $n::uuid`, binding `organizationId` onto the caller's mutable
 * `params` array at the position it lands (mirrors `appendSqlOrganizationColumn` above, which
 * does the same for a `{sql, params}` pair already built — this variant exists because the
 * three call sites below interpolate the predicate into a template literal *before* the base
 * query is wrapped as `{sql, params}`, so `params` is threaded in by reference instead).
 * Was `sqlLiteralUuid()` — a hand-escaped `'…'::uuid` literal glued into the query text; not
 * exploitable (quotes were escaped and the `::uuid` cast rejects non-UUID text) but it invited
 * the same shortcut for a value without that cast. See
 * `docs/_TODO/TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md` §0.3.
 */
function canonicalAppointmentOrgPredicate(
  alias: string,
  organizationId: string | undefined,
  params: unknown[],
): string {
  if (!organizationId) return 'TRUE';
  params.push(organizationId);
  return `${alias}.organization_id = $${params.length}::uuid`;
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
      const organizationId = filters.organizationId ?? null;
      const archivedClause =
        filters.archivedOnly === true
          ? `COALESCE(is_archived, false) = true`
          : `COALESCE(is_archived, false) = false`;
      const listBaseParams: unknown[] = [];
      let listBase = `SELECT pu.id, ${FIO_SELECT}, ${CONTACTS.phoneNormalized} AS phone_normalized, pu.created_at, pu.email, ${CONTACTS.emailNormalized} AS email_normalized, pu.email_verified_at
         FROM platform_users pu
         ${USER_IDENTITY_FIO_JOIN}
         ${USER_CONTACTS_PRIMARY_LATERALS}
         WHERE pu.role = 'client' AND pu.merged_into_id IS NULL AND ${archivedClause}`;
      if (organizationId) {
        listBaseParams.push(organizationId);
        listBase += ` AND EXISTS (
          SELECT 1
          FROM org_enrollments oe
          WHERE oe.platform_user_id = pu.id
            AND oe.organization_id = $${listBaseParams.length}::uuid
            AND oe.status IN ('invited', 'active')
        )`;
      }
      // Apply userIds restriction when caller provides a specific set (e.g. conversations route).
      let listBaseWithUserIds = listBase;
      if (filters.userIds !== undefined && filters.userIds.length > 0) {
        listBaseParams.push(filters.userIds);
        listBaseWithUserIds = `${listBase} AND pu.id = ANY($${listBaseParams.length}::uuid[])`;
      }
      const listQ = appendSqlExcludeUserIds(listBaseWithUserIds, 'pu.id', excluded, listBaseParams);
      const visibleListQ = appendSqlPatientVisibility(
        listQ,
        'pu.id',
        organizationId ?? undefined,
        filters.visibilityActor,
      );
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
        `${visibleListQ.sql}
         ORDER BY display_name, id`,
        visibleListQ.params,
      );
      if (clientRows.rows.length === 0) return [];

      const userIds = clientRows.rows.map((r) => r.id);
      const bindingsRows = await runWebappPgText(
        `SELECT user_id, channel_code, external_id, bot_blocked_at FROM user_channel_bindings WHERE user_id = ANY($1::uuid[])`,
        [userIds],
      );
      const bindingsByUser = new Map<
        string | number,
        { channel_code: string; external_id: string }[]
      >();
      for (const row of bindingsRows.rows as {
        user_id: string;
        channel_code: string;
        external_id: string;
      }[]) {
        const list = bindingsByUser.get(row.user_id) ?? [];
        list.push({ channel_code: row.channel_code, external_id: row.external_id });
        bindingsByUser.set(row.user_id, list);
      }

      const [
        appointmentAggRows,
        eventMetricRows,
        supportConversationRows,
        activeProgramPatients,
        onSupportIds,
        unreadExerciseCommentRows,
        membershipRows,
        noShowRows,
        pwaActivityRows,
        webPushRows,
      ] = await Promise.all([
        runWebappPgText<{
          user_id: string;
          history_count: number;
          last_appointment_at: Date | string | null;
          active_count: number;
          visited_month_count: number;
        }>(
          `WITH clinical_visit_agg AS (
               SELECT
                 cv.patient_user_id,
                 COUNT(*)::int AS history_count,
                 MAX(cv.visited_at) FILTER (WHERE cv.visited_at <= NOW()) AS last_visit_at,
                 COUNT(*) FILTER (
                   WHERE cv.visited_at >= date_trunc('month', NOW())
                     AND cv.visited_at < date_trunc('month', NOW()) + interval '1 month'
                     AND cv.visited_at <= NOW()
                 )::int AS visited_month_count
               FROM clinical_visit cv
               WHERE cv.patient_user_id = ANY($1::uuid[])
                 AND ($2::uuid IS NULL OR cv.organization_id = $2::uuid)
                 AND cv.canonical_appointment_id IS NULL
               GROUP BY cv.patient_user_id
             )
             SELECT
               pu.id::text AS user_id,
               (
                 COUNT(DISTINCT bea.id) FILTER (
                   WHERE bea.deleted_at IS NULL
                     AND bea.status NOT IN (${CANONICAL_CANCELLED_STATUS_SQL})
                     AND ($2::uuid IS NULL OR bea.organization_id = $2::uuid)
                 )::int + COALESCE(cva.history_count, 0)
               )::int AS history_count,
               GREATEST(
                 MAX(bea.start_at) FILTER (
                   WHERE bea.deleted_at IS NULL
                     AND bea.status NOT IN (${CANONICAL_CANCELLED_STATUS_SQL})
                     AND bea.start_at IS NOT NULL
                     AND bea.start_at <= NOW()
                     AND ($2::uuid IS NULL OR bea.organization_id = $2::uuid)
                 ),
                 cva.last_visit_at
               ) AS last_appointment_at,
               COUNT(DISTINCT bea.id) FILTER (
                 WHERE bea.deleted_at IS NULL
                   AND bea.status NOT IN (${CANONICAL_CANCELLED_STATUS_SQL})
                   AND bea.start_at IS NOT NULL
                   AND bea.start_at >= NOW()
                   AND ($2::uuid IS NULL OR bea.organization_id = $2::uuid)
               )::int AS active_count,
               (
                 COUNT(DISTINCT bea.id) FILTER (
                   WHERE bea.deleted_at IS NULL
                     AND bea.start_at IS NOT NULL
                     AND bea.start_at >= date_trunc('month', NOW())
                     AND bea.start_at < date_trunc('month', NOW()) + interval '1 month'
                     AND bea.start_at < NOW()
                     AND bea.status NOT IN (${CANONICAL_CANCELLED_STATUS_SQL})
                     AND ($2::uuid IS NULL OR bea.organization_id = $2::uuid)
                 )::int + COALESCE(cva.visited_month_count, 0)
               )::int AS visited_month_count
             FROM platform_users pu
             LEFT JOIN be_appointments bea ON bea.platform_user_id = pu.id
             LEFT JOIN clinical_visit_agg cva ON cva.patient_user_id = pu.id
             WHERE pu.id = ANY($1::uuid[])
             GROUP BY pu.id, cva.history_count, cva.last_visit_at, cva.visited_month_count`,
          [userIds, organizationId],
        ),
        loadClientEventMetrics(userIds, organizationId),
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
               AND ($2::uuid IS NULL OR sc.organization_id = $2::uuid)
             GROUP BY sc.platform_user_id`,
          [userIds, organizationId],
        ),
        runWebappPgText<{ patient_user_id: string; instance_id: string }>(
          `SELECT DISTINCT ON (patient_user_id)
               patient_user_id,
               id AS instance_id
             FROM treatment_program_instances
             WHERE patient_user_id = ANY($1::uuid[])
               AND status = 'active'
               AND assignment_source = 'doctor'
               AND ($2::uuid IS NULL OR organization_id = $2::uuid)
             ORDER BY patient_user_id, updated_at DESC NULLS LAST`,
          [userIds, organizationId],
        ),
        listOnSupportPatientUserIds(organizationId ?? undefined),
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
                     AND ($3::uuid IS NULL OR tpi.organization_id = $3::uuid)
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
              [userIds, filters.viewerUserId, organizationId],
            )
          : Promise.resolve({
              rows: [] as { patient_user_id: string; unread_comments_count: number }[],
            }),
        loadClientMembershipMetrics(userIds, organizationId),
        // no_show_count from booking profile
        runWebappPgText<{ user_id: string; no_show_count: number }>(
          `SELECT
               platform_user_id::text AS user_id,
               COALESCE(no_show_count, 0)::int AS no_show_count
             FROM be_patient_booking_profiles
             WHERE platform_user_id = ANY($1::uuid[])
               AND ($2::uuid IS NULL OR organization_id = $2::uuid)`,
          [userIds, organizationId],
        ),
        runWebappPgText<{ user_id: string }>(
          `SELECT DISTINCT pah.user_id::text AS user_id
             FROM product_analytics_user_hourly pah
             WHERE pah.user_id = ANY($1::uuid[])
               AND pah.entry_channel = 'pwa'`,
          [userIds],
        ),
        runWebappPgText<{ user_id: string }>(
          `SELECT DISTINCT s.user_id::text AS user_id
             FROM user_web_push_subscriptions s
             LEFT JOIN user_channel_preferences p
               ON p.platform_user_id = s.user_id
              AND p.channel_code = 'web_push'
             WHERE s.user_id = ANY($1::uuid[])
               AND COALESCE(p.is_enabled_for_notifications, true) = true`,
          [userIds],
        ),
      ]);

      const appointmentAggByUserId = new Map(
        appointmentAggRows.rows.map((row) => [
          row.user_id,
          {
            hasHistory: Number(row.history_count ?? 0) > 0,
            lastAppointmentAt: row.last_appointment_at
              ? toIsoStringSafe(row.last_appointment_at)
              : null,
            activeCount: Number(row.active_count ?? 0),
            visitedThisCalendarMonth: Number(row.visited_month_count ?? 0) > 0,
          },
        ]),
      );
      const eventMetricsByUserId = new Map(eventMetricRows.map((row) => [row.userId, row]));
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
        unreadExerciseCommentRows.rows.map((row) => [
          row.patient_user_id,
          Number(row.unread_comments_count ?? 0),
        ]),
      );
      const membershipsByPatientId = new Map(
        membershipRows.map((row) => [
          row.userId,
          {
            purchased: row.purchasedMembershipsCount,
            active: row.activeMembershipsCount,
            expired: row.expiredMembershipsCount,
          },
        ]),
      );
      const noShowByPatientId = new Map<string, number>(
        noShowRows.rows.map((row) => [row.user_id, Number(row.no_show_count ?? 0)]),
      );
      const pwaActiveUserIds = new Set<string>(pwaActivityRows.rows.map((row) => row.user_id));
      const webPushEnabledUserIds = new Set<string>(webPushRows.rows.map((row) => row.user_id));

      let list: ClientListItem[] = clientRows.rows.map((r) => {
        const bindings = rowToBindings(bindingsByUser.get(r.id) ?? []);
        const phone = r.phone_normalized;
        const appointmentAgg = appointmentAggByUserId.get(r.id);
        const eventMetrics = eventMetricsByUserId.get(r.id);
        const supportConversation = supportConversationByUserId.get(r.id);
        const activeAppointmentsCount = appointmentAgg?.activeCount ?? 0;
        const activeInstanceId = activeProgramInstanceByPatient.get(r.id) ?? null;
        const email = r.email?.trim() ?? '';
        return {
          userId: r.id,
          displayName: r.display_name ?? '',
          firstName: r.first_name ?? null,
          lastName: r.last_name ?? null,
          patronymic: r.patronymic ?? null,
          phone,
          bindings,
          hasEmail: Boolean(email) || Boolean(r.email_verified_at),
          hasApp: pwaActiveUserIds.has(r.id),
          hasWebPush: webPushEnabledUserIds.has(r.id),
          nextAppointmentLabel: activeAppointmentsCount > 0 ? 'Есть запись' : null,
          hasAppointmentHistory: appointmentAgg?.hasHistory ?? false,
          lastAppointmentAt: appointmentAgg?.lastAppointmentAt ?? null,
          activeAppointmentsCount,
          activeTreatmentProgram: activeInstanceId != null,
          activeTreatmentProgramInstanceId: activeInstanceId,
          cancellationsCount: eventMetrics?.cancellationsCount ?? 0,
          reschedulesCount: eventMetrics?.reschedulesCount ?? 0,
          noShowCount: noShowByPatientId.get(r.id) ?? 0,
          visitedThisCalendarMonth: appointmentAgg?.visitedThisCalendarMonth ?? false,
          hasConversation: supportConversation?.hasConversation ?? false,
          unreadMessagesCount: supportConversation?.unreadCount ?? 0,
          unreadExerciseCommentsCount: unreadExerciseCommentsByPatientId.get(r.id) ?? 0,
          isOnSupport: onSupportIds.has(r.id),
          hasMemberships: (membershipsByPatientId.get(r.id)?.purchased ?? 0) > 0,
          hasActiveMemberships: (membershipsByPatientId.get(r.id)?.active ?? 0) > 0,
          hasExpiredMemberships: (membershipsByPatientId.get(r.id)?.expired ?? 0) > 0,
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
      if (filters.supportStatus === 'on') {
        list = list.filter((item) => item.isOnSupport === true);
      }
      if (filters.supportStatus === 'programWithoutSupport') {
        list = list.filter((item) => item.activeTreatmentProgram && item.isOnSupport !== true);
      }
      // New filters for Patients section
      if (filters.hasEmail === true) {
        list = list.filter((item) => item.hasEmail === true);
      }
      if (filters.hasPhone === true) {
        list = list.filter((item) => Boolean(item.phone?.trim()));
      }
      if (filters.hasApp === true) {
        list = list.filter((item) => item.hasApp === true);
      }
      if (filters.hasWebPush === true) {
        list = list.filter((item) => item.hasWebPush === true);
      }
      if (filters.hasMemberships === true) {
        list = list.filter((item) => item.hasActiveMemberships === true);
      }
      if (filters.hasExpiredMemberships === true) {
        list = list.filter((item) => item.hasExpiredMemberships === true);
      }
      if (filters.hasCancellations === true) {
        list = list.filter((item) => item.cancellationsCount > 0);
      }
      if (filters.hasReschedules === true) {
        list = list.filter((item) => item.reschedulesCount > 0);
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
          (item) =>
            item.hasAppointmentHistory === true && (item.activeAppointmentsCount ?? 0) === 0,
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

    async listPatientAppointments(
      userId: string,
      organizationId?: string,
    ): Promise<PatientAppointmentItem[]> {
      const pool = getPool();
      const canonicalId = (await resolveCanonicalUserId(getWebappSqlDb(), userId)) ?? userId;

      const rows = await runWebappPgText<{
        internal_id: string;
        id: string;
        record_at: Date | string | null;
        status: string;
        service_title: string | null;
        duration_minutes: number | null;
        branch_name: string | null;
        is_package: boolean | null;
        patient_package_id: string | null;
        package_title: string | null;
        package_display_number: number | null;
        has_visit_record: boolean;
      }>(
        `SELECT
           bea.id::text AS internal_id,
           bea.id::text AS id,
           bea.start_at AS record_at,
           bea.status,
           svc.title AS service_title,
           bea.duration_minutes,
           br.title AS branch_name,
           (bea.package_usage_ref IS NOT NULL)::boolean AS is_package,
           u.patient_package_id::text AS patient_package_id,
           pp.title AS package_title,
           pp.display_number AS package_display_number,
           EXISTS (
             SELECT 1
             FROM clinical_visit cv
             WHERE cv.canonical_appointment_id = bea.id
               AND cv.patient_user_id = bea.platform_user_id
               AND cv.organization_id = bea.organization_id
           ) AS has_visit_record
         FROM be_appointments bea
         LEFT JOIN be_branches br ON br.id = bea.branch_id
         LEFT JOIN be_clinic_services svc ON svc.id = bea.service_id
         LEFT JOIN be_package_usages u ON u.id::text = bea.package_usage_ref
         LEFT JOIN be_patient_packages pp ON pp.id = u.patient_package_id
         WHERE bea.platform_user_id = $1::uuid
           AND bea.deleted_at IS NULL
           AND ($2::uuid IS NULL OR bea.organization_id = $2::uuid)
         ORDER BY bea.start_at DESC`,
        [canonicalId, organizationId ?? null],
      );

      const now = Date.now();

      return rows.rows.map((row): PatientAppointmentItem => {
        const recordAtMs = row.record_at ? new Date(row.record_at).getTime() : null;
        const isPast = recordAtMs !== null && recordAtMs < now;

        let status: PatientAppointmentItem['status'];
        if (row.status === 'canceled') {
          status = 'canceled';
        } else if (row.status === 'rescheduled') {
          status = 'rescheduled';
        } else if (
          row.status === 'cancelled_by_patient' ||
          row.status === 'cancelled_by_specialist' ||
          row.status === 'late_cancellation' ||
          row.status === 'no_show'
        ) {
          status = 'canceled';
        } else if (row.status === 'updated') {
          // «updated» = перенесённая запись — показываем актуальный слот
          status = isPast ? 'completed' : 'upcoming';
        } else {
          // «created»
          status = isPast ? 'completed' : 'upcoming';
        }

        const durationRaw = row.duration_minutes;
        const durationMin =
          typeof durationRaw === 'number' && Number.isFinite(durationRaw)
            ? Math.round(durationRaw)
            : null;

        return {
          id: row.id,
          internalId: row.internal_id ?? null,
          dateTime: row.record_at ? new Date(row.record_at).toISOString() : '',
          status,
          serviceName: (row.service_title && row.service_title.trim()) || null,
          location: row.branch_name ?? null,
          durationMin,
          isPackage: row.is_package ?? null,
          patientPackageId: row.patient_package_id ?? null,
          packageTitle: row.package_title ?? null,
          packageDisplayNumber: row.package_display_number ?? null,
          hasVisitRecord: row.has_visit_record,
        };
      });
    },

    async getPatientCardHeader(userId: string) {
      // Resolve canonical user id
      const pool = getPool();
      const canonicalId = (await resolveCanonicalUserId(getWebappSqlDb(), userId)) ?? userId;

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
        `SELECT pu.id, ${FIO_SELECT}, ${CONTACTS.phoneNormalized} AS phone_normalized, pu.email, ${CONTACTS.emailNormalized} AS email_normalized, pu.email_verified_at,
                COALESCE(pu.is_blocked, false) AS is_blocked,
                COALESCE(pu.is_archived, false) AS is_archived,
                pu.role,
                ${FIO.birthDate}::text AS birth_date,
                pu.gender
         FROM platform_users pu
         ${USER_IDENTITY_FIO_JOIN}
         ${USER_CONTACTS_PRIMARY_LATERALS}
         WHERE pu.id = $1::uuid`,
        [canonicalId],
      );
      const ur = userRow.rows[0];
      if (!ur || ur.role !== 'client') return null;

      // Fetch channel bindings
      const bindingsRows = await runWebappPgText<{
        channel_code: string;
        external_id: string;
        bot_blocked_at: string | null;
      }>(
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
      const noShowCount = parseInt(noShowRows.rows[0]?.no_show_count ?? '0', 10);

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
           COUNT(DISTINCT bea.id) FILTER (
             WHERE bea.status NOT IN (${CANONICAL_CANCELLED_STATUS_SQL})
               AND bea.start_at IS NOT NULL
               AND bea.start_at < NOW()
           )::text AS total_visits,
           COUNT(DISTINCT bea.id) FILTER (
             WHERE bea.status IN (${CANONICAL_CANCELLED_STATUS_SQL})
           )::text AS cancellations_count,
           COUNT(DISTINCT r.id)::text AS reschedules_count,
           MAX(bea.start_at) FILTER (
             WHERE bea.status NOT IN (${CANONICAL_CANCELLED_STATUS_SQL})
               AND bea.start_at IS NOT NULL
               AND bea.start_at < NOW()
           ) AS last_visit_at,
           MIN(bea.start_at) FILTER (
             WHERE bea.status NOT IN (${CANONICAL_CANCELLED_STATUS_SQL})
               AND bea.start_at IS NOT NULL
               AND bea.start_at >= NOW()
           ) AS next_appt_at,
           MIN(bea.start_at) FILTER (
             WHERE bea.status NOT IN (${CANONICAL_CANCELLED_STATUS_SQL})
               AND bea.start_at IS NOT NULL
               AND bea.start_at < NOW()
           ) AS first_visit_at
         FROM be_appointments bea
         LEFT JOIN be_appointment_reschedules r ON r.appointment_id = bea.id
         WHERE bea.platform_user_id = $1::uuid
           AND bea.deleted_at IS NULL`,
        [canonicalId],
      );
      const appt = apptRows.rows[0];

      const totalVisits = parseInt(appt?.total_visits ?? '0', 10);
      const cancellationsCount = parseInt(appt?.cancellations_count ?? '0', 10);
      const reschedulesCount = parseInt(appt?.reschedules_count ?? '0', 10);

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

      // Last visit: prefer clinical_visit (has visitType + city); fall back to canonical appointment date
      let lastVisit: import('@/modules/doctor-clients/ports').PatientCardHeader['lastVisit'] = null;
      if (latestClinical) {
        lastVisit = {
          date: new Date(latestClinical.visited_at).toISOString(),
          visitType: latestClinical.visit_type === 'first' ? 'Первичный' : 'Повторный',
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
      let nextAppointment: import('@/modules/doctor-clients/ports').PatientCardHeader['nextAppointment'] =
        null;
      if (appt?.next_appt_at) {
        const dt = new Date(appt.next_appt_at);
        const pad = (n: number) => String(n).padStart(2, '0');
        nextAppointment = {
          date: dt.toISOString(),
          time: `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`,
          city: null,
          appointmentType: null,
        };
      }

      // Support: precise start date + months on support (doctor_patient_support.support_started_at)
      const isOnSupport = supportProfile?.onSupport ?? false;
      const supportStartedAt: string | null = isOnSupport
        ? (supportProfile?.supportStartedAt ?? null)
        : null;
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
          displayName: ur.display_name ?? '',
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
          gender: ur.gender === 'male' || ur.gender === 'female' ? ur.gender : null,
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
      organizationId?: string;
      visibilityActor?: PatientVisibilityActor;
    }): Promise<DoctorDashboardPatientMetrics> {
      const excluded = audience?.excludedUserIds ?? [];
      const organizationId = audience?.organizationId;

      const totalBase = `SELECT COUNT(*)::text AS c FROM platform_users pu WHERE pu.role = 'client' AND pu.merged_into_id IS NULL AND COALESCE(pu.is_archived, false) = false`;
      const totalQ = appendSqlOrganizationEnrollment(
        appendSqlExcludeUserIds(totalBase, 'pu.id', excluded, []),
        'pu.id',
        organizationId,
      );

      const supportBase = `SELECT COUNT(*)::text AS c
           FROM doctor_patient_support dps
           INNER JOIN platform_users pu ON pu.id = dps.patient_user_id
           WHERE dps.on_support = true
             AND pu.role = 'client'
             AND pu.merged_into_id IS NULL
             AND COALESCE(pu.is_archived, false) = false`;
      const supportQ = appendSqlOrganizationColumn(
        appendSqlOrganizationEnrollment(
          appendSqlExcludeUserIds(supportBase, 'pu.id', excluded, []),
          'pu.id',
          organizationId,
        ),
        'dps.organization_id',
        organizationId,
      );

      const visitedParams: unknown[] = [];
      const visitedOrgPredicate = canonicalAppointmentOrgPredicate(
        'bea',
        organizationId,
        visitedParams,
      );
      const visitedBase = `SELECT COUNT(DISTINCT pu.id)::text AS c
           FROM platform_users pu
           INNER JOIN be_appointments bea ON bea.platform_user_id = pu.id
           WHERE pu.role = 'client'
             AND pu.merged_into_id IS NULL
             AND COALESCE(pu.is_archived, false) = false
             AND bea.start_at IS NOT NULL
             AND bea.start_at >= date_trunc('month', NOW())
             AND bea.start_at < date_trunc('month', NOW()) + interval '1 month'
             AND bea.start_at < NOW()
             AND bea.status NOT IN (${CANONICAL_CANCELLED_STATUS_SQL})
             AND bea.deleted_at IS NULL
             AND ${visitedOrgPredicate}`;
      const visitedQ = appendSqlOrganizationEnrollment(
        appendSqlExcludeUserIds(visitedBase, 'pu.id', excluded, visitedParams),
        'pu.id',
        organizationId,
      );

      // «С программой»: хотя бы одна активная treatment_program_instances (doctor-assigned)
      const withProgramBase = `SELECT COUNT(DISTINCT pu.id)::text AS c
           FROM platform_users pu
           INNER JOIN treatment_program_instances tpi ON tpi.patient_user_id = pu.id
           WHERE pu.role = 'client'
             AND pu.merged_into_id IS NULL
             AND COALESCE(pu.is_archived, false) = false
             AND tpi.status = 'active'
             AND tpi.assignment_source = 'doctor'`;
      const withProgramQ = appendSqlOrganizationColumn(
        appendSqlOrganizationEnrollment(
          appendSqlExcludeUserIds(withProgramBase, 'pu.id', excluded, []),
          'pu.id',
          organizationId,
        ),
        'tpi.organization_id',
        organizationId,
      );

      // Legacy aggregate remains the source for past/future appointment segments.
      // UI-4b event and membership metrics are loaded through Drizzle below.
      // Один агрегирующий запрос на платформных клиентов
      const aggParams: unknown[] = [];
      const aggPastOrgPredicate = canonicalAppointmentOrgPredicate(
        'bea',
        organizationId,
        aggParams,
      );
      const aggFutureOrgPredicate = canonicalAppointmentOrgPredicate(
        'bea',
        organizationId,
        aggParams,
      );
      const aggBase = `SELECT
           pu.id,
           COUNT(DISTINCT bea.id) FILTER (
             WHERE bea.deleted_at IS NULL
               AND bea.status NOT IN (${CANONICAL_CANCELLED_STATUS_SQL})
               AND bea.start_at IS NOT NULL
               AND bea.start_at < NOW()
               AND ${aggPastOrgPredicate}
           )::int AS past_count,
           COUNT(DISTINCT bea.id) FILTER (
             WHERE bea.deleted_at IS NULL
               AND bea.status NOT IN (${CANONICAL_CANCELLED_STATUS_SQL})
               AND bea.start_at IS NOT NULL
               AND bea.start_at >= NOW()
               AND ${aggFutureOrgPredicate}
           )::int AS future_count
         FROM platform_users pu
         LEFT JOIN be_appointments bea ON bea.platform_user_id = pu.id
         WHERE pu.role = 'client'
           AND pu.merged_into_id IS NULL
           AND COALESCE(pu.is_archived, false) = false`;
      const aggQ = appendSqlOrganizationEnrollment(
        appendSqlExcludeUserIds(aggBase, 'pu.id', excluded, aggParams),
        'pu.id',
        organizationId,
      );

      const visibleTotalQ = appendSqlPatientVisibility(
        totalQ,
        'pu.id',
        organizationId,
        audience?.visibilityActor,
      );
      const visibleSupportQ = appendSqlPatientVisibility(
        supportQ,
        'pu.id',
        organizationId,
        audience?.visibilityActor,
      );
      const visibleVisitedQ = appendSqlPatientVisibility(
        visitedQ,
        'pu.id',
        organizationId,
        audience?.visibilityActor,
      );
      const visibleWithProgramQ = appendSqlPatientVisibility(
        withProgramQ,
        'pu.id',
        organizationId,
        audience?.visibilityActor,
      );
      const visibleAggQ = appendSqlPatientVisibility(
        aggQ,
        'pu.id',
        organizationId,
        audience?.visibilityActor,
      );

      const [totalR, supportR, visitedR, withProgramR, aggR] = await Promise.all([
        runWebappPgText<{ c: string }>(visibleTotalQ.sql, visibleTotalQ.params),
        runWebappPgText<{ c: string }>(visibleSupportQ.sql, visibleSupportQ.params),
        runWebappPgText<{ c: string }>(visibleVisitedQ.sql, visibleVisitedQ.params),
        runWebappPgText<{ c: string }>(visibleWithProgramQ.sql, visibleWithProgramQ.params),
        runWebappPgText<{
          id: string;
          past_count: number;
          future_count: number;
        }>(`${visibleAggQ.sql} GROUP BY pu.id`, visibleAggQ.params),
      ]);

      const eligibleUserIds = aggR.rows.map((row) => row.id);
      const [eventMetricRows, membershipMetricRows] = await Promise.all([
        loadClientEventMetrics(eligibleUserIds, organizationId ?? null),
        loadClientMembershipMetrics(eligibleUserIds, organizationId ?? null),
      ]);

      let newCount = 0;
      let formerCount = 0;
      let subscriberCount = 0;
      for (const row of aggR.rows) {
        const past = Number(row.past_count ?? 0);
        const future = Number(row.future_count ?? 0);
        // «Новые»: есть будущая запись, но ещё не было прошедшего посещения
        if (future > 0 && past === 0) newCount++;
        // «Бывшие»: были посещения, нет будущей записи
        else if (past > 0 && future === 0) formerCount++;
        // «Подписчики»: никогда не было ни одной записи
        else if (past === 0 && future === 0) subscriberCount++;
      }
      const cancellationsCount = eventMetricRows.filter((row) => row.cancellationsCount > 0).length;
      const reschedulesCount = eventMetricRows.filter((row) => row.reschedulesCount > 0).length;
      const membershipsCount = membershipMetricRows.filter(
        (row) => row.activeMembershipsCount > 0,
      ).length;
      const expiredMembershipsCount = membershipMetricRows.filter(
        (row) => row.expiredMembershipsCount > 0,
      ).length;

      return {
        totalClients: parseInt(totalR.rows[0]?.c ?? '0', 10),
        onSupportCount: parseInt(supportR.rows[0]?.c ?? '0', 10),
        visitedThisCalendarMonthCount: parseInt(visitedR.rows[0]?.c ?? '0', 10),
        withProgramCount: parseInt(withProgramR.rows[0]?.c ?? '0', 10),
        membershipsCount,
        expiredMembershipsCount,
        newCount,
        formerCount,
        subscriberCount,
        cancellationsCount,
        reschedulesCount,
      };
    },

    async getPatientClientIdentity(userId: string): Promise<ClientIdentity | null> {
      const pool = getPool();
      const canonicalId = (await resolveCanonicalUserId(getWebappSqlDb(), userId)) ?? userId;
      const roleRow = await runWebappPgText<{ role: string }>(
        `SELECT role FROM platform_users WHERE id = $1::uuid`,
        [canonicalId],
      );
      if (!roleRow.rows[0] || roleRow.rows[0].role !== 'client') return null;
      return this.getClientIdentity(userId);
    },

    async getClientIdentityForOrganization(
      userId: string,
      organizationId: string,
      actor: PatientVisibilityActor,
    ): Promise<ClientIdentity | null> {
      const pool = getPool();
      const canonicalId = (await resolveCanonicalUserId(getWebappSqlDb(), userId)) ?? userId;
      const visibleIdentityQuery = buildPatientVisibilityPredicate(
        {
          sql: `SELECT pu.id
         FROM platform_users pu
         WHERE pu.id = $1::uuid
           AND pu.role = 'client'
           AND EXISTS (
             SELECT 1
             FROM org_enrollments oe
             WHERE oe.platform_user_id = pu.id
               AND oe.organization_id = $2::uuid
               AND oe.status IN ('invited', 'active')
           )`,
          params: [canonicalId, organizationId],
        },
        'pu.id',
        organizationId,
        actor,
      );
      const membershipRow = await runWebappPgText<{ id: string }>(
        visibleIdentityQuery.sql,
        visibleIdentityQuery.params,
      );
      if (!membershipRow.rows[0]) return null;
      return this.getClientIdentity(canonicalId);
    },

    async getPlatformUserRole(userId: string): Promise<string | null> {
      const roleRow = await runWebappPgText<{ role: string }>(
        `SELECT role FROM platform_users WHERE id = $1::uuid`,
        [userId],
      );
      return roleRow.rows[0]?.role ?? null;
    },

    async getClientIdentity(userId: string): Promise<ClientIdentity | null> {
      const pool = getPool();
      const canonicalId = (await resolveCanonicalUserId(getWebappSqlDb(), userId)) ?? userId;
      const userRow = await runWebappPgText(
        `SELECT pu.id, ${FIO.displayName} AS display_name, ${CONTACTS.phoneNormalized} AS phone_normalized, pu.created_at,
                ${FIO.firstName} AS first_name, ${FIO.lastName} AS last_name, pu.email, pu.email_verified_at,
                COALESCE(pu.is_blocked, false) AS is_blocked,
                pu.blocked_reason,
                COALESCE(pu.is_archived, false) AS is_archived
         FROM platform_users pu
         ${USER_IDENTITY_FIO_JOIN}
         ${USER_CONTACTS_PRIMARY_LATERALS}
         WHERE pu.id = $1`,
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
        'SELECT channel_code, external_id, created_at FROM user_channel_bindings WHERE user_id = $1',
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
        displayName: r.display_name ?? '',
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
        [userId],
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
          [params.userId, params.reason, params.actorId],
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
          [params.userId],
        );
      }
    },

    async setUserArchived(userId: string, archived: boolean): Promise<void> {
      // C-1 (2026-07-26): archiving a user must kill their existing sessions too, not just gate
      // future access. Only incremented when actually archiving (archived = true) — un-archiving
      // does not need to force a re-login. This bump alone is NOT the D2 fix: it kills the cookies
      // that exist right now, while `pgUserByPhone` refusing to load an archived identity is what
      // keeps a session from being resolved or minted on every later request.
      await runWebappPgText(
        `UPDATE platform_users SET
           is_archived = $2,
           session_epoch = session_epoch + CASE WHEN $2 THEN 1 ELSE 0 END,
           updated_at = now()
         WHERE id = $1::uuid AND role = 'client'`,
        [userId, archived],
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
      await runWebappTransaction(async (tx) => {
        await runWebappPgText(
          `UPDATE platform_users SET birth_date = $2::date, updated_at = now()
           WHERE id = $1::uuid AND role = 'client'`,
          [userId, birthDate],
          tx,
        );
        await syncUserIdentityFioMirrorWebapp(tx, userId);
      });
    },

    async setPatientGender(userId: string, gender: 'male' | 'female' | null): Promise<void> {
      await runWebappTransaction((tx) =>
        runWebappPgText(
          `UPDATE platform_users SET gender = $2, updated_at = now()
           WHERE id = $1::uuid AND role = 'client'`,
          [userId, gender],
          tx,
        ),
      );
    },

    async setPatientNames(
      userId: string,
      names: { firstName?: string | null; lastName?: string | null; patronymic?: string | null },
    ): Promise<void> {
      const sets: string[] = [];
      const params: unknown[] = [userId];
      let firstNameExpr = 'first_name';
      let lastNameExpr = 'last_name';
      let patronymicExpr = 'patronymic';
      if (names.firstName !== undefined) {
        params.push(names.firstName);
        sets.push(`first_name = $${params.length}`);
        firstNameExpr = `$${params.length}::text`;
      }
      if (names.lastName !== undefined) {
        params.push(names.lastName);
        sets.push(`last_name = $${params.length}`);
        lastNameExpr = `$${params.length}::text`;
      }
      if (names.patronymic !== undefined) {
        params.push(names.patronymic);
        sets.push(`patronymic = $${params.length}`);
        patronymicExpr = `$${params.length}::text`;
      }
      if (sets.length === 0) return;
      sets.push(`display_name = COALESCE(NULLIF(concat_ws(' ',
          ${lastNameExpr},
          ${firstNameExpr},
          ${patronymicExpr}
        ), ''), '')`);
      await runWebappTransaction(async (tx) => {
        await runWebappPgText(
          `UPDATE platform_users SET ${sets.join(', ')}, updated_at = now()
           WHERE id = $1::uuid AND role = 'client'`,
          params,
          tx,
        );
        await syncUserIdentityFioMirrorWebapp(tx, userId);
      });
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
      const sets: string[] = ['updated_at = now()'];
      const values: unknown[] = [userId];
      if ('heightCm' in params) {
        values.push(params.heightCm ?? null);
        sets.push(`height_cm = $${values.length}::integer`);
      }
      if ('weightKg' in params) {
        values.push(params.weightKg ?? null);
        sets.push(`weight_kg = $${values.length}::integer`);
      }
      if (sets.length <= 1) return; // only updated_at, nothing to do
      await runWebappTransaction((tx) =>
        runWebappPgText(
          `UPDATE platform_users SET ${sets.join(', ')} WHERE id = $1::uuid AND role = 'client'`,
          values,
          tx,
        ),
      );
    },

    async getClientContactBreakdown(audience?: {
      excludedUserIds?: string[];
      organizationId?: string;
      visibilityActor?: PatientVisibilityActor;
    }) {
      const excluded = audience?.excludedUserIds ?? [];
      const organizationId = audience?.organizationId;
      const contactParams: unknown[] = [];
      const appointmentOrgFilter = organizationId
        ? `AND ${canonicalAppointmentOrgPredicate('bea', organizationId, contactParams)}`
        : '';
      const base = `SELECT
           ${sqlActiveTelegramBinding('pu.id')} AS has_telegram,
           ${sqlActiveMaxBinding('pu.id')} AS has_max,
           ${sqlMessengerBotBlocked('pu.id', 'telegram')} AS telegram_bot_blocked,
           ${sqlMessengerBotBlocked('pu.id', 'max')} AS max_bot_blocked,
           (pu.email_verified_at IS NOT NULL) AS has_verified_email,
           ${CONTACTS_HAS_PHONE} AS has_phone,
           EXISTS(
             SELECT 1
             FROM be_appointments bea
             WHERE bea.platform_user_id = pu.id
               AND bea.deleted_at IS NULL
               ${appointmentOrgFilter}
           ) AS has_appointment
         FROM platform_users pu
         ${USER_CONTACTS_PRIMARY_PHONE_LATERAL}
         WHERE pu.role = 'client'
           AND pu.merged_into_id IS NULL
           AND COALESCE(pu.is_archived, false) = false`;
      const q = appendSqlOrganizationEnrollment(
        appendSqlExcludeUserIds(base, 'pu.id', excluded, contactParams),
        'pu.id',
        organizationId,
      );
      const visibleQ = appendSqlPatientVisibility(
        q,
        'pu.id',
        organizationId,
        audience?.visibilityActor,
      );
      const rows = await runWebappPgText<{
        has_telegram: boolean;
        has_max: boolean;
        telegram_bot_blocked: boolean;
        max_bot_blocked: boolean;
        has_verified_email: boolean;
        has_phone: boolean;
        has_appointment: boolean;
      }>(visibleQ.sql, visibleQ.params);
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
