import { describe, expect, it } from 'vitest';
import {
  buildPatientReminderContinuation,
  buildPatientReminderOrganizationOpener,
  parsePatientReminderOrganizationTarget,
  patientOrganizationRecoveryPath,
} from './patientReminderOrganizationTarget';

const ORG_A = '11111111-1111-4111-8111-111111111111';

describe('patient reminder organization target', () => {
  it('accepts only an exact UUID target', () => {
    expect(parsePatientReminderOrganizationTarget(ORG_A)).toBe(ORG_A);
    expect(parsePatientReminderOrganizationTarget('org-a')).toBeNull();
    expect(parsePatientReminderOrganizationTarget(undefined)).toBeNull();
  });

  it('routes a mismatched remembered context through the server-verifying opener', () => {
    expect(buildPatientReminderOrganizationOpener('daily-warmup', ORG_A)).toBe(
      `/api/patient/organization-context/open?kind=organization_go&organizationId=${ORG_A}&goKind=daily-warmup`,
    );
  });

  it('builds an exact continuation that can survive authentication', () => {
    expect(buildPatientReminderContinuation('plan-start-lesson', ORG_A)).toBe(
      `/app/patient/go/plan-start-lesson?from=reminder&organizationId=${ORG_A}`,
    );
  });

  it('uses a neutral chooser for missing or unavailable targets', () => {
    expect(patientOrganizationRecoveryPath('reminder_target_missing')).toBe(
      '/app/patient/organizations?reason=reminder_target_missing',
    );
    expect(patientOrganizationRecoveryPath('organization_unavailable')).toBe(
      '/app/patient/organizations?reason=organization_unavailable',
    );
  });
});
