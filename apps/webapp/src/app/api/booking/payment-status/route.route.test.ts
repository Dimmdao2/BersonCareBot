import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  RESOLVED_SURFACE_HEADER,
  serializeResolvedSurface,
} from '@/shared/lib/surface/requestSurface';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  withPatientIdentityPrincipal: vi.fn(),
  getBookingPaymentStatus: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withPatientIdentityPrincipal: fakes.withPatientIdentityPrincipal,
}));

import { GET } from './route';

const bookingId = 'booking-owner';
const patientOrigin = 'https://patient.example.test';

function request() {
  return new Request(`http://localhost/api/booking/payment-status?bookingId=${bookingId}`, {
    headers: {
      [RESOLVED_SURFACE_HEADER]: serializeResolvedSurface({
        surface: 'patient_default',
        publicOrigin: patientOrigin,
        authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
      }),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({
    ok: true,
    session: { user: { userId: 'owner-user' } },
  });
  fakes.buildAppDeps.mockReturnValue({
    patientBooking: {
      getBookingPaymentStatus: fakes.getBookingPaymentStatus,
    },
  });
  fakes.withPatientIdentityPrincipal.mockImplementation(
    (_principal: unknown, callback: () => Promise<unknown>) => callback(),
  );
});

describe('B1.2 booking payment status ownership', () => {
  it('returns payment status only through the authenticated booking owner identity', async () => {
    fakes.getBookingPaymentStatus.mockResolvedValue({
      ok: true,
      intentId: 'intent-1',
      amountMinor: 420000,
      currency: 'RUB',
      intentStatus: 'pending',
      checkoutUrl: `${patientOrigin}/book/pay/intent-1`,
      paymentDeadlineAt: '2026-09-12T09:30:00.000Z',
      appointmentStatus: 'awaiting_payment',
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      intentId: 'intent-1',
      amountMinor: 420000,
      currency: 'RUB',
      intentStatus: 'pending',
      checkoutUrl: `${patientOrigin}/book/pay/intent-1`,
      paymentDeadlineAt: '2026-09-12T09:30:00.000Z',
      appointmentStatus: 'awaiting_payment',
    });
    expect(fakes.withPatientIdentityPrincipal).toHaveBeenCalledWith(
      expect.objectContaining({ platformUserId: 'owner-user' }),
      expect.any(Function),
    );
    expect(fakes.getBookingPaymentStatus).toHaveBeenCalledWith(bookingId, patientOrigin);
  });

  it('denies a foreign booking even though the requester has a normal patient session', async () => {
    fakes.getBookingPaymentStatus.mockResolvedValue({ ok: false, error: 'not_found' });

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: 'not_found' });
    expect(fakes.getBookingPaymentStatus).toHaveBeenCalledWith(bookingId, patientOrigin);
  });
});
