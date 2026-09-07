/**
 * Live opt-in acceptance oracle for the C3M patient workspace projection.
 *
 * WHAT BREAKS: after an authenticated patient has resolved an organization, every patient page
 * asks for the organization's workspace composition. If that bounded read is not available to the
 * patient application principal, the patient root and rehabilitation routes answer 500 in both
 * the OFF and restored-ON states.
 *
 * Run against the named DEV database:
 *   set -a; . /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev; set +a
 *   USE_REAL_DATABASE=1 RUN_PATIENT_WORKSPACE_MODULES_DB=1 \
 *   pnpm --dir apps/webapp exec vitest run \
 *     src/app-layer/guards/patientWorkspaceModules.devDbProof.test.ts
 */
import { beforeAll, describe, expect, it } from 'vitest';

const PATIENT_PLATFORM_USER_ID = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0';
const ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001';

const enabled =
  process.env.RUN_PATIENT_WORKSPACE_MODULES_DB === '1' &&
  process.env.USE_REAL_DATABASE === '1';

describe.skipIf(!enabled)('C3M patient workspace projection against named DEV', () => {
  let runWithDbPatientPrincipal: typeof import('@bersoncare/db-principal').runWithDbPatientPrincipal;
  let buildAppDeps: typeof import('@/app-layer/di/buildAppDeps').buildAppDeps;
  let resolveOrganizationWorkspaceModules: typeof import(
    './workspaceModuleAccess'
  ).resolveOrganizationWorkspaceModules;

  beforeAll(async () => {
    // vitest.setup.ts deliberately forces hermetic suites onto legacy-guc. This opt-in DEV proof
    // must import the application graph only after restoring the live server's port-context mode.
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'port-context';
    ({ runWithDbPatientPrincipal } = await import('@bersoncare/db-principal'));
    ({ buildAppDeps } = await import('@/app-layer/di/buildAppDeps'));
    ({ resolveOrganizationWorkspaceModules } = await import('./workspaceModuleAccess'));
  });

  it('resolves the rehabilitation preference through the patient application principal', async () => {
    const resolution = runWithDbPatientPrincipal(
      {
        platformUserId: PATIENT_PLATFORM_USER_ID,
        organizationId: ORGANIZATION_ID,
        source: 'c3m-patient-workspace-modules-dev-proof',
      },
      () => resolveOrganizationWorkspaceModules(buildAppDeps(), ORGANIZATION_ID),
    );

    await expect(resolution).resolves.toMatchObject({ rehabilitation: expect.any(Boolean) });
  });
});
