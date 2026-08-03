import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  withExplicitOrganizationPrincipal: vi.fn(),
  resolveActiveOrganizationForPatient: vi.fn(),
  getPatientPackageDetail: vi.fn(),
  getIntentForOrganization: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: fakes.withExplicitOrganizationPrincipal,
}));

import { GET } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const platformUserId = '22222222-2222-4222-8222-222222222222';
const patientPackageId = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({
    ok: true,
    session: { user: { userId: platformUserId } },
  });
  fakes.withExplicitOrganizationPrincipal.mockImplementation(
    async (_ctx: unknown, callback: () => Promise<unknown>) => callback(),
  );
  fakes.resolveActiveOrganizationForPatient.mockResolvedValue({ ok: true, organizationId });
  fakes.getPatientPackageDetail.mockResolvedValue({
    package: {
      id: patientPackageId,
      platformUserId,
      status: 'awaiting_payment',
      paymentIntentId: 'intent-1',
      priceMinor: 5000,
      currency: 'RUB',
    },
    usages: [],
    history: [],
  });
  fakes.getIntentForOrganization.mockResolvedValue({
    id: 'intent-1',
    status: 'pending',
    checkoutUrl: 'https://checkout.example.test/intent-1',
  });
});

function configurePayments(state: 'full_access' | 'disabled' | 'read_only') {
  fakes.buildAppDeps.mockReturnValue({
    patientOrganization: {
      resolveActiveOrganizationForPatient: fakes.resolveActiveOrganizationForPatient,
    },
    orgEntitlements: {
      resolveMechanicAccess: async (_organizationId: string, mechanic: string) => ({
        state: mechanic === 'payments' ? state : 'full_access',
        warning: null,
      }),
    },
    memberships: {
      getPatientPackageDetail: fakes.getPatientPackageDetail,
    },
    payments: { getIntentForOrganization: fakes.getIntentForOrganization },
  });
}

function statusRequest() {
  return new Request(
    `http://test/api/booking/memberships/payment-status?patientPackageId=${patientPackageId}`,
  );
}

describe('GET /api/booking/memberships/payment-status', () => {
  it.each(['disabled', 'read_only'] as const)(
    'keeps package status but removes the checkout continuation when payments are %s',
    async (state) => {
      configurePayments(state);

      const response = await GET(statusRequest());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        status: 'awaiting_payment',
        intentId: 'intent-1',
        intentStatus: 'pending',
        checkoutUrl: null,
      });
    },
  );

  it('returns the checkout continuation with full payments access', async () => {
    configurePayments('full_access');

    const response = await GET(statusRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      checkoutUrl: 'https://checkout.example.test/intent-1',
    });
  });
});
