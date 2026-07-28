import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminModeSessionMock = vi.hoisted(() => vi.fn());
vi.mock('@/modules/auth/requireAdminMode', () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

import { GET } from './route';

describe('GET /api/doctor/clients/merge-user-search', () => {
  beforeEach(() =>
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: 'admin' } },
    }),
  );

  it('preserves the platform guard', async () => {
    requireAdminModeSessionMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    expect((await GET()).status).toBe(403);
  });

  it('is a PII-free unavailable surface', async () => {
    const response = await GET();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'not_available' });
  });
});
