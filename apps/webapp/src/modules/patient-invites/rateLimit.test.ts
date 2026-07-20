import { beforeEach, describe, expect, it, vi } from 'vitest';

const { limiter, resolveRealIp } = vi.hoisted(() => ({
  limiter: vi.fn(async (_key: string) => false),
  resolveRealIp: vi.fn(),
}));

vi.mock('@/modules/auth/authRateLimits', () => ({
  isPatientInviteExchangeRateLimitedByKey: limiter,
  isPatientInviteEmailStartRateLimitedByKey: limiter,
  isPatientInviteEmailConfirmRateLimitedByKey: limiter,
}));

vi.mock('@/modules/auth/realIpRateLimitClientKey', () => ({
  resolveRealIpRateLimitClientKey: resolveRealIp,
}));

import { checkPatientInvitePublicRateLimit } from './rateLimit';

beforeEach(() => {
  limiter.mockReset().mockResolvedValue(false);
  resolveRealIp.mockReset().mockReturnValue({ ok: true, key: '203.0.113.7' });
});

describe('patient invite public rate limits', () => {
  it('uses trusted real IP plus a hashed artifact and never the raw continuation', async () => {
    const raw = 'raw-secret-continuation';
    await expect(
      checkPatientInvitePublicRateLimit(new Request('https://example.test'), 'email_start', raw),
    ).resolves.toBe('ok');

    expect(resolveRealIp).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        scope: 'patient_invite.email_start',
      }),
    );
    expect(limiter).toHaveBeenCalledWith('email_start:ip:203.0.113.7');
    const artifactKey = limiter.mock.calls[1]?.[0] as string;
    expect(artifactKey).toMatch(/^email_start:artifact:[a-f0-9]{64}$/);
    expect(artifactKey).not.toContain(raw);
  });

  it('fails closed when production proxy identity is unavailable', async () => {
    resolveRealIp.mockReturnValue({ ok: false, reason: 'missing_x_real_ip' });
    await expect(
      checkPatientInvitePublicRateLimit(new Request('https://example.test'), 'exchange', 'bearer'),
    ).resolves.toBe('proxy_configuration');
    expect(limiter).not.toHaveBeenCalled();
  });

  it('rejects when either the IP or artifact bucket is exhausted', async () => {
    limiter.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(
      checkPatientInvitePublicRateLimit(
        new Request('https://example.test'),
        'email_confirm',
        'continuation',
      ),
    ).resolves.toBe('rate_limited');
  });
});
