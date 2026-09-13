import { describe, expect, it } from 'vitest';
import { mapBookingCreateErrorCodeToRu } from './bookingCreateErrorMessages';

/**
 * Проверяется разбор кода, а не формулировка: запасной ответ берётся у самой функции, поэтому
 * редактура текста ничего здесь не ломает, а код, потерявший собственное объяснение и провалившийся
 * в общую заглушку, — ломает.
 */
const FALLBACK = mapBookingCreateErrorCodeToRu('unexpected_booking_error');

describe('mapBookingCreateErrorCodeToRu', () => {
  it.each(['payment_provider_unavailable', 'payments_disabled'])(
    'explains when online payments are unavailable for %s',
    (code) => {
      const text = mapBookingCreateErrorCodeToRu(code);

      expect(text).not.toBe(FALLBACK);
      expect(text).toBe(mapBookingCreateErrorCodeToRu('payments_disabled'));
      expect(text).not.toContain(code);
    },
  );

  it('keeps the generic fallback for an unknown code', () => {
    expect(mapBookingCreateErrorCodeToRu('some_future_code')).toBe(FALLBACK);
    expect(FALLBACK.trim().length).toBeGreaterThan(0);
  });
});
