import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, notInArray, or, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import {
  beAppointments,
  beBranches,
  beClinicServices,
  beRooms,
  beSpecialists,
  beSpecialistServiceAvailability,
} from '../../../db/schema/bookingEngine';
import {
  beBookingFormFields,
  beBookingFormSubmissions,
} from '../../../db/schema/bookingScheduling';
import { bePaymentIntents } from '../../../db/schema/bookingPayments';
import { bePackageUsages, bePatientPackages } from '../../../db/schema/bookingMemberships';
import { patientBookings, platformUsers, userIdentity } from '../../../db/schema/schema';
import { drizzleFioCols, drizzleUserIdentityFioJoin } from '@/infra/repos/userIdentityFioSql';
import { drizzlePrimaryPhoneCol } from '@/infra/repos/userContactsSql';
import type { BookingCalendarPort } from '@/modules/booking-calendar/ports';
import type {
  CalendarAppointmentEvent,
  AppointmentFeedFilters,
  AppointmentFeedPage,
  CalendarFilterMeta,
  CalendarFilters,
} from '@/modules/booking-calendar/types';
import { filterCanonicalRowsNotPurged } from '@/infra/repos/doctorAppointmentPurgeFilter';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function patientDisplayName(row: {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  const fromParts = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  if (fromParts) return fromParts;
  const dn = row.displayName.trim();
  return dn || 'Пациент';
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

export function isPrepaymentPending(
  appointmentStatus: string,
  paymentStatus: string | null | undefined,
): boolean {
  if (appointmentStatus === 'awaiting_payment') return true;
  if (!paymentStatus) return false;
  return paymentStatus === 'pending' || paymentStatus === 'requires_action';
}

export function createPgBookingCalendarPort(): BookingCalendarPort {
  const port: BookingCalendarPort = {
    async listFilterMeta(organizationId): Promise<CalendarFilterMeta> {
      const db = getDrizzle();
      const [specialists, branches, rooms, services, serviceAvailability] = await Promise.all([
        db
          .select({ id: beSpecialists.id, label: beSpecialists.fullName })
          .from(beSpecialists)
          .where(
            and(eq(beSpecialists.organizationId, organizationId), eq(beSpecialists.isActive, true)),
          )
          .orderBy(asc(beSpecialists.sortOrder), asc(beSpecialists.fullName)),
        db
          .select({
            id: beBranches.id,
            label: beBranches.title,
            shortTitle: beBranches.shortTitle,
            color: beBranches.color,
          })
          .from(beBranches)
          .where(and(eq(beBranches.organizationId, organizationId), eq(beBranches.isActive, true)))
          .orderBy(asc(beBranches.sortOrder), asc(beBranches.title)),
        db
          .select({ id: beRooms.id, label: beRooms.title })
          .from(beRooms)
          .where(and(eq(beRooms.organizationId, organizationId), eq(beRooms.isActive, true)))
          .orderBy(asc(beRooms.sortOrder), asc(beRooms.title)),
        db
          .select({
            id: beClinicServices.id,
            label: beClinicServices.title,
            durationMinutes: beClinicServices.durationMinutes,
          })
          .from(beClinicServices)
          .where(
            and(
              eq(beClinicServices.organizationId, organizationId),
              eq(beClinicServices.isActive, true),
            ),
          )
          .orderBy(asc(beClinicServices.sortOrder), asc(beClinicServices.title)),
        db
          .select({
            serviceId: beSpecialistServiceAvailability.serviceId,
            specialistId: beSpecialistServiceAvailability.specialistId,
            branchId: beSpecialistServiceAvailability.branchId,
          })
          .from(beSpecialistServiceAvailability)
          .innerJoin(
            beSpecialists,
            and(
              eq(beSpecialists.id, beSpecialistServiceAvailability.specialistId),
              eq(beSpecialists.organizationId, organizationId),
              eq(beSpecialists.isActive, true),
            ),
          )
          .where(
            and(
              eq(beSpecialistServiceAvailability.organizationId, organizationId),
              eq(beSpecialistServiceAvailability.isActive, true),
            ),
          ),
      ]);
      const availabilityByService = new Map<
        string,
        Map<string, { specialistId: string; branchId: string }>
      >();
      for (const row of serviceAvailability) {
        if (!row.branchId) continue;
        const byRelationship = availabilityByService.get(row.serviceId) ?? new Map();
        byRelationship.set(`${row.specialistId}:${row.branchId}`, {
          specialistId: row.specialistId,
          branchId: row.branchId,
        });
        availabilityByService.set(row.serviceId, byRelationship);
      }
      return {
        specialists: specialists.map((r) => ({ id: r.id, label: r.label })),
        branches: branches.map((r) => ({
          id: r.id,
          label: r.label,
          shortLabel: r.shortTitle ?? null,
          color: r.color ?? null,
        })),
        rooms: rooms.map((r) => ({ id: r.id, label: r.label })),
        services: services.map((r) => ({
          id: r.id,
          label: r.label,
          durationMinutes: r.durationMinutes,
          availability: Array.from(availabilityByService.get(r.id)?.values() ?? []),
        })),
      };
    },

    async listAppointmentsInRange(filters: CalendarFilters): Promise<CalendarAppointmentEvent[]> {
      const db = getDrizzle();
      const conds = [
        eq(beAppointments.organizationId, filters.organizationId),
        // F1b: soft-deleted appointments are not shown on the calendar.
        isNull(beAppointments.deletedAt),
        gte(beAppointments.endAt, filters.rangeStart),
        lte(beAppointments.startAt, filters.rangeEnd),
      ];
      if (filters.specialistId) {
        conds.push(eq(beAppointments.specialistId, filters.specialistId));
      }
      if (filters.branchId) {
        conds.push(eq(beAppointments.branchId, filters.branchId));
      }
      if (filters.roomId) {
        conds.push(eq(beAppointments.roomId, filters.roomId));
      }
      if (filters.serviceId) {
        conds.push(eq(beAppointments.serviceId, filters.serviceId));
      }
      if (filters.appointmentIds) {
        if (filters.appointmentIds.length === 0) return [];
        conds.push(inArray(beAppointments.id, filters.appointmentIds));
      }

      const rows = await db
        .select({
          id: beAppointments.id,
          startAt: beAppointments.startAt,
          endAt: beAppointments.endAt,
          status: beAppointments.status,
          source: beAppointments.source,
          specialistId: beAppointments.specialistId,
          branchId: beAppointments.branchId,
          roomId: beAppointments.roomId,
          serviceId: beAppointments.serviceId,
          platformUserId: beAppointments.platformUserId,
          phoneNormalized: beAppointments.phoneNormalized,
          attributionJson: beAppointments.attributionJson,
          packageUsageRef: beAppointments.packageUsageRef,
          rescheduleCount: beAppointments.rescheduleCount,
          originalStartAt: beAppointments.originalStartAt,
          specialistName: beSpecialists.fullName,
          branchTitle: beBranches.title,
          branchColor: beBranches.color,
          roomTitle: beRooms.title,
          serviceTitle: beClinicServices.title,
          patientDisplayName: drizzleFioCols.displayName,
          patientFirstName: drizzleFioCols.firstName,
          patientLastName: drizzleFioCols.lastName,
          patientPhone: drizzlePrimaryPhoneCol,
        })
        .from(beAppointments)
        .leftJoin(beSpecialists, eq(beSpecialists.id, beAppointments.specialistId))
        .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
        .leftJoin(beRooms, eq(beRooms.id, beAppointments.roomId))
        .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
        .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
        .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
        .where(and(...conds))
        .orderBy(asc(beAppointments.startAt));

      const appointmentIds = rows.map((r) => r.id);
      const bookingStatusByAppt = new Map<string, string>();
      const paymentByAppt = new Map<string, string>();
      const packageByUsageRef = new Map<string, { title: string; displayNumber: number }>();
      const formCommentsByAppt = new Map<string, { label: string; value: string }[]>();
      const packageUsageRefs = rows
        .map((row) => row.packageUsageRef)
        .filter((usageRef): usageRef is string => usageRef != null && UUID_RE.test(usageRef));

      if (appointmentIds.length > 0) {
        const [bookingRows, paymentRows, packageRows, submissionRows] = await Promise.all([
          db
            .select({
              appointmentId: patientBookings.canonicalAppointmentId,
              status: patientBookings.status,
            })
            .from(patientBookings)
            .where(inArray(patientBookings.canonicalAppointmentId, appointmentIds)),
          db
            .select({
              appointmentId: bePaymentIntents.appointmentId,
              status: bePaymentIntents.status,
            })
            .from(bePaymentIntents)
            .where(inArray(bePaymentIntents.appointmentId, appointmentIds))
            .orderBy(desc(bePaymentIntents.createdAt)),
          db
            .select({
              usageId: bePackageUsages.id,
              title: bePatientPackages.title,
              displayNumber: bePatientPackages.displayNumber,
            })
            .from(bePackageUsages)
            .innerJoin(
              bePatientPackages,
              eq(bePatientPackages.id, bePackageUsages.patientPackageId),
            )
            .where(
              packageUsageRefs.length > 0
                ? inArray(bePackageUsages.id, packageUsageRefs)
                : sql`false`,
            ),
          db
            .select({
              appointmentId: beBookingFormSubmissions.appointmentId,
              label: beBookingFormFields.label,
              valueText: beBookingFormSubmissions.valueText,
            })
            .from(beBookingFormSubmissions)
            .innerJoin(
              beBookingFormFields,
              eq(beBookingFormFields.id, beBookingFormSubmissions.fieldId),
            )
            .where(
              and(
                eq(beBookingFormSubmissions.organizationId, filters.organizationId),
                inArray(beBookingFormSubmissions.appointmentId, appointmentIds),
                eq(beBookingFormFields.visibleToStaff, true),
              ),
            ),
        ]);

        for (const b of bookingRows) {
          if (b.appointmentId && !bookingStatusByAppt.has(b.appointmentId)) {
            bookingStatusByAppt.set(b.appointmentId, b.status);
          }
        }
        for (const p of paymentRows) {
          if (p.appointmentId && !paymentByAppt.has(p.appointmentId)) {
            paymentByAppt.set(p.appointmentId, p.status);
          }
        }
        for (const pkg of packageRows) {
          if (!packageByUsageRef.has(pkg.usageId)) {
            packageByUsageRef.set(pkg.usageId, {
              title: pkg.title,
              displayNumber: pkg.displayNumber,
            });
          }
        }
        for (const sub of submissionRows) {
          const value = sub.valueText.trim();
          if (!value) continue;
          const list = formCommentsByAppt.get(sub.appointmentId) ?? [];
          list.push({ label: sub.label, value });
          formCommentsByAppt.set(sub.appointmentId, list);
        }
      }

      const visibleRows = await filterCanonicalRowsNotPurged(filters.organizationId, rows);

      return visibleRows.map((row) => {
        const attr = (row.attributionJson ?? {}) as Record<string, unknown>;
        const attrName = contactNameFromAttribution(attr);
        const linkedName =
          row.patientDisplayName != null
            ? patientDisplayName({
                displayName: row.patientDisplayName,
                firstName: row.patientFirstName,
                lastName: row.patientLastName,
              })
            : null;
        const paymentStatus = paymentByAppt.get(row.id) ?? null;
        const status = row.status as CalendarAppointmentEvent['status'];
        const packageData = row.packageUsageRef
          ? (packageByUsageRef.get(row.packageUsageRef) ?? null)
          : null;
        return {
          kind: 'appointment' as const,
          id: row.id,
          startAt: row.startAt,
          endAt: row.endAt,
          status,
          source: row.source,
          specialistId: row.specialistId,
          specialistName: row.specialistName ?? null,
          branchId: row.branchId,
          branchTitle: row.branchTitle ?? null,
          branchColor: row.branchColor ?? null,
          roomId: row.roomId,
          roomTitle: row.roomTitle ?? null,
          serviceId: row.serviceId,
          serviceTitle: row.serviceTitle ?? null,
          platformUserId: row.platformUserId,
          patientName: linkedName ?? attrName,
          patientPhone: row.patientPhone ?? row.phoneNormalized ?? null,
          bookingStatus: bookingStatusByAppt.get(row.id) ?? null,
          paymentStatus,
          prepaymentPending: isPrepaymentPending(status, paymentStatus),
          packageUsageRef: row.packageUsageRef ?? null,
          packageTitle: packageData?.title ?? null,
          packageDisplayNumber: packageData?.displayNumber ?? null,
          rescheduleCount: row.rescheduleCount,
          originalStartAt: row.originalStartAt ?? null,
          formComments: formCommentsByAppt.get(row.id) ?? [],
        };
      });
    },

    async listAppointmentFeed(
      filters: AppointmentFeedFilters,
    ): Promise<AppointmentFeedPage> {
      const db = getDrizzle();
      const conds = [
        eq(beAppointments.organizationId, filters.organizationId),
        isNull(beAppointments.deletedAt),
      ];
      if (filters.rangeStart) conds.push(gte(beAppointments.endAt, filters.rangeStart));
      if (filters.rangeEnd) conds.push(lte(beAppointments.startAt, filters.rangeEnd));
      if (filters.specialistId) conds.push(eq(beAppointments.specialistId, filters.specialistId));
      if (filters.branchId) conds.push(eq(beAppointments.branchId, filters.branchId));
      if (filters.roomId) conds.push(eq(beAppointments.roomId, filters.roomId));
      if (filters.serviceId) conds.push(eq(beAppointments.serviceId, filters.serviceId));
      if (!filters.includeCancelled) {
        conds.push(
          notInArray(beAppointments.status, [
            'cancelled_by_patient',
            'cancelled_by_specialist',
            'late_cancellation',
            'no_show',
          ]),
        );
      }

      const search = filters.search?.trim();
      if (search) {
        const pattern = `%${search}%`;
        conds.push(
          or(
            ilike(userIdentity.displayName, pattern),
            ilike(userIdentity.firstName, pattern),
            ilike(userIdentity.lastName, pattern),
            ilike(beAppointments.phoneNormalized, pattern),
          )!,
        );
      }

      const base = db
        .select({ id: beAppointments.id, startAt: beAppointments.startAt })
        .from(beAppointments)
        .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
        .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
        .where(and(...conds));
      const [pageRows, totalRows] = await Promise.all([
        base
          .orderBy(
            filters.order === 'desc'
              ? desc(beAppointments.startAt)
              : asc(beAppointments.startAt),
            filters.order === 'desc' ? desc(beAppointments.id) : asc(beAppointments.id),
          )
          .limit(filters.limit)
          .offset(filters.offset),
        db
          .select({ value: count() })
          .from(beAppointments)
          .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
          .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
          .where(and(...conds)),
      ]);
      const ids = pageRows.map((row) => row.id);
      if (ids.length === 0) {
        return { items: [], total: totalRows[0]?.value ?? 0, hasMore: false };
      }
      const chronologicalRows = [...pageRows].sort((a, b) => a.startAt.localeCompare(b.startAt));
      const byId = new Map(
        (
          await port.listAppointmentsInRange({
            organizationId: filters.organizationId,
            rangeStart: chronologicalRows[0]!.startAt,
            rangeEnd: chronologicalRows[chronologicalRows.length - 1]!.startAt,
            timeZone: filters.timeZone,
            specialistId: filters.specialistId,
            branchId: filters.branchId,
            roomId: filters.roomId,
            serviceId: filters.serviceId,
            appointmentIds: ids,
          })
        ).map((item) => [item.id, item]),
      );
      const items = ids.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
      const total = totalRows[0]?.value ?? 0;
      return {
        items,
        total,
        hasMore: filters.offset + pageRows.length < total,
      };
    },
  };
  return port;
}
