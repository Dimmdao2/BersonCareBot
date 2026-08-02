import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  withExplicitOrganizationPrincipal: vi.fn(),
  resolveBookingOrganizationId: vi.fn(),
  getBookingPaymentStatus: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: fakes.withExplicitOrganizationPrincipal,
}));

import { GET } from './route';

const bookingId = 'booking-owner';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({
    ok: true,
    session: { user: { userId: 'owner-user' } },
  });
  fakes.buildAppDeps.mockReturnValue({
    patientBooking: {
      resolveBookingOrganizationId: fakes.resolveBookingOrganizationId,
      getBookingPaymentStatus: fakes.getBookingPaymentStatus,
    },
  });
  fakes.resolveBookingOrganizationId.mockResolvedValue('org-1');
  fakes.withExplicitOrganizationPrincipal.mockImplementation(
    (_principal: unknown, callback: () => Promise<unknown>) => callback(),
  );
});

describe('B1.2 booking payment status ownership', () => {
  it('returns payment status only through the authenticated booking owner identity', async () => {
    fakes.getBookingPaymentStatus.mockResolvedValue({
      ok: true,
      booking: { id: bookingId },
      summary: { intent: { id: 'intent-1' } },
      intentId: 'intent-1',
    });

    const response = await GET(
      new Request(`http://localhost/api/booking/payment-status?bookingId=${bookingId}`),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, booking: { id: bookingId } });
    expect(fakes.getBookingPaymentStatus).toHaveBeenCalledWith(bookingId, 'owner-user');
  });

  it('denies a foreign booking even though the requester has a normal patient session', async () => {
    fakes.getBookingPaymentStatus.mockResolvedValue({ ok: false, error: 'forbidden' });

    const response = await GET(
      new Request(`http://localhost/api/booking/payment-status?bookingId=${bookingId}`),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: 'forbidden' });
    expect(fakes.getBookingPaymentStatus).toHaveBeenCalledWith(bookingId, 'owner-user');
  });
});
