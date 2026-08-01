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

/** Active/unrestricted entitlement — POST tests below aren't exercising the ladder itself. */
const activeEntitlement = { resolveMechanicAccess: async () => ({ state: 'active', warning: null }) };

describe('GET /api/clinic/invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementApiContext.mockResolvedValue({ ok: true, ctx: { organizationId } });
  });

  it('refuses invitations when the clinic team is disabled', async () => {
    const listPending = vi.fn();
    const getSeatStatus = vi.fn();
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'disabled', warning: null }) },
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
      orgEntitlements: { resolveMechanicAccess: async () => ({ state: 'read_only', warning: null }) },
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
    expect(getSeatStatus).toHaveBeenCalledWith(organizationId);
  });
});

function postRequest(body: unknown): Request {
  return new Request('http://127.0.0.1/api/clinic/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * §5a item 5.1 — the one test this feature earns per AGENTS.md §10a: the sum shown to the clinic
 * for confirmation (`seat_overage_confirmation_required.priceMinor`) must be the exact sum the
 * resulting invoice is raised for. A silent drift here means the clinic pays a different amount
 * than what it agreed to — expensive and, short of reading the provider dashboard, unnoticed.
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

  it('quotes a price without creating anything, then invoices exactly that price once confirmed', async () => {
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
      })
      // Second call: same price echoed back — now allowed through.
      .mockResolvedValueOnce({
        ok: true,
        token: 'tok',
        invite: {
          id: 'invite-1',
          invitedEmail: 'new-doctor@example.com',
          organizationTitle: 'Clinic',
          expiresAt: '2026-08-08T00:00:00.000Z',
        },
        seatOverage: { priceMinor, currency },
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

    const confirmed = await POST(
      postRequest({
        email: 'new-doctor@example.com',
        role: 'doctor',
        confirmedSeatOveragePriceMinor: quotedBody.priceMinor,
      }),
    );
    expect(confirmed.status).toBe(200);

    expect(createManualSaasBillingInvoice).toHaveBeenCalledTimes(1);
    const invoiceCall = createManualSaasBillingInvoice.mock.calls[0][0] as {
      amountMinor: number;
      currency: string;
    };
    // The exact assertion this test exists for: quoted price === invoiced price.
    expect(invoiceCall.amountMinor).toBe(quotedBody.priceMinor);
    expect(invoiceCall.currency).toBe(quotedBody.currency);
  });
});
