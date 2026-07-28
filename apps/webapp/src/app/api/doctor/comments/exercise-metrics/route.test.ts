import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
    const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
    if (!fn) throw new Error('principal_callback_required');
    return fn();
  }),
);
const getInstanceByIdMock = vi.hoisted(() => vi.fn());
const getClientIdentityForOrganizationMock = vi.hoisted(() => vi.fn());
const listExerciseMetricsForWindowMock = vi.hoisted(() => vi.fn());

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
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: {
      getInstanceById: getInstanceByIdMock,
    },
    doctorClientsPort: {
      getClientIdentityForOrganization: getClientIdentityForOrganizationMock,
    },
    treatmentProgramProgress: {
      listExerciseMetricsForWindow: listExerciseMetricsForWindowMock,
    },
  }),
}));

import { GET } from './route';

const instanceId = '10000000-0000-4000-8000-000000000001';
const stageItemId = '20000000-0000-4000-8000-000000000002';
const patientUserId = '30000000-0000-4000-8000-000000000003';
const doctorUserId = '40000000-0000-4000-8000-000000000004';
const organizationId = '50000000-0000-4000-8000-000000000005';

const workspaceCtx = {
  session: { user: { userId: doctorUserId, role: 'doctor', bindings: {} } },
  organizationId,
  membershipId: '60000000-0000-4000-8000-000000000006',
  membershipRole: 'doctor',
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

const instance = {
  id: instanceId,
  organizationId,
  patientUserId,
  assignmentSource: 'doctor',
  stages: [{ items: [{ id: stageItemId }] }],
};

function request(itemId = stageItemId) {
  return new Request(
    `http://localhost/api/doctor/comments/exercise-metrics?instanceId=${instanceId}&stageItemId=${itemId}&windowDays=30`,
  );
}

describe('GET /api/doctor/comments/exercise-metrics', () => {
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
    getInstanceByIdMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    listExerciseMetricsForWindowMock.mockReset();

    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    getInstanceByIdMock.mockResolvedValue(instance);
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: patientUserId });
    listExerciseMetricsForWindowMock.mockResolvedValue([{ date: '2026-07-01', reps: 10 }]);
  });

  it('reads exercise metrics only after selected-workspace instance resolution', async () => {
    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(getInstanceByIdMock).toHaveBeenCalledWith(instanceId);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(
      patientUserId,
      organizationId,
    );
    expect(listExerciseMetricsForWindowMock).toHaveBeenCalledWith({
      instanceId,
      instanceStageItemId: stageItemId,
      windowDays: 30,
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
  });

  it('returns 404 for another organization before reading metrics', async () => {
    getInstanceByIdMock.mockResolvedValue({
      ...instance,
      organizationId: '70000000-0000-4000-8000-000000000007',
    });

    const res = await GET(request());

    expect(res.status).toBe(404);
    expect(listExerciseMetricsForWindowMock).not.toHaveBeenCalled();
  });

  it('returns 404 when stage item does not belong to the instance', async () => {
    const res = await GET(request('80000000-0000-4000-8000-000000000008'));

    expect(res.status).toBe(404);
    expect(listExerciseMetricsForWindowMock).not.toHaveBeenCalled();
  });
});
