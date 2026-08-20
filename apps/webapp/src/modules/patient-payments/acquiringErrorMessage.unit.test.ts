import { describe, expect, it } from 'vitest';
import { acquiringErrorMessage } from './acquiringErrorMessage';

describe('acquiringErrorMessage', () => {
  it('tells the clinic admin which fiscal setting is missing', () => {
    expect(acquiringErrorMessage('booking_payment_receipt_vat_code_missing')).toBe(
      'В настройках платежей не выбрана ставка НДС для чека',
    );
  });

  it('does not expose an unknown provider response', () => {
    expect(acquiringErrorMessage('provider_secret_detail')).toBe(
      'Провайдер оплаты отклонил запрос',
    );
  });
});
