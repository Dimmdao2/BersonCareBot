import { describe, expect, it, vi } from 'vitest';
import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';

const emitBookingEvent = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/modules/integrator/bookingM2mApi', () => ({
  createBookingSyncPort: () => ({ emitBookingEvent }),
}));

import { emitBookingDeletedEvent } from './emitBookingDeletedEvent';

describe('emitBookingDeletedEvent organization boundary', () => {
  it('keeps the caller tenant identity when the legacy booking projection is absent', async () => {
    const organizationId = '10000000-0000-4000-8000-000000000001';
    const appointmentId = '20000000-0000-4000-8000-000000000002';
    const deps = {
      patientBooking: {
        getBookingByCanonicalAppointment: vi.fn(async () => null),
      },
      appointmentAccess: {
        getByExternalRecordId: vi.fn(async () => null),
      },
    } as unknown as ReturnType<typeof buildAppDeps>;

    await emitBookingDeletedEvent({
      deps,
      organizationId,
      integratorRecordId: `be:${appointmentId}`,
      slotIsoFallback: '2027-01-02T12:00:00.000Z',
    });

    expect(emitBookingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'booking.deleted',
        payload: expect.objectContaining({ organizationId }),
      }),
    );
  });
});
