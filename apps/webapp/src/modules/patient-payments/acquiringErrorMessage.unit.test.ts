import { describe, expect, it } from 'vitest';
import { acquiringErrorMessage } from './acquiringErrorMessage';

/**
 * Предмет — что достаётся человеку, а не какими словами. Неизвестный ответ провайдера обязан
 * свернуться в общий отказ и не вынести наружу собственный код, а известная фискальная причина
 * обязана получить собственное объяснение, а не ту же заглушку.
 */
const GENERIC = acquiringErrorMessage('provider_secret_detail');

describe('acquiringErrorMessage', () => {
  it('tells the clinic admin which fiscal setting is missing', () => {
    const text = acquiringErrorMessage('booking_payment_receipt_vat_code_missing');

    expect(text).not.toBe(GENERIC);
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it('does not expose an unknown provider response', () => {
    expect(acquiringErrorMessage('some_future_provider_detail')).toBe(GENERIC);
    expect(GENERIC).not.toContain('provider_secret_detail');
    expect(GENERIC).not.toContain('some_future_provider_detail');
  });
});
