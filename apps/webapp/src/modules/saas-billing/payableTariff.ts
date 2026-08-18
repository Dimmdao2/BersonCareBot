/**
 * Решение владельца 18.08.2026, дословно: «Считать бесплатный тариф неоплачиваемым».
 *
 * Единственное место, где живёт это правило. Тариф ценой 0 не порождает счёта вообще: экран не
 * предлагает оплату, а маршрут отказывает с человеческой причиной — вместо того чтобы дойти до
 * `assertReceiptMatchesOperation` и упасть на позиции чека с нулевой суммой
 * (`modules/payments/providerPort.ts`), что снаружи выглядело как «оплата временно недоступна».
 *
 * Цена неизвестна (тариф не найден или без цены) — это НЕ «бесплатно»: такой случай остаётся за
 * прежними отказами (`saas_billing_tariff_not_billable`), которые говорят о другом.
 */
export const SAAS_BILLING_TARIFF_NOT_PAYABLE = 'saas_billing_tariff_not_payable';

export function isFreeTariffPrice(priceMinor: number | null | undefined): boolean {
  return typeof priceMinor === 'number' && priceMinor <= 0;
}

/**
 * Решение владельца 18.08.2026, дословно: «клиент получает то что оплачено. То что не оплачено не
 * получает. Вот и все».
 *
 * Единственное место, где живёт правило «за какой тариф платят». Счёт оплачивает СЛЕДУЮЩИЙ период
 * целиком, а если смена тарифа уже запланирована, весь этот период клиника проведёт на
 * запланированном тарифе — значит из него берутся и цена, и длина периода, и сам ответ «есть ли что
 * оплачивать». Обычное продление ничего не планирует, и покупаемый тариф совпадает с текущим.
 *
 * Правило одно на все счётные пути (`createSaasBillingInvoice`,
 * `createSaasBillingRenewalInvoiceIfAbsent`, `requireOwnTariffBillingSubscription`, фоновый tick) —
 * именно потому, что раньше цена бралась из текущего тарифа, а период из запланированного, и счёт
 * получался внутренне противоречивым: месячная цена за год либо годовая за месяц.
 *
 * Немедленный upgrade внутри уже оплаченного периода — другой путь
 * (`createProratedTariffUpgradeInvoice`): там покупаемый тариф назван явно, ничего не планируется.
 */
export function purchasedTariffId(subscription: {
  tariffId: string;
  pendingTariffId: string | null;
}): string;
export function purchasedTariffId(subscription: {
  tariffId: string | null;
  pendingTariffId: string | null;
}): string | null;
export function purchasedTariffId(subscription: {
  tariffId: string | null;
  pendingTariffId: string | null;
}): string | null {
  return subscription.pendingTariffId ?? subscription.tariffId;
}
