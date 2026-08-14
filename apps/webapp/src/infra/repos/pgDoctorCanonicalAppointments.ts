import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import {
  beAppointmentCancellations,
  beAppointmentReschedules,
} from '../../../db/schema/bookingPolicies';
import { beAppointments, beBranches, beClinicServices } from '../../../db/schema/bookingEngine';
import { bePackageUsages, bePatientPackages } from '../../../db/schema/bookingMemberships';
import { platformUsers, userIdentity } from '../../../db/schema/schema';
import { drizzleFioCols, drizzleUserIdentityFioJoin } from '@/infra/repos/userIdentityFioSql';
import { resolveAppointmentStatsBounds } from '@/modules/doctor-appointments/resolveAppointmentStatsBounds';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { localDayRangeBoundsIso } from '@/shared/datetime/localDayRangeBounds';
import { appointmentStatusLabel } from '@/modules/booking-calendar/appointmentStatusLabels';
import { drizzleExcludeUserIdColumn } from '@/modules/analytics/analyticsAudience';
import {
  filterCanonicalRowsNotPurged,
  PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL,
} from '@/infra/repos/doctorAppointmentPurgeFilter';
import type { AppointmentStatus } from '@/modules/booking-engine/types';
import { formatDoctorFio } from '@/shared/lib/fio';
import type {
  AppointmentRow,
  AppointmentStats,
  DoctorAppointmentStatsFilter,
  DoctorAppointmentsListFilter,
  DoctorAppointmentsPort,
  DoctorDashboardAppointmentMetrics,
  ScheduleKpis,
  ScheduleKpisQuery,
  DoctorScheduleKpisAudience,
  DoctorAppointmentsAudience,
} from '@/modules/doctor-appointments/ports';

const CANCELLED_STATUSES = [
  'cancelled_by_patient',
  'cancelled_by_specialist',
  'late_cancellation',
  'no_show',
] as const;

function appointmentUserAudienceCond(excludedUserIds: string[]) {
  const exclude = drizzleExcludeUserIdColumn(beAppointments.platformUserId, excludedUserIds);
  if (!exclude) return undefined;
  return or(isNull(beAppointments.platformUserId), exclude);
}

function appointmentVisibilityCond(audience: DoctorAppointmentsAudience | undefined) {
  if (!audience?.organizationId) return undefined;
  const actor = audience.visibilityActor;
  if (!actor) throw new Error('patient_visibility_actor_required');
  if (actor.canManageAllSpecialists) return undefined;
  return actor.specialistId ? eq(beAppointments.specialistId, actor.specialistId) : sql`false`;
}

const BE_APPOINTMENTS_NOT_PURGED = sql.raw(PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL);

const ACTIVE_UPCOMING_STATUSES = [
  'created',
  'awaiting_payment',
  'paid',
  'confirmed',
  'rescheduled',
  'manual_review_required',
] as const;

function patientDisplayName(row: {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  patronymic: string | null;
}): string {
  return (
    formatDoctorFio(
      { lastName: row.lastName, firstName: row.firstName, patronymic: row.patronymic },
      row.displayName,
    ) || 'Неизвестный клиент'
  );
}

function contactNameFromAttribution(
  attr: Record<string, unknown> | null | undefined,
): string | null {
  if (!attr) return null;
  const v =
    typeof attr.contact_name === 'string'
      ? attr.contact_name
      : typeof attr.contactName === 'string'
        ? attr.contactName
        : null;
  return v?.trim() || null;
}

type ListRow = {
  id: string;
  startAt: string | null;
  status: string;
  phoneNormalized: string | null;
  attributionJson: unknown;
  platformUserId: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  patronymic: string | null;
  serviceTitle: string | null;
  branchTitle: string | null;
  packageUsageRef: string | null;
  packageTitle: string | null;
  packageDisplayNumber: number | null;
};

function mapListRow(row: ListRow): AppointmentRow {
  const attr = (row.attributionJson ?? {}) as Record<string, unknown>;
  const attrName = contactNameFromAttribution(attr);
  const linkedName =
    row.displayName != null
      ? patientDisplayName({
          displayName: row.displayName,
          firstName: row.firstName,
          lastName: row.lastName,
          patronymic: row.patronymic,
        })
      : null;
  const phoneLabel = row.phoneNormalized?.trim() || null;
  const clientLabel = linkedName ?? attrName ?? phoneLabel ?? 'Неизвестный клиент';
  return {
    id: row.id,
    clientUserId: row.platformUserId ?? '',
    clientLabel,
    time: '',
    recordAtIso: row.startAt,
    dateKey: '',
    type: row.serviceTitle?.trim() || 'Запись',
    status: appointmentStatusLabel(row.status as AppointmentStatus),
    link: null,
    cancellationCountForClient: 0,
    branchName: row.branchTitle ?? null,
    packageUsageRef: row.packageUsageRef,
    packageTitle: row.packageTitle,
    packageDisplayNumber: row.packageDisplayNumber,
  };
}

const listSelect = {
  id: beAppointments.id,
  startAt: beAppointments.startAt,
  status: beAppointments.status,
  phoneNormalized: beAppointments.phoneNormalized,
  attributionJson: beAppointments.attributionJson,
  platformUserId: beAppointments.platformUserId,
  displayName: drizzleFioCols.displayName,
  firstName: drizzleFioCols.firstName,
  lastName: drizzleFioCols.lastName,
  patronymic: drizzleFioCols.patronymic,
  serviceTitle: beClinicServices.title,
  branchTitle: beBranches.title,
  packageUsageRef: beAppointments.packageUsageRef,
  packageTitle: bePatientPackages.title,
  packageDisplayNumber: bePatientPackages.displayNumber,
};

const UUID_TEXT_RE =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

function packageUsageJoinCond() {
  return sql`${beAppointments.packageUsageRef} ~ ${UUID_TEXT_RE} AND ${bePackageUsages.id} = ${beAppointments.packageUsageRef}::uuid`;
}

export function createPgDoctorCanonicalAppointmentsPort(
  getDefaultOrganizationId: () => Promise<string>,
): DoctorAppointmentsPort {
  return {
    async listAppointmentsForSpecialist(
      filter: DoctorAppointmentsListFilter,
      audience?: DoctorAppointmentsAudience,
    ): Promise<AppointmentRow[]> {
      const db = getDrizzle();
      const organizationId = audience?.organizationId ?? (await getDefaultOrganizationId());
      const specialistAudience = appointmentVisibilityCond(audience);
      // F1b: soft-deleted (deleted_at) canonical rows are hidden from all doctor reads.
      const base = and(
        eq(beAppointments.organizationId, organizationId),
        isNull(beAppointments.deletedAt),
        isNotNull(beAppointments.startAt),
        specialistAudience,
      );
      const userAudience = appointmentUserAudienceCond(audience?.excludedUserIds ?? []);

      let rows: ListRow[] = [];

      if (filter.kind === 'range') {
        const iana = await getAppDisplayTimeZone();
        const { from, to } = localDayRangeBoundsIso(filter.range, iana);
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .leftJoin(bePackageUsages, packageUsageJoinCond())
          .leftJoin(bePatientPackages, eq(bePatientPackages.id, bePackageUsages.patientPackageId))
          .where(
            and(
              base,
              userAudience,
              gte(beAppointments.startAt, from),
              lte(beAppointments.startAt, to),
            ),
          )
          .orderBy(asc(beAppointments.startAt));
      } else if (filter.kind === 'statsRange') {
        const iana = await getAppDisplayTimeZone();
        const { from, toExclusive } = resolveAppointmentStatsBounds(
          { kind: 'range', range: filter.range },
          iana,
        );
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .leftJoin(bePackageUsages, packageUsageJoinCond())
          .leftJoin(bePatientPackages, eq(bePatientPackages.id, bePackageUsages.patientPackageId))
          .where(
            and(
              eq(beAppointments.organizationId, organizationId),
              isNull(beAppointments.deletedAt),
              userAudience,
              specialistAudience,
              gte(beAppointments.startAt, from),
              lt(beAppointments.startAt, toExclusive),
            ),
          )
          .orderBy(desc(beAppointments.startAt));
      } else if (filter.kind === 'futureActive') {
        const nowIso = new Date().toISOString();
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .leftJoin(bePackageUsages, packageUsageJoinCond())
          .leftJoin(bePatientPackages, eq(bePatientPackages.id, bePackageUsages.patientPackageId))
          .where(
            and(
              base,
              userAudience,
              gte(beAppointments.startAt, nowIso),
              inArray(beAppointments.status, [...ACTIVE_UPCOMING_STATUSES]),
            ),
          )
          .orderBy(asc(beAppointments.startAt));
      } else if (filter.kind === 'recordsInCalendarMonth') {
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .leftJoin(bePackageUsages, packageUsageJoinCond())
          .leftJoin(bePatientPackages, eq(bePatientPackages.id, bePackageUsages.patientPackageId))
          .where(
            and(
              base,
              userAudience,
              gte(beAppointments.startAt, sql`date_trunc('month', NOW())`),
              lte(beAppointments.startAt, sql`date_trunc('month', NOW()) + interval '1 month'`),
            ),
          )
          .orderBy(asc(beAppointments.startAt));
      } else if (filter.kind === 'past') {
        const nowIso = new Date().toISOString();
        const limit = filter.limit ?? 50;
        const offset = filter.offset ?? 0;
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .leftJoin(bePackageUsages, packageUsageJoinCond())
          .leftJoin(bePatientPackages, eq(bePatientPackages.id, bePackageUsages.patientPackageId))
          .where(and(base, userAudience, lt(beAppointments.startAt, nowIso)))
          .orderBy(desc(beAppointments.startAt))
          .limit(limit)
          .offset(offset);
      } else if (filter.kind === 'cancellations30d') {
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .leftJoin(bePackageUsages, packageUsageJoinCond())
          .leftJoin(bePatientPackages, eq(bePatientPackages.id, bePackageUsages.patientPackageId))
          .where(
            and(
              eq(beAppointments.organizationId, organizationId),
              isNull(beAppointments.deletedAt),
              userAudience,
              specialistAudience,
              inArray(beAppointments.status, [...CANCELLED_STATUSES]),
              gte(beAppointments.updatedAt, sql`NOW() - interval '30 days'`),
            ),
          )
          .orderBy(desc(beAppointments.updatedAt));
      } else {
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .leftJoin(bePackageUsages, packageUsageJoinCond())
          .leftJoin(bePatientPackages, eq(bePatientPackages.id, bePackageUsages.patientPackageId))
          .where(
            and(
              eq(beAppointments.organizationId, organizationId),
              isNull(beAppointments.deletedAt),
              userAudience,
              specialistAudience,
              inArray(beAppointments.status, [...CANCELLED_STATUSES]),
              gte(beAppointments.updatedAt, sql`date_trunc('month', NOW())`),
              lte(beAppointments.updatedAt, sql`date_trunc('month', NOW()) + interval '1 month'`),
            ),
          )
          .orderBy(sql`${beAppointments.updatedAt} DESC`);
      }

      const visibleRows = await filterCanonicalRowsNotPurged(organizationId, rows);
      return visibleRows.map(mapListRow);
    },

    async getAppointmentStats(
      filter: DoctorAppointmentStatsFilter,
      audience?: DoctorAppointmentsAudience,
    ): Promise<AppointmentStats> {
      const db = getDrizzle();
      const organizationId = audience?.organizationId ?? (await getDefaultOrganizationId());
      const iana = await getAppDisplayTimeZone();
      const { from, toExclusive } = resolveAppointmentStatsBounds(filter, iana);
      const excluded = audience?.excludedUserIds ?? [];
      const userAudience = appointmentUserAudienceCond(excluded);
      const specialistAudience = appointmentVisibilityCond(audience);
      const rangeCond = and(
        eq(beAppointments.organizationId, organizationId),
        isNull(beAppointments.deletedAt),
        gte(beAppointments.startAt, from),
        lt(beAppointments.startAt, toExclusive),
        userAudience,
        specialistAudience,
      );
      const createdInRangeCond = and(
        eq(beAppointments.organizationId, organizationId),
        isNull(beAppointments.deletedAt),
        gte(beAppointments.createdAt, from),
        lt(beAppointments.createdAt, toExclusive),
        userAudience,
        specialistAudience,
      );
      const [
        totalRow,
        pastVisitsRow,
        cancelledVisitsRow,
        bookingsCreatedRow,
        cancellationActionsRow,
        rescheduleActionsRow,
        cancel30Row,
      ] = await Promise.all([
        db
          .select({ count: count() })
          .from(beAppointments)
          .where(and(rangeCond, BE_APPOINTMENTS_NOT_PURGED)),
        db
          .select({ count: count() })
          .from(beAppointments)
          .where(
            and(
              rangeCond,
              lt(beAppointments.startAt, sql`NOW()`),
              notInArray(beAppointments.status, [...CANCELLED_STATUSES]),
            ),
          ),
        db
          .select({ count: count() })
          .from(beAppointments)
          .where(
            and(
              rangeCond,
              inArray(beAppointments.status, [...CANCELLED_STATUSES]),
              BE_APPOINTMENTS_NOT_PURGED,
            ),
          ),
        db
          .select({ count: count() })
          .from(beAppointments)
          .where(and(createdInRangeCond, BE_APPOINTMENTS_NOT_PURGED)),
        db
          .select({ count: count() })
          .from(beAppointmentCancellations)
          .innerJoin(
            beAppointments,
            eq(beAppointments.id, beAppointmentCancellations.appointmentId),
          )
          .where(
            and(
              eq(beAppointmentCancellations.organizationId, organizationId),
              isNull(beAppointments.deletedAt),
              gte(beAppointmentCancellations.createdAt, from),
              lt(beAppointmentCancellations.createdAt, toExclusive),
              userAudience,
              specialistAudience,
            ),
          ),
        db
          .select({ count: count() })
          .from(beAppointmentReschedules)
          .innerJoin(beAppointments, eq(beAppointments.id, beAppointmentReschedules.appointmentId))
          .where(
            and(
              eq(beAppointmentReschedules.organizationId, organizationId),
              isNull(beAppointments.deletedAt),
              gte(beAppointmentReschedules.createdAt, from),
              lt(beAppointmentReschedules.createdAt, toExclusive),
              userAudience,
              specialistAudience,
            ),
          ),
        db
          .select({ count: count() })
          .from(beAppointments)
          .where(
            and(
              eq(beAppointments.organizationId, organizationId),
              isNull(beAppointments.deletedAt),
              inArray(beAppointments.status, [...CANCELLED_STATUSES]),
              gte(beAppointments.updatedAt, sql`NOW() - interval '30 days'`),
              userAudience,
              specialistAudience,
              BE_APPOINTMENTS_NOT_PURGED,
            ),
          ),
      ]);

      return {
        pastVisitsInPeriod: pastVisitsRow[0]?.count ?? 0,
        cancelledVisitsInPeriod: cancelledVisitsRow[0]?.count ?? 0,
        bookingsCreatedInPeriod: bookingsCreatedRow[0]?.count ?? 0,
        cancellationActionsInPeriod: cancellationActionsRow[0]?.count ?? 0,
        rescheduleActionsInPeriod: rescheduleActionsRow[0]?.count ?? 0,
        total: totalRow[0]?.count ?? 0,
        cancellations30d: cancel30Row[0]?.count ?? 0,
        firstVisitInPeriod: 0,
        repeatVisitInPeriod: 0,
      };
    },

    async getDashboardAppointmentMetrics(
      audience?: DoctorAppointmentsAudience,
    ): Promise<DoctorDashboardAppointmentMetrics> {
      const db = getDrizzle();
      const organizationId = audience?.organizationId ?? (await getDefaultOrganizationId());
      const userAudience = appointmentUserAudienceCond(audience?.excludedUserIds ?? []);
      const specialistAudience = appointmentVisibilityCond(audience);
      const orgCond = and(
        eq(beAppointments.organizationId, organizationId),
        isNull(beAppointments.deletedAt),
        userAudience,
        specialistAudience,
      );
      const nowIso = new Date().toISOString();

      const [futureR, monthR, cancelR] = await Promise.all([
        db
          .select({ c: count() })
          .from(beAppointments)
          .where(
            and(
              orgCond,
              isNotNull(beAppointments.startAt),
              gte(beAppointments.startAt, nowIso),
              inArray(beAppointments.status, [...ACTIVE_UPCOMING_STATUSES]),
              BE_APPOINTMENTS_NOT_PURGED,
            ),
          ),
        db
          .select({ c: count() })
          .from(beAppointments)
          .where(
            and(
              orgCond,
              isNotNull(beAppointments.startAt),
              gte(beAppointments.startAt, sql`date_trunc('month', NOW())`),
              lte(beAppointments.startAt, sql`date_trunc('month', NOW()) + interval '1 month'`),
              BE_APPOINTMENTS_NOT_PURGED,
            ),
          ),
        db
          .select({ c: count() })
          .from(beAppointments)
          .where(
            and(
              orgCond,
              inArray(beAppointments.status, [...CANCELLED_STATUSES]),
              gte(beAppointments.updatedAt, sql`date_trunc('month', NOW())`),
              lte(beAppointments.updatedAt, sql`date_trunc('month', NOW()) + interval '1 month'`),
              BE_APPOINTMENTS_NOT_PURGED,
            ),
          ),
      ]);

      return {
        futureActiveCount: futureR[0]?.c ?? 0,
        recordsInCalendarMonthTotal: monthR[0]?.c ?? 0,
        cancellationsInCalendarMonth: cancelR[0]?.c ?? 0,
      };
    },

    async getScheduleKpis(
      query: ScheduleKpisQuery,
      audience: DoctorScheduleKpisAudience,
    ): Promise<ScheduleKpis> {
      if (!audience?.organizationId) {
        throw new Error('schedule_kpis_organization_required');
      }
      const db = getDrizzle();
      const organizationId = audience.organizationId;
      const nowIso = new Date().toISOString();
      const { from, to: toExclusive, branchId, serviceId, specialistId } = query;
      const excluded = audience?.excludedUserIds ?? [];
      const userAudience = appointmentUserAudienceCond(excluded);

      // Optional branch/service filters
      const branchCond = branchId ? eq(beAppointments.branchId, branchId) : undefined;
      const serviceCond = serviceId ? eq(beAppointments.serviceId, serviceId) : undefined;
      const specialistCond = specialistId
        ? eq(beAppointments.specialistId, specialistId)
        : undefined;

      // Base condition: non-cancelled, start_at in [from, toExclusive)
      const activeRangeCond = and(
        eq(beAppointments.organizationId, organizationId),
        isNull(beAppointments.deletedAt),
        gte(beAppointments.startAt, from),
        lt(beAppointments.startAt, toExclusive),
        notInArray(beAppointments.status, [...CANCELLED_STATUSES]),
        userAudience,
        branchCond,
        serviceCond,
        specialistCond,
        BE_APPOINTMENTS_NOT_PURGED,
      );

      // Cancelled with start_at in window (for cancellationsInPeriod §13.1)
      const cancelledRangeCond = and(
        eq(beAppointments.organizationId, organizationId),
        isNull(beAppointments.deletedAt),
        gte(beAppointments.startAt, from),
        lt(beAppointments.startAt, toExclusive),
        inArray(beAppointments.status, [...CANCELLED_STATUSES]),
        userAudience,
        branchCond,
        serviceCond,
        specialistCond,
        BE_APPOINTMENTS_NOT_PURGED,
      );

      const [
        recordsRow,
        pastRow,
        futureRow,
        bySubscriptionRow,
        uniqueRow,
        cancellationRow,
        rescheduleRow,
      ] = await Promise.all([
        // recordsInPeriod: non-cancelled, start_at in window
        db.select({ c: count() }).from(beAppointments).where(activeRangeCond),
        // pastInPeriod: non-cancelled, start_at in window AND < now()
        db
          .select({ c: count() })
          .from(beAppointments)
          .where(and(activeRangeCond, lt(beAppointments.startAt, nowIso))),
        // futureInPeriod: non-cancelled, start_at in window AND >= now()
        db
          .select({ c: count() })
          .from(beAppointments)
          .where(and(activeRangeCond, gte(beAppointments.startAt, nowIso))),
        // bySubscriptionInPeriod: non-cancelled with packageUsageRef != null
        db
          .select({ c: count() })
          .from(beAppointments)
          .where(and(activeRangeCond, isNotNull(beAppointments.packageUsageRef))),
        // uniquePatientsInPeriod
        db
          .select({ c: countDistinct(beAppointments.platformUserId) })
          .from(beAppointments)
          .where(activeRangeCond),
        // cancellationsInPeriod: cancelled records by date of visit (start_at in window) §13.1
        db.select({ c: count() }).from(beAppointments).where(cancelledRangeCond),
        // reschedulesInPeriod: non-cancelled with rescheduleCount > 0, start_at in window §13.1
        db
          .select({ c: count() })
          .from(beAppointments)
          .where(and(activeRangeCond, gt(beAppointments.rescheduleCount, 0))),
      ]);

      // firstVisitInPeriod: non-cancelled records in window that are the patient's first-ever
      // non-cancelled appointment — i.e. NO earlier non-cancelled appointment than THIS one.
      // Strict total order by (start_at, id) so each patient contributes at most one "first",
      // even when the same new patient has several appointments inside the window.
      // We select both count AND ids so the frontend modal can filter by the exact same set.
      const firstVisitRows = await db
        .select({ id: beAppointments.id })
        .from(beAppointments)
        .where(
          and(
            activeRangeCond,
            isNotNull(beAppointments.platformUserId),
            sql`NOT EXISTS (
              SELECT 1 FROM be_appointments earlier
              WHERE earlier.organization_id = ${organizationId}
                AND earlier.deleted_at IS NULL
                AND earlier.platform_user_id = ${beAppointments.platformUserId}
                AND (
                  earlier.start_at < ${beAppointments.startAt}
                  OR (earlier.start_at = ${beAppointments.startAt} AND earlier.id < ${beAppointments.id})
                )
                AND earlier.status NOT IN (${sql.join(
                  CANCELLED_STATUSES.map((s) => sql`${s}`),
                  sql`, `,
                )})
            )`,
          ),
        );

      const recordsInPeriod = recordsRow[0]?.c ?? 0;
      const firstVisitIds = firstVisitRows.map((r) => r.id);
      const firstVisitInPeriod = firstVisitIds.length;

      return {
        recordsInPeriod,
        pastInPeriod: pastRow[0]?.c ?? 0,
        futureInPeriod: futureRow[0]?.c ?? 0,
        bySubscriptionInPeriod: bySubscriptionRow[0]?.c ?? 0,
        firstVisitInPeriod,
        firstVisitIds,
        repeatVisitInPeriod: Math.max(0, recordsInPeriod - firstVisitInPeriod),
        uniquePatientsInPeriod: uniqueRow[0]?.c ?? 0,
        cancellationsInPeriod: cancellationRow[0]?.c ?? 0,
        reschedulesInPeriod: rescheduleRow[0]?.c ?? 0,
      };
    },

    // Canonical appointments are not yet used for daily series analytics; stub returns empty.
    async getAppointmentDailySeries() {
      return { daySeries: [], branchSeries: [] };
    },
  };
}
