import { beforeEach, describe, expect, it, vi } from 'vitest';

type GetCurrentSession = typeof import('@/modules/auth/service').getCurrentSession;
type StartEmailChallenge = typeof import('@/modules/auth/emailAuth').startEmailChallenge;

const fakes = vi.hoisted(() => ({
  getCurrentSession: vi.fn<GetCurrentSession>(),
  startEmailChallenge: vi.fn<StartEmailChallenge>(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  AUTH_CHANNEL_DISABLED_ERROR: 'auth_channel_disabled',
  isAuthChannelEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/modules/auth/service', () => ({ getCurrentSession: fakes.getCurrentSession }));
vi.mock('@/modules/auth/emailAuth', () => ({ startEmailChallenge: fakes.startEmailChallenge }));

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.startEmailChallenge.mockResolvedValue({
    ok: true,
    challengeId: '00000000-0000-4000-8000-000000000209',
  });
});

describe('email verification HTTP boundary', () => {
  it('selects the patient sender from the authenticated recipient role', async () => {
    fakes.getCurrentSession.mockResolvedValue({
      user: {
        userId: '00000000-0000-4000-8000-000000000107',
        role: 'client',
        displayName: 'Patient',
        bindings: {},
        sessionEpoch: 1,
      },
      issuedAt: 1_790_000_000,
      expiresAt: 1_790_043_200,
    });

    const response = await POST(
      new Request('https://app.example.test/api/auth/email/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'patient@example.test' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fakes.startEmailChallenge).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000107',
      'patient@example.test',
      'email_verify',
      { kind: 'platform', senderDisplayName: 'Therapygo' },
    );
  });
});
