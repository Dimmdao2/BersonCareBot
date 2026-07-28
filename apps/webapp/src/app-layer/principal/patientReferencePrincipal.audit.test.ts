import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = resolve(import.meta.dirname, '../..');

describe('patient reference tenant derivation', () => {
  it('derives the patient organization from active enrollment before tenant-owned reads', () => {
    const source = readFileSync(
      resolve(srcRoot, 'app-layer/principal/sessionPrincipal.ts'),
      'utf8',
    );
    const patientBranch = source.slice(source.indexOf('if (canAccessPatient'));
    const firstPatientWall = patientBranch.indexOf('enterWithDbPatientPrincipal');
    const enrollmentResolution = patientBranch.indexOf('resolveActiveOrganizationForPatient');
    const organizationStamp = patientBranch.indexOf('organizationId: resolved.organizationId');
    expect(firstPatientWall).toBeGreaterThan(-1);
    expect(enrollmentResolution).toBeGreaterThan(firstPatientWall);
    expect(organizationStamp).toBeGreaterThan(enrollmentResolution);
  });

  it('does not retain a reference UUID across patient organizations', () => {
    const source = readFileSync(
      resolve(srcRoot, 'modules/patient-mood/wellbeingMoodService.ts'),
      'utf8',
    );
    expect(source).not.toContain('cachedRefId');
    expect(source).toContain('listActiveItemsByCategoryCode("symptom_type")');
  });
});
