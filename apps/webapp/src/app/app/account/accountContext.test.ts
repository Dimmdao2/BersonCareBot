// TEST 2026-08-03: `/app/account` 500'd for the global admin right after the identity-self DB
// wall fix in sessionPrincipal.ts started firing for it — that wall (app_patient) deliberately
// has no grant on `be_organization_members`, and this loader calls resolveOrganizationForUser a
// SECOND time (requireStaffAccountPage already resolved it once inside stampDbPrincipalFromSession)
// under whatever principal is now active. Proves the second lookup fails closed to "no workspace"
// instead of crashing the page, and that a real membership lookup still resolves normally.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireStaffAccountPage: vi.fn(),
  resolveOrganizationForUser: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireStaffAccountPage: fakes.requireStaffAccountPage,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    organizationMembership: { resolveOrganizationForUser: fakes.resolveOrganizationForUser },
  }),
}));

import { loadStaffAccountPageContext } from './accountContext';

const ADMIN_SESSION = {
  user: { userId: '9c40e322-5823-4dba-ba98-84b1e9b3aeba', role: 'admin', displayName: 'Admin', bindings: {} },
  issuedAt: 0,
  expiresAt: 0,
  adminMode: true,
};

const DOCTOR_SESSION = {
  user: { userId: 'b0021a38-fb86-45e9-9aec-d85014e932d4', role: 'doctor', displayName: 'Doctor', bindings: {} },
  issuedAt: 0,
  expiresAt: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadStaffAccountPageContext — redundant organization lookup after the identity-self wall', () => {
  it('falls back to no workspace when the second lookup 42501s under the identity-self wall', async () => {
    fakes.requireStaffAccountPage.mockResolvedValue(ADMIN_SESSION);
    fakes.resolveOrganizationForUser.mockRejectedValue(
      Object.assign(new Error('permission denied for table be_organization_members'), {
        code: '42501',
      }),
    );

    const result = await loadStaffAccountPageContext();

    expect(result.session).toBe(ADMIN_SESSION);
    expect(result.workspaceContext).toBeNull();
  });

  it('still resolves a real membership for a doctor with an organization', async () => {
    fakes.requireStaffAccountPage.mockResolvedValue(DOCTOR_SESSION);
    fakes.resolveOrganizationForUser.mockResolvedValue({
      ok: true,
      context: {
        organizationId: '11111111-1111-4111-8111-111111111111',
        membershipId: 'm1',
        role: 'doctor',
        specialistId: 's1',
        canManageOrganization: false,
        canManageAllSpecialists: false,
        canAccessClinicalWorkspace: true,
      },
    });

    const result = await loadStaffAccountPageContext();

    expect(result.workspaceContext).not.toBeNull();
    expect(result.workspaceContext?.organizationId).toBe('11111111-1111-4111-8111-111111111111');
  });
});
