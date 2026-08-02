import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveOrCreateUserByPhone } = vi.hoisted(() => ({
  resolveOrCreateUserByPhone: vi.fn(),
}));
vi.mock('@/app-layer/platform-user/resolveOrCreateUserByPhone', () => ({
  resolveOrCreateUserByPhone,
}));

import { identifyPublicBookingPayer } from './identifyPublicBookingPayer';

const patientSession = { user: { userId: 'user-session', role: 'client' as const } };

function deps(input?: { session?: typeof patientSession | null; verifiedEmail?: string | null }) {
  return {
    auth: { getCurrentSession: vi.fn(async () => input?.session ?? patientSession) },
    userByPhone: { getVerifiedEmailForUser: vi.fn(async () => input?.verifiedEmail ?? null) },
  };
}

describe('identifyPublicBookingPayer', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ['current session', { kind: 'session' } as const, deps(), 'user-session'],
    [
      'verified email session',
      { kind: 'verified_email_session', submittedEmail: ' USER@example.test ' } as const,
      deps({ verifiedEmail: 'user@example.test' }),
      'user-session',
    ],
  ])('returns the canonical user for %s', async (_name, proof, input, expectedUserId) => {
    await expect(identifyPublicBookingPayer(input, proof)).resolves.toEqual({
      ok: true,
      platformUserId: expectedUserId,
    });
  });

  it('resolves an SMS-proven phone into the same canonical result shape', async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ ok: true, userId: 'user-sms' });

    await expect(
      identifyPublicBookingPayer(deps(), {
        kind: 'sms',
        contactPhone: '+79990000000',
        contactName: 'Пациент',
      }),
    ).resolves.toEqual({ ok: true, platformUserId: 'user-sms' });
  });

  it.each([
    ['unverified', null],
    ['different', 'other@example.test'],
  ])('refuses a %s email proof before booking can be created', async (_name, verifiedEmail) => {
    await expect(
      identifyPublicBookingPayer(deps({ verifiedEmail }), {
        kind: 'verified_email_session',
        submittedEmail: 'user@example.test',
      }),
    ).resolves.toEqual({ ok: false, error: 'email_mismatch' });
  });
});
