/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireDoctorWorkspaceApiContextMock = vi.fn();
const withDoctorWorkspacePrincipalMock = vi.fn(
  (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
    const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
    if (!fn) throw new Error('principal_callback_required');
    return fn();
  },
);
const getInstanceMock = vi.fn();
const getClientIdentityForOrganizationMock = vi.fn();
const listDiscussionPageMergedMock = vi.fn();

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

vi.mock('@/modules/program-item-discussion/listDiscussionPage', () => ({
  listDiscussionPageMerged: (...args: unknown[]) => listDiscussionPageMergedMock(...args),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: { getInstanceById: getInstanceMock },
    doctorClientsPort: { getClientIdentityForOrganization: getClientIdentityForOrganizationMock },
    programItemDiscussion: {
      getLastReadAtForViewer: async () => null,
    },
  }),
}));

import { GET } from './route';

const instanceId = '11111111-1111-4111-8111-111111111111';
const stageItemId = '22222222-2222-4222-8222-222222222222';
const organizationId = '55555555-5555-4555-8555-555555555555';
const workspaceCtx = {
  session: {
    user: { userId: '33333333-3333-4333-8333-333333333333', role: 'doctor', bindings: {} },
  },
  organizationId,
  membershipId: '66666666-6666-4666-8666-666666666666',
  membershipRole: 'doctor',
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

describe('GET doctor program item discussion', () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
        if (!fn) throw new Error('principal_callback_required');
        return fn();
      },
    );
    getInstanceMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    listDiscussionPageMergedMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    getClientIdentityForOrganizationMock.mockResolvedValue({
      userId: '00000000-0000-4000-8000-000000000001',
    });
    getInstanceMock.mockResolvedValue({
      organizationId,
      assignmentSource: 'doctor',
      patientUserId: '00000000-0000-4000-8000-000000000001',
      stages: [{ items: [{ id: stageItemId, snapshot: { title: 'Присед' } }] }],
    });
    listDiscussionPageMergedMock.mockResolvedValue({
      page: [{ id: 'msg-1', body: 'Тест', createdAt: '2026-06-01T10:00:00.000Z' }],
      nextCursor: null,
      hasMore: false,
      totalCount: 1,
    });
  });

  it('returns messages for doctor-assigned program item', async () => {
    const res = await GET(new Request(`http://localhost/discussion?limit=30`), {
      params: Promise.resolve({ instanceId, stageItemId }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.messages).toHaveLength(1);
    expect(data.totalCount).toBe(1);
    expect(listDiscussionPageMergedMock).toHaveBeenCalledWith(
      expect.objectContaining({ stageItemId }),
    );
  });

  it('rejects promo assignment source', async () => {
    getInstanceMock.mockResolvedValue({
      organizationId,
      assignmentSource: 'promo',
      patientUserId: '00000000-0000-4000-8000-000000000001',
      stages: [{ items: [{ id: stageItemId, snapshot: {} }] }],
    });

    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId, stageItemId }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('program_not_doctor_assigned');
  });

  it('returns 401 without session', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 }),
    });
    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId, stageItemId }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when doctor has no access to patient', async () => {
    getClientIdentityForOrganizationMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId, stageItemId }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
    expect(listDiscussionPageMergedMock).not.toHaveBeenCalled();
  });

  it('returns 404 when instance belongs to another organization', async () => {
    getInstanceMock.mockResolvedValue({
      organizationId: '77777777-7777-4777-8777-777777777777',
      assignmentSource: 'doctor',
      patientUserId: '00000000-0000-4000-8000-000000000001',
      stages: [{ items: [{ id: stageItemId, snapshot: {} }] }],
    });
    const res = await GET(new Request(`http://localhost/discussion`), {
      params: Promise.resolve({ instanceId, stageItemId }),
    });
    expect(res.status).toBe(404);
    expect(listDiscussionPageMergedMock).not.toHaveBeenCalled();
  });
});
