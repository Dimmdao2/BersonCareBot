import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  archiveMock,
  findItemMock,
  buildAppDepsMock,
  requireAdminModeSessionMock,
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
} = vi.hoisted(() => {
  const archiveMockInner = vi.fn();
  const findItemMockInner = vi.fn();
  const requireAdminModeSessionMockInner = vi.fn();
  const requireDoctorWorkspaceApiContextMockInner = vi.fn();
  const withDoctorWorkspacePrincipalMockInner = vi.fn(
    (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
      const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
      if (!fn) throw new Error('principal_callback_required');
      return fn();
    },
  );
  return {
    archiveMock: archiveMockInner,
    findItemMock: findItemMockInner,
    requireAdminModeSessionMock: requireAdminModeSessionMockInner,
    requireDoctorWorkspaceApiContextMock: requireDoctorWorkspaceApiContextMockInner,
    withDoctorWorkspacePrincipalMock: withDoctorWorkspacePrincipalMockInner,
    buildAppDepsMock: vi.fn(() => ({
      references: {
        archiveItem: archiveMockInner,
        findItemById: findItemMockInner,
      },
    })),
  };
});

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock('@/modules/auth/requireAdminMode', () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
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

import { PATCH } from './route';

describe('PATCH /api/admin/references/[itemId]/archive', () => {
  beforeEach(() => {
    archiveMock.mockReset();
    findItemMock.mockReset();
    requireAdminModeSessionMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
        if (!fn) throw new Error('principal_callback_required');
        return fn();
      },
    );
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: 'org-1', session: { user: { userId: 'a1', role: 'admin' } } },
    });
  });

  it('returns 403 for doctor', async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 }),
    });
    const res = await PATCH(new Request('http://localhost/api/admin/references/x/archive'), {
      params: Promise.resolve({ itemId: 'x' }),
    });
    expect(res.status).toBe(403);
    expect(requireDoctorWorkspaceApiContextMock).not.toHaveBeenCalled();
  });

  it('archives for admin', async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: {
        user: { userId: 'a1', role: 'admin', displayName: 'A', bindings: {} },
        adminMode: true,
      },
    });
    findItemMock.mockResolvedValue({
      id: 'it1',
      categoryId: 'c',
      code: 'x',
      title: 'T',
      sortOrder: 1,
      isActive: true,
      deletedAt: null,
      metaJson: {},
    });
    const res = await PATCH(new Request('http://localhost/api/admin/references/it1/archive'), {
      params: Promise.resolve({ itemId: 'it1' }),
    });
    expect(res.status).toBe(200);
    expect(archiveMock).toHaveBeenCalledWith('it1');
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      expect.any(Function),
    );
  });
});
