import { describe, expect, it } from 'vitest';
import { parseBookingLifecycleEvent } from './bookingLifecycleSchema.js';

describe('booking lifecycle organization boundary', () => {
  it('rejects an otherwise valid lifecycle event when the exact organization identity is absent', () => {
    const parsed = parseBookingLifecycleEvent({
      eventType: 'booking.created',
      idempotencyKey: 'missing-organization-scope',
      payload: {
        bookingId: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
        bookingType: 'in_person',
        category: 'general',
        slotStart: '2027-01-02T12:00:00.000Z',
        slotEnd: '2027-01-02T12:30:00.000Z',
        contactName: 'Пациент',
        contactPhone: '+79990000000',
      },
    });

    expect(parsed.success).toBe(false);
  });
});
