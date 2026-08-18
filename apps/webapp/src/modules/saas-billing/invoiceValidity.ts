/**
 * Единственный дом правила «сколько живёт счёт» (Этап 1, пункт 1.3 плана
 * `docs/_TODO/SAAS_BILLING_RECONCILE_2026-08-18.md`).
 *
 * Раньше срок жил в двух разных местах и ни одно не было домом: форма выставления счёта в админке
 * подставляла свои трое суток, а «просрочен» на экране считался прямо в компоненте. Две копии
 * одного правила расходятся, и первой ломается та, о которой забыли.
 *
 * Владелец, 18.08 (правка того же дня): срок жизни счёта — НАСТРОЙКА, а не константа в коде и не
 * поле в форме. Одна на все счета — и на выставленные администратором вручную, и на автоматические
 * при продлении, — и администратор её меняет. Живёт она там же, где остальные числа политики
 * биллинга: `saas_billing_payment_provider.value.lifecyclePolicy.invoiceValidityDays`
 * (`settings.ts`). Здесь остаётся ТОЛЬКО документированный дефолт на случай пустой настройки и
 * арифметика — само число этот файл больше не решает.
 *
 * Срок НЕ хранится статусом — он выводится из даты выставления (`db/schema/saasBilling.ts`:
 * «просрочка считается от срока действия, а не выставляется вручную»).
 */

import type { SaasBillingInvoiceStatus } from './ports';

/** Дефолт, когда администратор не задал срок в настройке. Не политика — только запасное значение. */
export const SAAS_BILLING_INVOICE_VALIDITY_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Срок действия счёта, выставленного в момент `issuedAt`.
 *
 * `validityDays` обязателен: у вызывающего нет права решать этот вопрос молча — он обязан принести
 * настроенное значение (`parseSaasBillingPaymentProviderSettings(...).lifecyclePolicy.invoiceValidityDays`).
 */
export function saasBillingInvoiceExpiresAt(
  issuedAt: Date | string,
  validityDays: number,
): string {
  const issuedMs = issuedAt instanceof Date ? issuedAt.getTime() : Date.parse(issuedAt);
  if (!Number.isFinite(issuedMs)) {
    throw new Error('saas_billing_invoice_issued_at_invalid');
  }
  if (!Number.isInteger(validityDays) || validityDays <= 0) {
    throw new Error('saas_billing_invoice_validity_days_invalid');
  }
  return new Date(issuedMs + validityDays * DAY_MS).toISOString();
}

/**
 * Можно ли ещё платить по этому счёту на момент `asOf`.
 *
 * `paid`/`failed`/`void` — исход уже наступил, платить нечего. `expiresAt === null` — счёт на
 * автопродление, своего срока у него нет (см. `db/schema/saasBilling.ts`), поэтому он остаётся
 * оплачиваемым, пока его не закрыл провайдер или оператор.
 */
export function isSaasBillingInvoicePayable(
  invoice: { status: SaasBillingInvoiceStatus; expiresAt: string | null },
  asOf: Date,
): boolean {
  if (invoice.status !== 'draft' && invoice.status !== 'pending') return false;
  if (invoice.expiresAt === null) return true;
  const expiresMs = Date.parse(invoice.expiresAt);
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs > asOf.getTime();
}
