import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const mutatingRouteFiles = [
  'src/app/api/doctor/clients/[userId]/treatment-program-instances/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/editor-batch/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/discussion/messages/[messageId]/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/items/[stageItemId]/discussion/read/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/items/[stageItemId]/program-note-reply/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stage-groups/[groupId]/hide/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stage-groups/[groupId]/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stage-items/[itemId]/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/groups/reorder/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/groups/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/items/from-freeform-recommendation/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/items/from-lfk-complex/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/items/from-test-set/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/items/reorder/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/items/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/reorder/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/test-attempts/[attemptId]/accept/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/test-results/[resultId]/route.ts',
] as const;

const readRouteFiles = [
  'src/app/api/doctor/treatment-program-instances/[instanceId]/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/discussion/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/discussion/summary/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/items/[stageItemId]/discussion/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/events/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/action-log/route.ts',
  'src/app/api/doctor/treatment-program-instances/[instanceId]/test-results/route.ts',
] as const;

const transactionBackedRepoFiles = [
  'src/infra/repos/pgTreatmentProgramInstance.ts',
  'src/infra/repos/pgTreatmentProgramEvents.ts',
  'src/infra/repos/pgProgramActionLog.ts',
  'src/infra/repos/pgProgramItemDiscussion.ts',
  'src/infra/repos/pgTreatmentProgramTestAttempts.ts',
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('doctor treatment program instance principal cutover', () => {
  it.each(mutatingRouteFiles)(
    '%s resolves workspace and wraps mutations in DB principal',
    (file) => {
      const src = readSource(file);
      expect(src).toContain('requireDoctorWorkspaceApiContext');
      expect(src).toContain('withDoctorWorkspacePrincipal');
    },
  );

  it.each(transactionBackedRepoFiles)(
    '%s has no direct db writes outside a transaction wrapper',
    (file) => {
      const src = readSource(file);
      expect(src).not.toMatch(/await\s+db\s*\.\s*(insert|update|delete)\b/);
      expect(src).not.toMatch(
        /const\s+\[[^\]]+\]\s*=\s*await\s+db\s*\.\s*(insert|update|delete)\b/,
      );
      expect(src).toContain('runDrizzleMutationTransaction');
    },
  );

  it('stamps newly inserted instance rows from the active organization principal', () => {
    const src = readSource('src/infra/repos/pgTreatmentProgramInstance.ts');
    expect(src).toContain('organizationId: currentWriteOrganizationId(input.organizationId)');
    expect(src).toContain('organizationId: currentWriteOrganizationId(stRow.organizationId)');
    expect(src).toContain('organization_principal_mismatch');
    expect(src).toContain('fallbackOrganizationIds.some');
  });

  it('validates program action log parent ownership before stamping organization_id', () => {
    const src = readSource('src/infra/repos/pgProgramActionLog.ts');
    expect(src).toContain('program_action_log_parent_mismatch');
    expect(src).toContain('stageItemOrganizationId');
    expect(src).toContain('stageItem.instanceId !== input.instanceId');
    expect(src).toContain('currentWriteOrganizationId(');
  });

  it('applies the current DB principal inside Drizzle mutation transactions', () => {
    const src = readSource('src/infra/db/drizzleMutationTx.ts');
    expect(src).toContain('getCurrentDbPrincipalOrganizationId');
    expect(src).toContain("set_config('app.org'");
  });

  it('create route resolves the patient inside the selected workspace organization', () => {
    const src = readSource(
      'src/app/api/doctor/clients/[userId]/treatment-program-instances/route.ts',
    );
    expect(src).toContain('getClientIdentityForOrganization');
    expect(src).toContain('gate.ctx.organizationId');
  });

  it.each(
    mutatingRouteFiles.filter((file) =>
      file.includes('/treatment-program-instances/[instanceId]/'),
    ),
  )('%s rejects existing instances outside the selected workspace before mutation', (file) => {
    const src = readSource(file);
    expect(src).toContain('organizationId !== gate.ctx.organizationId');
  });

  it.each(readRouteFiles)('%s scopes reads to selected workspace instance ownership', (file) => {
    const src = readSource(file);
    expect(src).toContain('requireDoctorWorkspaceApiContext');
    expect(src).toContain('resolveDoctorInstanceInWorkspace');
    expect(src).not.toContain('getCurrentSession');
    expect(src).not.toContain('canAccessDoctor');
  });

  it('doctor instance read helper verifies instance organization and patient membership', () => {
    const src = readSource(
      'src/app/api/doctor/treatment-program-instances/_doctorInstanceWorkspace.ts',
    );
    expect(src).toContain('instance.organizationId !== ctx.organizationId');
    expect(src).toContain('getClientIdentityForOrganization');
    expect(src).toContain('ctx.organizationId');
  });
});
