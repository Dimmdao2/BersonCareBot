import { and, asc, desc, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { assertValidAppointmentStatusTransition } from "@/modules/booking-engine/appointmentStatusFsm";
import type { BeAppointment } from "@/modules/booking-engine/types";
import type {
  AppointmentCancellationRecord,
  AppointmentLifecyclePort,
  AppointmentRescheduleRecord,
} from "@/modules/booking-appointment-lifecycle/ports";
import {
  beAppointmentCancellations,
  beAppointmentReschedules,
} from "../../../db/schema/bookingPolicies";
import {
  beAppointmentEvents,
  beAppointmentHistoryEvents,
  beAppointments,
  bePatientTimelineEvents,
} from "../../../db/schema/bookingEngine";

function mapAppointment(row: typeof beAppointments.$inferSelect): BeAppointment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId ?? null,
    roomId: row.roomId ?? null,
    specialistId: row.specialistId ?? null,
    serviceId: row.serviceId ?? null,
    platformUserId: row.platformUserId ?? null,
    startAt: row.startAt,
    endAt: row.endAt,
    durationMinutes: row.durationMinutes,
    source: row.source as BeAppointment["source"],
    status: row.status as BeAppointment["status"],
    originalStartAt: row.originalStartAt ?? null,
    rescheduleCount: row.rescheduleCount,
    paymentRef: row.paymentRef ?? null,
    packageUsageRef: row.packageUsageRef ?? null,
    phoneNormalized: row.phoneNormalized ?? null,
    attributionJson: (row.attributionJson ?? {}) as Record<string, unknown>,
  };
}

function mapReschedule(row: typeof beAppointmentReschedules.$inferSelect): AppointmentRescheduleRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    appointmentId: row.appointmentId,
    fromStartAt: row.fromStartAt,
    fromEndAt: row.fromEndAt,
    toStartAt: row.toStartAt,
    toEndAt: row.toEndAt,
    actorType: row.actorType as AppointmentRescheduleRecord["actorType"],
    actorId: row.actorId ?? null,
    wasInFreeRescheduleWindow: row.wasInFreeRescheduleWindow,
    freeCancellationAvailableAtReschedule: row.freeCancellationAvailableAtReschedule,
    freeCancellationAvailableAfter: row.freeCancellationAvailableAfter,
    appliedPolicyId: row.appliedPolicyId ?? null,
    appliedPolicySnapshot: (row.appliedPolicySnapshot ?? {}) as Record<string, unknown>,
    reason: row.reason ?? null,
    staffComment: row.staffComment ?? null,
    notificationsSent: (row.notificationsSent ?? {}) as Record<string, unknown>,
    manualOverride: row.manualOverride,
    createdAt: row.createdAt,
  };
}

function mapCancellation(row: typeof beAppointmentCancellations.$inferSelect): AppointmentCancellationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    appointmentId: row.appointmentId,
    actorType: row.actorType as AppointmentCancellationRecord["actorType"],
    actorId: row.actorId ?? null,
    cancellationType: row.cancellationType as AppointmentCancellationRecord["cancellationType"],
    reason: row.reason ?? null,
    wasFree: row.wasFree,
    wasPenalized: row.wasPenalized,
    packageSessionCharged: row.packageSessionCharged,
    prepaymentRetained: row.prepaymentRetained,
    prepaymentRefunded: row.prepaymentRefunded,
    staffComment: row.staffComment ?? null,
    notificationsSent: (row.notificationsSent ?? {}) as Record<string, unknown>,
    manualOverride: row.manualOverride,
    appliedPolicyId: row.appliedPolicyId ?? null,
    appliedPolicySnapshot: (row.appliedPolicySnapshot ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

export function createPgBookingAppointmentLifecyclePort(): AppointmentLifecyclePort {
  return {
    async getAppointment(appointmentId, organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beAppointments)
        .where(and(eq(beAppointments.id, appointmentId), eq(beAppointments.organizationId, organizationId)))
        .limit(1);
      return rows[0] ? mapAppointment(rows[0]) : null;
    },

    async listReschedules(appointmentId, organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beAppointmentReschedules)
        .where(
          and(
            eq(beAppointmentReschedules.appointmentId, appointmentId),
            eq(beAppointmentReschedules.organizationId, organizationId),
          ),
        )
        .orderBy(asc(beAppointmentReschedules.createdAt));
      return rows.map(mapReschedule);
    },

    async listCancellations(appointmentId, organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beAppointmentCancellations)
        .where(
          and(
            eq(beAppointmentCancellations.appointmentId, appointmentId),
            eq(beAppointmentCancellations.organizationId, organizationId),
          ),
        )
        .orderBy(asc(beAppointmentCancellations.createdAt));
      return rows.map(mapCancellation);
    },

    async applyReschedule(input) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      return db.transaction(async (tx) => {
        const currentRows = await tx
          .select()
          .from(beAppointments)
          .where(
            and(eq(beAppointments.id, input.appointmentId), eq(beAppointments.organizationId, input.organizationId)),
          )
          .limit(1);
        const current = currentRows[0];
        if (!current) throw new Error("appointment_not_found");

        const fromStatus = current.status as BeAppointment["status"];
        if (fromStatus !== "rescheduled") {
          assertValidAppointmentStatusTransition(fromStatus, "rescheduled");
        }
        await tx
          .update(beAppointments)
          .set({ status: "rescheduled", updatedAt: now })
          .where(eq(beAppointments.id, input.appointmentId));

        const originalStartAt = current.originalStartAt ?? current.startAt;
        await tx
          .update(beAppointments)
          .set({
            startAt: input.newStartAt,
            endAt: input.newEndAt,
            durationMinutes: input.durationMinutes,
            branchId: input.branchId ?? current.branchId,
            roomId: input.roomId ?? current.roomId,
            specialistId: input.specialistId ?? current.specialistId,
            serviceId: input.serviceId ?? current.serviceId,
            originalStartAt,
            rescheduleCount: current.rescheduleCount + 1,
            status: "confirmed",
            updatedAt: now,
          })
          .where(eq(beAppointments.id, input.appointmentId));

        await tx.insert(beAppointmentReschedules).values({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          fromStartAt: current.startAt,
          fromEndAt: current.endAt,
          toStartAt: input.newStartAt,
          toEndAt: input.newEndAt,
          actorType: input.actorType,
          actorId: input.actorId,
          wasInFreeRescheduleWindow: input.wasInFreeRescheduleWindow,
          freeCancellationAvailableAtReschedule: input.freeCancellationAvailableAtReschedule,
          freeCancellationAvailableAfter: input.freeCancellationAvailableAfter,
          appliedPolicyId: input.policy.id === "default" ? null : input.policy.id,
          appliedPolicySnapshot: { ...input.policy, cancellationPolicyId: input.cancellationPolicy.id },
          reason: input.reason ?? null,
          staffComment: input.staffComment ?? null,
          manualOverride: input.manualOverride ?? false,
          notificationsSent: input.notificationsSent ?? {},
          createdAt: now,
        });

        const payload = {
          fromStatus,
          toStatus: "confirmed",
          fromStartAt: current.startAt,
          toStartAt: input.newStartAt,
          manualOverride: input.manualOverride ?? false,
        };
        await tx.insert(beAppointmentEvents).values({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          eventType: "rescheduled",
          actorId: input.actorId,
          payload,
        });
        await tx.insert(beAppointmentHistoryEvents).values({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          eventType: "rescheduled",
          actorId: input.actorId,
          payload,
          occurredAt: now,
        });
        if (current.platformUserId) {
          await tx.insert(bePatientTimelineEvents).values({
            organizationId: input.organizationId,
            platformUserId: current.platformUserId,
            domain: "appointment",
            eventType: "appointment_rescheduled",
            linkedObjectType: "appointment",
            linkedObjectId: input.appointmentId,
            payload,
            occurredAt: now,
          });
        }

        const updated = await tx
          .select()
          .from(beAppointments)
          .where(eq(beAppointments.id, input.appointmentId))
          .limit(1);
        return mapAppointment(updated[0]!);
      });
    },

    async applyCancellation(input) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      return db.transaction(async (tx) => {
        const currentRows = await tx
          .select()
          .from(beAppointments)
          .where(
            and(eq(beAppointments.id, input.appointmentId), eq(beAppointments.organizationId, input.organizationId)),
          )
          .limit(1);
        const current = currentRows[0];
        if (!current) throw new Error("appointment_not_found");

        const fromStatus = current.status as BeAppointment["status"];
        assertValidAppointmentStatusTransition(fromStatus, input.targetStatus);

        await tx
          .update(beAppointments)
          .set({
            status: input.targetStatus,
            updatedAt: now,
          })
          .where(eq(beAppointments.id, input.appointmentId));

        await tx.insert(beAppointmentCancellations).values({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          actorType: input.actorType,
          actorId: input.actorId,
          cancellationType: input.decisionType,
          reason: input.reason ?? null,
          wasFree: input.wasFree,
          wasPenalized: input.wasPenalized,
          packageSessionCharged: input.packageSessionCharged,
          prepaymentRetained: input.prepaymentRetained,
          prepaymentRefunded: input.prepaymentRefunded,
          staffComment: input.staffComment ?? null,
          manualOverride: input.manualOverride ?? false,
          appliedPolicyId: input.policy.id === "default" ? null : input.policy.id,
          appliedPolicySnapshot: input.policy as unknown as Record<string, unknown>,
          notificationsSent: input.notificationsSent ?? {},
          createdAt: now,
        });

        const payload = {
          fromStatus,
          toStatus: input.targetStatus,
          decisionType: input.decisionType,
          wasFree: input.wasFree,
          manualOverride: input.manualOverride ?? false,
        };
        await tx.insert(beAppointmentEvents).values({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          eventType: "cancelled",
          actorId: input.actorId,
          payload,
        });
        await tx.insert(beAppointmentHistoryEvents).values({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          eventType: "cancelled",
          actorId: input.actorId,
          payload,
          occurredAt: now,
        });
        if (current.platformUserId) {
          await tx.insert(bePatientTimelineEvents).values({
            organizationId: input.organizationId,
            platformUserId: current.platformUserId,
            domain: "appointment",
            eventType: "appointment_cancelled",
            linkedObjectType: "appointment",
            linkedObjectId: input.appointmentId,
            payload,
            occurredAt: now,
          });
        }

        const updated = await tx
          .select()
          .from(beAppointments)
          .where(eq(beAppointments.id, input.appointmentId))
          .limit(1);
        return mapAppointment(updated[0]!);
      });
    },

    async patchLatestRescheduleNotifications(appointmentId, organizationId, notificationsSent) {
      const db = getDrizzle();
      const rows = await db
        .select({ id: beAppointmentReschedules.id })
        .from(beAppointmentReschedules)
        .where(
          and(
            eq(beAppointmentReschedules.appointmentId, appointmentId),
            eq(beAppointmentReschedules.organizationId, organizationId),
          ),
        )
        .orderBy(desc(beAppointmentReschedules.createdAt))
        .limit(1);
      const row = rows[0];
      if (!row) return;
      await db
        .update(beAppointmentReschedules)
        .set({ notificationsSent })
        .where(eq(beAppointmentReschedules.id, row.id));
    },

    async patchLatestCancellationNotifications(appointmentId, organizationId, notificationsSent) {
      const db = getDrizzle();
      const rows = await db
        .select({ id: beAppointmentCancellations.id })
        .from(beAppointmentCancellations)
        .where(
          and(
            eq(beAppointmentCancellations.appointmentId, appointmentId),
            eq(beAppointmentCancellations.organizationId, organizationId),
          ),
        )
        .orderBy(desc(beAppointmentCancellations.createdAt))
        .limit(1);
      const row = rows[0];
      if (!row) return;
      await db
        .update(beAppointmentCancellations)
        .set({ notificationsSent })
        .where(eq(beAppointmentCancellations.id, row.id));
    },
  };
}
