import { beforeEach, describe, expect, it, vi } from 'vitest';

const readContinuationMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const startEmailProofMock = vi.hoisted(() => vi.fn());
const ensureAuthModulePortsBoundMock = vi.hoisted(() => vi.fn());

vi.mock('@/modules/patient-invites/continuationCookie', () => ({
  readPatientInviteContinuationCookie: () => readContinuationMock(),
}));
vi.mock('@/modules/patient-invites/rateLimit', () => ({
  checkPatientInvitePublicRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: () => ensureAuthModulePortsBoundMock(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ patientInvites: { startEmailProof: startEmailProofMock } }),
}));

import * as authChannelPolicy from '@/modules/auth/authChannelPolicy';
import { POST } from './route';

function request(email: string): Request {
  return new Request('http://localhost/api/join/email/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

describe('POST /api/join/email/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readContinuationMock.mockResolvedValue(
      'continuation-token-with-at-least-thirty-two-characters',
    );
    checkRateLimitMock.mockResolvedValue('ok');
    startEmailProofMock.mockResolvedValue({ ok: true, retryAfterSeconds: 60 });
  });

  it('rejects a disabled email channel before continuation, rate-limit, or proof work', async () => {
    const policy = vi.spyOn(authChannelPolicy, 'isAuthChannelEnabled').mockResolvedValue(false);
    try {
      const response = await POST(request('known@example.com'));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ ok: false, error: 'auth_channel_disabled' });
      expect(readContinuationMock).not.toHaveBeenCalled();
      expect(checkRateLimitMock).not.toHaveBeenCalled();
      expect(startEmailProofMock).not.toHaveBeenCalled();
    } finally {
      policy.mockRestore();
    }
  });

  it('keeps the existing proof path available when the channel is enabled', async () => {
    const policy = vi.spyOn(authChannelPolicy, 'isAuthChannelEnabled').mockResolvedValue(true);
    try {
      const response = await POST(request('known@example.com'));

      expect(response.status).toBe(200);
      expect(startEmailProofMock).toHaveBeenCalledWith(
        'continuation-token-with-at-least-thirty-two-characters',
        'known@example.com',
      );
    } finally {
      policy.mockRestore();
    }
  });
});
