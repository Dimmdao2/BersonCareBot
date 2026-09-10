import { NextResponse } from 'next/server';
import { jsonError, mapApiError, type ApiErrorLiteralRules } from '@/shared/http/apiResponse';

/**
 * Closed allowlist of the booking-catalog refusals these manual-create routes may name. Codes are
 * echoed through the shared mapper instead of through the caught error's own text, so a rejected
 * statement can no longer take the same exit.
 */
const MANUAL_CREATE_ERROR_RULES: ApiErrorLiteralRules = {
  visit_in_future: { code: 'visit_in_future', status: 400 },
  invalid_visit_time: { code: 'invalid_visit_time', status: 400 },
  branch_not_found: { code: 'branch_not_found', status: 404 },
  service_not_found: { code: 'service_not_found', status: 404 },
  specialist_not_found: { code: 'specialist_not_found', status: 404 },
  service_not_available_for_specialist: {
    code: 'service_not_available_for_specialist',
    status: 409,
  },
  room_branch_mismatch: { code: 'room_branch_mismatch', status: 409 },
};

/** Distinct object identity: `mapApiError` returns this exact value when nothing matched. */
const MANUAL_CREATE_UNMAPPED = { code: 'appointment_create_unavailable', status: 503 } as const;

import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { emitPackageLinkedCalendarSync } from '@/app-layer/booking/emitPackageCalendarSync';
import { getMechanicMutationAvailability } from '@/app-layer/guards/requireEntitlement';
import { runWithMechanicWriteClearance } from '@/app-layer/entitlements/mechanicWriteClearance';
import {
  staffBookingContactNameFromAppointment,
  staffBookingServiceTitleFromAppointment,
} from '@/app-layer/booking/staffBookingIntegratorEvent';
import { appointmentReminderPlanForPreset } from '@/modules/booking-notifications/appointmentReminderPresets';
import { createBookingSyncPort } from '@/modules/integrator/bookingM2mApi';
import { resolveStaffAppointmentFinancials } from '@/app-layer/booking/staffAppointmentFinancials';
import { initialAppointmentStatusForSnapshot } from '@/modules/payments/appointmentFinancialSnapshot';
import { requireDoctorBookingEngine } from '../../_requireDoctorBookingEngine';
import {
  canMutateOwnAppointments,
  resolveDoctorCreateSpecialist,
} from '../../_resolveDoctorAppointmentAccess';

/**
 * PAY-APPT-02/03: врач переопределяет стоимость и условие предоплаты ДЛЯ КОНКРЕТНОЙ записи.
 * Словарь режимов один на всю систему (`PREPAYMENT_MODES`): «без предоплаты» — `disabled`,
 * «процент» — `percent`, «полная» — `full_price`. Второго словаря рядом не заводится.
 */
const prepaymentOverrideSchema = z.object({
  mode: z.enum(['disabled', 'fixed_minor', 'percent', 'full_price']),
  percentBps: z.number().int().min(0).max(10_000).nullable().optional(),
  amountMinor: z.number().int().min(0).nullable().optional(),
});

const bodySchema = z.object({
  branchId: z.string().uuid(),
  roomId: z.string().uuid().nullable().optional(),
  specialistId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid(),
  platformUserId: z.string().uuid().nullable().optional(),
  phoneNormalized: z.string().nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  /** Минорные единицы (копейки). Дробных денег контракт не принимает вовсе. */
  priceMinor: z.number().int().min(0).nullable().optional(),
  prepayment: prepaymentOverrideSchema.nullable().optional(),
  /**
   * ENCOUNTER-APPOINTMENT-05: явное согласие специалиста на наложение ИМЕННО этого слота.
   *
   * Обычный запрос поля не несёт и остаётся fail-closed: занятое время отбивается `slot_overlap`
   * до всякой записи. Форма показывает подтверждение и повторяет ТОТ ЖЕ запрос с `true` — второй
   * двери, упрощённого appointment или локальной вставки для этого не заводится. Всё остальное
   * (арендатор, пациент, специалист, филиал/услуга, цена и предоплата) проверяется ровно так же:
   * согласие снимает один запрет пересечения, а не валидацию.
   */
  allowOverlap: z.boolean().optional(),
  deliveryFormat: z.enum(['in_person', 'online']).optional(),
});

export async function POST(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const { ctx } = gate;
  if (!canMutateOwnAppointments(ctx)) {
    return NextResponse.json(
      { ok: false, error: 'appointment_mutation_forbidden' },
      { status: 403 },
    );
  }
  const specialistResolution = await resolveDoctorCreateSpecialist(ctx, parsed.data.specialistId);
  if (!specialistResolution.ok) {
    const status = specialistResolution.error === 'schedule_specialist_not_available' ? 404 : 403;
    return NextResponse.json({ ok: false, error: specialistResolution.error }, { status });
  }
  const deps = buildAppDeps();
  const syncPort = createBookingSyncPort();

  // Staff manual creates MUST have a concrete specialist even when their delivery is online.
  // A NULL specialist_id bypasses the be_appointments_specialist_no_overlap
  // exclusion constraint (it only covers non-null), letting a booking land on
  // any occupied slot. ONLINE patient bookings legitimately use NULL, but they
  // never reach this route. (F2: null-specialist overlap escape.)
  try {
    const appointment = await withDoctorWorkspacePrincipal(
      ctx,
      'doctor.booking-engine.appointments.manual-create',
      async () => {
        const resolvedSpecialistId = specialistResolution.specialistId;
        const reminderSettings = await ctx.service.getSpecialistAppointmentReminderSettings({
          organizationId: ctx.organizationId,
          specialistId: resolvedSpecialistId,
        });
        // ENCOUNTER-APPOINTMENT-05: `allowOverlap` — не общий bypass, а retry ПОСЛЕ реально
        // найденного конфликта. На свободном слоте он оставляет обычную запись без долгоживущего
        // маркера; другой отказ scheduling не превращается в согласие.
        let overlapConfirmed = false;
        if (deps.bookingScheduling) {
          try {
            await deps.bookingScheduling.assertSlotAvailable({
              organizationId: ctx.organizationId,
              specialistId: resolvedSpecialistId,
              roomId: parsed.data.roomId ?? null,
              slotStart: parsed.data.startAt,
              slotEnd: parsed.data.endAt,
              durationMinutes: parsed.data.durationMinutes,
            });
          } catch (err) {
            if (
              !parsed.data.allowOverlap ||
              !(err instanceof Error && err.message === 'slot_overlap')
            ) {
              throw err;
            }
            overlapConfirmed = true;
          }
        }
        // PAY-APPT-01/03/07: снимок считается ДО вставки, потому что от него зависит и стартовый
        // статус записи, и занятость слота. Абонемент проверяется здесь же (чтение), чтобы
        // покрытая абонементом запись не уходила в ожидание оплаты и не требовала денег дважды.
        const coveringPackage =
          parsed.data.platformUserId && deps.memberships
            ? await deps.memberships.pickAutoPackageForBooking(
                parsed.data.platformUserId,
                ctx.organizationId,
                parsed.data.serviceId,
              )
            : null;
        const financials = await resolveStaffAppointmentFinancials(
          {
            payments: deps.payments ?? null,
            bookingScheduling: deps.bookingScheduling ?? null,
            getServicePriceMinor: async (serviceId) =>
              (await ctx.service.services.getService(serviceId))?.priceMinor ?? null,
          },
          {
            organizationId: ctx.organizationId,
            serviceId: parsed.data.serviceId,
            priceMinor: parsed.data.priceMinor ?? null,
            prepayment: parsed.data.prepayment ?? null,
          },
        );
        const initialStatus = initialAppointmentStatusForSnapshot(financials, {
          coveredByPackage: coveringPackage != null,
        });
        let created = await ctx.service.createAppointment({
          organizationId: ctx.organizationId,
          branchId: parsed.data.branchId,
          roomId: parsed.data.roomId ?? null,
          specialistId: resolvedSpecialistId,
          serviceId: parsed.data.serviceId,
          platformUserId: parsed.data.platformUserId ?? null,
          startAt: parsed.data.startAt,
          endAt: parsed.data.endAt,
          durationMinutes: parsed.data.durationMinutes,
          source: 'admin_manual',
          status: initialStatus,
          deliveryFormat: parsed.data.deliveryFormat,
          phoneNormalized: parsed.data.phoneNormalized ?? null,
          actorId: ctx.session.user.userId,
          appointmentReminderAllowedPresetIds: reminderSettings?.allowedPresetIds ?? [],
          appointmentReminderPresetId: reminderSettings?.defaultPresetId ?? null,
          priceMinor: financials.priceMinor,
          priceCurrency: financials.priceCurrency,
          prepaymentMode: financials.prepaymentMode,
          prepaymentPercentBps: financials.prepaymentPercentBps,
          prepaymentAmountMinor: financials.prepaymentAmountMinor,
          prepaymentRequiredMinor:
            initialStatus === 'awaiting_payment' ? financials.prepaymentRequiredMinor : 0,
          paymentDeadlineAt:
            initialStatus === 'awaiting_payment' ? financials.paymentDeadlineAt : null,
          // Признак появляется только после фактического `slot_overlap`, а не от одного флага
          // клиента. Перенос делает пару отличной от нового времени и вновь включает обычный
          // exclusion guard; DB trigger отдельно не даёт новому обычному write пройти поверх
          // записи, оставленной этим подтверждением на исходном слоте.
          overlapConfirmedStartAt: overlapConfirmed ? parsed.data.startAt : null,
          overlapConfirmedEndAt: overlapConfirmed ? parsed.data.endAt : null,
        });
        try {
          if (parsed.data.platformUserId && parsed.data.serviceId && deps.memberships) {
            const picked = coveringPackage;
            if (picked) {
              // Списание сеанса — запись механики `subscriptions`, и она физически отказывает без
              // решения тарифа в этом же запросе. Отдельного решения здесь не было вовсе, поэтому
              // привязка падала на замке и молча гасилась `catch` ниже. Решение берётся тем же
              // резолвером, что и `payments` в снимке, а запись выполняется в его явной области.
              const subscriptions = await getMechanicMutationAvailability(
                { organizationId: ctx.organizationId },
                'subscriptions',
              );
              if (subscriptions.available) {
                const memberships = deps.memberships;
                const platformUserId = parsed.data.platformUserId;
                const serviceId = parsed.data.serviceId;
                await runWithMechanicWriteClearance('subscriptions', () =>
                  memberships.reserveForAppointment({
                    organizationId: ctx.organizationId,
                    patientPackageId: picked.id,
                    serviceId,
                    appointmentId: created.id,
                    platformUserId,
                  }),
                );
                const fresh = await ctx.service.getAppointment(created.id);
                if (fresh) created = fresh;
                await emitPackageLinkedCalendarSync(syncPort, created);
              }
            }
          }
        } catch (err) {
          // The appointment is already committed; optional package enrichment cannot reverse the
          // API result. It is logged, though: a silent catch is exactly what kept the auto-link
          // broken — the refusal existed on every create and nothing ever said so.
          console.error('[manual-appointment] package auto-link failed', {
            appointmentId: created.id,
            errorClass: err instanceof Error ? err.name : 'unknown',
          });
        }
        let bookingRow: Awaited<
          ReturnType<NonNullable<typeof deps.patientBooking>['getBookingByCanonicalAppointment']>
        > = null;
        try {
          bookingRow =
            deps.patientBooking && parsed.data.platformUserId
              ? await deps.patientBooking.ensureStaffBookingProjection({
                  appointment: created,
                  contactName: staffBookingContactNameFromAppointment(created),
                  contactPhone: created.phoneNormalized ?? '+70000000000',
                })
              : null;
        } catch {
          // The canonical appointment is already committed. A projection failure must not make a
          // retry create a duplicate appointment; diagnostics retain the failure server-side.
          console.error('[manual-appointment] booking projection failed', {
            appointmentId: created.id,
          });
        }
        try {
          const reminderPlan = appointmentReminderPlanForPreset(
            created.appointmentReminderPresetId,
          );
          await syncPort.emitBookingEvent({
            eventType: 'booking.created',
            idempotencyKey: `staff.booking.created:${created.id}:${created.startAt}`,
            payload: {
              organizationId: created.organizationId,
              bookingId: bookingRow?.id ?? created.id,
              userId: bookingRow?.userId ?? created.platformUserId ?? created.id,
              bookingType: bookingRow?.bookingType ?? 'in_person',
              city: bookingRow?.city ?? undefined,
              category: bookingRow?.category ?? 'general',
              slotStart: created.startAt,
              slotEnd: created.endAt,
              contactName:
                bookingRow?.contactName ?? staffBookingContactNameFromAppointment(created),
              contactPhone: bookingRow?.contactPhone ?? created.phoneNormalized ?? '+70000000000',
              contactEmail: bookingRow?.contactEmail ?? undefined,
              cityCodeSnapshot: bookingRow?.cityCodeSnapshot ?? null,
              serviceTitleSnapshot: staffBookingServiceTitleFromAppointment(created, bookingRow),
              canonicalAppointmentId: created.id,
              reminderPlan,
            },
          });
        } catch {
          // Lifecycle event is best-effort for a committed staff manual create.
        }
        return created;
      },
    );
    return NextResponse.json({ ok: true, appointment });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'create_failed';
    if (
      message === 'slot_overlap' ||
      (typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === '23P01')
    ) {
      return NextResponse.json({ ok: false, error: 'slot_overlap' }, { status: 409 });
    }
    if (message === 'patient_not_available') {
      return NextResponse.json({ ok: false, error: 'patient_not_available' }, { status: 404 });
    }
    const catalogRefusal = mapApiError(err, MANUAL_CREATE_ERROR_RULES, MANUAL_CREATE_UNMAPPED);
    if (catalogRefusal !== MANUAL_CREATE_UNMAPPED) {
      return jsonError(catalogRefusal.code, {}, { status: catalogRefusal.status });
    }
    console.error('[manual-appointment] create failed', {
      errorClass: err instanceof Error ? err.name : 'unknown',
      code:
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : 'unknown',
    });
    return NextResponse.json(
      { ok: false, error: 'appointment_create_unavailable' },
      { status: 503 },
    );
  }
}
