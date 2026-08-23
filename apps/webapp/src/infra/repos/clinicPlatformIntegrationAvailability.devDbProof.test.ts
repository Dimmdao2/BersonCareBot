/**
 * Live opt-in regression proof for the clinic delivery switch read.
 *
 * A clinic owner must be able to ask one bounded question — whether a specific delivery
 * integration is enabled by the platform — without gaining general platform-settings access.
 * This test uses the same doctor principal and named DEV database as the real settings screen.
 *
 * Run:
 *   USE_REAL_DATABASE=1 RUN_CLINIC_INTEGRATION_AVAILABILITY_DB=1 \
 *   pnpm exec vitest run src/infra/repos/clinicPlatformIntegrationAvailability.devDbProof.test.ts
 */
import { describe, expect, it } from 'vitest';
import { runWithDbStaffPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isPlatformIntegrationAvailable } from '@/modules/system-settings/platformIntegrationAvailability';

const DOCTOR_PLATFORM_USER_ID = 'b0021a38-fb86-45e9-9aec-d85014e932d4';
const ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001';

const enabled =
  process.env.RUN_CLINIC_INTEGRATION_AVAILABILITY_DB === '1' &&
  process.env.USE_REAL_DATABASE === '1';

describe.skipIf(!enabled)('clinic integration availability against named DEV', () => {
  it('lets the clinic owner read the bounded email switch through the application port', async () => {
    const availability = await runWithDbStaffPrincipal(
      {
        organizationId: ORGANIZATION_ID,
        platformUserId: DOCTOR_PLATFORM_USER_ID,
        source: 'clinic-integration-availability-dev-proof',
      },
      () => buildAppDeps().systemSettings.getClinicPlatformIntegrationAvailability(),
    );

    expect(isPlatformIntegrationAvailable(availability, 'email')).toBe(true);
  });
});
