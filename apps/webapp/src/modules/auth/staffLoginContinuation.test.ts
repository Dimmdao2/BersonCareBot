import { beforeEach, describe, expect, it, vi } from 'vitest';

let storedCookie: string | undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: (_name: string, value: string) => {
      storedCookie = value;
    },
    get: () => (storedCookie ? { value: storedCookie } : undefined),
  }),
}));

import { issueStaffLoginContinuation, readStaffLoginContinuation } from './staffLoginContinuation';

describe('staffLoginContinuation', () => {
  beforeEach(() => {
    storedCookie = undefined;
  });

  it('round-trips phone OTP hints inside the signed factor continuation', async () => {
    await issueStaffLoginContinuation({
      userId: '11111111-1111-4111-8111-111111111111',
      token: 'factor-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      postLoginHints: { phoneOtpChannel: 'max' },
    });

    await expect(readStaffLoginContinuation()).resolves.toMatchObject({
      userId: '11111111-1111-4111-8111-111111111111',
      token: 'factor-token',
      postLoginHints: { phoneOtpChannel: 'max' },
    });
  });
});
