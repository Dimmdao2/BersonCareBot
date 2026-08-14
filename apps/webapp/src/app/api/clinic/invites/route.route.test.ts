import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireClinicManagementApiContext: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: fakes.requireClinicManagementApiContext,
}));
vi.mock('@bersoncare/db-principal', () => ({
  runWithDbClinicBillingPrincipal: <T>(_principal: unknown, callback: () => T): T => callback(),
}));
vi.mock('@/infra/integrations/email/integratorEmailAdapter', () => ({
  sendEmailSetupLinkViaIntegrator: vi.fn().mockResolvedValue({ ok: true }),
}));

import { POST, GET } from './route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const platformUserId = 'platform-user-1';

/** Active/unrestricted entitlement — POST tests below aren't exercising the ladder itself. */
const activeEntitlement = {
  resolveMechanicAccess: async () => ({ state: 'active', warning: null }),
};

describe('GET /api/clinic/invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementApiContext.mockResolvedValue({
      ok: true,
      ctx: { organizationId, session: { user: { userId: platformUserId } } },
    });
  });

  it('refuses invitations when the clinic team is disabled', async () => {
    const listPending = vi.fn();
    const getSeatStatus = vi.fn();
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async () => ({ state: 'disabled', warning: null }),
      },
      organizationInvites: { listPending },
      clinicSeats: { getSeatStatus },
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(listPending).not.toHaveBeenCalled();
    expect(getSeatStatus).not.toHaveBeenCalled();
  });

  it('keeps invitations readable when the clinic team is read-only', async () => {
    const listPending = vi.fn().mockResolvedValue([{ id: 'invite-1' }]);
    const getSeatStatus = vi.fn().mockResolvedValue({ used: 1 });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async () => ({ state: 'read_only', warning: null }),
      },
      organizationInvites: { listPending },
      clinicSeats: { getSeatStatus },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      invites: [{ id: 'invite-1' }],
      seats: { used: 1 },
    });
    expect(listPending).toHaveBeenCalledWith(organizationId);
    expect(getSeatStatus).toHaveBeenCalledWith(organizationId, platformUserId);
  });
});

function postRequest(body: unknown): Request {
  return new Request('http://127.0.0.1/api/clinic/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/clinic/invites entitlement lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementApiContext.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: 'platform-user-1' } },
      },
    });
  });

  it('refuses a direct invite mutation when the clinic team is disabled before the write port', async () => {
    const createInvite = vi.fn();
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: {
        resolveMechanicAccess: async () => ({ state: 'disabled', warning: null }),
      },
      organizationInvites: { createInvite },
    });

    const response = await POST(postRequest({ email: 'new-doctor@example.com', role: 'doctor' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'entitlement_required' });
    expect(createInvite).not.toHaveBeenCalled();
  });
});

/**
 * A full clinic must not create an invite merely because it has seen a price: checkout and trusted
 * capture are the only capacity-changing path.
 */
describe('POST /api/clinic/invites — §5a item 5.1 seat overage confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementApiContext.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: 'platform-user-1' } },
      },
    });
  });

  it('quotes a price without creating an invite or a manual invoice', async () => {
    const priceMinor = 150_00;
    const currency = 'RUB';
    const createInvite = vi
      .fn()
      // First call: at the seat ceiling, no confirmation supplied yet — must not create anything.
      .mockResolvedValueOnce({
        ok: false,
        code: 'seat_overage_confirmation_required',
        priceMinor,
        currency,
      });
    const createManualSaasBillingInvoice = vi.fn().mockResolvedValue({ id: 'invoice-1' });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: activeEntitlement,
      organizationInvites: { createInvite },
      saasBilling: { createManualSaasBillingInvoice },
    });

    const quoted = await POST(postRequest({ email: 'new-doctor@example.com', role: 'doctor' }));
    expect(quoted.status).toBe(402);
    const quotedBody = (await quoted.json()) as { priceMinor: number; currency: string };
    expect(quotedBody.priceMinor).toBe(priceMinor);
    expect(createManualSaasBillingInvoice).not.toHaveBeenCalled();

    expect(createInvite).toHaveBeenCalledTimes(1);
    expect(createManualSaasBillingInvoice).not.toHaveBeenCalled();
  });
});
