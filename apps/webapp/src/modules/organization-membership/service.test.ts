// VISIBILITY_MODEL_DESIGN_2026-08-04.md §5/§6 stage B — the clinical-workspace predicate must
// read `doctor_screens_disabled` off the membership row: by default an admin/owner with a bound
// specialist keeps its doctor screens; after disabling, `canAccessClinicalWorkspace` flips to
// false; re-enabling restores it; and the flag never leaks across membership rows.
//
// Арбитр (обязателен per `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`): remove the
// `!facts.doctorScreensDisabled` conjunct from `canAccessClinicalWorkspace` in service.ts — every
// `it` below that asserts `false` after disabling must go red.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  createInMemoryOrganizationMembershipPort,
  resetInMemoryOrganizationMembershipsForTests,
} from '@/infra/repos/inMemoryOrganizationMembership';
import type { OrganizationMembership } from './ports';
import { createOrganizationMembershipService } from './service';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';
const SPECIALIST_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_SPECIALIST_ID = '55555555-5555-4555-8555-555555555555';

function membership(overrides: Partial<OrganizationMembership> = {}): OrganizationMembership {
  return {
    id: 'membership-admin',
    organizationId: ORG_ID,
    platformUserId: ADMIN_USER_ID,
    role: 'admin',
    specialistId: SPECIALIST_ID,
    status: 'active',
    doctorScreensDisabled: false,
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    ...overrides,
  };
}

function buildService() {
  return createOrganizationMembershipService({
    membershipPort: createInMemoryOrganizationMembershipPort(),
  });
}

beforeEach(() => {
  resetInMemoryOrganizationMembershipsForTests([]);
});

describe('§5: doctor_screens_disabled gates canAccessClinicalWorkspace', () => {
  it('default — admin bound to a specialist keeps its doctor screens', async () => {
    resetInMemoryOrganizationMembershipsForTests([membership()]);
    const service = buildService();

    const resolution = await service.resolveOrganizationForUser({
      platformUserId: ADMIN_USER_ID,
    });

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.context.canAccessClinicalWorkspace).toBe(true);
  });

  it('after disabling — the same admin loses canAccessClinicalWorkspace, not just a menu entry', async () => {
    resetInMemoryOrganizationMembershipsForTests([
      membership({ id: 'membership-admin', doctorScreensDisabled: true }),
    ]);
    const service = buildService();

    const resolution = await service.resolveOrganizationForUser({
      platformUserId: ADMIN_USER_ID,
    });

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.context.canAccessClinicalWorkspace).toBe(false);
  });

  it('re-enabling restores access through the same write path used to disable it', async () => {
    resetInMemoryOrganizationMembershipsForTests([
      membership({ id: 'membership-admin', doctorScreensDisabled: true }),
    ]);
    const service = buildService();

    await service.setOwnDoctorScreensDisabled({
      membershipId: 'membership-admin',
      disabled: false,
    });
    const resolution = await service.resolveOrganizationForUser({
      platformUserId: ADMIN_USER_ID,
    });

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.context.canAccessClinicalWorkspace).toBe(true);
  });

  it('disabling one membership does not affect another person in the same organization', async () => {
    resetInMemoryOrganizationMembershipsForTests([
      membership({ id: 'membership-admin', doctorScreensDisabled: true }),
      membership({
        id: 'membership-other',
        platformUserId: OTHER_USER_ID,
        specialistId: OTHER_SPECIALIST_ID,
        doctorScreensDisabled: false,
      }),
    ]);
    const service = buildService();

    const other = await service.resolveOrganizationForUser({ platformUserId: OTHER_USER_ID });

    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(other.context.canAccessClinicalWorkspace).toBe(true);
  });

  it('a plain owner (no admin needed) is also gated by the flag, per the corrected predicate', async () => {
    resetInMemoryOrganizationMembershipsForTests([
      membership({ role: 'owner', doctorScreensDisabled: true }),
    ]);
    const service = buildService();

    const resolution = await service.resolveOrganizationForUser({
      platformUserId: ADMIN_USER_ID,
    });

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.context.canAccessClinicalWorkspace).toBe(false);
  });

  it('never grants clinical workspace without a bound specialist, even if not disabled', async () => {
    resetInMemoryOrganizationMembershipsForTests([
      membership({ specialistId: null, doctorScreensDisabled: false }),
    ]);
    const service = buildService();

    const resolution = await service.resolveOrganizationForUser({
      platformUserId: ADMIN_USER_ID,
    });

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.context.canAccessClinicalWorkspace).toBe(false);
  });
});
