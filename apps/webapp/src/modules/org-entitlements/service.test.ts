import { describe, expect, it } from 'vitest';
import { resolveOrgQuotaProjections } from '@/modules/org-entitlements/service';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';

function snapshotPort(): OrgEntitlementsPort {
  return {
    async getSnapshot() {
      return {
        tariff: {
          mechanics: { courses: true, files: true, patient_app: true, clinic_team: false },
          // Simulates a historical stored value which the stage-2 migration removes.
          quotas: {
            files: { kind: 'numeric', limit: 10, unit: 'bytes' },
            courses: { kind: 'numeric', limit: 1, unit: 'bytes' },
            patient_app: { kind: 'numeric', limit: 1, unit: 'bytes' },
          } as never,
          includedSeats: null,
        },
        overrides: [],
        access: { lifecycle: 'active', tariffId: 'tariff', source: 'assignment' as const },
      };
    },
    async getTariffForOrg() {
      return null;
    },
    async listOverrides() {
      return [];
    },
    async getEffectiveCommercialAccess() {
      return { lifecycle: 'active', tariffId: null, source: 'assignment' as const };
    },
    async getEnforcedQuotaUsage() {
      return { courses: 1, files: 5, patient_app: 1 };
    },
  };
}

describe('org entitlement mechanic classes', () => {
  it('fed a historical courses number, does not project usage for a possibility mechanic', async () => {
    const projections = await resolveOrgQuotaProjections(snapshotPort(), 'org');

    expect(projections).toHaveLength(1);
    expect(projections[0]).toEqual(
      expect.objectContaining({
        mechanic: 'files',
        usage: 5,
        quota: expect.objectContaining({ limit: 10, unit: 'bytes' }),
      }),
    );
  });

  it('fed a historical patient-app number, does not project usage for a never mechanic', async () => {
    const projections = await resolveOrgQuotaProjections(snapshotPort(), 'org');

    expect(projections.map((projection) => projection.mechanic)).not.toContain('patient_app');
  });
});
