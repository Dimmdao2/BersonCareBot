import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession, UserRole } from '@/shared/types/session';
import type {
  OrganizationMembershipContext,
  OrganizationResolution,
} from '@/modules/organization-membership/service';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';

vi.mock('@bersoncare/db-principal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bersoncare/db-principal')>();
  return {
    ...actual,
    ensureDbPrincipalContext: vi.fn(),
    enterWithDbPatientPrincipal: vi.fn(),
    enterWithDbPlatformPrincipal: vi.fn(),
    enterWithDbStaffPrincipal: vi.fn(),
    getCurrentDbPrincipal: vi.fn(() => undefined),
    isDbPrincipalPlatformUserId: vi.fn(() => false),
  };
});

vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));

vi.mock('@/app-layer/platform-access', () => ({
  patientClientBusinessGate: vi.fn(),
  resolvePlatformAccessContext: vi.fn(),
}));

vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: vi.fn(),
  getCurrentSessionForIdentitySelf: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: vi.fn(),
}));

vi.mock('@/modules/auth/authChannelPolicy', () => ({
  getOAuthProviderPolicyDetail: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/modules/auth/authChannelPolicyAdmin', () => ({
  getAuthChannelPolicyDetail: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(<T>(_ctx: unknown, callback: () => T): T => callback()),
}));

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isDbPrincipalPlatformUserId } from '@bersoncare/db-principal';
import { getCurrentSession } from '@/modules/auth/service';
import { PATCH as patchTask } from '@/app/api/doctor/tasks/[taskId]/route';
import { GET as getStaffSecurityStatus } from '@/app/api/account/security/status/route';
import { GET as getPlatformSettings } from '@/app/api/platform/settings/route';

type AppDeps = ReturnType<typeof buildAppDeps>;

const CLINIC_A = '11111111-1111-4111-8111-111111111111';
const CLINIC_B = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';

const resolveOrganizationForUser =
  vi.fn<AppDeps['organizationMembership']['resolveOrganizationForUser']>();
const getTaskByIdForOwner = vi.fn<AppDeps['specialistTasks']['getByIdForOwner']>();
const updateTask = vi.fn<AppDeps['specialistTasks']['update']>();
const getSecurityStatus = vi.fn<AppDeps['staffSecurity']['getStatus']>();
const listSettingsByScope = vi.fn<AppDeps['systemSettings']['listSettingsByScope']>();

const fakeDeps = {
  organizationMembership: {
    resolveOrganizationForUser,
  },
  specialistTasks: {
    getByIdForOwner: getTaskByIdForOwner,
    update: updateTask,
  },
  staffSecurity: {
    getStatus: getSecurityStatus,
  },
  systemSettings: {
    listSettingsByScope,
  },
  // §5a/2.1a: cabinet entry is its own ladder rung and the guard fails closed when it cannot be
  // resolved. This suite is about the CLINIC boundary, so entry stays open here — otherwise every
  // case below would stop at the cabinet door and prove nothing about the wall it targets.
  orgEntitlements: {
    resolveCabinetAccess: async () => ({
      state: 'full_access',
      policySource: 'system',
      warning: null,
    }),
    resolveMechanicAccess: async (_organizationId: string, mechanic: string) => ({
      mechanic,
      state: 'full_access',
      policySource: 'system',
      warning: null,
    }),
  },
} as unknown as Pick<
  AppDeps,
  | 'organizationMembership'
  | 'specialistTasks'
  | 'orgEntitlements'
  | 'staffSecurity'
  | 'systemSettings'
>;

const getCurrentSessionMock = vi.mocked(getCurrentSession);
const buildAppDepsMock = vi.mocked(buildAppDeps);

function session(
  role: UserRole,
  options: {
    securityFactorRequired?: boolean;
    staffSecurity?: AppSession['staffSecurity'];
  } = {},
): AppSession {
  return {
    user: {
      userId: `${role}-test-user`,
      role,
      displayName: role,
      bindings: {},
      securityFactorRequired: options.securityFactorRequired,
    },
    issuedAt: 1,
    expiresAt: 2,
    staffSecurity: options.staffSecurity,
  };
}

function doctorMembership(platformUserId: string): OrganizationMembershipContext {
  return {
    membershipId: 'membership-a',
    organizationId: CLINIC_A,
    platformUserId,
    role: 'doctor',
    specialistId: 'specialist-a',
    canManageOrganization: false,
    canManageAllSpecialists: false,
    canAccessClinicalWorkspace: true,
    doctorScreensDisabled: false,
  };
}

function taskPatchRequest(): Request {
  return new Request(`https://app.example.test/api/doctor/tasks/${TASK_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Changed' }),
  });
}

function invokeTaskPatchRoute() {
  return patchTask(taskPatchRequest(), {
    params: Promise.resolve({ taskId: TASK_ID }),
  });
}

async function expectRouteError(status: number, error: string): Promise<void> {
  const response = await invokeTaskPatchRoute();
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({ ok: false, error });
}

beforeEach(() => {
  vi.clearAllMocks();
  buildAppDepsMock.mockReturnValue(fakeDeps as AppDeps);
  getCurrentSessionMock.mockResolvedValue(null);
  resolveOrganizationForUser.mockResolvedValue({
    ok: false,
    reason: 'no_active_membership',
  });
  getTaskByIdForOwner.mockResolvedValue(null);
  getSecurityStatus.mockResolvedValue(null);
  listSettingsByScope.mockResolvedValue([]);
});

describe('doctor request access boundary', () => {
  it.each([
    ['an unsigned request', null],
    ['a patient session', session('client')],
  ])('keeps %s out of the doctor API', async (_case, candidate) => {
    getCurrentSessionMock.mockResolvedValue(candidate);

    await expectRouteError(401, 'unauthorized');
    expect(resolveOrganizationForUser).not.toHaveBeenCalled();
  });

  it('fails closed before membership lookup when staff factor verification is required', async () => {
    getCurrentSessionMock.mockResolvedValue(session('doctor', { securityFactorRequired: true }));

    await expectRouteError(403, 'forbidden');
    expect(resolveOrganizationForUser).not.toHaveBeenCalled();
  });

  it.each(['recovery', 'recovery_confirmation'] as const)(
    'keeps a %s session out of the doctor workspace until recovery is complete',
    async (assurance) => {
      getCurrentSessionMock.mockResolvedValue(
        session('doctor', { staffSecurity: { assurance, verifiedAt: 1 } }),
      );

      await expectRouteError(403, 'forbidden');
      expect(resolveOrganizationForUser).not.toHaveBeenCalled();
    },
  );

  it('keeps the self-security API reachable during recovery', async () => {
    getCurrentSessionMock.mockResolvedValue(
      session('doctor', { staffSecurity: { assurance: 'recovery', verifiedAt: 1 } }),
    );

    const response = await getStaffSecurityStatus();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, status: null });
  });

  it('keeps platform operations closed when an enrolled factor is not verified in-session', async () => {
    vi.mocked(isDbPrincipalPlatformUserId).mockReturnValue(true);
    const adminSession = session('admin', {
      securityFactorRequired: true,
    });
    getCurrentSessionMock.mockResolvedValue({
      ...adminSession,
      user: { ...adminSession.user, userId: '44444444-4444-4444-8444-444444444444' },
    });

    const response = await getPlatformSettings();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'forbidden' });
    expect(listSettingsByScope).not.toHaveBeenCalled();
  });

  it('rejects a doctor without an active organization membership', async () => {
    getCurrentSessionMock.mockResolvedValue(session('doctor'));

    await expectRouteError(403, 'doctor_workspace_membership_required');
  });

  it('does not turn platform operations into a clinic workspace grant', async () => {
    const platformSession = session('admin');
    getCurrentSessionMock.mockResolvedValue(platformSession);
    resolveOrganizationForUser.mockResolvedValue({
      ok: true,
      context: doctorMembership(platformSession.user.userId),
    });

    await expectRouteError(403, 'forbidden');
  });

  it('returns not found without mutating when a task belongs to another clinic', async () => {
    const doctorSession = session('doctor');
    const resolution: OrganizationResolution = {
      ok: true,
      context: doctorMembership(doctorSession.user.userId),
    };
    const foreignTask: SpecialistTaskRow = {
      id: TASK_ID,
      organizationId: CLINIC_B,
      ownerUserId: doctorSession.user.userId,
      patientUserId: null,
      title: 'Foreign clinic task',
      description: null,
      dueAt: null,
      remindAt: null,
      isImportant: false,
      completedAt: null,
      reminderSentAt: null,
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
    };
    getCurrentSessionMock.mockResolvedValue(doctorSession);
    resolveOrganizationForUser.mockResolvedValue(resolution);
    getTaskByIdForOwner.mockResolvedValue(foreignTask);

    const response = await invokeTaskPatchRoute();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'not_found' });
    expect(updateTask).not.toHaveBeenCalled();
  });
});
