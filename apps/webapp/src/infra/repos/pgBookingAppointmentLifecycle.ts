import { and, asc, desc, eq } from 'drizzle-orm';
import { sql as drizzleSql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
} from '@/infra/db/runWebappSql';
import { readCurrentPatientBookingAppointment } from '@/infra/repos/pgBookingEngine';
import { assertValidAppointmentStatusTransition } from '@/modules/booking-engine/appointmentStatusFsm';
import type { BeAppointment } from '@/modules/booking-engine/types';
import { normalizeAppointmentReminderSettings } from '@/modules/booking-notifications/appointmentReminderPresets';
import type {
  AppointmentCancellationRecord,
  AppointmentLifecyclePort,
  AppointmentNoShowRecord,
  AppointmentRescheduleRecord,
} from '@/modules/booking-appointment-lifecycle/ports';
import {
  beAppointmentCancellations,
  beAppointmentNoShows,
  beAppointmentReschedules,
} from '../../../db/schema/bookingPolicies';
import {
  beAppointmentHistoryEvents,
  beAppointments,
  bePatientTimelineEvents,
} from '../../../db/schema/bookingEngine';

function mapAppointment(row: typeof beAppointments.$inferSelect): BeAppointment {
  const reminderSettings = normalizeAppointmentReminderSettings({
    allowedPresetIds: row.appointmentReminderAllowedPresetIds ?? [],
    defaultPresetId: row.appointmentReminderPresetId ?? null,
  });
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
    source: row.source as BeAppointment['source'],
    status: row.status as BeAppointment['status'],
    originalStartAt: row.originalStartAt ?? null,
    rescheduleCount: row.rescheduleCount,
    paymentRef: row.paymentRef ?? null,
    packageUsageRef: row.packageUsageRef ?? null,
    phoneNormalized: row.phoneNormalized ?? null,
    attributionJson: (row.attributionJson ?? {}) as Record<string, unknown>,
    appointmentReminderAllowedPresetIds: reminderSettings.allowedPresetIds,
    appointmentReminderPresetId: reminderSettings.defaultPresetId,
    appointmentReminderSelectionSource:
      row.appointmentReminderSelectionSource === 'patient' ? 'patient' : 'specialist_default',
  };
}

function mapReschedule(
  row: typeof beAppointmentReschedules.$inferSelect,
): AppointmentRescheduleRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    appointmentId: row.appointmentId,
    fromStartAt: row.fromStartAt,
    fromEndAt: row.fromEndAt,
    toStartAt: row.toStartAt,
    toEndAt: row.toEndAt,
    actorType: row.actorType as AppointmentRescheduleRecord['actorType'],
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

function mapCancellation(
  row: typeof beAppointmentCancellations.$inferSelect,
): AppointmentCancellationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    appointmentId: row.appointmentId,
    actorType: row.actorType as AppointmentCancellationRecord['actorType'],
    actorId: row.actorId ?? null,
    cancellationType: row.cancellationType as AppointmentCancellationRecord['cancellationType'],
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

function mapNoShow(row: typeof beAppointmentNoShows.$inferSelect): AppointmentNoShowRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    appointmentId: row.appointmentId,
    actorType: row.actorType as AppointmentNoShowRecord['actorType'],
    actorId: row.actorId ?? null,
    reason: row.reason ?? null,
    staffComment: row.staffComment ?? null,
    notificationsSent: (row.notificationsSent ?? {}) as Record<string, unknown>,
    manualOverride: row.manualOverride,
    createdAt: row.createdAt,
  };
}

type CurrentPatientAppointmentRow = {
  id: string;
  organization_id: string;
  branch_id: string | null;
  room_id: string | null;
  specialist_id: string | null;
  service_id: string | null;
  platform_user_id: string | null;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  source: string;
  status: string;
  original_start_at: string | null;
  reschedule_count: number;
  payment_ref: string | null;
  package_usage_ref: string | null;
  phone_normalized: string | null;
  attribution_json: Record<string, unknown> | null;
  appointment_reminder_allowed_preset_ids: string[] | null;
  appointment_reminder_preset_id: string | null;
  appointment_reminder_selection_source: string;
};

type CurrentPatientRescheduleRow = {
  id: string;
  organization_id: string;
  appointment_id: string;
  from_start_at: string;
  from_end_at: string;
  to_start_at: string;
  to_end_at: string;
  actor_type: string;
  actor_id: string | null;
  was_in_free_reschedule_window: boolean;
  free_cancellation_available_at_reschedule: boolean;
  free_cancellation_available_after: boolean;
  applied_policy_id: string | null;
  applied_policy_snapshot: Record<string, unknown> | null;
  reason: string | null;
  staff_comment: string | null;
  notifications_sent: Record<string, unknown> | null;
  manual_override: boolean;
  created_at: string;
};

function mapCurrentPatientAppointment(row: CurrentPatientAppointmentRow): BeAppointment {
  const reminderSettings = normalizeAppointmentReminderSettings({
    allowedPresetIds: row.appointment_reminder_allowed_preset_ids ?? [],
    defaultPresetId: row.appointment_reminder_preset_id,
  });
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    roomId: row.room_id,
    specialistId: row.specialist_id,
    serviceId: row.service_id,
    platformUserId: row.platform_user_id,
    startAt: row.start_at,
    endAt: row.end_at,
    durationMinutes: row.duration_minutes,
    source: row.source as BeAppointment['source'],
    status: row.status as BeAppointment['status'],
    originalStartAt: row.original_start_at,
    rescheduleCount: row.reschedule_count,
    paymentRef: row.payment_ref,
    packageUsageRef: row.package_usage_ref,
    phoneNormalized: row.phone_normalized,
    attributionJson: row.attribution_json ?? {},
    appointmentReminderAllowedPresetIds: reminderSettings.allowedPresetIds,
    appointmentReminderPresetId: reminderSettings.defaultPresetId,
    appointmentReminderSelectionSource:
      row.appointment_reminder_selection_source === 'patient'
        ? 'patient'
        : 'specialist_default',
  };
}

function mapCurrentPatientReschedule(
  row: CurrentPatientRescheduleRow,
): AppointmentRescheduleRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    appointmentId: row.appointment_id,
    fromStartAt: row.from_start_at,
    fromEndAt: row.from_end_at,
    toStartAt: row.to_start_at,
    toEndAt: row.to_end_at,
    actorType: row.actor_type as AppointmentRescheduleRecord['actorType'],
    actorId: row.actor_id,
    wasInFreeRescheduleWindow: row.was_in_free_reschedule_window,
    freeCancellationAvailableAtReschedule: row.free_cancellation_available_at_reschedule,
    freeCancellationAvailableAfter: row.free_cancellation_available_after,
    appliedPolicyId: row.applied_policy_id,
    appliedPolicySnapshot: row.applied_policy_snapshot ?? {},
    reason: row.reason,
    staffComment: row.staff_comment,
    notificationsSent: row.notifications_sent ?? {},
    manualOverride: row.manual_override,
    createdAt: row.created_at,
  };
}

function isCurrentPatientPrincipal(): boolean {
  return getCurrentDbPrincipal()?.kind === 'patient';
}

async function patchCurrentPatientNotifications(
  appointmentId: string,
  kind: 'reschedule' | 'cancellation',
  notificationsSent: Record<string, unknown>,
): Promise<void> {
  const notificationsJson = JSON.stringify(notificationsSent);
  await runWebappNamedRoot(
    getWebappSqlDb(),
    'app.patch_current_patient_booking_notifications(uuid,text,text)',
    [appointmentId, kind, notificationsJson],
    drizzleSql`SELECT app.patch_current_patient_booking_notifications(
      ${appointmentId}::uuid, ${kind}::text, ${notificationsJson}::text
    )`,
  );
}

export function createPgBookingAppointmentLifecyclePort(): AppointmentLifecyclePort {
  return {
    async getAppointment(appointmentId, organizationId) {
      if (isCurrentPatientPrincipal()) {
        const appointment = await readCurrentPatientBookingAppointment(appointmentId);
        return appointment?.organizationId === organizationId ? appointment : null;
      }
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beAppointments)
        .where(
          and(
            eq(beAppointments.id, appointmentId),
            eq(beAppointments.organizationId, organizationId),
          ),
        )
        .limit(1);
      return rows[0] ? mapAppointment(rows[0]) : null;
    },

    async listReschedules(appointmentId, organizationId) {
      if (isCurrentPatientPrincipal()) {
        const result = await runWebappNamedRoot<{ reschedules: CurrentPatientRescheduleRow[] }>(
          getWebappSqlDb(),
          'app.read_current_patient_booking_reschedules(uuid)',
          [appointmentId],
          drizzleSql`SELECT app.read_current_patient_booking_reschedules(
            ${appointmentId}::uuid
          ) AS reschedules`,
        );
        const rows = (result.rows[0]?.reschedules ?? []).map(mapCurrentPatientReschedule);
        return rows.filter((row) => row.organizationId === organizationId);
      }
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
      if (isCurrentPatientPrincipal()) {
        const inputJson = JSON.stringify(input);
        const result = await runWebappNamedRoot<{
          appointment: CurrentPatientAppointmentRow | null;
        }>(
          getWebappSqlDb(),
          'app.apply_current_patient_booking_reschedule(text)',
          [inputJson],
          drizzleSql`SELECT app.apply_current_patient_booking_reschedule(
            ${inputJson}::text
          ) AS appointment`,
        );
        const appointment = result.rows[0]?.appointment;
        if (!appointment) throw new Error('appointment_not_found');
        return mapCurrentPatientAppointment(appointment);
      }
      const db = getDrizzle();
      const now = new Date().toISOString();
      return db.transaction(async (tx) => {
        const currentRows = await tx
          .select()
          .from(beAppointments)
          .where(
            and(
              eq(beAppointments.id, input.appointmentId),
              eq(beAppointments.organizationId, input.organizationId),
            ),
          )
          .for('update');
        const current = currentRows[0];
        if (!current) throw new Error('appointment_not_found');

        const fromStatus = current.status as BeAppointment['status'];
        const terminal = new Set<BeAppointment['status']>([
          'cancelled_by_patient',
          'cancelled_by_specialist',
          'no_show',
          'late_cancellation',
        ]);
        if (terminal.has(fromStatus)) {
          throw new Error('state_conflict');
        }
        if (fromStatus !== 'rescheduled') {
          assertValidAppointmentStatusTransition(fromStatus, 'rescheduled');
        }
        await tx
          .update(beAppointments)
          .set({ status: 'rescheduled', updatedAt: now })
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
            status: 'confirmed',
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
          appliedPolicyId: input.policy.id === 'default' ? null : input.policy.id,
          appliedPolicySnapshot: {
            ...input.policy,
            cancellationPolicyId: input.cancellationPolicy.id,
          },
          reason: input.reason ?? null,
          staffComment: input.staffComment ?? null,
          manualOverride: input.manualOverride ?? false,
          notificationsSent: input.notificationsSent ?? {},
          createdAt: now,
        });

        const payload = {
          fromStatus,
          toStatus: 'confirmed',
          fromStartAt: current.startAt,
          toStartAt: input.newStartAt,
          manualOverride: input.manualOverride ?? false,
        };
        await tx.insert(beAppointmentHistoryEvents).values({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          eventType: 'rescheduled',
          actorId: input.actorId,
          payload,
          occurredAt: now,
        });
        if (current.platformUserId) {
          await tx.insert(bePatientTimelineEvents).values({
            organizationId: input.organizationId,
            platformUserId: current.platformUserId,
            domain: 'appointment',
            eventType: 'appointment_rescheduled',
            linkedObjectType: 'appointment',
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
      if (isCurrentPatientPrincipal()) {
        const inputJson = JSON.stringify(input);
        const result = await runWebappNamedRoot<{
          appointment: CurrentPatientAppointmentRow | null;
        }>(
          getWebappSqlDb(),
          'app.apply_current_patient_booking_cancellation(text)',
          [inputJson],
          drizzleSql`SELECT app.apply_current_patient_booking_cancellation(
            ${inputJson}::text
          ) AS appointment`,
        );
        const appointment = result.rows[0]?.appointment;
        if (!appointment) throw new Error('appointment_not_found');
        return mapCurrentPatientAppointment(appointment);
      }
      const db = getDrizzle();
      const now = new Date().toISOString();
      return db.transaction(async (tx) => {
        const currentRows = await tx
          .select()
          .from(beAppointments)
          .where(
            and(
              eq(beAppointments.id, input.appointmentId),
              eq(beAppointments.organizationId, input.organizationId),
            ),
          )
          .for('update');
        const current = currentRows[0];
        if (!current) throw new Error('appointment_not_found');

        const fromStatus = current.status as BeAppointment['status'];
        const cancelledStatuses = new Set<BeAppointment['status']>([
          'cancelled_by_patient',
          'cancelled_by_specialist',
          'no_show',
          'late_cancellation',
        ]);
        if (cancelledStatuses.has(fromStatus) && cancelledStatuses.has(input.targetStatus)) {
          const updated = await tx
            .select()
            .from(beAppointments)
            .where(eq(beAppointments.id, input.appointmentId))
            .limit(1);
          return mapAppointment(updated[0]!);
        }
        if (cancelledStatuses.has(fromStatus)) {
          throw new Error('state_conflict');
        }
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
          appliedPolicyId: input.policy.id === 'default' ? null : input.policy.id,
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
        await tx.insert(beAppointmentHistoryEvents).values({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          eventType: 'cancelled',
          actorId: input.actorId,
          payload,
          occurredAt: now,
        });
        if (current.platformUserId) {
          await tx.insert(bePatientTimelineEvents).values({
            organizationId: input.organizationId,
            platformUserId: current.platformUserId,
            domain: 'appointment',
            eventType: 'appointment_cancelled',
            linkedObjectType: 'appointment',
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
      if (isCurrentPatientPrincipal()) {
        const appointment = await readCurrentPatientBookingAppointment(appointmentId);
        if (!appointment || appointment.organizationId !== organizationId) return;
        await patchCurrentPatientNotifications(appointmentId, 'reschedule', notificationsSent);
        return;
      }
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
      if (isCurrentPatientPrincipal()) {
        const appointment = await readCurrentPatientBookingAppointment(appointmentId);
        if (!appointment || appointment.organizationId !== organizationId) return;
        await patchCurrentPatientNotifications(appointmentId, 'cancellation', notificationsSent);
        return;
      }
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

    async applyNoShow(input) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      return db.transaction(async (tx) => {
        const currentRows = await tx
          .select()
          .from(beAppointments)
          .where(
            and(
              eq(beAppointments.id, input.appointmentId),
              eq(beAppointments.organizationId, input.organizationId),
            ),
          )
          .for('update');
        const current = currentRows[0];
        if (!current) throw new Error('appointment_not_found');

        const fromStatus = current.status as BeAppointment['status'];
        // no_show is terminal — idempotent if already there
        if (fromStatus === 'no_show') {
          const existing = await tx
            .select()
            .from(beAppointments)
            .where(eq(beAppointments.id, input.appointmentId))
            .limit(1);
          return mapAppointment(existing[0]!);
        }
        // Guard: FSM allows confirmed → no_show
        assertValidAppointmentStatusTransition(fromStatus, 'no_show');

        // 1. Transition appointment status
        await tx
          .update(beAppointments)
          .set({ status: 'no_show', updatedAt: now })
          .where(eq(beAppointments.id, input.appointmentId));

        // 2. Write history record (mirrors beAppointmentCancellations pattern)
        await tx.insert(beAppointmentNoShows).values({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          actorType: input.actorType,
          actorId: input.actorId,
          reason: input.reason ?? null,
          staffComment: input.staffComment ?? null,
          manualOverride: input.manualOverride ?? true,
          notificationsSent: input.notificationsSent ?? {},
          createdAt: now,
        });

        // 3. Appointment-level events (mirrors rescheduled / cancelled pattern)
        const payload = {
          fromStatus,
          toStatus: 'no_show',
          manualOverride: input.manualOverride ?? true,
        };
        await tx.insert(beAppointmentHistoryEvents).values({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          eventType: 'no_show',
          actorId: input.actorId,
          payload,
          occurredAt: now,
        });
        if (current.platformUserId) {
          await tx.insert(bePatientTimelineEvents).values({
            organizationId: input.organizationId,
            platformUserId: current.platformUserId,
            domain: 'appointment',
            eventType: 'appointment_no_show',
            linkedObjectType: 'appointment',
            linkedObjectId: input.appointmentId,
            payload,
            occurredAt: now,
          });

          // 4. Per-patient no-show counter: upsert + increment atomically.
          // INSERT ... ON CONFLICT avoids a separate SELECT + UPDATE race condition.
          await tx.execute(
            drizzleSql`
              INSERT INTO be_patient_booking_profiles
                (organization_id, platform_user_id, no_show_count, updated_at)
              VALUES
                (${input.organizationId}::uuid, ${current.platformUserId}::uuid, 1, ${now}::timestamptz)
              ON CONFLICT (organization_id, platform_user_id)
              DO UPDATE SET
                no_show_count = be_patient_booking_profiles.no_show_count + 1,
                updated_at    = EXCLUDED.updated_at
            `,
          );
        }

        const updated = await tx
          .select()
          .from(beAppointments)
          .where(eq(beAppointments.id, input.appointmentId))
          .limit(1);
        return mapAppointment(updated[0]!);
      });
    },

    async listNoShows(appointmentId, organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beAppointmentNoShows)
        .where(
          and(
            eq(beAppointmentNoShows.appointmentId, appointmentId),
            eq(beAppointmentNoShows.organizationId, organizationId),
          ),
        )
        .orderBy(asc(beAppointmentNoShows.createdAt));
      return rows.map(mapNoShow);
    },

    async patchLatestNoShowNotifications(appointmentId, organizationId, notificationsSent) {
      const db = getDrizzle();
      const rows = await db
        .select({ id: beAppointmentNoShows.id })
        .from(beAppointmentNoShows)
        .where(
          and(
            eq(beAppointmentNoShows.appointmentId, appointmentId),
            eq(beAppointmentNoShows.organizationId, organizationId),
          ),
        )
        .orderBy(desc(beAppointmentNoShows.createdAt))
        .limit(1);
      const row = rows[0];
      if (!row) return;
      await db
        .update(beAppointmentNoShows)
        .set({ notificationsSent })
        .where(eq(beAppointmentNoShows.id, row.id));
    },
  };
}
