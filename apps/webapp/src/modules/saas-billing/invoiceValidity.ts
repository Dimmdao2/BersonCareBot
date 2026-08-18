/**
 * Единственный дом срока жизни счёта (Этап 1, пункт 1.3 плана
 * `docs/_TODO/SAAS_BILLING_RECONCILE_2026-08-18.md`).
 *
 * Владелец, 18.08: «оплатить можно только актуальный счёт, срок жизни счёта — константа 30 дней в
 * коде». Раньше срок жил в двух разных местах и ни одно не было домом: форма выставления счёта в
 * админке подставляла свои трое суток, а «просрочен» на экране считался прямо в компоненте. Две
 * копии одного правила расходятся, и первой ломается та, о которой забыли.
 *
 * Читателей ровно три и четвёртого быть не должно: выставление счёта, кнопка оплаты в кабинете и
 * экран платежей платформы. Срок НЕ хранится статусом — он выводится из даты выставления
 * (`db/schema/saasBilling.ts`: «просрочка считается от срока действия, а не выставляется вручную»).
 */

import type { SaasBillingInvoiceStatus } from './ports';

/** Сколько живёт выставленный счёт. Константа владельца, не настройка и не колонка в БД. */
export const SAAS_BILLING_INVOICE_VALIDITY_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1_000;

/** Срок действия счёта, выставленного в момент `issuedAt`. */
export function saasBillingInvoiceExpiresAt(issuedAt: Date | string): string {
  const issuedMs = issuedAt instanceof Date ? issuedAt.getTime() : Date.parse(issuedAt);
  if (!Number.isFinite(issuedMs)) {
    throw new Error('saas_billing_invoice_issued_at_invalid');
  }
  return new Date(issuedMs + SAAS_BILLING_INVOICE_VALIDITY_DAYS * DAY_MS).toISOString();
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
