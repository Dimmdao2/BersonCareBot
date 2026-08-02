import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  stampBootstrapPrincipal: vi.fn(),
  ensureAuthModulePortsBound: vi.fn(),
  buildAppDeps: vi.fn(),
  identifyPublicBookingPayer: vi.fn(),
  createVerifiedPublicBooking: vi.fn(),
  isPublicBookingCreateRateLimited: vi.fn(),
  resolvePublicBookingRateLimitClientKey: vi.fn(),
  issuePublicBookingVerification: vi.fn(),
  resolveSlugBoundPublicInPersonBookingOrganization: vi.fn(),
  resolveInPersonBookingContext: vi.fn(),
  withExplicitOrganizationPrincipal: vi.fn(),
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
  PUBLIC_BOOKING_RATE_LIMIT_SEC: 60,
  isPublicBookingCreateRateLimited: fakes.isPublicBookingCreateRateLimited,
  resolvePublicBookingRateLimitClientKey: fakes.resolvePublicBookingRateLimitClientKey,
}));
vi.mock('@/modules/public-booking/publicBookingVerification', () => ({
  issuePublicBookingVerification: fakes.issuePublicBookingVerification,
}));
vi.mock('@/modules/patient-booking/inPersonBookingResolve', () => ({
  InPersonBookingResolveError: class InPersonBookingResolveError extends Error {},
  resolveSlugBoundPublicInPersonBookingOrganization:
    fakes.resolveSlugBoundPublicInPersonBookingOrganization,
  resolveInPersonBookingContext: fakes.resolveInPersonBookingContext,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: fakes.withExplicitOrganizationPrincipal,
}));

import { POST } from './route';

const branchId = '00000000-0000-4000-8000-000000000301';
const serviceId = '00000000-0000-4000-8000-000000000302';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.resolvePublicBookingRateLimitClientKey.mockReturnValue({ ok: true, key: 'client-1' });
  fakes.isPublicBookingCreateRateLimited.mockResolvedValue(false);
  fakes.buildAppDeps.mockReturnValue({});
  fakes.resolveSlugBoundPublicInPersonBookingOrganization.mockResolvedValue({
    organizationId: 'org-1',
    keys: { branchId, serviceId },
  });
  fakes.resolveInPersonBookingContext.mockResolvedValue({ organizationId: 'org-1', branchId, serviceId });
  fakes.withExplicitOrganizationPrincipal.mockImplementation(
    (_principal: unknown, callback: () => Promise<unknown>) => callback(),
  );
});

describe('B1.2 public email booking identity', () => {
  it('creates neither a booking nor a payment proof when the OTP session email is unverified or mismatched', async () => {
    fakes.identifyPublicBookingPayer.mockResolvedValue({ ok: false, error: 'email_mismatch' });

    const response = await POST(
      new Request('http://localhost/api/booking/public/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'in_person',
          orgSlug: 'clinic',
          branchId,
          serviceId,
          slotStart: '2026-08-10T10:00:00.000Z',
          slotEnd: '2026-08-10T10:30:00.000Z',
          contactName: 'Payer',
          contactPhone: '+79990000000',
          contactEmail: 'mismatch@example.test',
          proofMethod: 'email',
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: 'identity_not_verified' });
    expect(fakes.createVerifiedPublicBooking).not.toHaveBeenCalled();
    expect(fakes.issuePublicBookingVerification).not.toHaveBeenCalled();
  });
});
