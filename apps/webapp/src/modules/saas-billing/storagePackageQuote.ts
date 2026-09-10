import { issueSignedPurchaseQuote, verifySignedPurchaseQuote } from './signedPurchaseQuote';

/**
 * Котировка на докупку объёма — тот же приём и тот же секрет, что у котировки места
 * (`seatOverageQuote.ts`), и та же причина: цену выпускает сервер, браузер возвращает только
 * подпись, денежное значение из запроса не читается никогда.
 *
 * Отличие ровно одно и оно существенное: котировка привязана к КОНКРЕТНОМУ пакету. Без этого
 * привязка «цена ↔ товар» рвалась бы на проводе — можно было бы взять подпись цены маленького
 * пакета и подставить в запрос большой.
 */
export type StoragePackageQuote = {
  organizationId: string;
  storagePackageId: string;
  /** Личность покупки. Из неё выводится `providerIdempotencyKey` — второго механизма нет. */
  purchaseKey: string;
  priceMinor: number;
  currency: string;
  expiresAt: string;
};

const SUBJECT_PREFIX = 'storage:';

export function issueStoragePackageQuote(input: {
  organizationId: string;
  storagePackageId: string;
  priceMinor: number;
  currency: string;
  /** Момент, до которого цена неподвижна, — из предложения двери, вместе с ценой (Р-15). */
  priceStableUntil: string;
  nowMs?: number;
}): { token: string; expiresAt: string } {
  return issueSignedPurchaseQuote({
    organizationId: input.organizationId,
    subject: `${SUBJECT_PREFIX}${input.storagePackageId}`,
    priceMinor: input.priceMinor,
    currency: input.currency,
    priceStableUntil: input.priceStableUntil,
    nowMs: input.nowMs,
  });
}

/**
 * `null` — подделана, просрочена, выписана другой организации ИЛИ на другой пакет. Во всех случаях
 * покупка не состоится и экран запрашивает цену заново.
 */
export function verifyStoragePackageQuote(
  token: string,
  expected: { organizationId: string; storagePackageId: string },
  nowMs: number = Date.now(),
): StoragePackageQuote | null {
  const quote = verifySignedPurchaseQuote(
    token,
    {
      organizationId: expected.organizationId,
      subject: `${SUBJECT_PREFIX}${expected.storagePackageId}`,
    },
    nowMs,
  );
  if (!quote) return null;
  return {
    organizationId: quote.organizationId,
    storagePackageId: expected.storagePackageId,
    purchaseKey: quote.purchaseKey,
    priceMinor: quote.priceMinor,
    currency: quote.currency,
    expiresAt: quote.expiresAt,
  };
}

export type StoragePackageQuoteBody = {
  error: 'storage_package_confirmation_required';
  quote: string;
  priceMinor: number;
  currency: string;
  quoteExpiresAt: string;
};

/**
 * Единственное место, где цена пакета объёма уходит на провод: цена физически не может оказаться на
 * экране без котировки, которой она подтверждается обратно. `priceMinor`/`currency` рядом с
 * токеном — то, что рисуется человеку; сервер их обратно не читает.
 */
export function storagePackageQuoteBody(input: {
  organizationId: string;
  storagePackageId: string;
  priceMinor: number;
  currency: string;
  priceStableUntil: string;
}): StoragePackageQuoteBody {
  const quote = issueStoragePackageQuote(input);
  return {
    error: 'storage_package_confirmation_required',
    quote: quote.token,
    priceMinor: input.priceMinor,
    currency: input.currency,
    quoteExpiresAt: quote.expiresAt,
  };
}
