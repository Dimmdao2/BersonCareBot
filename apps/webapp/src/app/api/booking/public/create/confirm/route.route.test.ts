import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  stampBootstrapPrincipal: vi.fn(),
  ensureAuthModulePortsBound: vi.fn(),
  buildAppDeps: vi.fn(),
  identifyPublicBookingPayer: vi.fn(),
  createVerifiedPublicBooking: vi.fn(),
  isPublicBookingConfirmRateLimited: vi.fn(),
  resolvePublicBookingRateLimitClientKey: vi.fn(),
  consumePublicBookingVerification: vi.fn(),
  withExplicitOrganizationPrincipal: vi.fn(),
  findByUserId: vi.fn(),
  setSessionFromUser: vi.fn(),
  getBookingPaymentStatus: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: fakes.stampBootstrapPrincipal,
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: fakes.ensureAuthModulePortsBound,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/booking/identifyPublicBookingPayer', () => ({
  identifyPublicBookingPayer: fakes.identifyPublicBookingPayer,
}));
vi.mock('@/app-layer/booking/createVerifiedPublicBooking', () => ({
  createVerifiedPublicBooking: fakes.createVerifiedPublicBooking,
}));
vi.mock('@/modules/public-booking/publicBookingRateLimit', () => ({
  PUBLIC_BOOKING_CONFIRM_RATE_LIMIT_SEC: 60,
  isPublicBookingConfirmRateLimited: fakes.isPublicBookingConfirmRateLimited,
  resolvePublicBookingRateLimitClientKey: fakes.resolvePublicBookingRateLimitClientKey,
}));
vi.mock('@/modules/public-booking/publicBookingVerification', () => ({
  consumePublicBookingVerification: fakes.consumePublicBookingVerification,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: fakes.withExplicitOrganizationPrincipal,
}));
vi.mock('@/modules/patient-booking/inPersonBookingResolve', () => ({
  InPersonBookingResolveError: class InPersonBookingResolveError extends Error {},
}));

import { POST } from './route';

const payer = { userId: 'payer-user', role: 'client' as const };
const intent = {
  organizationId: 'org-1',
  contactPhone: '+79990000000',
  contactName: 'Payer',
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.resolvePublicBookingRateLimitClientKey.mockReturnValue({ ok: true, key: 'client-1' });
  fakes.isPublicBookingConfirmRateLimited.mockResolvedValue(false);
  fakes.consumePublicBookingVerification.mockResolvedValue({ ok: true, verified: { intent } });
  fakes.identifyPublicBookingPayer.mockResolvedValue({ ok: true, platformUserId: payer.userId });
  fakes.findByUserId.mockResolvedValue(payer);
  fakes.createVerifiedPublicBooking.mockResolvedValue({ id: 'booking-1', status: 'awaiting_payment' });
  fakes.getBookingPaymentStatus.mockResolvedValue({
    ok: true,
    summary: { intent: { checkoutUrl: 'https://pay.example.test/checkout' } },
  });
  fakes.buildAppDeps.mockReturnValue({
    auth: { setSessionFromUser: fakes.setSessionFromUser },
    userByPhone: { findByUserId: fakes.findByUserId },
    patientBooking: { getBookingPaymentStatus: fakes.getBookingPaymentStatus },
  });
  fakes.withExplicitOrganizationPrincipal.mockImplementation(
    (_principal: unknown, callback: () => Promise<unknown>) => callback(),
  );
});

describe('B1.2 SMS booking confirmation', () => {
  it('keeps the canonical SMS payer in the normal patient session and payment door', async () => {
    const response = await POST(
      new Request('http://localhost/api/booking/public/create/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId: 'challenge-1', code: '123456' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, checkoutUrl: 'https://pay.example.test/checkout' });
    expect(fakes.setSessionFromUser).toHaveBeenCalledWith(payer);
    expect(fakes.createVerifiedPublicBooking).toHaveBeenCalledWith(
      expect.anything(),
      intent,
      payer.userId,
    );
    expect(fakes.getBookingPaymentStatus).toHaveBeenCalledWith('booking-1', payer.userId);
  });
});
