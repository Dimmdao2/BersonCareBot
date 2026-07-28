import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const instanceRepo = readFileSync(
  resolve(process.cwd(), 'src/infra/repos/pgTreatmentProgramInstance.ts'),
  'utf8',
);
const refValidation = readFileSync(
  resolve(process.cwd(), 'src/infra/repos/pgTreatmentProgramItemRefValidation.ts'),
  'utf8',
);
const snapshotRepo = readFileSync(
  resolve(process.cwd(), 'src/infra/repos/pgTreatmentProgramItemSnapshot.ts'),
  'utf8',
);

describe('individual exercise persistence contract', () => {
  it('binds creation and video attachment to the instance organization and patient folder', () => {
    expect(instanceRepo).toContain('eq(instTable.organizationId, organizationId)');
    expect(instanceRepo).toContain('eq(mediaFiles.organizationId, organizationId)');
    expect(instanceRepo).toContain('eq(mediaFiles.status, "ready")');
    expect(instanceRepo).toContain('eq(mediaFolders.kind, "client_patient")');
    expect(instanceRepo).toContain('eq(mediaFolders.patientUserId, instance.patientUserId)');
  });

  it('keeps personal refs out of every generic catalog assignment and snapshot path', () => {
    expect(refValidation).toContain('eq(lfkExercises.catalogScope, "catalog")');
    expect(snapshotRepo).toContain('eq(lfkExercises.catalogScope, "catalog")');
  });

  it('allows title-only personal mutation and exposes no media replacement path', () => {
    const titleMutation = instanceRepo.slice(
      instanceRepo.indexOf('async updatePersonalExerciseTitle'),
      instanceRepo.indexOf('async expandTestSetIntoInstanceStageItems'),
    );
    expect(titleMutation).toContain('eq(lfkExercises.catalogScope, "personal")');
    expect(titleMutation).toContain('snapshot: { ...owned.item.snapshot, title }');
    expect(titleMutation).not.toContain('lfkExerciseMedia');
    expect(titleMutation).not.toContain('mediaFiles');
  });
});
