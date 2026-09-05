import { NextResponse } from 'next/server';
import { z } from 'zod';
import { applyStaffRescheduleSideEffects } from '@/app-layer/booking/staffAppointmentLifecycleEffects';
import { staffBookingContactNameFromAppointment } from '@/app-layer/booking/staffBookingIntegratorEvent';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { createBookingSyncPort } from '@/modules/integrator/bookingM2mApi';
import { appointmentReminderPlanForPreset } from '@/modules/booking-notifications/appointmentReminderPresets';
import {
  assertStaffMayRewriteFinancials,
  resolveStaffAppointmentFinancials,
} from '@/app-layer/booking/staffAppointmentFinancials';
import { requireDoctorBookingEngine } from '../../../_requireDoctorBookingEngine';
import { resolveDoctorAppointmentAccess } from '../../../_resolveDoctorAppointmentAccess';

/** PAY-APPT-03: тот же закрытый словарь режимов, что и у создания записи врачом. */
const prepaymentOverrideSchema = z.object({
  mode: z.enum(['disabled', 'percent', 'full_price']),
  percentBps: z.number().int().min(0).max(10_000).nullable().optional(),
});

const bodySchema = z.object({
  newStartAt: z.string().min(1),
  newEndAt: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  reason: z.string().trim().max(400).optional(),
  staffComment: z.string().trim().max(1000).optional(),
  branchId: z.string().uuid().nullable().optional(),
  specialistId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  /** APPT-FORM-13: правка записи меняет пациента через этот же контракт, без второго endpoint. */
  platformUserId: z.string().uuid().nullable().optional(),
  /**
   * PAY-APPT-02/12: правка стоимости и условия предоплаты идёт ТЕМ ЖЕ контрактом, что и правка
   * времени, — второй «финансовой» ручки рядом нет. Поле отсутствует — снимок не трогаем.
   */
  priceMinor: z.number().int().min(0).nullable().optional(),
  prepayment: prepaymentOverrideSchema.nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

function isSlotOverlapError(err: unknown): boolean {
  if (err instanceof Error && err.message === 'slot_overlap') return true;
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23P01'
  );
}

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: appointmentId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const appointment = await resolveDoctorAppointmentAccess(gate.ctx, appointmentId, 'clinic');
  if (!appointment) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (
    parsed.data.specialistId !== undefined &&
    parsed.data.specialistId !== appointment.specialistId
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_specialist' }, { status: 400 });
  }
  const deps = buildAppDeps();
  const lifecycle = deps.bookingAppointmentLifecycle;
  if (!lifecycle) {
    return NextResponse.json({ ok: false, error: 'lifecycle_unavailable' }, { status: 503 });
  }
  const actorType = gate.ctx.session.user.role === 'admin' ? 'admin' : 'specialist';
  const syncPort = createBookingSyncPort();
  let bookingRow = deps.patientBooking
    ? await deps.patientBooking.getBookingByCanonicalAppointment(appointmentId)
    : null;
  const patientChanged =
    parsed.data.platformUserId !== undefined &&
    (parsed.data.platformUserId ?? null) !== appointment.platformUserId;
  if (patientChanged && bookingRow) {
    // Запись, пришедшая из самозаписи пациента, держит проекцию с контактами прежнего пациента:
    // именно из неё интегратор берёт получателя уведомления. Пока проекция не переносится вместе
    // с записью, смена пациента здесь молча уведомила бы прежнего — отказываем явно.
    return NextResponse.json({ ok: false, error: 'patient_change_not_allowed' }, { status: 409 });
  }
  let result: Awaited<ReturnType<typeof lifecycle.staffReschedule>> | null = null;
  try {
    result = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor.booking-engine.appointments.manual-reschedule',
      () =>
        lifecycle.staffReschedule({
          appointmentId,
          organizationId: gate.ctx.organizationId,
          actorType,
          actorId: gate.ctx.session.user.userId,
          newStartAt: parsed.data.newStartAt,
          newEndAt: parsed.data.newEndAt,
          durationMinutes: parsed.data.durationMinutes,
          reason: parsed.data.reason,
          staffComment: parsed.data.staffComment,
          branchId: parsed.data.branchId,
          specialistId: appointment.specialistId,
          serviceId: parsed.data.serviceId,
          ...(patientChanged ? { platformUserId: parsed.data.platformUserId ?? null } : {}),
          manualOverride: true,
        }),
    );
  } catch (err) {
    if (isSlotOverlapError(err)) {
      return NextResponse.json({ ok: false, error: 'slot_overlap' }, { status: 409 });
    }
    if (err instanceof Error && err.message === 'appointment_not_found') {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    if (err instanceof Error && err.message === 'patient_change_not_allowed') {
      return NextResponse.json({ ok: false, error: 'patient_change_not_allowed' }, { status: 409 });
    }
    if (err instanceof Error && err.message === 'patient_not_available') {
      return NextResponse.json({ ok: false, error: 'patient_not_available' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: 'reschedule_failed' }, { status: 500 });
  }
  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  let currentAppointment = result.appointment;

  // PAY-APPT-12: финансовая часть правки идёт ДО проекции и до уведомлений, потому что проекция
  // и карточка обязаны увидеть уже НОВЫЙ снимок, а не прошлую цену.
  const financialEditRequested =
    parsed.data.priceMinor !== undefined ||
    parsed.data.prepayment !== undefined ||
    (parsed.data.serviceId !== undefined &&
      (parsed.data.serviceId ?? null) !== appointment.serviceId);
  if (financialEditRequested) {
    // Замок денег стоит ДО расчёта: запись с состоявшейся или удержанной оплатой финансовые
    // значения не переписывает — ни молча, ни новым снимком.
    if (
      currentAppointment.prepaymentPaidMinor > 0 ||
      currentAppointment.paymentRef !== null
    ) {
      return NextResponse.json(
        { ok: false, error: 'appointment_financials_locked' },
        { status: 409 },
      );
    }
    try {
      currentAppointment = await withDoctorWorkspacePrincipal(
        gate.ctx,
        'doctor.booking-engine.appointments.manual-reschedule',
        async () => {
          assertStaffMayRewriteFinancials(currentAppointment);
          const financials = await resolveStaffAppointmentFinancials(
            {
              payments: deps.payments ?? null,
              bookingScheduling: deps.bookingScheduling ?? null,
              getServicePriceMinor: async (serviceId) =>
                (await gate.ctx.service.services.getService(serviceId))?.priceMinor ?? null,
            },
            {
              organizationId: gate.ctx.organizationId,
              serviceId: currentAppointment.serviceId,
              // Услуга та же и цену не прислали — держим уже сохранённый ручной снимок: сам по
              // себе прайс каталога его не переписывает. Услугу сменили без явной цены — цену
              // подставляет новая услуга (решение владельца, PAY-APPT-02).
              priceMinor:
                parsed.data.priceMinor !== undefined
                  ? parsed.data.priceMinor
                  : (parsed.data.serviceId ?? null) !== appointment.serviceId
                    ? null
                    : currentAppointment.priceMinor,
              prepayment:
                parsed.data.prepayment !== undefined
                  ? parsed.data.prepayment
                  : {
                      mode: currentAppointment.prepaymentMode,
                      percentBps: currentAppointment.prepaymentPercentBps,
                      amountMinor: currentAppointment.prepaymentAmountMinor,
                    },
            },
          );
          const written = await gate.ctx.service.updateAppointmentFinancialSnapshot({
            appointmentId,
            organizationId: gate.ctx.organizationId,
            actorId: gate.ctx.session.user.userId,
            snapshot: {
              priceMinor: financials.priceMinor,
              priceCurrency: financials.priceCurrency,
              prepaymentMode: financials.prepaymentMode,
              prepaymentPercentBps: financials.prepaymentPercentBps,
              prepaymentAmountMinor: financials.prepaymentAmountMinor,
              prepaymentRequiredMinor: financials.prepaymentRequiredMinor,
              paymentDeadlineAt: financials.paymentDeadlineAt,
            },
          });
          // Требование появилось — слот держится ожиданием оплаты; исчезло — запись возвращается
          // к обычному подтверждённому поведению. Оба перехода проверяет тот же FSM.
          const wantsAwaiting = financials.prepaymentRequiredMinor > 0;
          if (wantsAwaiting && written.status !== 'awaiting_payment') {
            return gate.ctx.service.transitionAppointmentStatus({
              appointmentId,
              toStatus: 'awaiting_payment',
              actorId: gate.ctx.session.user.userId,
              payload: { source: 'staff_prepayment_required' },
            });
          }
          if (!wantsAwaiting && written.status === 'awaiting_payment') {
            return gate.ctx.service.transitionAppointmentStatus({
              appointmentId,
              toStatus: 'confirmed',
              actorId: gate.ctx.session.user.userId,
              payload: { source: 'staff_prepayment_removed' },
            });
          }
          return written;
        },
      );
    } catch (err) {
      const locked =
        err instanceof Error && err.message === 'appointment_financials_locked';
      return NextResponse.json(
        { ok: false, error: locked ? 'appointment_financials_locked' : 'financials_update_failed' },
        { status: locked ? 409 : 500 },
      );
    }
  }

  if (deps.patientBooking && currentAppointment.platformUserId) {
    try {
      bookingRow = await deps.patientBooking.ensureStaffBookingProjection({
        appointment: currentAppointment,
        contactName:
          bookingRow?.contactName ?? staffBookingContactNameFromAppointment(currentAppointment),
        contactPhone:
          bookingRow?.contactPhone ?? currentAppointment.phoneNormalized ?? '+70000000000',
        contactEmail: bookingRow?.contactEmail ?? null,
      });
    } catch {
      console.error('[manual-reschedule] booking projection sync failed', {
        appointmentId: currentAppointment.id,
      });
    }
  }
  const { loadBookingLifecycleNotificationsFromSystemSettings } =
    await import('@/modules/booking-notifications/settings');
  const lifecycleNotificationSettings = await loadBookingLifecycleNotificationsFromSystemSettings(
    (key, scope) => deps.systemSettings.getSetting(key, scope),
  );
  const reminderPlan = appointmentReminderPlanForPreset(
    currentAppointment.appointmentReminderPresetId,
  );
  await applyStaffRescheduleSideEffects({
    lifecycle,
    organizationId: gate.ctx.organizationId,
    appointment: currentAppointment,
    reschedulePolicy: result.reschedulePolicy,
    syncPort,
    bookingRow,
    lifecycleNotificationSettings,
    reminderPlan,
  });
  if (deps.payments) {
    await deps.payments.recordReschedulePaymentCarryOver({
      appointmentId,
      organizationId: gate.ctx.organizationId,
      platformUserId: currentAppointment.platformUserId,
      newStartAt: parsed.data.newStartAt,
    });
  }
  return NextResponse.json({ ok: true, appointment: currentAppointment });
}
