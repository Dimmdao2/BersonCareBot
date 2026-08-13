import { describe, expect, it } from 'vitest';
import {
  getCurrentDbPrincipal,
  runWithDbOrganizationPrincipal,
  runWithDbStaffPrincipal,
} from '@bersoncare/db-principal';
import { withDoctorWorkspacePrincipal } from './withOrganizationPrincipal';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const OLD_ORG_ID = '00000000-0000-4000-8000-000000000002';
const WORKSPACE_ORG_ID = '00000000-0000-4000-8000-000000000003';

describe('withDoctorWorkspacePrincipal', () => {
  it('keeps the authenticated staff identity while selecting the workspace organization', () => {
    const principal = runWithDbStaffPrincipal(
      { organizationId: OLD_ORG_ID, platformUserId: USER_ID, source: 'request' },
      () =>
        withDoctorWorkspacePrincipal(
          { organizationId: WORKSPACE_ORG_ID },
          'doctor.dashboard.read',
          () => getCurrentDbPrincipal(),
        ),
    );

    expect(principal).toEqual({
      kind: 'staff',
      organizationId: WORKSPACE_ORG_ID,
      platformUserId: USER_ID,
      source: 'doctor.dashboard.read',
    });
  });

  it('rejects an organization-only service principal on a human doctor path', () => {
    expect(() =>
      runWithDbOrganizationPrincipal(WORKSPACE_ORG_ID, () =>
        withDoctorWorkspacePrincipal(
          { organizationId: WORKSPACE_ORG_ID },
          'doctor.dashboard.read',
          () => undefined,
        ),
      ),
    ).toThrow('doctor_workspace_staff_principal_required');
  });
});
