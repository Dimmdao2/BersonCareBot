/**
 * §5a item 7.0 — КОНЕЦ ОПЛАЧЕННОГО ПЕРИОДА, источник события для лестницы доступа.
 *
 * Длительность периода — поле владельца `saas_tariffs.billing_period`, которое ссылается на каталог
 * `saas_billing_periods` (#1069 T9). Здесь только календарная арифметика по числу месяцев.
 */

export {
  type BillingPeriodOption,
  LEGACY_BILLING_PERIOD_DAY,
  paidPeriodEndsAtForCode,
  paidPeriodEndsAtFromMonths as paidPeriodEndsAt,
} from './billingPeriodCatalog';
