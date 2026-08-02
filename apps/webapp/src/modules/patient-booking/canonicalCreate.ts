import { randomUUID } from 'node:crypto';
import type { createBookingEngineService } from '@/modules/booking-engine/service';
import type {
  BeAppointment,
  BeBranch,
  BeClinicService,
  CreateAppointmentInput,
} from '@/modules/booking-engine/types';

type BookingEngineService = ReturnType<typeof createBookingEngineService>;
import type { createBookingFormService } from '@/modules/booking-form/service';
import type { createBookingSchedulingService } from '@/modules/booking-scheduling/service';
import type { CanonicalBookingContext } from '@/modules/booking-scheduling/ports';

type BookingFormService = ReturnType<typeof createBookingFormService>;
type BookingSchedulingService = ReturnType<typeof createBookingSchedulingService>;
import type { AppointmentProjectionPort } from './ports';
import type { PaymentsService } from '@/modules/payments/service';
import type { MembershipsService } from '@/modules/memberships/service';
import type { ClientHistoryService } from '@/modules/client-history/service';
import type { PlatformUserContactsService } from '@/modules/platform-user-contacts/service';
import type { IdentityContactFields } from '@/modules/platform-user-contacts/identityContactMatch';
import { upsertBookingFormContactsBestEffort } from '@/modules/platform-user-contacts/bookingContactUpsert';
import { normalizeRuPhoneE164 } from '@/shared/phone/normalizeRuPhoneE164';
import type {
  BookingSyncPort,
  PatientBookingsPort,
  CreatePendingPatientBookingInput,
} from './ports';
import type { CreatePatientBookingInput, PatientBookingRecord } from './types';
import { projectCanonicalAppointmentForDoctor } from './projectCanonicalAppointment';
import {
  resolveBookingNotifyTargets,
  type BookingLifecycleNotificationsSettings,
} from './bookingLifecycleNotifications';
import { appointmentReminderPlanForPreset } from '@/modules/booking-notifications/appointmentReminderPresets';
import { sendBookingConfirmationEmail } from './sendBookingConfirmationEmail';
import { buildPatientCreatedMessageText } from './patientMessageText';
import { buildDoctorCreatedMessageText } from './doctorMessageText';
import { resolveBookingCalendarSyncFields } from './bookingCalendarSyncFields';
import { DEFAULT_APP_DISPLAY_TIMEZONE } from '@/modules/system-settings/calendarIana';
import { env } from '@/config/env';
import { publicBookPaths } from '@/shared/publicBook/paths';

function isPostgresExclusionViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23P01'
  );
}

async function persistBookingFormContacts(
  deps: CanonicalBookingDeps,
  createInput: CreatePatientBookingInput,
) {
  const identity =
    deps.getPlatformUserIdentityContacts != null
      ? await deps.getPlatformUserIdentityContacts(createInput.userId)
      : null;
  await upsertBookingFormContactsBestEffort(deps.platformUserContacts, {
    platformUserId: createInput.userId,
    contactPhone: createInput.contactPhone,
    contactEmail: createInput.contactEmail,
    identity,
  });
}

export type CanonicalBookingDeps = {
  bookingsPort: PatientBookingsPort;
  syncPort: BookingSyncPort;
  bookingEngine: BookingEngineService | null;
  bookingScheduling: BookingSchedulingService | null;
  bookingForm: BookingFormService | null;
  appointmentProjection: AppointmentProjectionPort | null;
  payments: PaymentsService | null;
  canAcceptBookingPrepayment: (organizationId: string) => Promise<boolean>;
  memberships: MembershipsService | null;
  clientHistory: ClientHistoryService | null;
  platformUserContacts?: PlatformUserContactsService | null;
  getPlatformUserIdentityContacts?: (userId: string) => Promise<IdentityContactFields | null>;
  getBookingLifecycleNotificationSettings?: () => Promise<BookingLifecycleNotificationsSettings | null>;
  /** D14(3): часовой пояс организации для текста пациентского сообщения. Отсутствие — DEFAULT_APP_DISPLAY_TIMEZONE. */
  getAppDisplayTimeZone?: () => Promise<string>;
};

function toPendingRowOnline(
  input: CreatePatientBookingInput & { type: 'online' },
  organizationId: string,
): CreatePendingPatientBookingInput {
  return {
    organizationId,
    userId: input.userId,
    bookingType: 'online',
    city: null,
    category: input.category,
    slotStart: input.slotStart,
    slotEnd: input.slotEnd,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail ?? null,
    branchId: null,
    serviceId: null,
    branchServiceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: 60,
    priceMinorSnapshot: null,
  };
}

function toPendingRowInPerson(
  input: CreatePatientBookingInput & { type: 'in_person' },
  organizationId: string,
  resolved: {
    context: CanonicalBookingContext;
    branch: BeBranch;
    service: BeClinicService;
  },
): CreatePendingPatientBookingInput {
  const { context, branch, service } = resolved;
  return {
    organizationId,
    userId: input.userId,
    bookingType: 'in_person',
    city: branch.cityCode,
    category: 'general',
    slotStart: input.slotStart,
    slotEnd: input.slotEnd,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail ?? null,
    // `patient_bookings` is retained for historical projection only. New canonical
    // bookings never create legacy catalog links; `be_appointments` owns the ids.
    branchId: null,
    serviceId: null,
    branchServiceId: null,
    cityCodeSnapshot: branch.cityCode,
    branchTitleSnapshot: branch.title,
    serviceTitleSnapshot: service.title,
    durationMinutesSnapshot: context.durationMinutes,
    priceMinorSnapshot: service.priceMinor,
  };
}

export async function createBookingOnCanonicalEngine(
  deps: CanonicalBookingDeps,
  createInput: CreatePatientBookingInput,
  formAnswers: { fieldKey: string; value: string }[] = [],
): Promise<PatientBookingRecord> {
  if (!deps.bookingEngine || !deps.bookingScheduling) {
    throw new Error('canonical_booking_unavailable');
  }
  const slotCount = createInput.slotCount ?? 1;
  if (!Number.isInteger(slotCount) || slotCount < 1 || slotCount > 8)
    throw new Error('invalid_slot_count');

  let pendingRow: CreatePendingPatientBookingInput;
  let durationMinutes = 60;
  let canonicalBranchId: string | null = null;
  let canonicalSpecialistId: string | null = null;
  let canonicalServiceId: string | null = null;
  let canonicalRoomId: string | null = null;
  let orgId = createInput.organizationId?.trim() ?? '';
  let inPersonCtx: Awaited<
    ReturnType<BookingSchedulingService['resolveCanonicalInPersonContext']>
  > | null = null;

  if (createInput.type === 'online') {
    if (!orgId) throw new Error('ambiguous_booking_tenant');
    pendingRow = toPendingRowOnline(createInput, orgId);
    await deps.bookingScheduling.assertSlotAvailable({
      organizationId: orgId,
      specialistId: null,
      roomId: null,
      slotStart: createInput.slotStart,
      slotEnd: createInput.slotEnd,
      durationMinutes: 60,
      slotCount,
    });
  } else {
    inPersonCtx = await deps.bookingScheduling.resolveCanonicalInPersonContext({
      organizationId: orgId || null,
      branchId: createInput.branchId,
      serviceId: createInput.serviceId,
    });
    if (!inPersonCtx) throw new Error('branch_service_not_found');
    const [branch, service] = await Promise.all([
      deps.bookingEngine.catalog.getBranch(inPersonCtx.branchId),
      deps.bookingEngine.services.getService(inPersonCtx.serviceId),
    ]);
    if (
      !branch ||
      !service ||
      !branch.isActive ||
      !service.isActive ||
      branch.organizationId !== inPersonCtx.organizationId ||
      service.organizationId !== inPersonCtx.organizationId
    ) {
      throw new Error('branch_service_not_found');
    }
    if (orgId && orgId !== inPersonCtx.organizationId) throw new Error('ambiguous_booking_tenant');
    orgId = inPersonCtx.organizationId;
    const expectedCity = branch.cityCode.trim().toLowerCase();
    if (createInput.cityCode.trim().toLowerCase() !== expectedCity)
      throw new Error('city_mismatch');
    pendingRow = toPendingRowInPerson(createInput, orgId, {
      context: inPersonCtx,
      branch,
      service,
    });
    durationMinutes = inPersonCtx.durationMinutes;
    await deps.bookingScheduling.assertSlotAvailable({
      organizationId: inPersonCtx.organizationId,
      specialistId: inPersonCtx.specialistId,
      roomId: inPersonCtx.roomId,
      slotStart: createInput.slotStart,
      slotEnd: createInput.slotEnd,
      durationMinutes,
      slotCount,
    });
    // In-person bookings MUST resolve a concrete specialist: a NULL specialist_id
    // bypasses the be_appointments_specialist_no_overlap exclusion constraint
    // (it only covers non-null rows), allowing an overlapping booking. Only ONLINE
    // consults legitimately keep canonicalSpecialistId = null. (F2 guard.)
    if (!inPersonCtx.specialistId) throw new Error('specialist_required');
    canonicalBranchId = inPersonCtx.branchId;
    canonicalSpecialistId = inPersonCtx.specialistId;
    canonicalServiceId = inPersonCtx.serviceId;
    canonicalRoomId = inPersonCtx.roomId;
  }

  if (!orgId) throw new Error('ambiguous_booking_tenant');
  const maxConsecutiveHours = await deps.bookingScheduling.getMaxConsecutiveSlotHours(orgId);
  if (durationMinutes * slotCount > maxConsecutiveHours * 60) {
    throw new Error('consecutive_slot_cap_exceeded');
  }
  if (deps.clientHistory) {
    await deps.clientHistory.assertSelfServiceBookingAllowed(orgId, createInput.userId);
  }
  const profilePrefill: Record<string, string> = {
    contact_name: createInput.contactName,
    contact_phone: createInput.contactPhone,
    first_name: createInput.contactFio?.firstName ?? createInput.contactName,
    ...(createInput.contactFio?.lastName ? { last_name: createInput.contactFio.lastName } : {}),
    ...(createInput.contactFio?.patronymic
      ? { patronymic: createInput.contactFio.patronymic }
      : {}),
    phone: createInput.contactPhone,
    ...(createInput.contactEmail
      ? { contact_email: createInput.contactEmail, email: createInput.contactEmail }
      : {}),
  };

  if (deps.bookingForm) {
    const validation = await deps.bookingForm.validateAnswers(
      orgId,
      'patient',
      formAnswers,
      profilePrefill,
    );
    if (!validation.ok) throw new Error(validation.error);
  }

  const slotRows = Array.from({ length: slotCount }, (_, chainPosition) => {
    const startAt = new Date(
      new Date(createInput.slotStart).getTime() + chainPosition * durationMinutes * 60_000,
    ).toISOString();
    const endAt = new Date(new Date(startAt).getTime() + durationMinutes * 60_000).toISOString();
    return {
      startAt,
      endAt,
      chainPosition,
      pending: {
        ...pendingRow,
        organizationId: orgId,
        slotStart: startAt,
        slotEnd: endAt,
        durationMinutesSnapshot:
          pendingRow.durationMinutesSnapshot == null ? null : durationMinutes,
      },
    };
  });
  const pendingRows: PatientBookingRecord[] = [];
  try {
    for (const row of slotRows) {
      pendingRows.push(await deps.bookingsPort.createPending(row.pending));
    }
  } catch (err) {
    await Promise.allSettled(pendingRows.map((row) => deps.bookingsPort.markFailedSync(row.id)));
    throw err;
  }
  const pending = pendingRows[0]!;

  let packageCoversVisit = false;
  let patientPackageId =
    createInput.type === 'in_person' ? createInput.patientPackageId?.trim() : undefined;
  if (
    createInput.type === 'in_person' &&
    !patientPackageId &&
    canonicalServiceId &&
    deps.memberships
  ) {
    const picked = await deps.memberships.pickAutoPackageForBooking(
      createInput.userId,
      orgId,
      canonicalServiceId,
    );
    if (picked) patientPackageId = picked.id;
  }
  if (patientPackageId) {
    if (!canonicalServiceId || !deps.memberships) {
      throw new Error('package_not_found');
    }
    const eligible = await deps.memberships.listActivePackagesForBooking(
      createInput.userId,
      orgId,
      canonicalServiceId,
    );
    if (!eligible.some((p) => p.id === patientPackageId)) {
      throw new Error('package_not_found');
    }
    packageCoversVisit = true;
  }

  const prepaymentMechanicAllowsMoney =
    deps.payments !== null && (await deps.canAcceptBookingPrepayment(orgId));
  const prepayQuote = prepaymentMechanicAllowsMoney && deps.payments
    ? await deps.payments.resolvePrepayment({
        organizationId: orgId,
        serviceId: canonicalServiceId,
        onlineCategory: createInput.type === 'online' ? createInput.category : null,
        servicePriceMinor: pendingRow.priceMinorSnapshot,
        currency: 'RUB',
      })
    : null;
  const needsPrepayment =
    !packageCoversVisit &&
    prepayQuote?.required === true &&
    (prepayQuote.amountMinor ?? 0) > 0;
  const initialAppointmentStatus = needsPrepayment ? 'awaiting_payment' : 'confirmed';
  const specialistReminderSettings = canonicalSpecialistId
    ? await deps.bookingEngine.getSpecialistAppointmentReminderSettings({
        organizationId: orgId,
        specialistId: canonicalSpecialistId,
      })
    : null;

  const phoneNormalized =
    normalizeRuPhoneE164(createInput.contactPhone) ?? createInput.contactPhone.trim();
  const chainId = slotCount > 1 ? randomUUID() : null;
  const appointmentSource: CreateAppointmentInput['source'] =
    createInput.bookingChannel === 'public_widget' ? 'public_widget' : 'native';
  let appointments: BeAppointment[];
  try {
    const appointmentInputs: CreateAppointmentInput[] = slotRows.map(
      ({ startAt, endAt, chainPosition }) => {
        return {
          organizationId: orgId,
          branchId: canonicalBranchId,
          roomId: canonicalRoomId,
          specialistId: canonicalSpecialistId,
          serviceId: canonicalServiceId,
          platformUserId: createInput.userId,
          startAt,
          endAt,
          durationMinutes,
          chainId,
          chainPosition: chainId ? chainPosition : null,
          source: appointmentSource,
          status: initialAppointmentStatus,
          phoneNormalized,
          actorId: createInput.userId,
          attributionJson: {
            ...(createInput.attribution ?? {}),
            ...(createInput.contactFio ? { contactFio: createInput.contactFio } : {}),
          },
          appointmentReminderAllowedPresetIds:
            specialistReminderSettings?.allowedPresetIds ?? [],
          appointmentReminderPresetId: specialistReminderSettings?.defaultPresetId ?? null,
        };
      },
    );
    appointments =
      createInput.type === 'online'
        ? await deps.bookingEngine.createOnlineAppointmentsIfAvailable(appointmentInputs)
        : slotCount === 1
          ? [await deps.bookingEngine.createAppointment(appointmentInputs[0]!)]
          : await deps.bookingEngine.createAppointmentChain(appointmentInputs);
  } catch (err) {
    await Promise.allSettled(pendingRows.map((row) => deps.bookingsPort.markFailedSync(row.id)));
    if (isPostgresExclusionViolation(err)) throw new Error('slot_overlap');
    throw err;
  }
  const appointment = appointments[0]!;
  const rollbackChain = async (source: string) => {
    await Promise.allSettled([
      ...pendingRows.map((row) => deps.bookingsPort.markFailedSync(row.id)),
      ...appointments.map((item) =>
        deps.bookingEngine!.transitionAppointmentStatus({
          appointmentId: item.id,
          toStatus: 'cancelled_by_specialist',
          payload: { source },
        }),
      ),
    ]);
  };

  if (deps.bookingForm && formAnswers.length > 0) {
    await Promise.all(
      appointments.map((item) => deps.bookingForm!.saveForAppointment(orgId, item.id, formAnswers)),
    );
  }

  if (needsPrepayment && deps.payments && prepayQuote) {
    const returnUrl =
      createInput.bookingChannel === 'public_widget'
        ? `${env.APP_BASE_URL}${publicBookPaths.pay}?bookingId=${encodeURIComponent(pending.id)}`
        : `${env.APP_BASE_URL}/app/patient/booking/pay?bookingId=${encodeURIComponent(pending.id)}`;
    try {
      await deps.payments.createAppointmentPaymentIntent({
        organizationId: orgId,
        appointmentId: appointment.id,
        platformUserId: createInput.userId,
        amountMinor: prepayQuote.amountMinor * slotCount,
        currency: prepayQuote.currency,
        idempotencyKey: `appointment_prepay:${appointment.id}`,
        returnUrl,
      });
    } catch (err) {
      await rollbackChain('payment_intent_create_failed');
      throw err;
    }
    let awaitingRows: Array<PatientBookingRecord | null>;
    try {
      awaitingRows = await Promise.all(
        pendingRows.map((row, index) =>
          deps.bookingsPort.markAwaitingPayment(row.id, appointments[index]!.id),
        ),
      );
    } catch {
      await rollbackChain('booking_awaiting_payment_sync_failed');
      throw new Error('booking_confirm_failed');
    }
    if (awaitingRows.some((row) => !row)) {
      await rollbackChain('booking_awaiting_payment_sync_failed');
      throw new Error('booking_confirm_failed');
    }
    await persistBookingFormContacts(deps, createInput);
    return awaitingRows[0] ?? pending;
  }

  if (packageCoversVisit && patientPackageId && canonicalServiceId && deps.memberships) {
    try {
      for (const item of appointments) {
        await deps.memberships.reserveForAppointment({
          organizationId: orgId,
          patientPackageId,
          serviceId: canonicalServiceId,
          appointmentId: item.id,
          platformUserId: createInput.userId,
        });
      }
    } catch (reserveErr) {
      await rollbackChain('package_reserve_failed');
      const code =
        reserveErr instanceof Error &&
        (reserveErr.message === 'package_not_found' ||
          reserveErr.message === 'package_no_balance' ||
          reserveErr.message === 'package_expired' ||
          reserveErr.message === 'package_not_active')
          ? reserveErr.message
          : 'package_reserve_failed';
      throw new Error(code);
    }
  }

  let confirmedRows: Array<PatientBookingRecord | null>;
  try {
    confirmedRows = await Promise.all(
      pendingRows.map((row, index) =>
        deps.bookingsPort.markConfirmed(row.id, {
          canonicalAppointmentId: appointments[index]!.id,
        }),
      ),
    );
  } catch {
    await rollbackChain('booking_confirm_failed');
    throw new Error('booking_confirm_failed');
  }
  const confirmed = confirmedRows[0];
  if (confirmedRows.some((row) => !row)) {
    await rollbackChain('booking_confirm_failed');
    throw new Error('booking_confirm_failed');
  }

  if (deps.appointmentProjection) {
    try {
      await Promise.all(
        appointments.map((item, index) =>
          projectCanonicalAppointmentForDoctor(deps.appointmentProjection!, item, {
            phoneNormalized,
            contactName: createInput.contactName,
            serviceTitle: pendingRows[index]!.serviceTitleSnapshot,
            branchTitle: pendingRows[index]!.branchTitleSnapshot,
            legacyBranchId: null,
          }),
        ),
      );
    } catch {
      // Doctor projection is best-effort on transition.
    }
  }

  if (packageCoversVisit && patientPackageId && deps.bookingEngine) {
    try {
      const { emitPackageLinkedCalendarSync } =
        await import('@/app-layer/booking/emitPackageCalendarSync');
      await Promise.all(
        appointments.map(async (item, index) => {
          const freshAppt = await deps.bookingEngine!.getAppointment(item.id);
          if (freshAppt) {
            await emitPackageLinkedCalendarSync(
              deps.syncPort,
              freshAppt,
              confirmedRows[index] ?? pendingRows[index]!,
            );
          }
        }),
      );
    } catch {
      // Calendar package marker sync is best-effort.
    }
  }

  try {
    const createNotify = resolveBookingNotifyTargets(
      'booking.created',
      { notifyPatient: true, notifyStaff: true },
      (await deps.getBookingLifecycleNotificationSettings?.()) ?? null,
    );
    if (createNotify.notifyPatient || createNotify.notifyStaff) {
      const timeZone = (await deps.getAppDisplayTimeZone?.()) ?? DEFAULT_APP_DISPLAY_TIMEZONE;
      await Promise.all(
        appointments.map((item, index) => {
          const row = confirmedRows[index] ?? pendingRows[index]!;
          return deps.syncPort.emitBookingEvent({
            eventType: 'booking.created',
            idempotencyKey: `booking.created:${row.id}`,
            payload: {
              organizationId: item.organizationId,
              bookingId: row.id,
              userId: createInput.userId,
              bookingType: row.bookingType,
              city: row.city ?? undefined,
              category: row.category,
              slotStart: row.slotStart,
              slotEnd: row.slotEnd,
              contactName: row.contactName,
              ...(createInput.contactFio ? { contactFio: createInput.contactFio } : {}),
              contactPhone: row.contactPhone,
              contactEmail: row.contactEmail ?? undefined,
              cityCodeSnapshot: row.cityCodeSnapshot,
              serviceTitleSnapshot: row.serviceTitleSnapshot,
              canonicalAppointmentId: item.id,
              reminderPlan: appointmentReminderPlanForPreset(item.appointmentReminderPresetId),
              cancelPendingReminders: true,
              patientMessageText: buildPatientCreatedMessageText(
                {
                  slotStart: row.slotStart,
                  bookingType: row.bookingType,
                  city: row.city,
                  cityCodeSnapshot: row.cityCodeSnapshot,
                },
                timeZone,
              ),
              doctorNotify: createNotify.notifyStaff,
              doctorMessageText: buildDoctorCreatedMessageText(
                { slotStart: row.slotStart, contactName: row.contactName, contactPhone: row.contactPhone },
                timeZone,
              ),
              ...resolveBookingCalendarSyncFields('booking.created'),
            },
          });
        }),
      );
    }
  } catch {
    // Notifications are best-effort.
  }

  // #81: отправить пациенту письмо с .ics-вложением (best-effort, не роняет booking).
  await sendBookingConfirmationEmail({
    bookingId: (confirmed ?? pending).id,
    contactEmail: createInput.contactEmail,
    slotStart: pendingRow.slotStart,
    slotEnd: pendingRow.slotEnd,
    serviceTitle: pendingRow.serviceTitleSnapshot ?? pendingRow.category,
    locationLabel:
      pendingRow.branchTitleSnapshot ?? (pendingRow.bookingType === 'online' ? 'Онлайн' : null),
    contactName: createInput.contactName,
  });

  await persistBookingFormContacts(deps, createInput);
  return confirmed ?? pending;
}
