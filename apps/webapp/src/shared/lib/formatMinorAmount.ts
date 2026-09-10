/**
 * Сумма в минорных единицах → строка для человека.
 *
 * Одна реализация на весь биллинг: до неё тот же формат жил копиями в обзоре счетов и в покупке
 * места специалиста, и две цены одного экрана могли разъехаться написанием при правке одной копии.
 * `currency` всегда приходит с сервера вместе с суммой — валюта здесь не подставляется по умолчанию.
 */
export function formatMinorAmount(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${new Intl.NumberFormat('ru-RU').format(amountMinor / 100)} ${currency}`;
  }
}
