import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

const actionCoreFiles = [
  'src/app/app/doctor/clinical-tests/actionsShared.ts',
  'src/app/app/doctor/recommendations/actionsShared.ts',
  'src/app/app/doctor/test-sets/actionsShared.ts',
];

const apiWriteRouteFiles = [
  'src/app/api/doctor/clinical-tests/route.ts',
  'src/app/api/doctor/clinical-tests/[id]/route.ts',
  'src/app/api/doctor/recommendations/route.ts',
  'src/app/api/doctor/recommendations/[id]/route.ts',
  'src/app/api/doctor/test-sets/route.ts',
  'src/app/api/doctor/test-sets/[id]/route.ts',
  'src/app/api/doctor/test-sets/[id]/items/route.ts',
  'src/app/api/doctor/measure-kinds/route.ts',
];

const repoWriteFiles = [
  'src/infra/repos/pgClinicalTests.ts',
  'src/infra/repos/pgRecommendations.ts',
  'src/infra/repos/pgTestSets.ts',
];

const principalOnlyRepoWriteFiles = ['src/infra/repos/pgClinicalTestMeasureKinds.ts'];

describe('doctor catalog residual principal coverage', () => {
  it.each(actionCoreFiles)(
    '%s uses selected workspace principal for catalog write cores',
    (file) => {
      const src = readSource(file);
      expect(src).not.toContain('requireDoctorAccess');
      expect(src).toContain('requireDoctorWorkspaceContext');
      expect(src).toContain('withDoctorWorkspacePrincipal');
    },
  );

  it.each(apiWriteRouteFiles)('%s uses selected workspace principal for write handlers', (file) => {
    const src = readSource(file);
    expect(src).toContain('requireDoctorWorkspaceApiContext');
    expect(src).toContain('withDoctorWorkspacePrincipal');
  });

  it.each(repoWriteFiles)(
    '%s runs catalog writes through principal-aware mutation transactions',
    (file) => {
      const src = readSource(file);
      expect(src).toContain('getCurrentDbPrincipalOrganizationId');
      expect(src).toContain('runDrizzleMutationTransaction');
      expect(src).toContain('organization_principal_required');
      expect(src).toContain('organization_principal_mismatch');
      expect(src).not.toContain('db.transaction(async');
    },
  );

  it.each(principalOnlyRepoWriteFiles)(
    '%s requires principal for global catalog writes',
    (file) => {
      const src = readSource(file);
      // A-6/#1007: this table has no organization_id at all (owner FINAL scope decision,
      // docs/_TODO/SAAS_FOUNDATION/scope-derivation/VERIFIED_SCOPE.md — platform-owned catalog, not
      // per-tenant), so there is no organization to assert. The gate instead requires a real,
      // non-anonymous write principal of kind "staff" (doctor, insert-only) or "platform" (operator,
      // full catalog management) — see assertStaffOrPlatformWritePrincipal.
      expect(src).toContain('getCurrentDbPrincipal');
      expect(src).toContain('runDrizzleMutationTransaction');
      expect(src).toContain('staff_or_platform_principal_required');
      expect(src).not.toContain('db.transaction(async');
    },
  );
});
