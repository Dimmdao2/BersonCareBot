import { describe, expect, it } from 'vitest';
import { formatBookingRuDateTime } from './bookingNotificationFormat.js';

describe('formatBookingRuDateTime', () => {
  it('formats UTC instant in Europe/Moscow (MSK)', () => {
    const out = formatBookingRuDateTime('2026-04-02T07:00:00.000Z', 'Europe/Moscow');
    expect(out).toMatch(/10:00/);
  });
});
