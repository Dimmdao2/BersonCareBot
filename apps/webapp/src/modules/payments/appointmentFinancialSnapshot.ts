import { computePrepaymentAmount } from './prepaymentCalculator';
import type { PrepaymentMode, PrepaymentPolicyRecord } from './types';

/**
 * PAY-APPT-01/02/03/04/12 + PAY-APPT-18: ОДИН доменный расчёт финансового снимка записи.
 *
 * До этого шага цена жила проекцией `patient_bookings.price_minor_snapshot`, условие предоплаты
 * пересчитывалось из каталога при каждом чтении, а срок оплаты не существовал вовсе. Отсюда два
 * разрыва: ручной снимок цены самопроизвольно уезжал за каталогом
 * (`ensureStaffBookingProjection` перечитывал `service.priceMinor`), а пациентская и врачебная
 * запись считали предоплату разными путями.
 *
 * Здесь считается ровно одно: из цены услуги, политики предоплаты клиники и (необязательного)
 * переопределения врача выводится снимок, который дальше ТОЛЬКО хранится. Сама формула
 * предоплаты не дублируется — она остаётся в `computePrepaymentAmount`.
 *
 * Деньги — только целые минорные единицы (копейки). Ни одного `float`: `Number.isSafeInteger`
 * стоит на каждом входе, а процент считается в базисных пунктах.
 */

/** PAY-APPT-08: значение по умолчанию для новой клиники. */
export const DEFAULT_PREPAYMENT_WAIT_MINUTES = 20;

/**
 * Верхняя граница ХРАНЕНИЯ, а не продуктовый лимит: столько минут в 365 сутках. Владелец
 * запретил искусственный продуктовый максимум, но значение всё равно обязано оставаться целым
 * числом минут, из которого получается корректный timestamptz.
 */
export const MAX_PREPAYMENT_WAIT_MINUTES = 525_600;

export type AppointmentPrepaymentOverride = {
  mode: PrepaymentMode;
  percentBps?: number | null;
  amountMinor?: number | null;
};

/** Ровно те значения, которые запись несёт в себе и которые пишет канонический write-path. */
export type AppointmentFinancialSnapshot = {
  priceMinor: number | null;
  priceCurrency: string;
  prepaymentMode: PrepaymentMode;
  prepaymentPercentBps: number | null;
  prepaymentAmountMinor: number | null;
  prepaymentRequiredMinor: number;
  paymentDeadlineAt: string | null;
};

/** Фактическое состояние денег записи; из него выводится замок на переписывание снимка. */
export type AppointmentMoneyState = {
  prepaymentPaidMinor: number;
  paymentRef: string | null;
  status: string;
};

export class AppointmentFinancialsError extends Error {}

function assertMinorAmount(value: number | null | undefined, field: string): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AppointmentFinancialsError(`invalid_${field}`);
  }
  return value;
}

function assertPercentBps(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new AppointmentFinancialsError('invalid_prepayment_percent_bps');
  }
  return value;
}

export function normalizePrepaymentWaitMinutes(value: number | null | undefined): number {
  if (value == null) return DEFAULT_PREPAYMENT_WAIT_MINUTES;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PREPAYMENT_WAIT_MINUTES) {
    throw new AppointmentFinancialsError('invalid_prepayment_wait_minutes');
  }
  return value;
}

/** Точный дедлайн записи: считается один раз, в момент создания требования оплаты. */
export function computePaymentDeadlineAt(fromIso: string, waitMinutes: number): string {
  const from = new Date(fromIso);
  const minutes = normalizePrepaymentWaitMinutes(waitMinutes);
  if (Number.isNaN(from.getTime())) {
    throw new AppointmentFinancialsError('invalid_payment_deadline_origin');
  }
  return new Date(from.getTime() + minutes * 60_000).toISOString();
}

export type ResolveAppointmentFinancialSnapshotInput = {
  /** Цена услуги из каталога на момент расчёта. */
  servicePriceMinor: number | null;
  /** PAY-APPT-02: авторизованное переопределение цены врачом для конкретной записи. */
  priceMinorOverride?: number | null;
  /** Политика предоплаты клиники/услуги — умолчание, если врач ничего не переопределил. */
  policy: PrepaymentPolicyRecord | null;
  /** PAY-APPT-03: переопределение условия предоплаты для конкретной записи. */
  prepaymentOverride?: AppointmentPrepaymentOverride | null;
  /** Механика оплаты клиники выключена — требования предоплаты не существует. */
  paymentsGloballyEnabled: boolean;
  currency?: string | null;
  /** Момент, от которого отсчитывается дедлайн (обычно момент создания записи). */
  now: string;
  prepaymentWaitMinutes: number;
};

/**
 * Единственный расчёт снимка. Возвращает ровно то, что ляжет в `be_appointments`; вызывающий
 * ничего не досчитывает.
 */
export function resolveAppointmentFinancialSnapshot(
  input: ResolveAppointmentFinancialSnapshotInput,
): AppointmentFinancialSnapshot {
  const override = assertMinorAmount(input.priceMinorOverride, 'price_minor');
  const catalog = assertMinorAmount(input.servicePriceMinor, 'service_price_minor');
  const priceMinor = override ?? catalog;
  const currency = (input.currency ?? input.policy?.currency ?? 'RUB').trim() || 'RUB';

  const mode: PrepaymentMode = input.prepaymentOverride
    ? input.prepaymentOverride.mode
    : input.policy && input.policy.isActive
      ? input.policy.mode
      : 'disabled';
  const percentBps = assertPercentBps(
    input.prepaymentOverride ? input.prepaymentOverride.percentBps : input.policy?.percentBps,
  );
  const amountMinor = assertMinorAmount(
    input.prepaymentOverride ? input.prepaymentOverride.amountMinor : input.policy?.amountMinor,
    'prepayment_amount_minor',
  );

  const requiredMinor = input.paymentsGloballyEnabled
    ? computePrepaymentAmount({ mode, amountMinor, percentBps, servicePriceMinor: priceMinor })
    : 0;
  // Требование, превышающее стоимость, — дефект настройки, а не «доплата вперёд».
  const boundedRequiredMinor =
    priceMinor == null ? requiredMinor : Math.min(requiredMinor, priceMinor);

  return {
    priceMinor,
    priceCurrency: currency,
    prepaymentMode: mode,
    prepaymentPercentBps: mode === 'percent' ? percentBps : null,
    prepaymentAmountMinor: mode === 'fixed_minor' ? amountMinor : null,
    prepaymentRequiredMinor: boundedRequiredMinor,
    paymentDeadlineAt:
      boundedRequiredMinor > 0
        ? computePaymentDeadlineAt(input.now, input.prepaymentWaitMinutes)
        : null,
  };
}

/**
 * PAY-APPT-12: после состоявшихся или удержанных денег финансовые значения не переписываются.
 * Замок опирается на ФАКТ (зачисленная сумма или ссылка на платёж), а не на статус, который
 * может измениться по другой причине.
 */
export function isAppointmentFinancialsLocked(state: AppointmentMoneyState): boolean {
  return state.prepaymentPaidMinor > 0 || state.paymentRef != null;
}

export function assertAppointmentFinancialsMutable(state: AppointmentMoneyState): void {
  if (isAppointmentFinancialsLocked(state)) {
    throw new AppointmentFinancialsError('appointment_financials_locked');
  }
}

/**
 * PAY-APPT-12: чем становится запись ПОСЛЕ переноса.
 *
 * Перенос сам по себе денег не двигает, поэтому он не вправе и подтверждать неоплаченное. Запись,
 * пришедшая в перенос ожидающей оплаты с непокрытым требованием, остаётся ожидающей: только в этом
 * статусе её видит тик истечения, и только он освобождает слот в срок. Любая другая запись —
 * `confirmed`, ровно как до появления предоплаты.
 *
 * Правило одно на оба переноса: врачебный (`applyReschedule`) и пациентский
 * (`app.apply_current_patient_booking_reschedule`) — второй повторяет его на SQL, потому что
 * исполняется в базе, а не в приложении.
 */
export function appointmentStatusAfterReschedule(state: {
  fromStatus: string;
  prepaymentRequiredMinor: number;
  prepaymentPaidMinor: number;
  paymentRef: string | null;
}): 'awaiting_payment' | 'confirmed' {
  const stillOwed =
    state.paymentRef == null && state.prepaymentPaidMinor < state.prepaymentRequiredMinor;
  return state.fromStatus === 'awaiting_payment' && stillOwed ? 'awaiting_payment' : 'confirmed';
}

/**
 * PAY-APPT-10/12: требование предоплаты покрыто фактически полученными деньгами.
 *
 * Один предикат на все двери приёма денег: онлайн-платёж, наличные в кассе и замок на
 * переписывание финансовых значений спрашивают одно и то же, а не каждый своё.
 */
export function isAppointmentPrepaymentSatisfied(state: {
  prepaymentRequiredMinor: number;
  prepaymentPaidMinor: number;
}): boolean {
  return state.prepaymentPaidMinor >= state.prepaymentRequiredMinor;
}

/**
 * PAY-APPT-05/06: сколько именно выставлять счётом из деталей записи.
 *
 * Ссылка/QR выставляются на НЕПОКРЫТУЮ ЧАСТЬ ТРЕБОВАНИЯ предоплаты, а не на полную стоимость:
 * иначе карточка показывает «предоплата 750 ₽», а платёжное намерение уходит на 2500 ₽. Требования
 * предоплаты нет — счёт выставляется на остаток стоимости, как и до появления снимка.
 */
export function appointmentPaymentIntentAmountMinor(state: {
  prepaymentRequiredMinor: number;
  prepaymentPaidMinor: number;
  remainingTotalMinor: number;
}): number {
  if (state.prepaymentRequiredMinor <= 0) return Math.max(0, state.remainingTotalMinor);
  const outstanding = state.prepaymentRequiredMinor - state.prepaymentPaidMinor;
  // Остаток стоимости — верхняя граница: переплатить вперёд предоплатой нельзя.
  return Math.max(0, Math.min(outstanding, state.remainingTotalMinor));
}

/**
 * PAY-APPT-07: требование предоплаты держит слот в `awaiting_payment`; без требования запись
 * ведёт себя ровно как раньше. Один и тот же выбор для пациентской и врачебной записи.
 */
export function initialAppointmentStatusForSnapshot(
  snapshot: Pick<AppointmentFinancialSnapshot, 'prepaymentRequiredMinor'>,
  options: { coveredByPackage: boolean },
): 'awaiting_payment' | 'confirmed' {
  return !options.coveredByPackage && snapshot.prepaymentRequiredMinor > 0
    ? 'awaiting_payment'
    : 'confirmed';
}
