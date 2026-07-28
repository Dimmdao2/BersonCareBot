import { beforeEach, describe, expect, it, vi } from 'vitest';

const getInstanceByIdMock = vi.fn();
const doctorApplyInstanceEditorBatchMock = vi.fn();
const getClientIdentityMock = vi.fn();

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
    const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
    if (!fn) throw new Error('principal_callback_required');
    return fn();
  }),
);

vi.mock('@/app-layer/cache/revalidatePatientTreatmentProgramUi', () => ({
  revalidatePatientTreatmentProgramUi: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: {
      getInstanceById: getInstanceByIdMock,
      doctorApplyInstanceEditorBatch: doctorApplyInstanceEditorBatchMock,
    },
    doctorClientsPort: {
      getClientIdentity: getClientIdentityMock,
    },
  }),
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

import { POST } from './route';

const instanceId = '11111111-1111-4111-8111-111111111111';
const patientUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const doctorUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const workspaceCtx = {
  session: { user: { userId: doctorUserId, role: 'doctor', bindings: {} } },
  organizationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  membershipId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  membershipRole: 'doctor',
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

const emptyDraft = {
  stageMetadata: {},
  groupPatches: {},
  itemPatches: {},
  stageOrder: null,
  stageCreates: [],
  groupCreates: [],
  itemCreates: [],
  itemDeletes: {},
  itemReorders: {},
  groupReorders: {},
  groupHides: {},
  itemStructuralPatches: {},
};

describe('POST .../editor-batch', () => {
  beforeEach(() => {
    getInstanceByIdMock.mockReset();
    doctorApplyInstanceEditorBatchMock.mockReset();
    getClientIdentityMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
        if (!fn) throw new Error('principal_callback_required');
        return fn();
      },
    );
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    getInstanceByIdMock.mockResolvedValue({
      id: instanceId,
      organizationId: workspaceCtx.organizationId,
      patientUserId,
    });
    getClientIdentityMock.mockResolvedValue({ userId: patientUserId, displayName: 'Пациент' });
    doctorApplyInstanceEditorBatchMock.mockResolvedValue({
      id: instanceId,
      patientUserId,
      stages: [],
    });
  });

  it('401 without session', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    });
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: emptyDraft }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(401);
  });

  it('400 on invalid body', async () => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notDraft: true }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(400);
  });

  it('applies batch draft', async () => {
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: emptyDraft }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceCtx,
      expect.any(Function),
    );
    expect(doctorApplyInstanceEditorBatchMock).toHaveBeenCalledWith({
      instanceId,
      actorId: doctorUserId,
      draft: emptyDraft,
    });
  });

  it('403 for non-doctor role', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    });
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: emptyDraft }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(403);
    expect(doctorApplyInstanceEditorBatchMock).not.toHaveBeenCalled();
  });

  it('404 when instance not found', async () => {
    getInstanceByIdMock.mockResolvedValue(null);
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: emptyDraft }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(404);
    expect(doctorApplyInstanceEditorBatchMock).not.toHaveBeenCalled();
  });

  it('400 when apply throws catalog unavailable', async () => {
    doctorApplyInstanceEditorBatchMock.mockRejectedValue(
      new Error('Объект для типа «exercise» не найден или недоступен'),
    );
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: emptyDraft }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(400);
  });

  it('404 when patient is not in doctor clients', async () => {
    getClientIdentityMock.mockResolvedValue(null);
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: emptyDraft }),
      }),
      { params: Promise.resolve({ instanceId }) },
    );
    expect(res.status).toBe(404);
    expect(doctorApplyInstanceEditorBatchMock).not.toHaveBeenCalled();
  });
});
