/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSessionMock,
  listFoldersMock,
  listAllMock,
  createFolderMock,
  pgExistsMock,
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  listFoldersMock: vi.fn(),
  listAllMock: vi.fn(),
  createFolderMock: vi.fn(),
  pgExistsMock: vi.fn(),
  requireDoctorWorkspaceApiContextMock: vi.fn(),
  withDoctorWorkspacePrincipalMock: vi.fn(
    (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
      const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
      if (!fn) throw new Error('principal_callback_required');
      return fn();
    },
  ),
}));

vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: getSessionMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    media: {
      listFolders: listFoldersMock,
      listAllFolders: listAllMock,
      createFolder: createFolderMock,
    },
  }),
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

vi.mock('@/app-layer/media/mediaFoldersRepo', () => ({
  pgFolderExists: (...a: unknown[]) => pgExistsMock(...a),
}));

const validateParentMock = vi.fn();
vi.mock('@/app-layer/media/clientMediaFolders', () => ({
  pgValidateManualFolderParent: (...a: unknown[]) => validateParentMock(...a),
}));

import { GET, POST } from './route';

describe('GET /api/admin/media/folders', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listFoldersMock.mockReset();
    listAllMock.mockReset();
    createFolderMock.mockReset();
    pgExistsMock.mockReset();
    validateParentMock.mockReset();
    validateParentMock.mockResolvedValue({ ok: true });
    requireDoctorWorkspaceApiContextMock.mockImplementation(async () => {
      const session = await getSessionMock();
      if (!session) return { ok: false, response: new Response(null, { status: 401 }) };
      return {
        ok: true,
        ctx: {
          organizationId: 'org-1',
          session: { ...session, user: { ...session.user, userId: session.user.userId ?? 'u1' } },
        },
      };
    });
  });

  it('returns 401 without session', async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/admin/media/folders'));
    expect(res.status).toBe(401);
  });

  it('returns flat list when flat=true', async () => {
    getSessionMock.mockResolvedValue({ user: { role: 'doctor' } });
    listAllMock.mockResolvedValue([
      { id: 'f1', parentId: null, name: 'A', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const res = await GET(new Request('http://localhost/api/admin/media/folders?flat=true'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; items?: unknown[] };
    expect(j.ok).toBe(true);
    expect(j.items).toHaveLength(1);
    expect(listAllMock).toHaveBeenCalled();
  });

  it('returns children for parentId', async () => {
    getSessionMock.mockResolvedValue({ user: { role: 'doctor' } });
    const pid = '11111111-1111-4111-8111-111111111111';
    listFoldersMock.mockResolvedValue([]);
    const res = await GET(new Request(`http://localhost/api/admin/media/folders?parentId=${pid}`));
    expect(res.status).toBe(200);
    expect(listFoldersMock).toHaveBeenCalledWith(pid);
  });
});

describe('POST /api/admin/media/folders', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    createFolderMock.mockReset();
    pgExistsMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: 'org-1', session: { user: { userId: 'u1', role: 'doctor' } } },
    });
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
        if (!fn) throw new Error('principal_callback_required');
        return fn();
      },
    );
    validateParentMock.mockReset();
    validateParentMock.mockResolvedValue({ ok: true });
    getSessionMock.mockResolvedValue({ user: { userId: 'u1', role: 'doctor' } });
  });

  it('returns 404 when parent missing', async () => {
    pgExistsMock.mockResolvedValue(false);
    const pid = '11111111-1111-4111-8111-111111111111';
    const res = await POST(
      new Request('http://localhost/api/admin/media/folders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Sub', parentId: pid }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when parent is system-managed folder', async () => {
    const pid = '11111111-1111-4111-8111-111111111111';
    validateParentMock.mockResolvedValue({ ok: false, error: 'system_folder_readonly' });
    const res = await POST(
      new Request('http://localhost/api/admin/media/folders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Sub', parentId: pid }),
      }),
    );
    expect(res.status).toBe(409);
    expect(createFolderMock).not.toHaveBeenCalled();
  });

  it('returns 200 when create succeeds', async () => {
    pgExistsMock.mockResolvedValue(true);
    createFolderMock.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      parentId: '11111111-1111-4111-8111-111111111111',
      name: 'Sub',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const pid = '11111111-1111-4111-8111-111111111111';
    const res = await POST(
      new Request('http://localhost/api/admin/media/folders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Sub', parentId: pid }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; folder?: { name: string } };
    expect(j.ok).toBe(true);
    expect(j.folder?.name).toBe('Sub');
    expect(createFolderMock).toHaveBeenCalledWith({
      name: 'Sub',
      parentId: pid,
      createdBy: 'u1',
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      expect.any(Function),
    );
  });
});
