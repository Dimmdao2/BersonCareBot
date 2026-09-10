import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { getMechanicMutationAvailability } from '@/app-layer/guards/requireEntitlement';
import type {
  CalendarAppointmentEvent,
  CalendarAppointmentPaymentView,
} from '@/modules/booking-calendar/types';
import type { AppointmentFinancialSnapshotRecord } from '@/modules/booking-engine/types';
import type { PatientBookingService } from '@/modules/patient-booking/ports';
import type { PatientPaymentsPort } from '@/modules/patient-payments/ports';
import type { PatientInvitesPort } from '@/modules/patient-invites/ports';
import { appointmentPaymentIntentAmountMinor } from '@/modules/payments/appointmentFinancialSnapshot';
import {
  splitAppointmentPaymentAmountMinor,
  type PaymentsService,
} from '@/modules/payments/service';
import { loadStaffAppointmentPaymentSummary } from './staffAppointmentPaymentSummary';

/**
 * Зависимости объявлены структурно, а не через `ReturnType<typeof buildAppDeps>`: композиционный
 * корень сам импортирует этот файл ради досбора деталей календаря, и ссылка на его тип замкнула
 * бы вывод типов на себя.
 */
export type StaffAppointmentPaymentsDeps = {
  payments?: PaymentsService | null;
  patientBooking: Pick<PatientBookingService, 'getBookingByCanonicalAppointment'>;
  patientPayments: Pick<PatientPaymentsPort, 'listAppointmentPayments' | 'addCashPayment'>;
  /**
   * PAY-APPT-05/06: сумма счёта берётся из канонического снимка САМОЙ записи. Без него дверь
   * выставляла бы ссылку на полную стоимость там, где карточка показывает требуемую предоплату.
   */
  bookingEngine?: {
    listAppointmentFinancialSnapshots(
      organizationId: string,
      appointmentIds: string[],
    ): Promise<AppointmentFinancialSnapshotRecord[]>;
  } | null;
};

export type StaffAppointmentPaymentViewDeps = {
  payments?: PaymentsService | null;
  /** PAY-APPT-06: канонический снимок предоплаты читается у САМОЙ записи, а не выводится заново. */
  bookingEngine?: {
    listAppointmentFinancialSnapshots(
      organizationId: string,
      appointmentIds: string[],
    ): Promise<AppointmentFinancialSnapshotRecord[]>;
  } | null;
  patientBooking?: Pick<PatientBookingService, 'listBookingsByCanonicalAppointments'> | null;
  patientPayments?: Pick<PatientPaymentsPort, 'sumPaidMinorForAppointments'> | null;
  patientInvites?: {
    listPortalLinkedPatients(
      organizationId: string,
      patientUserIds: string[],
    ): ReturnType<PatientInvitesPort['listPortalLinkedPatients']>;
  } | null;
};

/** Одна запись, для которой нужна сводка оплаты. */
export type StaffAppointmentPaymentViewTarget = {
  appointmentId: string;
  platformUserId: string;
  serviceId: string | null;
};

const NOT_ENTITLED_VIEW: CalendarAppointmentPaymentView = {
  payment: null,
  totalMinor: null,
  manualPaidMinor: 0,
  paymentsEntitled: false,
  onlinePaymentAvailable: false,
  patientChatAvailable: false,
  prepayment: null,
};

/**
 * APPT-DETAIL-11: сводка оплаты сразу для набора записей.
 *
 * Это единственный источник блока оплаты в карточке деталей: им наполняется первичный серверный
 * payload и он же отвечает на обновление после платёжной мутации. Все чтения — батчевые, потому
 * что карточку открывают из уже загруженного диапазона календаря: поштучное чтение превратилось
 * бы в пяток запросов на каждую запись месяца.
 */
export async function listStaffAppointmentPaymentViews(
  deps: StaffAppointmentPaymentViewDeps,
  input: { organizationId: string; targets: StaffAppointmentPaymentViewTarget[] },
): Promise<Map<string, CalendarAppointmentPaymentView>> {
  const views = new Map<string, CalendarAppointmentPaymentView>();
  if (input.targets.length === 0) return views;
  const payments = deps.payments;
  if (!payments || !deps.patientBooking || !deps.patientPayments || !deps.patientInvites) {
    return views;
  }

  // MONEY-06: блок оплаты существует только у клиники, чей тариф несёт механику `payments` —
  // то же решение, что охраняет платёжную мутацию. Отказ здесь стоит один запрос на диапазон.
  const entitlement = await getMechanicMutationAvailability(
    { organizationId: input.organizationId },
    'payments',
  );
  if (!entitlement.available) {
    for (const target of input.targets) views.set(target.appointmentId, NOT_ENTITLED_VIEW);
    return views;
  }

  const appointmentIds = input.targets.map((target) => target.appointmentId);
  const patientUserIds = Array.from(new Set(input.targets.map((t) => t.platformUserId)));
  const [online, bookings, briefs, paidSums, linkedPatients, snapshots, checkoutUrls] =
    await Promise.all([
      payments.getPrepaymentAvailability(input.organizationId),
      deps.patientBooking.listBookingsByCanonicalAppointments(appointmentIds),
      payments.listAppointmentPaymentBriefs(input.organizationId, appointmentIds),
      deps.patientPayments.sumPaidMinorForAppointments(appointmentIds),
      deps.patientInvites.listPortalLinkedPatients(input.organizationId, patientUserIds),
      deps.bookingEngine
        ? deps.bookingEngine.listAppointmentFinancialSnapshots(input.organizationId, appointmentIds)
        : Promise.resolve([]),
      payments.listAppointmentCheckoutUrls(input.organizationId, appointmentIds),
    ]);

  const bookingByAppointment = new Map(
    bookings
      .filter((booking) => booking.canonicalAppointmentId != null)
      .map((booking) => [booking.canonicalAppointmentId as string, booking]),
  );
  const briefByAppointment = new Map(briefs.map((brief) => [brief.appointmentId, brief]));
  const paidByAppointment = new Map(paidSums.map((row) => [row.appointmentId, row.paidMinor]));
  const linked = new Set(linkedPatients);
  const snapshotByAppointment = new Map(snapshots.map((row) => [row.appointmentId, row]));
  const checkoutByAppointment = new Map(
    checkoutUrls.map((row) => [row.appointmentId, row.checkoutUrl]),
  );

  for (const target of input.targets) {
    const booking = bookingByAppointment.get(target.appointmentId) ?? null;
    const brief = briefByAppointment.get(target.appointmentId) ?? null;
    let payment: CalendarAppointmentPaymentView['payment'] = null;
    if (brief) {
      try {
        payment = {
          amountMinor: splitAppointmentPaymentAmountMinor(
            brief.amountMinor,
            brief.appointmentCount,
          ),
          status: brief.status,
        };
      } catch {
        // Неделимый общий платёж — дефект данных. Поштучный контракт в этом случае тоже
        // отказывает, и карточка остаётся без блока оплаты, а не показывает неверную сумму.
        views.set(target.appointmentId, NOT_ENTITLED_VIEW);
        continue;
      }
    }

    // PAY-APPT-01/06: общая стоимость берётся из снимка САМОЙ записи. Историческая проекция
    // остаётся резервом только там, где снимка ещё нет (записи до этого изменения).
    const snapshot = snapshotByAppointment.get(target.appointmentId) ?? null;
    views.set(target.appointmentId, {
      payment,
      totalMinor: snapshot?.priceMinor ?? booking?.priceMinorSnapshot ?? null,
      manualPaidMinor: paidByAppointment.get(target.appointmentId) ?? 0,
      paymentsEntitled: true,
      onlinePaymentAvailable: online.available,
      patientChatAvailable: linked.has(target.platformUserId),
      prepayment: snapshot
        ? {
            mode: snapshot.prepaymentMode,
            percentBps: snapshot.prepaymentPercentBps,
            amountMinor: snapshot.prepaymentAmountMinor,
            requiredMinor: snapshot.prepaymentRequiredMinor,
            paidMinor: snapshot.prepaymentPaidMinor,
            currency: snapshot.priceCurrency,
            deadlineAt: snapshot.paymentDeadlineAt,
            checkoutUrl: checkoutByAppointment.get(target.appointmentId) ?? null,
          }
        : null,
    });
  }
  return views;
}

/**
 * APPT-DETAIL-11: досбор сводки оплаты в события календаря. Стоит на общем пути чтения, поэтому
 * карточку деталей можно открыть из календаря, ленты или «Сегодня» — блок оплаты везде готов
 * с первого рендера, без второго запроса.
 */
export async function hydrateCalendarAppointmentPayments(
  deps: StaffAppointmentPaymentViewDeps,
  organizationId: string,
  events: CalendarAppointmentEvent[],
): Promise<CalendarAppointmentEvent[]> {
  // Чтение платёжного регистра требует установленного принципала арендатора; вне кабинета
  // врача (интегратор, публичная воронка) его нет, и карточка деталей там не открывается.
  if (getCurrentDbPrincipal()?.kind !== 'staff') return events;
  const targets = events
    .filter((event) => event.platformUserId != null)
    .map((event) => ({
      appointmentId: event.id,
      platformUserId: event.platformUserId as string,
      serviceId: event.serviceId,
    }));
  if (targets.length === 0) return events;
  const views = await withDoctorWorkspacePrincipal(
    { organizationId },
    'doctor.booking.appointment-detail.read',
    () => listStaffAppointmentPaymentViews(deps, { organizationId, targets }),
  );
  return events.map((event) => ({ ...event, payment: views.get(event.id) ?? null }));
}

type PaymentStateInput = {
  organizationId: string;
  appointmentId: string;
  platformUserId: string;
};

export type StaffAppointmentPaymentState = {
  summary: Awaited<ReturnType<typeof loadStaffAppointmentPaymentSummary>>;
  totalMinor: number | null;
  manualPaidMinor: number;
  remainingMinor: number | null;
  /** PAY-APPT-06: требуемая предоплата из снимка записи — ровно то число, что видит врач. */
  prepaymentRequiredMinor: number;
  /** Уже зачисленная на запись предоплата; растёт только платёжным корнем и кассой. */
  prepaymentPaidMinor: number;
};

export type StaffAppointmentPaymentAction = 'cash' | 'link';

/**
 * Coordinates the existing payments share calculation with the patient-payment ledger.
 * This belongs in app-layer rather than either module: neither module may depend on the other,
 * and parameterizing one with the other's port would reverse that boundary.
 */
export function createStaffAppointmentPaymentsService(deps: StaffAppointmentPaymentsDeps) {
  async function getPaymentState(input: PaymentStateInput): Promise<StaffAppointmentPaymentState> {
    if (!deps.payments) throw new Error('payments_unavailable');
    const [summary, booking, manual, snapshots] = await Promise.all([
      loadStaffAppointmentPaymentSummary(deps, input.appointmentId, input.organizationId),
      deps.patientBooking.getBookingByCanonicalAppointment(input.appointmentId),
      deps.patientPayments.listAppointmentPayments(input.appointmentId, input.platformUserId),
      deps.bookingEngine
        ? deps.bookingEngine.listAppointmentFinancialSnapshots(input.organizationId, [
            input.appointmentId,
          ])
        : Promise.resolve([]),
    ]);
    // PAY-APPT-06/18: стоимость и требование предоплаты читаются из снимка САМОЙ записи — того же,
    // что рисует карточка. Историческая проекция остаётся резервом только для записей, созданных
    // до появления снимка, иначе показанное и выставленное разошлись бы.
    const snapshot = snapshots.find((row) => row.appointmentId === input.appointmentId) ?? null;
    const totalMinor = snapshot?.priceMinor ?? booking?.priceMinorSnapshot ?? null;
    const capturedMinor = summary?.payment?.status === 'captured' ? summary.payment.amountMinor : 0;
    const manualPaidMinor = manual
      .filter((payment) => payment.status === 'paid')
      .reduce((sum, payment) => sum + payment.amountMinor, 0);
    return {
      summary,
      totalMinor,
      manualPaidMinor,
      remainingMinor:
        totalMinor === null ? null : Math.max(0, totalMinor - capturedMinor - manualPaidMinor),
      prepaymentRequiredMinor: snapshot?.prepaymentRequiredMinor ?? 0,
      prepaymentPaidMinor: snapshot?.prepaymentPaidMinor ?? 0,
    };
  }

  async function createPayment(
    input: PaymentStateInput & {
      action: StaffAppointmentPaymentAction;
      createdBy: string;
      returnUrl: string;
    },
  ) {
    const payments = deps.payments;
    if (!payments) throw new Error('payments_unavailable');
    const state = await getPaymentState(input);
    if (!state.summary || state.totalMinor === null || state.totalMinor <= 0) {
      return { ok: false as const, error: 'appointment_amount_unavailable' as const };
    }
    if (state.remainingMinor === null || state.remainingMinor === 0) {
      return { ok: false as const, error: 'already_paid' as const };
    }
    const booking = await deps.patientBooking.getBookingByCanonicalAppointment(input.appointmentId);
    if (!booking) return { ok: false as const, error: 'appointment_amount_unavailable' as const };

    if (input.action === 'cash') {
      const payment = await deps.patientPayments.addCashPayment({
        organizationId: input.organizationId,
        patientUserId: input.platformUserId,
        appointmentId: input.appointmentId,
        amountMinor: state.remainingMinor,
        currency: 'RUB',
        service: booking.serviceTitleSnapshot ?? null,
        comment: 'Оплачено наличными в карточке записи',
        idempotencyKey: `staff-appointment-cash:${input.appointmentId}:${state.remainingMinor}`,
        createdBy: input.createdBy,
      });
      return { ok: true as const, payment, remainingMinor: 0 };
    }

    // PAY-APPT-05/06: счёт выставляется на ТРЕБУЕМУЮ предоплату из снимка записи, а не на полную
    // стоимость. Иначе карточка показывает «предоплата 750 ₽», а ссылка приходит на 2500 ₽ — и
    // пациентская дверь с той же политикой создаёт намерение на третье число.
    const intentAmountMinor = appointmentPaymentIntentAmountMinor({
      prepaymentRequiredMinor: state.prepaymentRequiredMinor,
      prepaymentPaidMinor: state.prepaymentPaidMinor,
      remainingTotalMinor: state.remainingMinor,
    });
    if (intentAmountMinor <= 0) return { ok: false as const, error: 'already_paid' as const };
    const intent = await payments.createAppointmentPaymentIntent({
      organizationId: input.organizationId,
      appointmentId: input.appointmentId,
      platformUserId: input.platformUserId,
      amountMinor: intentAmountMinor,
      currency: 'RUB',
      idempotencyKey: `staff-appointment-link:${input.appointmentId}:${intentAmountMinor}`,
      returnUrl: input.returnUrl,
    });
    if (!intent.checkoutUrl) throw new Error('payment_link_unavailable');
    return {
      ok: true as const,
      paymentLink: intent.checkoutUrl,
      remainingMinor: intentAmountMinor,
    };
  }

  return { getPaymentState, createPayment };
}
