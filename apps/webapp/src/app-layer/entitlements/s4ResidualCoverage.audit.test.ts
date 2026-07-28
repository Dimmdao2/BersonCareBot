import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

const doctorReadProjectionFiles = [
  'src/app/app/doctor/exercises/[id]/page.tsx',
  'src/app/app/doctor/exercises/page.tsx',
  'src/app/app/doctor/lfk-templates/[id]/page.tsx',
  'src/app/app/doctor/lfk-templates/new/page.tsx',
  'src/app/app/doctor/lfk-templates/page.tsx',
  'src/app/app/doctor/material-ratings/[kind]/[id]/page.tsx',
  'src/app/app/doctor/material-ratings/page.tsx',
  'src/app/app/doctor/patients/[userId]/programs/[instanceId]/page.tsx',
  'src/app/app/doctor/treatment-program-templates/[id]/page.tsx',
  'src/app/app/doctor/treatment-program-templates/page.tsx',
] as const;

describe('S4 residual exercise-catalog boundary coverage', () => {
  it.each(doctorReadProjectionFiles)(
    '%s derives platform-base visibility from the authenticated workspace read boundary',
    (file) => {
      const source = readSource(file);
      expect(source).toContain('requireDoctorWorkspaceContext');
      expect(source).toContain('requireEntitlementForReadAction(workspace, "exercise_catalog")');
      expect(source).not.toContain('assertMechanicEnabled(');
    },
  );

  it('uses mutation semantics for both platform-base composition writes', () => {
    const source = readSource('src/app/app/doctor/lfk-templates/actions.ts');
    expect(source).toContain('requireDoctorWorkspaceContext');
    expect(
      source.match(/requireEntitlementForMutationAction\(workspace, "exercise_catalog"\)/g),
    ).toHaveLength(2);
    expect(source).not.toContain('assertMechanicEnabled(');
  });

  it('derives platform media access only from the current principal organization read boundary', () => {
    const source = readSource('src/app-layer/media/resolvePlatformLfkMediaAccess.ts');
    expect(source).toContain('getCurrentDbPrincipalOrganizationId');
    expect(source).toContain(
      'requireEntitlementForReadAction({ organizationId }, "exercise_catalog")',
    );
    expect(source).not.toContain('assertMechanicEnabled(');
  });
});
