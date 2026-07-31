import type {
  PatientBookingService,
  PatientBookingsPort,
  BookingSyncPort,
  BookingSlotsQuery,
} from './ports';
import type { BookingSlotsByDate, CreatePatientBookingInput } from './types';
import type { createBookingEngineService } from '@/modules/booking-engine/service';
import type { createBookingSchedulingService } from '@/modules/booking-scheduling/service';
import type { createBookingFormService } from '@/modules/booking-form/service';
import type { createBookingAppointmentLifecycleService } from '@/modules/booking-appointment-lifecycle/service';
import type { PaymentsService } from '@/modules/payments/service';
import type { MembershipsService } from '@/modules/memberships/service';
import type { ProductsService } from '@/modules/products/service';
import type { ClientHistoryService } from '@/modules/client-history/service';
import type { PlatformUserContactsService } from '@/modules/platform-user-contacts/service';
import type { IdentityContactFields } from '@/modules/platform-user-contacts/identityContactMatch';

type BookingEngineService = ReturnType<typeof createBookingEngineService>;
type BookingSchedulingService = ReturnType<typeof createBookingSchedulingService>;
type BookingFormService = ReturnType<typeof createBookingFormService>;
type BookingAppointmentLifecycleService = ReturnType<
  typeof createBookingAppointmentLifecycleService
>;
import type { AppointmentProjectionPort } from './ports';
import { validateCreatePatientBookingInput } from './createInputValidation';
import { createBookingOnCanonicalEngine, type CanonicalBookingDeps } from './canonicalCreate';
import {
  buildBookingNotificationsSent,
  resolveBookingNotifyTargets,
  type BookingLifecycleNotificationsSettings,
} from './bookingLifecycleNotifications';
import {
  projectCanonicalAppointmentCancelled,
  projectCanonicalAppointmentRescheduled,
} from './projectCanonicalAppointment';
import { normalizeRuPhoneE164 } from '@/shared/phone/normalizeRuPhoneE164';
import type { PatientBookingRecord } from './types';
import { prepaymentContextFromBooking } from '@/modules/payments/prepaymentContextFromBooking';
import type { BeAppointment } from '@/modules/booking-engine/types';
import type { AppointmentReminderPlan } from '@/modules/booking-notifications/settings';

function isPostgresExclusionViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23P01'
  );
}

async function resolveCanonicalAppointmentOrganizationId(
  bookingEngine: BookingEngineService | null | undefined,
  appointmentId: string,
): Promise<string> {
  return (await loadCanonicalAppointment(bookingEngine, appointmentId)).organizationId;
}

async function loadCanonicalAppointment(
  bookingEngine: BookingEngineService | null | undefined,
  appointmentId: string,
): Promise<BeAppointment> {
  if (!bookingEngine) throw new Error('canonical_booking_unavailable');
  const appointment = await bookingEngine.getAppointment(appointmentId);
  if (!appointment) throw new Error('canonical_appointment_not_found');
  return appointment;
}

async function loadBookingPaymentStatus(
  row: PatientBookingRecord | null,
  input: {
    bookingEngine: BookingEngineService | null | undefined;
    payments: PaymentsService | null | undefined;
  },
) {
  if (!row?.canonicalAppointmentId || !input.bookingEngine || !input.payments) {
    return { ok: false as const, error: 'not_found' as const };
  }
  const orgId = await resolveCanonicalAppointmentOrganizationId(
    input.bookingEngine,
    row.canonicalAppointmentId,
  ).catch(() => null);
  if (!orgId) return { ok: false as const, error: 'not_found' as const };
  const summary = await input.payments.getAppointmentPaymentSummary(
    row.canonicalAppointmentId,
    orgId,
    undefined,
    prepaymentContextFromBooking(row),
  );
  return {
    ok: true as const,
    booking: row,
    summary,
    intentId: summary?.intent?.id ?? null,
  };
}

function rowToProjectionInput(row: PatientBookingRecord) {
  return {
    phoneNormalized: normalizeRuPhoneE164(row.contactPhone) ?? (row.contactPhone.trim() || null),
    contactName: row.contactName,
    serviceTitle: row.serviceTitleSnapshot,
    branchTitle: row.branchTitleSnapshot,
  };
}

function buildProjectionInput(row: PatientBookingRecord) {
  return { ...rowToProjectionInput(row), legacyBranchId: null };
}

function cacheKey(query: BookingSlotsQuery): string {
  if (query.type === 'online') {
    return JSON.stringify({
      type: query.type,
      category: query.category,
      date: query.date ?? '',
      slotCount: query.slotCount ?? 1,
    });
  }
  return JSON.stringify({
    type: query.type,
    branchId: query.branchId,
    serviceId: query.serviceId,
    date: query.date ?? '',
    slotCount: query.slotCount ?? 1,
  });
}

export function createPatientBookingService(input: {
  bookingsPort: PatientBookingsPort;
  syncPort: BookingSyncPort;
  bookingEngine?: BookingEngineService | null;
  bookingScheduling?: BookingSchedulingService | null;
  bookingForm?: BookingFormService | null;
  appointmentProjection?: AppointmentProjectionPort | null;
  appointmentLifecycle?: BookingAppointmentLifecycleService | null;
  payments?: PaymentsService | null;
  memberships?: MembershipsService | null;
  products?: ProductsService | null;
  clientHistory?: ClientHistoryService | null;
  platformUserContacts?: PlatformUserContactsService | null;
  getPlatformUserIdentityContacts?: (userId: string) => Promise<IdentityContactFields | null>;
  getBookingLifecycleNotificationSettings?: () => Promise<BookingLifecycleNotificationsSettings | null>;
  getAppointmentReminderPlan?: (organizationId: string) => Promise<AppointmentReminderPlan>;
  slotsTtlMs?: number;
}): PatientBookingService {
  const slotsTtlMs = input.slotsTtlMs ?? 60 * 1000;
  const slotsCache = new Map<
    string,
    { fetchedAt: number; expiresAt: number; value: BookingSlotsByDate[] }
  >();
  let lastSlotsMutationAt = 0;
  const inFlightCreateBySlot = new Set<string>();

  function invalidateSlotsCache(): void {
    lastSlotsMutationAt = Date.now();
    slotsCache.clear();
  }

  const canonicalDeps: CanonicalBookingDeps | null =
    input.bookingEngine && input.bookingScheduling
      ? {
          bookingsPort: input.bookingsPort,
          syncPort: input.syncPort,
          bookingEngine: input.bookingEngine,
          bookingScheduling: input.bookingScheduling,
          bookingForm: input.bookingForm ?? null,
          appointmentProjection: input.appointmentProjection ?? null,
          payments: input.payments ?? null,
          memberships: input.memberships ?? null,
          products: input.products ?? null,
          clientHistory: input.clientHistory ?? null,
          platformUserContacts: input.platformUserContacts ?? null,
          getPlatformUserIdentityContacts: input.getPlatformUserIdentityContacts,
          getBookingLifecycleNotificationSettings:
            input.getBookingLifecycleNotificationSettings ?? (async () => null),
          getAppointmentReminderPlan: input.getAppointmentReminderPlan,
        }
      : null;

  return {
    async getSlots(query) {
      const key = cacheKey(query);
      const now = Date.now();
      const cached = slotsCache.get(key);
      if (cached && cached.expiresAt > now && cached.fetchedAt >= lastSlotsMutationAt) {
        return cached.value;
      }

      if (!input.bookingScheduling || !input.bookingEngine) {
        throw new Error('canonical_booking_unavailable');
      }
      let value: BookingSlotsByDate[];
      if (query.type === 'online') {
        const orgId = query.organizationId?.trim();
        if (!orgId) throw new Error('ambiguous_booking_tenant');
        value = await input.bookingScheduling.getOnlineSlots({
          organizationId: orgId,
          category: query.category,
          date: query.date,
          slotCount: query.slotCount,
        });
      } else {
        value = await input.bookingScheduling.getInPersonSlots({
          organizationId: query.organizationId,
          branchId: query.branchId,
          serviceId: query.serviceId,
          date: query.date,
          slotCount: query.slotCount,
        });
      }

      slotsCache.set(key, { fetchedAt: now, value, expiresAt: now + slotsTtlMs });
      return value;
    },

    async createBooking(rawInput) {
      const createInput = validateCreatePatientBookingInput(rawInput);
      const formAnswers = rawInput.formAnswers ?? [];

      if (!canonicalDeps) {
        throw new Error('canonical_booking_unavailable');
      }

      const slotLockKey =
        createInput.type === 'in_person'
          ? `${createInput.branchId}:${createInput.serviceId}|${createInput.slotStart}|${createInput.slotEnd}`
          : `online:${createInput.category}|${createInput.slotStart}|${createInput.slotEnd}`;
      if (inFlightCreateBySlot.has(slotLockKey)) {
        throw new Error('slot_overlap');
      }
      inFlightCreateBySlot.add(slotLockKey);

      try {
        const result = await createBookingOnCanonicalEngine(
          canonicalDeps,
          createInput,
          formAnswers,
        );
        invalidateSlotsCache();
        return result;
      } finally {
        inFlightCreateBySlot.delete(slotLockKey);
      }
    },

    async resolveBookingOrganizationId(bookingId: string) {
      const row = await input.bookingsPort.getById(bookingId);
      if (!row?.canonicalAppointmentId) return null;
      return resolveCanonicalAppointmentOrganizationId(
        input.bookingEngine,
        row.canonicalAppointmentId,
      ).catch(() => null);
    },

    async getBookingPaymentStatus(bookingId: string, userId: string) {
      const row = await input.bookingsPort.getByIdForUser(bookingId, userId);
      return loadBookingPaymentStatus(row, {
        bookingEngine: input.bookingEngine ?? null,
        payments: input.payments ?? null,
      });
    },

    async getBookingPaymentStatusForContact(bookingId: string, contactPhone: string) {
      const row = await input.bookingsPort.getById(bookingId);
      if (!row) return { ok: false as const, error: 'not_found' as const };
      const normalized = normalizeRuPhoneE164(contactPhone) ?? contactPhone.trim();
      const rowPhone = normalizeRuPhoneE164(row.contactPhone) ?? row.contactPhone.trim();
      if (normalized !== rowPhone) return { ok: false as const, error: 'forbidden' as const };
      return loadBookingPaymentStatus(row, {
        bookingEngine: input.bookingEngine ?? null,
        payments: input.payments ?? null,
      });
    },

    async getBookingByCanonicalAppointment(canonicalAppointmentId: string) {
      return input.bookingsPort.getByCanonicalAppointmentId(canonicalAppointmentId);
    },

    async syncLinkedPatientBookingCancelled(syncInput: {
      canonicalAppointmentId: string;
      reason?: string;
    }): Promise<void> {
      const row = await input.bookingsPort.getByCanonicalAppointmentId(
        syncInput.canonicalAppointmentId,
      );
      if (!row) return;
      if (row.status === 'cancelled' || row.status === 'failed_sync') return;
      await input.bookingsPort.markCancelled({
        bookingId: row.id,
        status: 'cancelled',
        reason: syncInput.reason,
      });
    },

    async previewCancel(previewInput) {
      const row = await input.bookingsPort.getByIdForUser(
        previewInput.bookingId,
        previewInput.userId,
      );
      if (!row?.canonicalAppointmentId || !input.bookingEngine || !input.appointmentLifecycle) {
        return { ok: false, error: 'no_canonical' };
      }
      const orgId = await resolveCanonicalAppointmentOrganizationId(
        input.bookingEngine,
        row.canonicalAppointmentId,
      ).catch(() => null);
      if (!orgId) return { ok: false, error: 'not_found' };
      const preview = await input.appointmentLifecycle.previewPatientCancel(
        row.canonicalAppointmentId,
        orgId,
      );
      if (!preview.ok) return { ok: false, error: 'not_found' };
      return {
        ok: true,
        allowed: preview.allowed,
        isFree: preview.isFree,
        messageKey: preview.messageKey,
      };
    },

    async previewReschedule(previewInput) {
      const row = await input.bookingsPort.getByIdForUser(
        previewInput.bookingId,
        previewInput.userId,
      );
      if (!row?.canonicalAppointmentId || !input.bookingEngine || !input.appointmentLifecycle) {
        return { ok: false, error: 'no_canonical' };
      }
      const appointment = await loadCanonicalAppointment(
        input.bookingEngine,
        row.canonicalAppointmentId,
      ).catch(() => null);
      if (!appointment) return { ok: false, error: 'no_canonical' };
      const orgId = appointment.organizationId;
      if (row.bookingType === 'in_person' && (!appointment.branchId || !appointment.serviceId)) {
        return { ok: false, error: 'canonical_appointment_incomplete' };
      }
      const preview = await input.appointmentLifecycle.previewPatientReschedule(
        row.canonicalAppointmentId,
        orgId,
      );
      if (!preview.ok) return { ok: false, error: 'not_found' };
      return {
        ok: true,
        allowed: preview.allowed,
        messageKey: preview.messageKey,
        remainingSelfReschedules: preview.remainingSelfReschedules,
      };
    },

    async rescheduleBooking(rescheduleInput) {
      const row = await input.bookingsPort.getByIdForUser(
        rescheduleInput.bookingId,
        rescheduleInput.userId,
      );
      if (
        !row?.canonicalAppointmentId ||
        !input.bookingEngine ||
        !input.bookingScheduling ||
        !input.appointmentLifecycle
      ) {
        return { ok: false, error: 'no_canonical' };
      }
      if (row.status === 'cancelled' || row.status === 'cancelling') {
        return { ok: false, error: 'not_found' };
      }
      const appointment = await loadCanonicalAppointment(
        input.bookingEngine,
        row.canonicalAppointmentId,
      ).catch(() => null);
      if (!appointment) return { ok: false, error: 'no_canonical' };
      const orgId = appointment.organizationId;
      if (row.bookingType === 'in_person' && (!appointment.branchId || !appointment.serviceId)) {
        return { ok: false, error: 'canonical_appointment_incomplete' };
      }

      const durationMinutes = Math.max(
        1,
        Math.round(
          (new Date(rescheduleInput.slotEnd).getTime() -
            new Date(rescheduleInput.slotStart).getTime()) /
            60_000,
        ),
      );

      try {
        await input.bookingScheduling.assertSlotAvailable({
          organizationId: orgId,
          specialistId: appointment.specialistId,
          roomId: appointment.roomId,
          slotStart: rescheduleInput.slotStart,
          slotEnd: rescheduleInput.slotEnd,
          durationMinutes,
          excludeAppointmentId: row.canonicalAppointmentId,
        });
      } catch (err) {
        if (
          isPostgresExclusionViolation(err) ||
          (err instanceof Error && err.message === 'slot_overlap')
        ) {
          return { ok: false, error: 'slot_overlap' };
        }
        throw err;
      }

      const result = await input.appointmentLifecycle.patientReschedule({
        appointmentId: row.canonicalAppointmentId,
        organizationId: orgId,
        userId: rescheduleInput.userId,
        newStartAt: rescheduleInput.slotStart,
        newEndAt: rescheduleInput.slotEnd,
        durationMinutes,
        reason: rescheduleInput.reason,
      });
      if (!result.ok) {
        const err = result.error;
        if (err === 'staff_confirmation_required') {
          try {
            await input.syncPort.emitBookingEvent({
              eventType: 'booking.reschedule_requested',
              idempotencyKey: `booking.reschedule_requested:${row.id}:${rescheduleInput.slotStart}`,
              payload: {
                organizationId: orgId,
                bookingId: row.id,
                userId: row.userId as string,
                bookingType: row.bookingType,
                city: row.city ?? undefined,
                category: row.category,
                slotStart: row.slotStart,
                slotEnd: row.slotEnd,
                contactName: row.contactName,
                contactPhone: row.contactPhone,
                contactEmail: row.contactEmail ?? undefined,
                cityCodeSnapshot: row.cityCodeSnapshot,
                serviceTitleSnapshot: row.serviceTitleSnapshot,
                canonicalAppointmentId: row.canonicalAppointmentId ?? undefined,
              },
            });
          } catch {
            // GCal marker is best-effort.
          }
          return { ok: false, error: err };
        }
        if (
          err === 'not_found' ||
          err === 'too_late' ||
          err === 'limit_exceeded' ||
          err === 'change_not_allowed'
        ) {
          return { ok: false, error: err };
        }
        return { ok: false, error: 'not_found' };
      }

      const updatedRow = await input.bookingsPort.updateSlotsAfterReschedule({
        bookingId: row.id,
        slotStart: rescheduleInput.slotStart,
        slotEnd: rescheduleInput.slotEnd,
        status: row.status === 'awaiting_payment' ? 'awaiting_payment' : 'confirmed',
      });
      invalidateSlotsCache();

      let paymentOutcomeFailed = false;
      if (input.payments && row.canonicalAppointmentId) {
        try {
          await input.payments.recordReschedulePaymentCarryOver({
            appointmentId: row.canonicalAppointmentId,
            organizationId: orgId,
            platformUserId: rescheduleInput.userId,
            newStartAt: rescheduleInput.slotStart,
          });
        } catch (err) {
          paymentOutcomeFailed = true;
          console.error(
            '[patient-booking] payment carry-over failed (reschedule already committed)',
            {
              bookingId: row.id,
              canonicalAppointmentId: row.canonicalAppointmentId,
              err,
            },
          );
        }
      }

      if (input.appointmentProjection) {
        try {
          await projectCanonicalAppointmentRescheduled(
            input.appointmentProjection,
            result.appointment,
            buildProjectionInput({
              ...row,
              slotStart: rescheduleInput.slotStart,
              slotEnd: rescheduleInput.slotEnd,
            }),
          );
        } catch (err) {
          console.error(
            '[patient-booking] doctor projection reschedule failed (reschedule already committed)',
            {
              bookingId: row.id,
              canonicalAppointmentId: row.canonicalAppointmentId,
              err,
            },
          );
        }
      }

      const idempotencyKey = `booking.rescheduled:${row.id}:${rescheduleInput.slotStart}`;
      let integratorStatus: 'sent' | 'failed' = 'failed';
      try {
        const reminderPlan = await input.getAppointmentReminderPlan?.(orgId);
        await input.syncPort.emitBookingEvent({
          eventType: 'booking.rescheduled',
          idempotencyKey,
          payload: {
            organizationId: orgId,
            bookingId: row.id,
            userId: row.userId as string,
            bookingType: row.bookingType,
            city: row.city ?? undefined,
            category: row.category,
            slotStart: rescheduleInput.slotStart,
            slotEnd: rescheduleInput.slotEnd,
            contactName: row.contactName,
            contactPhone: row.contactPhone,
            contactEmail: row.contactEmail ?? undefined,
            cityCodeSnapshot: row.cityCodeSnapshot,
            serviceTitleSnapshot: row.serviceTitleSnapshot,
            canonicalAppointmentId: row.canonicalAppointmentId ?? undefined,
            ...(reminderPlan ? { reminderPlan } : {}),
          },
        });
        integratorStatus = 'sent';
      } catch {
        // Best-effort notifications.
      }

      const rescheduleNotify = resolveBookingNotifyTargets(
        'booking.rescheduled',
        result.reschedulePolicy,
        (await input.getBookingLifecycleNotificationSettings?.()) ?? null,
      );
      let notificationOutcomeFailed = false;
      try {
        await input.appointmentLifecycle.patchLatestRescheduleNotifications(
          row.canonicalAppointmentId,
          orgId,
          buildBookingNotificationsSent({
            eventType: 'booking.rescheduled',
            idempotencyKey,
            notifyPatient: rescheduleNotify.notifyPatient,
            notifyStaff: rescheduleNotify.notifyStaff,
            integratorStatus,
          }),
        );
      } catch (err) {
        notificationOutcomeFailed = true;
        console.error(
          '[patient-booking] reschedule notification patch failed (reschedule already committed)',
          {
            bookingId: row.id,
            canonicalAppointmentId: row.canonicalAppointmentId,
            err,
          },
        );
      }

      return {
        ok: true,
        booking: updatedRow ?? row,
        ...(notificationOutcomeFailed ? { notificationOutcomeFailed: true as const } : {}),
        ...(paymentOutcomeFailed ? { paymentOutcomeFailed: true as const } : {}),
      };
    },

    async cancelBooking(cancelInput) {
      const row = await input.bookingsPort.getByIdForUser(
        cancelInput.bookingId,
        cancelInput.userId,
      );
      if (!row) return { ok: false, error: 'not_found' };
      if (row.status === 'cancelled' || row.status === 'cancelling') {
        return { ok: false, error: 'already_cancelled' };
      }

      if (row.canonicalAppointmentId && input.bookingEngine && input.appointmentLifecycle) {
        const orgId = await resolveCanonicalAppointmentOrganizationId(
          input.bookingEngine,
          row.canonicalAppointmentId,
        ).catch(() => null);
        if (!orgId) return { ok: false, error: 'not_found' };
        const preview = await input.appointmentLifecycle.previewPatientCancel(
          row.canonicalAppointmentId,
          orgId,
        );
        if (!preview.ok) return { ok: false, error: 'not_found' };
        if (!preview.allowed) return { ok: false, error: 'not_allowed' };
        if (preview.requiresStaffConfirmation) {
          return { ok: false, error: 'staff_confirmation_required' };
        }

        await input.bookingsPort.markCancelling(row.id);

        const lifecycleResult = await input.appointmentLifecycle.patientCancel({
          appointmentId: row.canonicalAppointmentId,
          organizationId: orgId,
          userId: cancelInput.userId,
          reason: cancelInput.reason,
        });
        if (!lifecycleResult.ok) {
          await input.bookingsPort.markCancelled({
            bookingId: row.id,
            reason: 'cancel_lifecycle_failed',
            status: 'cancel_failed',
          });
          invalidateSlotsCache();
          if (lifecycleResult.error === 'not_allowed') return { ok: false, error: 'not_allowed' };
          if (lifecycleResult.error === 'staff_confirmation_required') {
            return { ok: false, error: 'staff_confirmation_required' };
          }
          return { ok: false, error: 'lifecycle_failed' };
        }

        let paymentOutcomeFailed = false;
        let membershipOutcomeFailed = false;
        let productOutcomeFailed = false;
        let notificationOutcomeFailed = false;

        if (input.payments) {
          try {
            await input.payments.applyCancelPaymentOutcome({
              appointmentId: row.canonicalAppointmentId,
              organizationId: orgId,
              prepaymentRetained: lifecycleResult.eligibility
                ? !lifecycleResult.eligibility.isFree &&
                  lifecycleResult.cancelPolicy.lateCancellationBehavior === 'retain_prepayment'
                : false,
              prepaymentRefunded: lifecycleResult.eligibility
                ? lifecycleResult.eligibility.isFree ||
                  lifecycleResult.cancelPolicy.lateCancellationBehavior === 'refund_prepayment'
                : false,
              reason: cancelInput.reason,
            });
          } catch (err) {
            paymentOutcomeFailed = true;
            console.error(
              '[patient-booking] cancel payment outcome failed (canonical already cancelled)',
              {
                bookingId: row.id,
                err,
              },
            );
          }
        }

        if (input.memberships && lifecycleResult.eligibility) {
          const { eligibility } = lifecycleResult;
          const packageLessonDeducted =
            !eligibility.isFree && eligibility.decisionType === 'package_charged';
          try {
            await input.memberships.applyCancelPackageOutcome({
              organizationId: orgId,
              appointmentId: row.canonicalAppointmentId,
              packageLessonDeducted,
            });
          } catch (err) {
            membershipOutcomeFailed = true;
            console.error(
              '[patient-booking] cancel package outcome failed (canonical already cancelled)',
              {
                bookingId: row.id,
                err,
              },
            );
          }
        }

        if (input.products && input.bookingEngine) {
          const appt = await input.bookingEngine.getAppointment(row.canonicalAppointmentId);
          const rawProductId = appt?.attributionJson?.productPurchaseId;
          const productPurchaseId =
            typeof rawProductId === 'string' && rawProductId.trim() ? rawProductId.trim() : null;
          if (productPurchaseId && lifecycleResult.eligibility) {
            const visitDeducted =
              !lifecycleResult.eligibility.isFree &&
              lifecycleResult.eligibility.decisionType === 'package_charged';
            try {
              await input.products.applyCancelVisitOutcome({
                organizationId: orgId,
                productPurchaseId,
                appointmentId: row.canonicalAppointmentId,
                visitDeducted,
              });
            } catch (err) {
              productOutcomeFailed = true;
              console.error(
                '[patient-booking] cancel product outcome failed (canonical already cancelled)',
                {
                  bookingId: row.id,
                  err,
                },
              );
            }
          }
        }

        await input.bookingsPort.markCancelled({
          bookingId: row.id,
          reason: cancelInput.reason,
          status: 'cancelled',
        });
        invalidateSlotsCache();

        if (input.appointmentProjection) {
          try {
            await projectCanonicalAppointmentCancelled(
              input.appointmentProjection,
              lifecycleResult.appointment,
              buildProjectionInput(row),
            );
          } catch (err) {
            console.error(
              '[patient-booking] doctor projection cancel failed (cancel already committed)',
              {
                bookingId: row.id,
                canonicalAppointmentId: row.canonicalAppointmentId,
                err,
              },
            );
          }
        }

        const idempotencyKey = `booking.cancelled:${row.id}`;
        let integratorStatus: 'sent' | 'failed' = 'failed';
        try {
          await input.syncPort.emitBookingEvent({
            eventType: 'booking.cancelled',
            idempotencyKey,
            payload: {
              organizationId: orgId,
              bookingId: row.id,
              userId: row.userId as string,
              bookingType: row.bookingType,
              city: row.city ?? undefined,
              category: row.category,
              slotStart: row.slotStart,
              slotEnd: row.slotEnd,
              contactName: row.contactName,
              contactPhone: row.contactPhone,
              contactEmail: row.contactEmail ?? undefined,
              reason: cancelInput.reason,
              cityCodeSnapshot: row.cityCodeSnapshot,
              serviceTitleSnapshot: row.serviceTitleSnapshot,
              canonicalAppointmentId: row.canonicalAppointmentId ?? undefined,
            },
          });
          integratorStatus = 'sent';
        } catch {
          // Best-effort.
        }

        const cancelNotify = resolveBookingNotifyTargets(
          'booking.cancelled',
          lifecycleResult.cancelPolicy,
          (await input.getBookingLifecycleNotificationSettings?.()) ?? null,
        );
        try {
          await input.appointmentLifecycle.patchLatestCancellationNotifications(
            row.canonicalAppointmentId,
            orgId,
            buildBookingNotificationsSent({
              eventType: 'booking.cancelled',
              idempotencyKey,
              notifyPatient: cancelNotify.notifyPatient,
              notifyStaff: cancelNotify.notifyStaff,
              integratorStatus,
            }),
          );
        } catch (err) {
          notificationOutcomeFailed = true;
          console.error(
            '[patient-booking] cancel notification patch failed (cancel already committed)',
            {
              bookingId: row.id,
              canonicalAppointmentId: row.canonicalAppointmentId,
              err,
            },
          );
        }

        return {
          ok: true,
          lateCancellation:
            lifecycleResult.eligibility.reasonCode === 'late' ||
            lifecycleResult.eligibility.reasonCode === 'forfeited_by_reschedule',
          ...(notificationOutcomeFailed ? { notificationOutcomeFailed: true as const } : {}),
          ...(paymentOutcomeFailed ? { paymentOutcomeFailed: true as const } : {}),
          ...(membershipOutcomeFailed ? { membershipOutcomeFailed: true as const } : {}),
          ...(productOutcomeFailed ? { productOutcomeFailed: true as const } : {}),
        };
      }

      return { ok: false, error: 'not_found' };
    },

    async listMyBookings(userId) {
      const nowIso = new Date().toISOString();
      const [upcoming, history] = await Promise.all([
        input.bookingsPort.listUpcomingByUser(userId, nowIso),
        input.bookingsPort.listHistoryByUser(userId, nowIso),
      ]);
      return { upcoming, history };
    },
  };
}
