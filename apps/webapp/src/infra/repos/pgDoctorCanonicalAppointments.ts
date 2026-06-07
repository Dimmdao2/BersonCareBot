import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  beAppointmentCancellations,
  beAppointmentReschedules,
} from "../../../db/schema/bookingPolicies";
import {
  beAppointments,
  beBranches,
  beClinicServices,
} from "../../../db/schema/bookingEngine";
import { platformUsers } from "../../../db/schema/schema";
import { resolveAppointmentStatsBounds } from "@/modules/doctor-appointments/resolveAppointmentStatsBounds";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { localDayRangeBoundsIso } from "@/shared/datetime/localDayRangeBounds";
import { appointmentStatusLabel } from "@/modules/booking-calendar/appointmentStatusLabels";
import {
  filterCanonicalRowsNotPurged,
  PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL,
} from "@/infra/repos/doctorAppointmentPurgeFilter";
import type { AppointmentStatus } from "@/modules/booking-engine/types";
import type {
  AppointmentRow,
  AppointmentStats,
  DoctorAppointmentStatsFilter,
  DoctorAppointmentsListFilter,
  DoctorAppointmentsPort,
  DoctorDashboardAppointmentMetrics,
} from "@/modules/doctor-appointments/ports";

const CANCELLED_STATUSES = [
  "cancelled_by_patient",
  "cancelled_by_specialist",
  "late_cancellation",
  "no_show",
] as const;

function appointmentUserAudienceCond(excludedUserIds: string[]) {
  if (excludedUserIds.length === 0) return undefined;
  return or(
    isNull(beAppointments.platformUserId),
    notInArray(beAppointments.platformUserId, excludedUserIds),
  );
}

const BE_APPOINTMENTS_NOT_PURGED = sql.raw(PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL);

const ACTIVE_UPCOMING_STATUSES = [
  "created",
  "awaiting_payment",
  "paid",
  "confirmed",
  "rescheduled",
  "manual_review_required",
] as const;

function patientDisplayName(row: {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  const fromParts = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  if (fromParts) return fromParts;
  const dn = row.displayName.trim();
  return dn || "Неизвестный клиент";
}

function contactNameFromAttribution(attr: Record<string, unknown> | null | undefined): string | null {
  if (!attr) return null;
  const v =
    typeof attr.contact_name === "string"
      ? attr.contact_name
      : typeof attr.contactName === "string"
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
  serviceTitle: string | null;
  branchTitle: string | null;
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
        })
      : null;
  const phoneLabel = row.phoneNormalized?.trim() || null;
  const clientLabel = linkedName ?? attrName ?? phoneLabel ?? "Неизвестный клиент";
  return {
    id: row.id,
    clientUserId: row.platformUserId ?? "",
    clientLabel,
    rubitimeNameIfDifferent: null,
    time: "",
    recordAtIso: row.startAt,
    dateKey: "",
    type: row.serviceTitle?.trim() || "Запись",
    status: appointmentStatusLabel(row.status as AppointmentStatus),
    link: null,
    cancellationCountForClient: 0,
    branchName: row.branchTitle ?? null,
  };
}

const listSelect = {
  id: beAppointments.id,
  startAt: beAppointments.startAt,
  status: beAppointments.status,
  phoneNormalized: beAppointments.phoneNormalized,
  attributionJson: beAppointments.attributionJson,
  platformUserId: beAppointments.platformUserId,
  displayName: platformUsers.displayName,
  firstName: platformUsers.firstName,
  lastName: platformUsers.lastName,
  serviceTitle: beClinicServices.title,
  branchTitle: beBranches.title,
};

export function createPgDoctorCanonicalAppointmentsPort(
  getDefaultOrganizationId: () => Promise<string>,
): DoctorAppointmentsPort {
  return {
    async listAppointmentsForSpecialist(
      filter: DoctorAppointmentsListFilter,
      audience?: { excludedUserIds?: string[] },
    ): Promise<AppointmentRow[]> {
      const db = getDrizzle();
      const organizationId = await getDefaultOrganizationId();
      const base = and(eq(beAppointments.organizationId, organizationId), isNotNull(beAppointments.startAt));
      const userAudience = appointmentUserAudienceCond(audience?.excludedUserIds ?? []);

      let rows: ListRow[] = [];

      if (filter.kind === "range") {
        const iana = await getAppDisplayTimeZone();
        const { from, to } = localDayRangeBoundsIso(filter.range, iana);
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .where(and(base, userAudience, gte(beAppointments.startAt, from), lte(beAppointments.startAt, to)))
          .orderBy(asc(beAppointments.startAt));
      } else if (filter.kind === "statsRange") {
        const iana = await getAppDisplayTimeZone();
        const { from, toExclusive } = resolveAppointmentStatsBounds({ kind: "range", range: filter.range }, iana);
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .where(and(eq(beAppointments.organizationId, organizationId), userAudience, gte(beAppointments.startAt, from), lt(beAppointments.startAt, toExclusive)))
          .orderBy(desc(beAppointments.startAt));
      } else if (filter.kind === "futureActive") {
        const nowIso = new Date().toISOString();
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .where(
            and(
              base,
              userAudience,
              gte(beAppointments.startAt, nowIso),
              inArray(beAppointments.status, [...ACTIVE_UPCOMING_STATUSES]),
            ),
          )
          .orderBy(asc(beAppointments.startAt));
      } else if (filter.kind === "recordsInCalendarMonth") {
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .where(
            and(
              base,
              userAudience,
              gte(beAppointments.startAt, sql`date_trunc('month', NOW())`),
              lte(beAppointments.startAt, sql`date_trunc('month', NOW()) + interval '1 month'`),
            ),
          )
          .orderBy(asc(beAppointments.startAt));
      } else if (filter.kind === "past") {
        const nowIso = new Date().toISOString();
        const limit = filter.limit ?? 50;
        const offset = filter.offset ?? 0;
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .where(and(base, userAudience, lt(beAppointments.startAt, nowIso)))
          .orderBy(desc(beAppointments.startAt))
          .limit(limit)
          .offset(offset);
      } else if (filter.kind === "cancellations30d") {
        rows = await db
          .select(listSelect)
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .where(
            and(
              eq(beAppointments.organizationId, organizationId),
              userAudience,
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
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .where(
            and(
              eq(beAppointments.organizationId, organizationId),
              userAudience,
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
      audience?: { excludedUserIds?: string[] },
    ): Promise<AppointmentStats> {
      const db = getDrizzle();
      const organizationId = await getDefaultOrganizationId();
      const iana = await getAppDisplayTimeZone();
      const { from, toExclusive } = resolveAppointmentStatsBounds(filter, iana);
      const excluded = audience?.excludedUserIds ?? [];
      const userAudience = appointmentUserAudienceCond(excluded);
      const rangeCond = and(
        eq(beAppointments.organizationId, organizationId),
        gte(beAppointments.startAt, from),
        lt(beAppointments.startAt, toExclusive),
        userAudience,
      );
      const createdInRangeCond = and(
        eq(beAppointments.organizationId, organizationId),
        gte(beAppointments.createdAt, from),
        lt(beAppointments.createdAt, toExclusive),
        userAudience,
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
        db.select({ count: count() }).from(beAppointments).where(and(rangeCond, BE_APPOINTMENTS_NOT_PURGED)),
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
            and(rangeCond, inArray(beAppointments.status, [...CANCELLED_STATUSES]), BE_APPOINTMENTS_NOT_PURGED),
          ),
        db
          .select({ count: count() })
          .from(beAppointments)
          .where(and(createdInRangeCond, BE_APPOINTMENTS_NOT_PURGED)),
        db
          .select({ count: count() })
          .from(beAppointmentCancellations)
          .innerJoin(beAppointments, eq(beAppointments.id, beAppointmentCancellations.appointmentId))
          .where(
            and(
              eq(beAppointmentCancellations.organizationId, organizationId),
              gte(beAppointmentCancellations.createdAt, from),
              lt(beAppointmentCancellations.createdAt, toExclusive),
              userAudience,
            ),
          ),
        db
          .select({ count: count() })
          .from(beAppointmentReschedules)
          .innerJoin(beAppointments, eq(beAppointments.id, beAppointmentReschedules.appointmentId))
          .where(
            and(
              eq(beAppointmentReschedules.organizationId, organizationId),
              gte(beAppointmentReschedules.createdAt, from),
              lt(beAppointmentReschedules.createdAt, toExclusive),
              userAudience,
            ),
          ),
        db
          .select({ count: count() })
          .from(beAppointments)
          .where(
            and(
              eq(beAppointments.organizationId, organizationId),
              inArray(beAppointments.status, [...CANCELLED_STATUSES]),
              gte(beAppointments.updatedAt, sql`NOW() - interval '30 days'`),
              userAudience,
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
      };
    },

    async getDashboardAppointmentMetrics(audience?: {
      excludedUserIds?: string[];
    }): Promise<DoctorDashboardAppointmentMetrics> {
      const db = getDrizzle();
      const organizationId = await getDefaultOrganizationId();
      const userAudience = appointmentUserAudienceCond(audience?.excludedUserIds ?? []);
      const orgCond = and(eq(beAppointments.organizationId, organizationId), userAudience);
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
  };
}
