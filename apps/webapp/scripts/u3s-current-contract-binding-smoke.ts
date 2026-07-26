/**
 * Internal child of smoke-phase3-specialist-signup-provisioning.mjs.
 *
 * It intentionally has no standalone defaults: every target must be supplied by the parent and the
 * database name must match the disposable U3S scratch convention. This invokes the production
 * pgOrganizationProvisioning port; it is not a second binding implementation.
 */
import { runWithDbStaffPrincipal } from '@bersoncare/db-principal';
import { getPool } from '@/app-layer/db/client';
import { createPgOrganizationProvisioningPort } from '@/infra/repos/pgOrganizationProvisioning';

function requiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required by the parent scratch smoke`);
  return value;
}

function assertScratchTarget(): void {
  const expectedName = requiredEnv('U3S_SMOKE_DB_NAME');
  const url = new URL(requiredEnv('DATABASE_URL'));
  const actualName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (
    actualName !== expectedName ||
    !/^bcb_saas_u3s_current_contract_scratch_p[0-9]+_[a-f0-9]+$/.test(actualName)
  ) {
    throw new Error('refusing non-scratch U3S binding target');
  }
  if (process.env.DB_PRINCIPAL_CONTEXT_MODE !== 'locked') {
    throw new Error('U3S binding smoke requires locked DB principal mode');
  }
}

async function expectFailure(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof Error && error.message.includes(code)) return;
    throw error;
  }
  throw new Error(`expected binding failure: ${code}`);
}

async function main(): Promise<void> {
  assertScratchTarget();
  const organizationId = requiredEnv('U3S_SMOKE_ORGANIZATION_ID');
  const membershipId = requiredEnv('U3S_SMOKE_MEMBERSHIP_ID');
  const platformUserId = requiredEnv('U3S_SMOKE_PLATFORM_USER_ID');
  const foreignPlatformUserId = requiredEnv('U3S_SMOKE_FOREIGN_PLATFORM_USER_ID');
  const otherOrganizationId = requiredEnv('U3S_SMOKE_OTHER_ORGANIZATION_ID');
  const fullName = requiredEnv('U3S_SMOKE_FULL_NAME');
  const port = createPgOrganizationProvisioningPort();

  await runWithDbStaffPrincipal({ organizationId, platformUserId }, async () => {
    // Superseded 2026-07-26 (was: `if (!first.created) throw ...`, asserting the FIRST call here
    // creates the specialist). Since commit feb80b75d, app.provision_specialist_owner binds the
    // owner's specialist inline in the same transaction (the dead-workspace fix), so by the time the
    // parent scratch smoke invokes this script the membership this test targets is already bound.
    // What this now proves is the idempotent no-op path: ensureOwnBookableSpecialist must return the
    // existing specialist without creating a second one or writing a second audit row (see
    // pgOrganizationProvisioning.ts's `if (membership.specialistId) return { created: false }`).
    const first = await port.ensureOwnBookableSpecialist({
      organizationId,
      membershipId,
      platformUserId,
      fullName,
    });
    if (first.created) {
      throw new Error('binding must be a no-op once provisioning already bound the specialist');
    }
    if (!first.specialistId) {
      throw new Error('binding no-op must still return the specialist provisioning already bound');
    }

    const replay = await port.ensureOwnBookableSpecialist({
      organizationId,
      membershipId,
      platformUserId,
      fullName,
    });
    if (replay.created || replay.specialistId !== first.specialistId) {
      throw new Error('binding replay must return the existing specialist');
    }

    await expectFailure(
      () =>
        port.ensureOwnBookableSpecialist({
          organizationId: otherOrganizationId,
          membershipId,
          platformUserId,
          fullName,
        }),
      'organization_membership_not_found',
    );
    await expectFailure(
      () =>
        port.ensureOwnBookableSpecialist({
          organizationId,
          membershipId,
          platformUserId: foreignPlatformUserId,
          fullName,
        }),
      'organization_membership_actor_mismatch',
    );
  });

  console.log('u3s-current-contract-binding-smoke: canonical binding OK');
}

main()
  .catch((error: unknown) => {
    console.error(
      `u3s-current-contract-binding-smoke: FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool().end();
  });
