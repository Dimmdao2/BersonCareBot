import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const commentId = '00000000-0000-4000-8000-000000000001';
const authorId = '00000000-0000-4000-8000-0000000000a1';
const otherUserId = '00000000-0000-4000-8000-0000000000a2';
const organizationId = '10000000-0000-4000-8000-000000000001';
const otherOrganizationId = '20000000-0000-4000-8000-000000000002';

const sampleItem = {
  id: commentId,
  organizationId,
  authorId,
  targetType: 'program_instance' as const,
  targetId: '00000000-0000-4000-8000-0000000000b1',
  commentType: 'clinical_note' as const,
  body: 'Note',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const {
  getByIdMock,
  updateMock,
  deleteMock,
  buildAppDepsMock,
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
} = vi.hoisted(() => {
  const getByIdMockInner = vi.fn();
  const updateMockInner = vi.fn();
  const deleteMockInner = vi.fn();
  const requireDoctorWorkspaceApiContextMockInner = vi.fn();
  const withDoctorWorkspacePrincipalMockInner = vi.fn(
    (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
      const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
      if (!fn) throw new Error('principal_callback_required');
      return fn();
    },
  );
  return {
    getByIdMock: getByIdMockInner,
    updateMock: updateMockInner,
    deleteMock: deleteMockInner,
    requireDoctorWorkspaceApiContextMock: requireDoctorWorkspaceApiContextMockInner,
    withDoctorWorkspacePrincipalMock: withDoctorWorkspacePrincipalMockInner,
    buildAppDepsMock: vi.fn(() => ({
      comments: {
        getById: getByIdMockInner,
        update: updateMockInner,
        delete: deleteMockInner,
      },
    })),
  };
});

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
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

import { DELETE, GET, PATCH } from './route';

const params = Promise.resolve({ id: commentId });

describe('/api/doctor/comments/[id]', () => {
  beforeEach(() => {
    getByIdMock.mockClear();
    updateMock.mockClear();
    deleteMock.mockClear();
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
      ctx: {
        organizationId,
        session: { user: { userId: otherUserId, role: 'doctor', displayName: 'D', bindings: {} } },
      },
    });
  });

  it('GET returns 404 when missing', async () => {
    getByIdMock.mockRejectedValue(new Error('not_found'));
    const res = await GET(new Request('http://localhost/api/doctor/comments/x'), { params });
    expect(res.status).toBe(404);
  });

  it('GET returns item', async () => {
    getByIdMock.mockResolvedValue(sampleItem);
    const res = await GET(new Request(`http://localhost/api/doctor/comments/${commentId}`), {
      params,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; item: typeof sampleItem };
    expect(data.ok).toBe(true);
    expect(data.item.id).toBe(commentId);
  });

  it('GET hides comments from another organization', async () => {
    getByIdMock.mockResolvedValue({ ...sampleItem, organizationId: otherOrganizationId });
    const res = await GET(new Request(`http://localhost/api/doctor/comments/${commentId}`), {
      params,
    });
    expect(res.status).toBe(404);
  });

  it('GET hides legacy unowned comments', async () => {
    getByIdMock.mockResolvedValue({ ...sampleItem, organizationId: null });
    const res = await GET(new Request(`http://localhost/api/doctor/comments/${commentId}`), {
      params,
    });
    expect(res.status).toBe(404);
  });

  it('PATCH returns 403 for non-author non-admin', async () => {
    getByIdMock.mockResolvedValue(sampleItem);
    const res = await PATCH(
      new Request(`http://localhost/api/doctor/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'Changed' }),
      }),
      { params },
    );
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('PATCH allows admin', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: otherUserId, role: 'admin', displayName: 'A', bindings: {} } },
      },
    });
    getByIdMock.mockResolvedValue(sampleItem);
    updateMock.mockResolvedValue({ ...sampleItem, body: 'Changed' });
    const res = await PATCH(
      new Request(`http://localhost/api/doctor/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'Changed' }),
      }),
      { params },
    );
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(commentId, { body: 'Changed', commentType: undefined });
  });

  it('PATCH allows author', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: authorId, role: 'doctor', displayName: 'D', bindings: {} } },
      },
    });
    getByIdMock.mockResolvedValue(sampleItem);
    updateMock.mockResolvedValue({ ...sampleItem, body: 'Changed' });
    const res = await PATCH(
      new Request(`http://localhost/api/doctor/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'Changed' }),
      }),
      { params },
    );
    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
  });

  it('PATCH returns 404 for legacy unowned comments', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: authorId, role: 'doctor', displayName: 'D', bindings: {} } },
      },
    });
    getByIdMock.mockResolvedValue({ ...sampleItem, organizationId: null });
    const res = await PATCH(
      new Request(`http://localhost/api/doctor/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'Changed' }),
      }),
      { params },
    );
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('DELETE returns 403 for non-author non-admin', async () => {
    getByIdMock.mockResolvedValue(sampleItem);
    const res = await DELETE(new Request(`http://localhost/api/doctor/comments/${commentId}`), {
      params,
    });
    expect(res.status).toBe(403);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('DELETE allows author', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: authorId, role: 'doctor', displayName: 'D', bindings: {} } },
      },
    });
    getByIdMock.mockResolvedValue(sampleItem);
    deleteMock.mockResolvedValue(undefined);
    const res = await DELETE(new Request(`http://localhost/api/doctor/comments/${commentId}`), {
      params,
    });
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith(commentId);
  });

  it('DELETE returns 404 for legacy unowned comments', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: authorId, role: 'doctor', displayName: 'D', bindings: {} } },
      },
    });
    getByIdMock.mockResolvedValue({ ...sampleItem, organizationId: null });
    const res = await DELETE(new Request(`http://localhost/api/doctor/comments/${commentId}`), {
      params,
    });
    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
