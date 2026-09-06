import { getMechanicMutationAvailability } from '@/app-layer/guards/requireEntitlement';
import type { createBookingSchedulingService } from '@/modules/booking-scheduling/service';
import type { PaymentsService } from '@/modules/payments/service';
import {
  assertAppointmentFinancialsMutable,
  resolveAppointmentFinancialSnapshot,
  type AppointmentFinancialSnapshot,
  type AppointmentPrepaymentOverride,
} from '@/modules/payments/appointmentFinancialSnapshot';
import type { BeAppointment } from '@/modules/booking-engine/types';

type BookingSchedulingService = ReturnType<typeof createBookingSchedulingService>;

/**
 * PAY-APPT-01/02/03/12: врачебная половина канонического финансового снимка.
 *
 * Собственного расчёта здесь НЕТ. Модуль только собирает вход — цену услуги из каталога, политику
 * предоплаты клиники, срок ожидания из настроек и решение тарифа — и передаёт его в единственный
 * доменный расчёт `resolveAppointmentFinancialSnapshot`, тот же самый, которым считает пациентская
 * запись (`canonicalCreate`).
 */

export type StaffAppointmentFinancialDeps = {
  payments: PaymentsService | null;
  bookingScheduling: BookingSchedulingService | null;
  getServicePriceMinor: (serviceId: string) => Promise<number | null>;
};

export type StaffAppointmentFinancialInput = {
  organizationId: string;
  serviceId: string | null;
  /** PAY-APPT-02: авторизованное переопределение стоимости для конкретной записи. */
  priceMinor?: number | null;
  /** PAY-APPT-03: авторизованное переопределение условия предоплаты для конкретной записи. */
  prepayment?: AppointmentPrepaymentOverride | null;
  /** Момент, от которого отсчитывается срок оплаты. */
  now?: string;
};

export async function resolveStaffAppointmentFinancials(
  deps: StaffAppointmentFinancialDeps,
  input: StaffAppointmentFinancialInput,
): Promise<AppointmentFinancialSnapshot> {
  const catalogPriceMinor = input.serviceId
    ? await deps.getServicePriceMinor(input.serviceId)
    : null;

  // Механика оплаты выключена тарифом — требования предоплаты у клиники не существует вовсе,
  // и переопределение врача его не создаёт. Цена при этом остаётся: она нужна и без онлайн-оплаты.
  const entitled = await getMechanicMutationAvailability(
    { organizationId: input.organizationId },
    'payments',
  );
  const settings =
    entitled.available && deps.payments ? await deps.payments.getSettings(input.organizationId) : null;
  const policy =
    entitled.available && deps.payments
      ? await deps.payments.getPrepaymentPolicyForBooking({
          organizationId: input.organizationId,
          serviceId: input.serviceId,
          onlineCategory: null,
        })
      : null;
  const prepaymentWaitMinutes = deps.bookingScheduling
    ? await deps.bookingScheduling.getPrepaymentWaitMinutes(input.organizationId)
    : 20;

  return resolveAppointmentFinancialSnapshot({
    servicePriceMinor: catalogPriceMinor,
    priceMinorOverride: input.priceMinor ?? null,
    policy,
    prepaymentOverride: input.prepayment ?? null,
    paymentsGloballyEnabled: settings?.enabled === true,
    currency: 'RUB',
    now: input.now ?? new Date().toISOString(),
    prepaymentWaitMinutes,
  });
}

/**
 * PAY-APPT-12: правка ДО оплаты пересчитывает требование детерминированно, правка ПОСЛЕ
 * состоявшихся денег отказывает. Замок один и тот же для любой врачебной правки.
 */
export function assertStaffMayRewriteFinancials(appointment: BeAppointment): void {
  assertAppointmentFinancialsMutable({
    prepaymentPaidMinor: appointment.prepaymentPaidMinor,
    paymentRef: appointment.paymentRef,
    status: appointment.status,
  });
}
