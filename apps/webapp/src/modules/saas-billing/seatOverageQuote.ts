import {
  issueSignedPurchaseQuote,
  verifySignedPurchaseQuote,
} from './signedPurchaseQuote';

/**
 * Котировка на дополнительное место. Криптография, срок жизни и правило «цена приходит из подписи,
 * а не из тела запроса» живут в `signedPurchaseQuote.ts` — одной механикой на все покупки внутри
 * оплаченного периода. Здесь остаётся только то, чем место отличается от пакета объёма: предмет
 * покупки и имена в теле ответа, которые читает экран команды.
 */
export type SeatOverageQuote = {
  organizationId: string;
  /** Личность покупки. Из неё выводится `providerIdempotencyKey` — второго механизма нет. */
  purchaseKey: string;
  priceMinor: number;
  currency: string;
  expiresAt: string;
};

/** Предмет покупки у места один на всю платформу: место сверх тарифа. */
const SUBJECT = 'seat';

export function issueSeatOverageQuote(input: {
  organizationId: string;
  priceMinor: number;
  currency: string;
  /** Момент, до которого цена неподвижна, — из предложения двери, вместе с ценой (Р-15). */
  priceStableUntil: string;
  nowMs?: number;
}): { token: string; expiresAt: string } {
  return issueSignedPurchaseQuote({ ...input, subject: SUBJECT });
}

/**
 * Проверка котировки. `null` — подделана, просрочена или выписана другой организации; во всех трёх
 * случаях покупка не состоится и экран запрашивает цену заново.
 */
export function verifySeatOverageQuote(
  token: string,
  expected: { organizationId: string },
  nowMs: number = Date.now(),
): SeatOverageQuote | null {
  const quote = verifySignedPurchaseQuote(
    token,
    { organizationId: expected.organizationId, subject: SUBJECT },
    nowMs,
  );
  if (!quote) return null;
  return {
    organizationId: quote.organizationId,
    purchaseKey: quote.purchaseKey,
    priceMinor: quote.priceMinor,
    currency: quote.currency,
    expiresAt: quote.expiresAt,
  };
}

export type SeatOverageQuoteBody = {
  error: 'seat_overage_confirmation_required';
  quote: string;
  priceMinor: number;
  currency: string;
  quoteExpiresAt: string;
};

/**
 * Единственное место, где цена дополнительного места уходит на провод. Оба входа — отказ
 * приглашения по лимиту и повторная сверка при покупке — строят тело 402 здесь, поэтому цена
 * физически не может уйти на экран без котировки, которой она подтверждается обратно.
 * `priceMinor`/`currency` рядом с токеном — то, что рисуется человеку; сервер их обратно не читает.
 */
export function seatOverageQuoteBody(input: {
  organizationId: string;
  priceMinor: number;
  currency: string;
  priceStableUntil: string;
}): SeatOverageQuoteBody {
  const quote = issueSeatOverageQuote(input);
  return {
    error: 'seat_overage_confirmation_required',
    quote: quote.token,
    priceMinor: input.priceMinor,
    currency: input.currency,
    quoteExpiresAt: quote.expiresAt,
  };
}
