import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { getMechanicMutationAvailability } from '@/app-layer/guards/requireEntitlement';
import type {
  CalendarAppointmentEvent,
  CalendarAppointmentPaymentView,
} from '@/modules/booking-calendar/types';
import type { PatientBookingService } from '@/modules/patient-booking/ports';
import type { PatientPaymentsPort } from '@/modules/patient-payments/ports';
import type { PatientInvitesPort } from '@/modules/patient-invites/ports';
import { quotePrepayment } from '@/modules/payments/prepaymentCalculator';
import { prepaymentContextFromBooking } from '@/modules/payments/prepaymentContextFromBooking';
import {
  splitAppointmentPaymentAmountMinor,
  type PaymentsService,
} from '@/modules/payments/service';
import type { PrepaymentPolicyRecord } from '@/modules/payments/types';
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
};

export type StaffAppointmentPaymentViewDeps = {
  payments?: PaymentsService | null;
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
  prepaymentQuote: null,
  payment: null,
  totalMinor: null,
  manualPaidMinor: 0,
  paymentsEntitled: false,
  onlinePaymentAvailable: false,
  patientChatAvailable: false,
};

/**
 * Зеркало выбора политики в `resolvePrepayment`: сначала точная политика услуги, иначе политика
 * онлайн-категории. Батч читает все политики организации одним запросом, поэтому выбор делается
 * в памяти, а сам расчёт остаётся в общей `quotePrepayment`.
 */
function selectPrepaymentPolicy(
  policies: PrepaymentPolicyRecord[],
  serviceId: string | null,
  onlineCategory: string | null,
): PrepaymentPolicyRecord | null {
  if (serviceId) return policies.find((policy) => policy.serviceId === serviceId) ?? null;
  if (onlineCategory) {
    return policies.find((policy) => policy.onlineCategory === onlineCategory) ?? null;
  }
  return null;
}

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
  const [settings, online, policies, bookings, briefs, paidSums, linkedPatients] =
    await Promise.all([
      payments.getSettings(input.organizationId),
      payments.getPrepaymentAvailability(input.organizationId),
      payments.listPrepaymentPolicies(input.organizationId),
      deps.patientBooking.listBookingsByCanonicalAppointments(appointmentIds),
      payments.listAppointmentPaymentBriefs(input.organizationId, appointmentIds),
      deps.patientPayments.sumPaidMinorForAppointments(appointmentIds),
      deps.patientInvites.listPortalLinkedPatients(input.organizationId, patientUserIds),
    ]);

  const bookingByAppointment = new Map(
    bookings
      .filter((booking) => booking.canonicalAppointmentId != null)
      .map((booking) => [booking.canonicalAppointmentId as string, booking]),
  );
  const briefByAppointment = new Map(briefs.map((brief) => [brief.appointmentId, brief]));
  const paidByAppointment = new Map(paidSums.map((row) => [row.appointmentId, row.paidMinor]));
  const linked = new Set(linkedPatients);

  for (const target of input.targets) {
    const booking = bookingByAppointment.get(target.appointmentId) ?? null;
    const context = prepaymentContextFromBooking(booking);
    const onlineCategory = context?.onlineCategory ?? null;
    const quote =
      target.serviceId || onlineCategory
        ? quotePrepayment({
            policy: selectPrepaymentPolicy(policies, target.serviceId, onlineCategory),
            servicePriceMinor: context?.servicePriceMinor ?? null,
            currency: 'RUB',
            paymentsGloballyEnabled: settings.enabled,
          })
        : null;

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

    views.set(target.appointmentId, {
      prepaymentQuote: quote ? { amountMinor: quote.amountMinor, currency: quote.currency } : null,
      payment,
      totalMinor: booking?.priceMinorSnapshot ?? null,
      manualPaidMinor: paidByAppointment.get(target.appointmentId) ?? 0,
      paymentsEntitled: true,
      onlinePaymentAvailable: online.available,
      patientChatAvailable: linked.has(target.platformUserId),
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
    const [summary, booking, manual] = await Promise.all([
      loadStaffAppointmentPaymentSummary(deps, input.appointmentId, input.organizationId),
      deps.patientBooking.getBookingByCanonicalAppointment(input.appointmentId),
      deps.patientPayments.listAppointmentPayments(input.appointmentId, input.platformUserId),
    ]);
    const totalMinor = booking?.priceMinorSnapshot ?? null;
    const capturedMinor =
      summary?.payment?.status === 'succeeded' ? summary.payment.amountMinor : 0;
    const manualPaidMinor = manual
      .filter((payment) => payment.status === 'paid')
      .reduce((sum, payment) => sum + payment.amountMinor, 0);
    return {
      summary,
      totalMinor,
      manualPaidMinor,
      remainingMinor:
        totalMinor === null ? null : Math.max(0, totalMinor - capturedMinor - manualPaidMinor),
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

    const intent = await payments.createAppointmentPaymentIntent({
      organizationId: input.organizationId,
      appointmentId: input.appointmentId,
      platformUserId: input.platformUserId,
      amountMinor: state.remainingMinor,
      currency: 'RUB',
      idempotencyKey: `staff-appointment-link:${input.appointmentId}:${state.remainingMinor}`,
      returnUrl: input.returnUrl,
    });
    if (!intent.checkoutUrl) throw new Error('payment_link_unavailable');
    return {
      ok: true as const,
      paymentLink: intent.checkoutUrl,
      remainingMinor: state.remainingMinor,
    };
  }

  return { getPaymentState, createPayment };
}
