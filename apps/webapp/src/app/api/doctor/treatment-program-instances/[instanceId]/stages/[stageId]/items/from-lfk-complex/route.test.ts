import { beforeEach, describe, expect, it, vi } from 'vitest';

const expandMock = vi.fn();
const getInstanceByIdMock = vi.fn();
const getClientIdentityMock = vi.fn();

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
    const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
    if (!fn) throw new Error('principal_callback_required');
    return fn();
  }),
);

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: {
      getInstanceById: getInstanceByIdMock,
      doctorExpandLfkComplexIntoStage: expandMock,
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

const INSTANCE_ID = '11111111-1111-4111-8111-111111111111';
const STAGE_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_ID = '33333333-3333-4333-8333-333333333333';
const GROUP_ID = '44444444-4444-4444-8444-444444444444';
const COMPLEX_ID = '55555555-5555-4555-8555-555555555555';
const DOCTOR_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const workspaceCtx = {
  session: { user: { userId: DOCTOR_ID, role: 'doctor', bindings: {} } },
  organizationId: '66666666-6666-4666-8666-666666666666',
  membershipId: '77777777-7777-4777-8777-777777777777',
  membershipRole: 'doctor',
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

function postRequest(body: unknown) {
  return POST(
    new Request(
      `http://localhost/api/doctor/treatment-program-instances/${INSTANCE_ID}/stages/${STAGE_ID}/items/from-lfk-complex`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ instanceId: INSTANCE_ID, stageId: STAGE_ID }) },
  );
}

describe('POST .../from-lfk-complex', () => {
  beforeEach(() => {
    expandMock.mockReset();
    getInstanceByIdMock.mockReset();
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
      id: INSTANCE_ID,
      organizationId: workspaceCtx.organizationId,
      patientUserId: PATIENT_ID,
    });
    getClientIdentityMock.mockResolvedValue({
      userId: PATIENT_ID,
      displayName: 'P',
      phone: '+70000000000',
      bindings: {},
      createdAt: null,
      isBlocked: false,
      blockedReason: null,
      isArchived: false,
    });
  });

  it('returns 404 when patient is not in doctor clients', async () => {
    getClientIdentityMock.mockResolvedValueOnce(null);
    const res = await postRequest({ complexTemplateId: COMPLEX_ID, groupId: GROUP_ID });
    expect(res.status).toBe(404);
    expect(expandMock).not.toHaveBeenCalled();
  });

  it('expands when client identity exists', async () => {
    expandMock.mockResolvedValue({ items: [{ id: 'item-1' }] });
    const res = await postRequest({ complexTemplateId: COMPLEX_ID, groupId: GROUP_ID });
    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspaceCtx,
      expect.any(Function),
    );
    expect(expandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: INSTANCE_ID,
        stageId: STAGE_ID,
        complexTemplateId: COMPLEX_ID,
        groupId: GROUP_ID,
        actorId: DOCTOR_ID,
      }),
    );
  });
});
