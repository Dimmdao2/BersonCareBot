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
