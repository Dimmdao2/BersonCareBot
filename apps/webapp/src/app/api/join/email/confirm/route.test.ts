import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieSetMock = vi.hoisted(() => vi.fn());
const verifyEmailProofMock = vi.hoisted(() => vi.fn());
const lookupContinuationMock = vi.hoisted(() => vi.fn());
const claimUnboundEmailProofMock = vi.hoisted(() => vi.fn());
const redeemEmailProofMock = vi.hoisted(() => vi.fn());
const findPublicEmailUserMock = vi.hoisted(() => vi.fn());
const findByUserIdMock = vi.hoisted(() => vi.fn());
const setSessionFromUserMock = vi.hoisted(() => vi.fn());
const clearContinuationMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSetMock }) }));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));
vi.mock('@/modules/auth/service', () => ({ setSessionFromUser: setSessionFromUserMock }));
vi.mock('@/modules/patient-invites/continuationCookie', () => ({
  readPatientInviteContinuationCookie: async () => 'continuation-token-with-at-least-thirty-two-characters',
  clearPatientInviteContinuationCookie: clearContinuationMock,
}));
vi.mock('@/modules/patient-invites/rateLimit', () => ({
  checkPatientInvitePublicRateLimit: async () => 'ok',
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    patientInvites: {
      verifyEmailProof: verifyEmailProofMock,
      lookupContinuation: lookupContinuationMock,
      claimUnboundEmailProof: claimUnboundEmailProofMock,
      redeemEmailProof: redeemEmailProofMock,
    },
    emailOtpPublicDb: { findPublicEmailUser: findPublicEmailUserMock },
    userByPhone: { findByUserId: findByUserIdMock },
  }),
}));

import { POST } from './route';

const patientUserId = '20000000-0000-4000-8000-000000000003';
const organizationId = '10000000-0000-4000-8000-000000000001';

function request() {
  return new Request('http://localhost/api/join/email/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'NEW@example.test', code: '123456' }),
  });
}

describe('POST patient invite email confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyEmailProofMock.mockResolvedValue({ ok: true });
    lookupContinuationMock.mockResolvedValue({
      ok: true,
      preview: {
        organizationTitle: 'Clinic',
        recipientHint: null,
        inviteExpiresAt: '2026-07-22T00:00:00.000Z',
        recipientBinding: 'unbound_email_claim',
      },
    });
    claimUnboundEmailProofMock.mockResolvedValue({ ok: true, organizationId, patientUserId });
    findByUserIdMock.mockResolvedValue({ userId: patientUserId, role: 'client' });
    setSessionFromUserMock.mockResolvedValue(undefined);
  });

  it('claims the unbound invite without generic email lookup or registration', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(claimUnboundEmailProofMock).toHaveBeenCalledWith(
      'continuation-token-with-at-least-thirty-two-characters',
      'new@example.test',
    );
    expect(findPublicEmailUserMock).not.toHaveBeenCalled();
    expect(redeemEmailProofMock).not.toHaveBeenCalled();
    expect(findByUserIdMock).toHaveBeenCalledWith(patientUserId);
    expect(setSessionFromUserMock).toHaveBeenCalledOnce();
    expect(cookieSetMock).toHaveBeenCalledWith(
      expect.any(String),
      organizationId,
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expect(clearContinuationMock).toHaveBeenCalledOnce();
  });

  it('returns 409 on a foreign canonical email with no partial session mutation', async () => {
    claimUnboundEmailProofMock.mockResolvedValue({ ok: false, code: 'conflicting_identity' });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: 'conflicting_identity' });
    expect(findPublicEmailUserMock).not.toHaveBeenCalled();
    expect(findByUserIdMock).not.toHaveBeenCalled();
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
    expect(cookieSetMock).not.toHaveBeenCalled();
    expect(clearContinuationMock).not.toHaveBeenCalled();
  });

  it('retries the same committed claim when the first session write fails', async () => {
    setSessionFromUserMock.mockRejectedValueOnce(new Error('simulated_session_write_failure'));

    await expect(POST(request())).rejects.toThrow('simulated_session_write_failure');
    expect(claimUnboundEmailProofMock).toHaveBeenCalledOnce();
    expect(cookieSetMock).not.toHaveBeenCalled();
    expect(clearContinuationMock).not.toHaveBeenCalled();

    const retry = await POST(request());

    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ ok: true });
    expect(verifyEmailProofMock).toHaveBeenCalledTimes(2);
    expect(lookupContinuationMock).toHaveBeenCalledTimes(2);
    expect(claimUnboundEmailProofMock).toHaveBeenCalledTimes(2);
    expect(claimUnboundEmailProofMock).toHaveBeenNthCalledWith(
      2,
      'continuation-token-with-at-least-thirty-two-characters',
      'new@example.test',
    );
    expect(findPublicEmailUserMock).not.toHaveBeenCalled();
    expect(findByUserIdMock).toHaveBeenCalledTimes(2);
    expect(setSessionFromUserMock).toHaveBeenCalledTimes(2);
    expect(cookieSetMock).toHaveBeenCalledOnce();
    expect(clearContinuationMock).toHaveBeenCalledOnce();
  });
});
