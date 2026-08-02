import { describe, expect, it } from 'vitest';
import { mapBookingCreateErrorCodeToRu } from './bookingCreateErrorMessages';

describe('mapBookingCreateErrorCodeToRu', () => {
  it.each(['payment_provider_unavailable', 'payments_disabled'])(
    'explains when online payments are unavailable for %s',
    (code) => {
      expect(mapBookingCreateErrorCodeToRu(code)).toBe(
        'Онлайн-оплата в клинике сейчас недоступна. Обратитесь в клинику.',
      );
    },
  );

  it('keeps the generic fallback for an unknown code', () => {
    expect(mapBookingCreateErrorCodeToRu('unexpected_booking_error')).toBe(
      'Не удалось создать запись.',
    );
  });
});
