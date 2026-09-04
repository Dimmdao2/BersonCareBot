import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorBookingEngine: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import { POST } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const platformUserId = '0194c2c5-1d75-7a42-8b64-a9b49aa52ba3';
const serviceId = '33333333-3333-4333-8333-333333333333';
const catalogPackageId = '44444444-4444-4444-8444-444444444444';
const saleIdempotencyKey = 'sale-attempt-0001';

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://test/api/doctor/booking-engine/patient-packages', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

function manualBody(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'manual',
    platformUserId,
    priceMinor: 1000,
    items: [{ serviceId, quantity: 1 }],
    saleMethod: 'link',
    saleIdempotencyKey,
    ...overrides,
  };
}

function catalogBody(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'catalog',
    platformUserId,
    subscriptionPackageId: catalogPackageId,
    saleMethod: 'link',
    saleIdempotencyKey,
    ...overrides,
  };
}

type MembershipsFakes = {
  createManualPatientPackage: ReturnType<typeof vi.fn>;
  offerCatalogPackageToPatient: ReturnType<typeof vi.fn>;
  settleStaffCashSale: ReturnType<typeof vi.fn>;
  addCashPayment: ReturnType<typeof vi.fn>;
};

function installDeps(options: {
  mechanic?: (mechanic: string) => string;
  createdPackage?: Record<string, unknown>;
}): MembershipsFakes {
  const created = options.createdPackage ?? {
    id: 'package-1',
    status: 'offered',
    priceMinor: 1000,
    currency: 'RUB',
    title: 'Абонемент',
  };
  const membershipFakes: MembershipsFakes = {
    createManualPatientPackage: vi.fn().mockResolvedValue(created),
    offerCatalogPackageToPatient: vi.fn().mockResolvedValue(created),
    settleStaffCashSale: vi.fn().mockResolvedValue({ ...created, status: 'active' }),
    addCashPayment: vi.fn().mockResolvedValue({ id: 'payment-1' }),
  };
  fakes.buildAppDeps.mockReturnValue({
    orgEntitlements: {
      resolveMechanicAccess: async (_organizationId: string, mechanic: string) => ({
        state: options.mechanic?.(mechanic) ?? 'full_access',
        warning: null,
      }),
    },
    memberships: {
      createManualPatientPackage: membershipFakes.createManualPatientPackage,
      offerCatalogPackageToPatient: membershipFakes.offerCatalogPackageToPatient,
      settleStaffCashSale: membershipFakes.settleStaffCashSale,
    },
    patientPayments: { addCashPayment: membershipFakes.addCashPayment },
  });
  return membershipFakes;
}

describe('POST /api/doctor/booking-engine/patient-packages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
    );
    fakes.requireDoctorBookingEngine.mockResolvedValue({
      ok: true,
      ctx: { organizationId, session: { user: { userId: 'doctor-user' } } },
    });
  });

  it.each([
    ['disabled', 'entitlement_required'],
    ['read_only', 'commercial_read_only'],
  ] as const)('refuses a direct clinic sale when subscriptions are %s', async (state, error) => {
    const deps = installDeps({ mechanic: (m) => (m === 'subscriptions' ? state : 'full_access') });

    const response = await post(manualBody());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error,
      mechanic: 'subscriptions',
    });
    expect(deps.createManualPatientPackage).not.toHaveBeenCalled();
  });

  it('keeps direct clinic sales available with full subscriptions access', async () => {
    installDeps({});

    const response = await post(manualBody());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, package: { id: 'package-1' } });
  });

  it.each([
    ['disabled', 'entitlement_required'],
    ['read_only', 'commercial_read_only'],
  ] as const)(
    'does not send a manual paid package online when payments are %s',
    async (state, error) => {
      const deps = installDeps({ mechanic: (m) => (m === 'payments' ? state : 'full_access') });

      const response = await post(manualBody({ saleMethod: 'link' }));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error,
        mechanic: 'payments',
      });
      expect(deps.createManualPatientPackage).not.toHaveBeenCalled();
    },
  );

  it('keeps an offline manual sale available when payments are disabled', async () => {
    const deps = installDeps({ mechanic: (m) => (m === 'payments' ? 'disabled' : 'full_access') });

    const response = await post(manualBody({ saleMethod: 'cash' }));

    expect(response.status).toBe(200);
    expect(deps.createManualPatientPackage).toHaveBeenCalledOnce();
    // No cash journal in this tariff, so nothing may be written to it — and the answer says so
    // instead of letting the card imply a KPI moved.
    expect(deps.addCashPayment).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ cashLedgerRecorded: false });
  });

  it('keeps a free catalog package available when payments are disabled', async () => {
    const deps = installDeps({ mechanic: (m) => (m === 'payments' ? 'disabled' : 'full_access') });

    const response = await post(catalogBody({ saleMethod: 'free' }));

    expect(response.status).toBe(200);
    expect(deps.offerCatalogPackageToPatient).toHaveBeenCalledOnce();
  });

  it('does not offer a paid catalog package online when payments are disabled', async () => {
    const deps = installDeps({ mechanic: (m) => (m === 'payments' ? 'disabled' : 'full_access') });

    const response = await post(catalogBody({ saleMethod: 'link' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'entitlement_required',
      mechanic: 'payments',
    });
    expect(deps.offerCatalogPackageToPatient).not.toHaveBeenCalled();
  });

  it('writes the cash sale into the ledger with the server price and the package relation', async () => {
    const deps = installDeps({});

    const response = await post(manualBody({ saleMethod: 'cash' }));

    expect(response.status).toBe(200);
    expect(deps.addCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        patientUserId: platformUserId,
        patientPackageId: 'package-1',
        amountMinor: 1000,
        idempotencyKey: 'staff-package-cash:package-1',
      }),
    );
    await expect(response.json()).resolves.toMatchObject({ cashLedgerRecorded: true });
  });

  it.each([
    ['paidAmountMinor', { paidAmountMinor: 1 }],
    ['activateImmediately', { activateImmediately: true }],
    ['sendForPayment', { sendForPayment: false }],
  ])('refuses a body that tries to state the money itself via %s', async (_field, forged) => {
    const deps = installDeps({});

    const response = await post(manualBody({ saleMethod: 'cash', ...forged }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid_body' });
    expect(deps.createManualPatientPackage).not.toHaveBeenCalled();
    expect(deps.addCashPayment).not.toHaveBeenCalled();
  });

  it('refuses a sale that carries no idempotency key', async () => {
    const deps = installDeps({});
    const body = manualBody({ saleMethod: 'cash' }) as Record<string, unknown>;
    delete body.saleIdempotencyKey;

    const response = await post(body);

    expect(response.status).toBe(400);
    expect(deps.createManualPatientPackage).not.toHaveBeenCalled();
  });

  it('forwards the caller key so the same attempt reaches the same package', async () => {
    const deps = installDeps({});

    await post(manualBody({ saleMethod: 'cash' }));
    await post(manualBody({ saleMethod: 'cash' }));

    for (const call of deps.createManualPatientPackage.mock.calls) {
      expect(call[0]).toMatchObject({ saleIdempotencyKey });
    }
  });

  it('names the real reason when a pay-link sale produced no link', async () => {
    installDeps({
      createdPackage: {
        id: 'package-1',
        status: 'offered',
        priceMinor: 1000,
        currency: 'RUB',
        title: 'Абонемент',
        checkoutUrl: null,
      },
    });

    const response = await post(manualBody({ saleMethod: 'link' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      paymentLinkError: 'payment_provider_unavailable',
      package: { status: 'offered' },
    });
  });

  it('reports no link error when the pay-link sale really produced a link', async () => {
    installDeps({
      createdPackage: {
        id: 'package-1',
        status: 'awaiting_payment',
        priceMinor: 1000,
        currency: 'RUB',
        title: 'Абонемент',
        checkoutUrl: 'https://pay.example/checkout/1',
      },
    });

    const response = await post(manualBody({ saleMethod: 'link' }));

    await expect(response.json()).resolves.toMatchObject({ paymentLinkError: null });
  });
});
