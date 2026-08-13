// TEST 2026-08-03: `/app/account?tab=notifications` 500'd for the global admin (digest
// 1641640286, "permission denied for table user_web_push_subscriptions") because a doctor-class
// session with no organization membership never got any DB principal stamped — the ambient
// "bootstrap" pool has no grant on staff/patient tables. This proves the fallback: a doctor-class
// session that cannot resolve an organization falls back to the identity-self wall instead of
// stamping nothing, while a doctor-class session that DOES resolve an organization keeps stamping
// the staff wall exactly as before (regression guard for the working case).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listActiveForWorkspaceResolution } = vi.hoisted(() => ({
  listActiveForWorkspaceResolution: vi.fn(),
}));

vi.mock('@/infra/repos/pgOrganizationMembership', () => ({
  createPgOrganizationMembershipPort: () => ({
    listActiveForWorkspaceResolution,
    listActiveByPlatformUser: vi.fn(),
    listByPlatformUser: vi.fn(),
    listByOrganization: vi.fn(),
    listPlatformDirectoryByOrganization: vi.fn(),
    getMemberByOrganization: vi.fn(),
    listSpecialistsByOrganization: vi.fn(),
    getSpecialistByOrganization: vi.fn(),
  }),
}));

vi.mock('@/infra/repos/pgPatientOrganization', () => ({
  createPgPatientOrganizationPort: () => ({
    resolveActiveOrganizationForPatient: vi.fn(),
    rememberActiveOrganizationForPatient: vi.fn(),
  }),
}));

vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureDbPrincipalContext: vi.fn(),
  enterWithDbStaffPrincipal: vi.fn(),
  enterWithDbPatientPrincipal: vi.fn(),
}));

import { enterWithDbPatientPrincipal, enterWithDbStaffPrincipal } from '@bersoncare/db-principal';
import { stampDbPrincipalFromSession } from './sessionPrincipal';
import type { AppSession } from '@/shared/types/session';

const ADMIN_USER_ID = '9c40e322-5823-4dba-ba98-84b1e9b3aeba';
const DOCTOR_USER_ID = 'b0021a38-fb86-45e9-9aec-d85014e932d4';
const ORG_ID = '11111111-1111-4111-8111-111111111111';

function session(userId: string, role: AppSession['user']['role']): AppSession {
  return {
    user: { userId, role, displayName: 'Test', bindings: {} },
    issuedAt: 0,
    expiresAt: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('stampDbPrincipalFromSession — doctor-class session with no organization membership', () => {
  it('falls back to the identity-self wall instead of stamping no principal', async () => {
    listActiveForWorkspaceResolution.mockResolvedValue([]);

    await stampDbPrincipalFromSession(session(ADMIN_USER_ID, 'admin'), 'test-source');

    expect(enterWithDbPatientPrincipal).toHaveBeenCalledWith({
      platformUserId: ADMIN_USER_ID,
      source: 'test-source:doctor-role-no-org-self',
    });
    expect(enterWithDbStaffPrincipal).not.toHaveBeenCalled();
  });

  it('still stamps the staff wall when the doctor-class session DOES resolve an organization', async () => {
    listActiveForWorkspaceResolution.mockResolvedValue([
      {
        id: 'm1',
        organizationId: ORG_ID,
        platformUserId: DOCTOR_USER_ID,
        role: 'doctor',
        specialistId: null,
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    await stampDbPrincipalFromSession(session(DOCTOR_USER_ID, 'doctor'), 'test-source');

    expect(enterWithDbStaffPrincipal).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      platformUserId: DOCTOR_USER_ID,
      source: 'test-source',
    });
    expect(enterWithDbPatientPrincipal).not.toHaveBeenCalled();
  });
});
