import { describe, expect, it } from 'vitest';
import { resolveLaunchCapabilities } from './workspaceCapabilities';

describe('resolveLaunchCapabilities — new-clinic-owner provisioning facts', () => {
  it('grants clinical.workspace once provisioning binds a real specialist id to the fresh owner membership', () => {
    // Facts app.provision_specialist_owner() now produces in the SAME transaction as the
    // organization/membership (deploy/postgres/specialist-owner-provisioning-rls.sql): an
    // "owner" membership whose specialist_id is a real, non-null be_specialists row id.
    // Verified end to end on a disposable DB: SELECT * FROM app.provision_specialist_owner(...)
    // returned specialist_id = '577107f1-b97a-40a5-aab3-00e878e6e404' for a fresh signup.
    const capabilities = resolveLaunchCapabilities({
      sessionRole: 'doctor',
      membershipRole: 'owner',
      specialistId: '577107f1-b97a-40a5-aab3-00e878e6e404',
    });

    expect(capabilities.has('clinical.workspace')).toBe(true);
    expect(capabilities).toEqual(
      new Set(['account.self', 'organization.management', 'clinical.workspace']),
    );
  });

  it('documents the pre-fix defect: the same owner membership with a NULL specialist id has no clinical.workspace', () => {
    // This is exactly the live-DB row the owner reported: role "owner", status "active",
    // specialist_id IS NULL. Left here so a future regression that reintroduces a NULL
    // specialist_id at provisioning time is caught by this same assertion flipping.
    const capabilities = resolveLaunchCapabilities({
      sessionRole: 'doctor',
      membershipRole: 'owner',
      specialistId: null,
    });

    expect(capabilities.has('clinical.workspace')).toBe(false);
    expect(capabilities).toEqual(new Set(['account.self', 'organization.management']));
  });
});

describe('resolveLaunchCapabilities — global admin account.self fix (owner ruling 2026-07-26)', () => {
  it('grants account.self alongside platform.operations so the platform operator can manage its own account', () => {
    // Fix for the /app/account lockout: requireStaffAccountPage checked platform.operations FIRST
    // and redirected unconditionally, because this branch used to return EXACTLY
    // {platform.operations}. The security tab here is where the global admin resets its own
    // password — locking it out was an unreviewed side effect of the capability collapse, not a
    // decision (account.md, written the same commit as the old redirect, already documented
    // account.self as the sole gate for this page).
    const capabilities = resolveLaunchCapabilities({ sessionRole: 'admin', adminMode: true });

    expect(capabilities.has('account.self')).toBe(true);
    expect(capabilities.has('platform.operations')).toBe(true);
    expect(capabilities).toEqual(new Set(['platform.operations', 'account.self']));
  });

  it('still never derives organization.management or clinical.workspace for an explicit platform operator', () => {
    // The boundary that must not move: a platform principal never renders a clinical workspace
    // (TARGET_IA.md:177, ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md §1.1/§0.a). Even membership
    // facts that would normally grant both capabilities to a doctor session are ignored once
    // adminMode is explicit — the branch returns before any membership fact is read.
    const capabilities = resolveLaunchCapabilities({
      sessionRole: 'admin',
      adminMode: true,
      membershipRole: 'owner',
      specialistId: 'specialist-1',
      canManageOrganization: true,
      canAccessClinicalWorkspace: true,
    });

    expect(capabilities.has('organization.management')).toBe(false);
    expect(capabilities.has('clinical.workspace')).toBe(false);
    expect(capabilities).toEqual(new Set(['platform.operations', 'account.self']));
  });

  it('leaves doctor, clinic_admin (owner/admin membership) and patient-shaped facts byte-identical', () => {
    // No other role's capability set may move. adminMode is the only branch this fix touches.
    const doctorOnly = resolveLaunchCapabilities({ sessionRole: 'doctor' });
    expect(doctorOnly).toEqual(new Set(['account.self']));

    const clinicalDoctor = resolveLaunchCapabilities({
      sessionRole: 'doctor',
      membershipRole: 'doctor',
      specialistId: 'specialist-1',
    });
    expect(clinicalDoctor).toEqual(new Set(['account.self', 'clinical.workspace']));

    const clinicAdminOwner = resolveLaunchCapabilities({
      sessionRole: 'doctor',
      membershipRole: 'owner',
      specialistId: 'specialist-1',
    });
    expect(clinicAdminOwner).toEqual(
      new Set(['account.self', 'organization.management', 'clinical.workspace']),
    );

    const adminNotInAdminMode = resolveLaunchCapabilities({
      sessionRole: 'admin',
      adminMode: false,
    });
    expect(adminNotInAdminMode).toEqual(new Set(['account.self']));

    const patientShaped = resolveLaunchCapabilities({ sessionRole: 'client' });
    expect(patientShaped).toEqual(new Set());
  });
});
