import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireClinicManagementApiContext: vi.fn(),
  startEmailChallenge: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: fakes.requireClinicManagementApiContext,
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  AUTH_CHANNEL_DISABLED_ERROR: 'auth_channel_disabled',
  isAuthChannelEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/modules/auth/emailAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/auth/emailAuth')>();
  return { ...actual, startEmailChallenge: fakes.startEmailChallenge };
});
vi.mock('@bersoncare/db-principal', () => ({
  runWithDbClinicBillingPrincipal: <T>(_principal: unknown, callback: () => T): T => callback(),
  // The shared error door resolves this request's correlation id and the root logger stamps it on
  // every line, so both live on the module graph of any route that answers with `jsonError`.
  ensureCorrelationId: () => 'test-correlation-id',
  getCurrentObservabilityContext: () => ({}),
}));
vi.mock('@/infra/integrations/email/integratorEmailAdapter', () => ({
  sendEmailSetupLinkViaIntegrator: vi.fn().mockResolvedValue({ ok: true }),
}));

import { POST, GET } from './route';
import { POST as startInviteAcceptance } from './accept/start/route';
import { verifySeatOverageQuote } from '@/modules/saas-billing/seatOverageQuote';

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

describe('POST /api/clinic/invites/accept/start mail identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.startEmailChallenge.mockResolvedValue({
      ok: true,
      challengeId: '00000000-0000-4000-8000-000000000209',
    });
  });

  it('sends the staff invite code with the Therapysto sender', async () => {
    const invitedEmail = 'invited-doctor@example.test';
    fakes.buildAppDeps.mockReturnValue({
      organizationInvites: {
        lookupPendingByToken: vi.fn().mockResolvedValue({
          ok: true,
          invite: { invitedEmail },
        }),
      },
      emailOtpPublicDb: {
        findOrCreatePublicEmailUser: vi.fn().mockResolvedValue({
          userId: '00000000-0000-4000-8000-000000000107',
        }),
      },
    });

    const response = await startInviteAcceptance(
      new Request('https://therapysto.example.test/api/clinic/invites/accept/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'a'.repeat(16), email: invitedEmail }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fakes.startEmailChallenge).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000107',
      invitedEmail,
      'clinic_invite',
      { kind: 'platform', senderDisplayName: 'Therapysto' },
    );
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
        // Момент неподвижности цены приходит из той же двери, что и цена (Р-15).
        priceStableUntil: '2999-01-01T00:00:00.000Z',
      });
    const createManualSaasBillingInvoice = vi.fn().mockResolvedValue({ id: 'invoice-1' });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: activeEntitlement,
      organizationInvites: { createInvite },
      saasBilling: { createManualSaasBillingInvoice },
    });

    const quoted = await POST(postRequest({ email: 'new-doctor@example.com', role: 'doctor' }));
    expect(quoted.status).toBe(402);
    const quotedBody = (await quoted.json()) as {
      priceMinor: number;
      currency: string;
      quote: string;
    };
    expect(quotedBody.priceMinor).toBe(priceMinor);
    // Вместе с ценой уходит котировка сервера — обратно на покупку вернётся только она, а цена
    // будет взята из её подписи, а не из тела запроса.
    expect(verifySeatOverageQuote(quotedBody.quote, { organizationId })).toMatchObject({
      organizationId,
      priceMinor,
      currency,
    });
    expect(createManualSaasBillingInvoice).not.toHaveBeenCalled();

    expect(createInvite).toHaveBeenCalledTimes(1);
    expect(createManualSaasBillingInvoice).not.toHaveBeenCalled();
  });
});
