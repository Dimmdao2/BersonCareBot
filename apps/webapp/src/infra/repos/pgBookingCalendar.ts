import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  beAppointments,
  beBranches,
  beClinicServices,
  beRooms,
  beSpecialists,
  beSpecialistServiceAvailability,
} from "../../../db/schema/bookingEngine";
import { beBookingFormFields, beBookingFormSubmissions } from "../../../db/schema/bookingScheduling";
import { bePaymentIntents } from "../../../db/schema/bookingPayments";
import {
  bePackageUsages,
  bePatientPackages,
  beSubscriptionPackages,
} from "../../../db/schema/bookingMemberships";
import { patientBookings, platformUsers } from "../../../db/schema/schema";
import type { BookingCalendarPort } from "@/modules/booking-calendar/ports";
import type { CalendarAppointmentEvent, CalendarFilterMeta, CalendarFilters } from "@/modules/booking-calendar/types";
import { filterCanonicalRowsNotPurged } from "@/infra/repos/doctorAppointmentPurgeFilter";

function patientDisplayName(row: {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  const fromParts = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  if (fromParts) return fromParts;
  const dn = row.displayName.trim();
  return dn || "Пациент";
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

export function isPrepaymentPending(
  appointmentStatus: string,
  paymentStatus: string | null | undefined,
): boolean {
  if (appointmentStatus === "awaiting_payment") return true;
  if (!paymentStatus) return false;
  return paymentStatus === "pending" || paymentStatus === "requires_action";
}

export function createPgBookingCalendarPort(): BookingCalendarPort {
  return {
    async listFilterMeta(organizationId): Promise<CalendarFilterMeta> {
      const db = getDrizzle();
      const [specialists, branches, rooms, services] = await Promise.all([
        db
          .select({ id: beSpecialists.id, label: beSpecialists.fullName })
          .from(beSpecialists)
          .where(and(eq(beSpecialists.organizationId, organizationId), eq(beSpecialists.isActive, true)))
          .orderBy(asc(beSpecialists.sortOrder), asc(beSpecialists.fullName)),
        db
          .select({ id: beBranches.id, label: beBranches.title })
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
          .where(and(eq(beClinicServices.organizationId, organizationId), eq(beClinicServices.isActive, true)))
          .orderBy(asc(beClinicServices.sortOrder), asc(beClinicServices.title)),
      ]);
      return {
        specialists: specialists.map((r) => ({ id: r.id, label: r.label })),
        branches: branches.map((r) => ({ id: r.id, label: r.label })),
        rooms: rooms.map((r) => ({ id: r.id, label: r.label })),
        services: services.map((r) => ({
          id: r.id,
          label: r.label,
          durationMinutes: r.durationMinutes,
        })),
      };
    },

    async resolveSchedulingForSlots(input) {
      const db = getDrizzle();
      const [ssaRows, serviceRows, branchRows] = await Promise.all([
        db
          .select({
            durationMinutesOverride: beSpecialistServiceAvailability.durationMinutesOverride,
            roomId: beSpecialistServiceAvailability.roomId,
          })
          .from(beSpecialistServiceAvailability)
          .where(
            and(
              eq(beSpecialistServiceAvailability.organizationId, input.organizationId),
              eq(beSpecialistServiceAvailability.specialistId, input.specialistId),
              eq(beSpecialistServiceAvailability.serviceId, input.serviceId),
              eq(beSpecialistServiceAvailability.branchId, input.branchId),
              eq(beSpecialistServiceAvailability.isActive, true),
            ),
          )
          .limit(1),
        db
          .select({ durationMinutes: beClinicServices.durationMinutes })
          .from(beClinicServices)
          .where(
            and(
              eq(beClinicServices.id, input.serviceId),
              eq(beClinicServices.organizationId, input.organizationId),
              eq(beClinicServices.isActive, true),
            ),
          )
          .limit(1),
        db
          .select({ timezone: beBranches.timezone })
          .from(beBranches)
          .where(
            and(
              eq(beBranches.id, input.branchId),
              eq(beBranches.organizationId, input.organizationId),
              eq(beBranches.isActive, true),
            ),
          )
          .limit(1),
      ]);
      const service = serviceRows[0];
      const branch = branchRows[0];
      if (!service || !branch) return null;
      const ssa = ssaRows[0];
      return {
        durationMinutes: ssa?.durationMinutesOverride ?? service.durationMinutes,
        roomId: ssa?.roomId ?? null,
        branchTimezone: branch.timezone,
      };
    },

    async listAppointmentsInRange(filters: CalendarFilters): Promise<CalendarAppointmentEvent[]> {
      const db = getDrizzle();
      const conds = [
        eq(beAppointments.organizationId, filters.organizationId),
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
          roomTitle: beRooms.title,
          serviceTitle: beClinicServices.title,
          patientDisplayName: platformUsers.displayName,
          patientFirstName: platformUsers.firstName,
          patientLastName: platformUsers.lastName,
          patientPhone: platformUsers.phoneNormalized,
        })
        .from(beAppointments)
        .leftJoin(beSpecialists, eq(beSpecialists.id, beAppointments.specialistId))
        .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
        .leftJoin(beRooms, eq(beRooms.id, beAppointments.roomId))
        .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
        .leftJoin(platformUsers, eq(platformUsers.id, beAppointments.platformUserId))
        .where(and(...conds))
        .orderBy(asc(beAppointments.startAt));

      const appointmentIds = rows.map((r) => r.id);
      const bookingStatusByAppt = new Map<string, string>();
      const rubitimeIdByAppt = new Map<string, string | null>();
      const rubitimeManageUrlByAppt = new Map<string, string | null>();
      const paymentByAppt = new Map<string, string>();
      const packageTitleByAppt = new Map<string, string>();
      const formCommentsByAppt = new Map<string, { label: string; value: string }[]>();

      if (appointmentIds.length > 0) {
        const [bookingRows, paymentRows, packageRows, submissionRows] = await Promise.all([
          db
            .select({
              appointmentId: patientBookings.canonicalAppointmentId,
              status: patientBookings.status,
              rubitimeId: patientBookings.rubitimeId,
              rubitimeManageUrl: patientBookings.rubitimeManageUrl,
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
              appointmentId: bePackageUsages.appointmentId,
              title: beSubscriptionPackages.title,
            })
            .from(bePackageUsages)
            .innerJoin(bePatientPackages, eq(bePatientPackages.id, bePackageUsages.patientPackageId))
            .innerJoin(
              beSubscriptionPackages,
              eq(beSubscriptionPackages.id, bePatientPackages.subscriptionPackageId),
            )
            .where(inArray(bePackageUsages.appointmentId, appointmentIds)),
          db
            .select({
              appointmentId: beBookingFormSubmissions.appointmentId,
              label: beBookingFormFields.label,
              valueText: beBookingFormSubmissions.valueText,
            })
            .from(beBookingFormSubmissions)
            .innerJoin(beBookingFormFields, eq(beBookingFormFields.id, beBookingFormSubmissions.fieldId))
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
            rubitimeIdByAppt.set(b.appointmentId, b.rubitimeId ?? null);
            rubitimeManageUrlByAppt.set(b.appointmentId, b.rubitimeManageUrl ?? null);
          }
        }
        for (const p of paymentRows) {
          if (p.appointmentId && !paymentByAppt.has(p.appointmentId)) {
            paymentByAppt.set(p.appointmentId, p.status);
          }
        }
        for (const pkg of packageRows) {
          if (pkg.appointmentId && !packageTitleByAppt.has(pkg.appointmentId)) {
            packageTitleByAppt.set(pkg.appointmentId, pkg.title);
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
        const status = row.status as CalendarAppointmentEvent["status"];
        return {
          kind: "appointment" as const,
          id: row.id,
          startAt: row.startAt,
          endAt: row.endAt,
          status,
          source: row.source,
          specialistId: row.specialistId,
          specialistName: row.specialistName ?? null,
          branchId: row.branchId,
          branchTitle: row.branchTitle ?? null,
          roomId: row.roomId,
          roomTitle: row.roomTitle ?? null,
          serviceId: row.serviceId,
          serviceTitle: row.serviceTitle ?? null,
          platformUserId: row.platformUserId,
          patientName: linkedName ?? attrName,
          patientPhone: row.patientPhone ?? row.phoneNormalized ?? null,
          bookingStatus: bookingStatusByAppt.get(row.id) ?? null,
          rubitimeId: rubitimeIdByAppt.get(row.id) ?? null,
          rubitimeManageUrl: rubitimeManageUrlByAppt.get(row.id) ?? null,
          paymentStatus,
          prepaymentPending: isPrepaymentPending(status, paymentStatus),
          packageUsageRef: row.packageUsageRef ?? null,
          packageTitle: packageTitleByAppt.get(row.id) ?? null,
          rescheduleCount: row.rescheduleCount,
          originalStartAt: row.originalStartAt ?? null,
          formComments: formCommentsByAppt.get(row.id) ?? [],
        };
      });
    },
  };
}
