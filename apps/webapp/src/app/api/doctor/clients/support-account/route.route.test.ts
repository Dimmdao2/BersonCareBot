import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requirePlatformOperationsApiContext: vi.fn(),
  applyPlatformSupportAccountAction: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    doctorClientsPort: {
      applyPlatformSupportAccountAction: fakes.applyPlatformSupportAccountAction,
    },
  }),
}));

import { POST } from './route';

const firstAccountId = '00000000-0000-4000-8000-000000000001';
const secondAccountId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000099';

function request(body: unknown): Request {
  return new Request('http://localhost/api/doctor/clients/support-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requirePlatformOperationsApiContext.mockResolvedValue({
    ok: true,
    session: { user: { userId: actorId } },
  });
  fakes.applyPlatformSupportAccountAction.mockResolvedValue({ changed: true });
});

describe('POST /api/doctor/clients/support-account', () => {
  it('revokes only the selected contact from the selected account through the named door', async () => {
    const response = await POST(
      request({
        action: 'revoke_contact',
        userId: secondAccountId,
        contactKind: 'phone',
        valueNormalized: '+79990000002',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fakes.applyPlatformSupportAccountAction).toHaveBeenCalledExactlyOnceWith({
      action: 'revoke_contact',
      userId: secondAccountId,
      contactKind: 'phone',
      valueNormalized: '+79990000002',
    });
  });

  it('revokes only the selected channel binding from the selected account', async () => {
    const response = await POST(
      request({
        action: 'revoke_channel_binding',
        userId: secondAccountId,
        channelCode: 'telegram',
        externalId: '123456',
      }),
    );

    expect(response.status).toBe(200);
    expect(fakes.applyPlatformSupportAccountAction).toHaveBeenCalledExactlyOnceWith({
      action: 'revoke_channel_binding',
      userId: secondAccountId,
      channelCode: 'telegram',
      externalId: '123456',
    });
  });

  it('blocks one selected account and unblocks the other without swapping ids', async () => {
    await POST(
      request({ action: 'set_blocked', userId: firstAccountId, blocked: true, reason: 'review' }),
    );
    await POST(request({ action: 'set_blocked', userId: secondAccountId, blocked: false }));

    expect(fakes.applyPlatformSupportAccountAction).toHaveBeenCalledTimes(2);
    expect(fakes.applyPlatformSupportAccountAction).toHaveBeenNthCalledWith(1, {
      action: 'set_blocked',
      userId: firstAccountId,
      blocked: true,
      reason: 'review',
      actorId,
    });
    // Unblock carries no reason — the door must not go on marking the account as blocked "for review".
    expect(fakes.applyPlatformSupportAccountAction).toHaveBeenNthCalledWith(2, {
      action: 'set_blocked',
      userId: secondAccountId,
      blocked: false,
      reason: null,
      actorId,
    });
  });

  it('defaults the block reason to "support" when the caller omits one', async () => {
    await POST(request({ action: 'set_blocked', userId: firstAccountId, blocked: true }));

    expect(fakes.applyPlatformSupportAccountAction).toHaveBeenCalledExactlyOnceWith({
      action: 'set_blocked',
      userId: firstAccountId,
      blocked: true,
      reason: 'support',
      actorId,
    });
  });

  it('rejects an invalid body without reaching the door', async () => {
    const response = await POST(request({ action: 'set_blocked', userId: 'not-a-uuid', blocked: true }));

    expect(response.status).toBe(400);
    expect(fakes.applyPlatformSupportAccountAction).not.toHaveBeenCalled();
  });

  it('refuses when the caller is not global support', async () => {
    fakes.requirePlatformOperationsApiContext.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    });

    const response = await POST(
      request({ action: 'set_blocked', userId: firstAccountId, blocked: true }),
    );

    expect(response.status).toBe(403);
    expect(fakes.applyPlatformSupportAccountAction).not.toHaveBeenCalled();
  });
});
