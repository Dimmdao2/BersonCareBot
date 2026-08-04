// VISIBILITY_MODEL_DESIGN_2026-08-04.md §5/§6 stage B — "маршруты тоже закрыты, не только пункт
// меню (иначе это косметика)". `canAccessClinicalWorkspace` is computed once by
// organization-membership/service.test.ts's predicate; this file proves that a `false` value
// actually closes a real `/api/doctor/*` route through the same guard chain every clinical route
// uses (`requireDoctorWorkspaceApiContext`), not just the nav capability list.
//
// Арбитр (обязателен per `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`): remove the
// `contextHasCapability(resolved.ctx, 'clinical.workspace')` check from
// `requireDoctorWorkspaceApiContext` in requireRole.ts — the "screens off" test below goes red
// (200 instead of 403), because the route would keep serving data despite the toggle.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: vi.fn(),
  getCurrentSessionForIdentitySelf: vi.fn(),
}));
vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureDbPrincipalContext: vi.fn(),
  enterWithDbStaffPrincipal: vi.fn(),
  getCurrentDbPrincipal: vi.fn(() => null),
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(<T>(_ctx: unknown, _source: string, fn: () => T): T => fn()),
}));

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getCurrentSession } from '@/modules/auth/service';
import { GET as listCourses } from '@/app/api/doctor/courses/route';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SPECIALIST_ID = '33333333-3333-4333-8333-333333333333';

const session = {
  user: {
    userId: USER_ID,
    role: 'doctor',
    displayName: 'Админ-врач',
    securityFactorRequired: false,
    bindings: {},
  },
  staffSecurity: { assurance: 'factor_verified' },
};

const listCoursesForDoctor = vi.fn();

/** `canAccessClinicalWorkspace` is the ONLY thing that varies — everything else about the
 * membership stays identical, so a status-code difference is attributable to the toggle alone. */
function withClinicalWorkspaceAccess(canAccessClinicalWorkspace: boolean): void {
  vi.mocked(buildAppDeps).mockReturnValue({
    organizationMembership: {
      resolveOrganizationForUser: async () => ({
        ok: true,
        context: {
          organizationId: ORG_ID,
          membershipId: 'membership-1',
          role: 'admin',
          specialistId: SPECIALIST_ID,
          canManageOrganization: true,
          canManageAllSpecialists: true,
          canAccessClinicalWorkspace,
        },
      }),
    },
    orgEntitlements: {
      resolveCabinetAccess: async () => ({ state: 'full_access', policySource: 'system', warning: null }),
      resolveMechanicAccess: async (_organizationId: string, mechanic: string) => ({
        mechanic,
        state: 'full_access' as const,
        policySource: 'system' as const,
        warning: null,
      }),
    },
    courses: { listCoursesForDoctor },
  } as unknown as ReturnType<typeof buildAppDeps>);
}

function coursesRequest(): Request {
  return new Request('https://app.example.test/api/doctor/courses', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentSession).mockResolvedValue(session as never);
  listCoursesForDoctor.mockResolvedValue([{ id: 'course-1', title: 'Курс 1' }]);
});

describe('§5/§6: doctor_screens_disabled closes routes, not just navigation', () => {
  it('screens on (default) — the clinical route serves data', async () => {
    withClinicalWorkspaceAccess(true);

    const response = await listCourses(coursesRequest());

    expect(response.status).toBe(200);
    expect(listCoursesForDoctor).toHaveBeenCalledTimes(1);
  });

  it('screens off — the clinical route refuses before reaching the store, not just hides a menu item', async () => {
    withClinicalWorkspaceAccess(false);

    const response = await listCourses(coursesRequest());

    expect(response.status).toBe(403);
    expect(listCoursesForDoctor).not.toHaveBeenCalled();
  });

  it('turning screens back on restores the same route without any other change', async () => {
    withClinicalWorkspaceAccess(false);
    expect((await listCourses(coursesRequest())).status).toBe(403);

    withClinicalWorkspaceAccess(true);
    const restored = await listCourses(coursesRequest());

    expect(restored.status).toBe(200);
    expect(listCoursesForDoctor).toHaveBeenCalledTimes(1);
  });
});
