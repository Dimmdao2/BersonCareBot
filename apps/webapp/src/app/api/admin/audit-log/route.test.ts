import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAdminModeSessionMock,
  requireDoctorWorkspaceApiContextMock,
  requirePlatformOperationsApiContextMock,
  withDoctorWorkspacePrincipalMock,
  getPoolMock,
  listAdminAuditLogMock,
  countOpenAutoMergeConflictsMock,
} = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  requireDoctorWorkspaceApiContextMock: vi.fn(),
  requirePlatformOperationsApiContextMock: vi.fn(),
  withDoctorWorkspacePrincipalMock: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  getPoolMock: vi.fn(() => ({})),
  listAdminAuditLogMock: vi.fn(),
  countOpenAutoMergeConflictsMock: vi.fn(),
}));

vi.mock('@/modules/auth/requireAdminMode', () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
  requirePlatformOperationsApiContext: requirePlatformOperationsApiContextMock,
}));

vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
    if (!fn) throw new Error('principal_callback_required');
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

vi.mock('@/app-layer/db/client', () => ({
  getPool: getPoolMock,
}));

vi.mock('@/app-layer/admin/auditLog', () => ({
  listAdminAuditLog: listAdminAuditLogMock,
  countOpenAutoMergeConflicts: countOpenAutoMergeConflictsMock,
}));

import { GET } from './route';

describe('GET /api/admin/audit-log', () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    requirePlatformOperationsApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    getPoolMock.mockClear();
    listAdminAuditLogMock.mockReset();
    countOpenAutoMergeConflictsMock.mockReset();
    countOpenAutoMergeConflictsMock.mockResolvedValue(0);
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
    requirePlatformOperationsApiContextMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: 'a1', role: 'admin' }, adminMode: true },
    });
  });

  it('returns 403 when not admin mode', async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await GET(new Request('http://localhost/api/admin/audit-log'));
    expect(res.status).toBe(403);
  });

  it('returns 400 on invalid date query', async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: 'a1', role: 'admin' } },
    });
    const res = await GET(new Request('http://localhost/api/admin/audit-log?from=not-a-date'));
    expect(res.status).toBe(400);
  });

  it('returns workspace gate response before audit reads', async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: 'a1', role: 'admin' } },
    });
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(
        JSON.stringify({ ok: false, error: 'doctor_workspace_membership_required' }),
        {
          status: 403,
        },
      ),
    });
    const res = await GET(new Request('http://localhost/api/admin/audit-log?page=1'));
    expect(res.status).toBe(403);
    expect(listAdminAuditLogMock).not.toHaveBeenCalled();
    expect(countOpenAutoMergeConflictsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when from is after to', async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: 'a1', role: 'admin' } },
    });
    const res = await GET(
      new Request('http://localhost/api/admin/audit-log?from=2026-04-10&to=2026-04-01'),
    );
    expect(res.status).toBe(400);
  });

  it('returns list when authorized', async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: 'a1', role: 'admin' } },
    });
    listAdminAuditLogMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    const res = await GET(new Request('http://localhost/api/admin/audit-log?page=1&limit=10'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      total: number;
      openAutoMergeConflictCount: number;
    };
    expect(body.ok).toBe(true);
    expect(body.total).toBe(0);
    expect(body.openAutoMergeConflictCount).toBe(0);
    expect(listAdminAuditLogMock).toHaveBeenCalled();
    expect(countOpenAutoMergeConflictsMock).toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      expect.any(Function),
    );
  });

  it('passes excludeSystemHealth to list when query flag set', async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: 'a1', role: 'admin' } },
    });
    listAdminAuditLogMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    const res = await GET(
      new Request('http://localhost/api/admin/audit-log?excludeSystemHealth=1'),
    );
    expect(res.status).toBe(200);
    expect(listAdminAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ excludeActionPrefix: 'system_health_' }),
    );
  });

  it('returns 400 when excludeSystemHealth and systemHealthOnly both set', async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: 'a1', role: 'admin' } },
    });
    const res = await GET(
      new Request('http://localhost/api/admin/audit-log?excludeSystemHealth=1&systemHealthOnly=1'),
    );
    expect(res.status).toBe(400);
    expect(listAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it('passes systemHealthScopeOnly when systemHealthOnly=1', async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: 'a1', role: 'admin' } },
    });
    listAdminAuditLogMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    const res = await GET(new Request('http://localhost/api/admin/audit-log?systemHealthOnly=1'));
    expect(res.status).toBe(200);
    expect(listAdminAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ systemHealthScopeOnly: true }),
    );
  });

  it('passes involvesPlatformUserId to list when valid uuid', async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: 'a1', role: 'admin' } },
    });
    listAdminAuditLogMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    const uid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const res = await GET(
      new Request(
        `http://localhost/api/admin/audit-log?involvesPlatformUserId=${encodeURIComponent(uid)}`,
      ),
    );
    expect(res.status).toBe(200);
    expect(listAdminAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ involvesPlatformUserId: uid }),
    );
  });

  describe('global admin (platform.operations)', () => {
    it('uses requirePlatformOperationsApiContext, never requireDoctorWorkspaceApiContext, and skips org scoping', async () => {
      requireAdminModeSessionMock.mockResolvedValue({
        ok: true,
        session: { user: { userId: 'a1', role: 'admin' }, adminMode: true },
      });
      listAdminAuditLogMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });
      const res = await GET(new Request('http://localhost/api/admin/audit-log?page=1'));
      expect(res.status).toBe(200);
      expect(requirePlatformOperationsApiContextMock).toHaveBeenCalled();
      expect(requireDoctorWorkspaceApiContextMock).not.toHaveBeenCalled();
      expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
      expect(listAdminAuditLogMock).toHaveBeenCalled();
    });

    it("returns the platform gate's response when the global admin is restricted (e.g. 2FA)", async () => {
      requireAdminModeSessionMock.mockResolvedValue({
        ok: true,
        session: { user: { userId: 'a1', role: 'admin' }, adminMode: true },
      });
      requirePlatformOperationsApiContextMock.mockResolvedValueOnce({
        ok: false,
        response: new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 }),
      });
      const res = await GET(new Request('http://localhost/api/admin/audit-log?page=1'));
      expect(res.status).toBe(403);
      expect(getPoolMock).not.toHaveBeenCalled();
      expect(listAdminAuditLogMock).not.toHaveBeenCalled();
    });
  });
});
