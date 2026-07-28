import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireAdminWorkspaceApiContextMock } = vi.hoisted(() => ({
  requireAdminWorkspaceApiContextMock: vi.fn(),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireAdminWorkspaceApiContext: requireAdminWorkspaceApiContextMock,
}));

import { PATCH } from './route';

describe('PATCH /api/admin/users/[userId]/archive', () => {
  beforeEach(() => {
    requireAdminWorkspaceApiContextMock.mockReset();
  });

  it('returns the resolved-workspace denial instead of treating global admin as patient repair', async () => {
    requireAdminWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 }),
    });
    const res = await PATCH(
      new Request('http://localhost/api/admin/users/00000000-0000-4000-8000-000000000001/archive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      }),
      { params: Promise.resolve({ userId: '00000000-0000-4000-8000-000000000001' }) },
    );
    expect(res.status).toBe(403);
  });
});
