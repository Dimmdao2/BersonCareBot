/**
 * One-time DEV-only repair for the two known active reminder rules without canonical platform users.
 * Dry-run is the default. Mutation requires the exact `--execute` flag and an exact DEV database name.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { closeDb, createDbPort } from '../db/client.js';
import { getIntegratorDrizzleSession } from '../db/drizzle.js';
import { reminderRules } from '../db/schema/integratorPublicProduct.js';
import { runWithOrganizationPrincipal } from '../principal/organizationPrincipal.js';

const ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001';
const ORPHAN_RULE_IDS = [
  'wp-122c3af1-b81f-4602-b2e4-5bb34d84f0eb',
  'wp-78d3c36d-a390-4dbc-88ea-3b94d6f2f038',
] as const;

function configuredDatabaseName(): string {
  const raw =
    env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context' ? env.INTEGRATOR_DB_URL : env.DATABASE_URL;
  try {
    return new URL(raw).pathname.replace(/^\//, '');
  } catch {
    throw new Error('reconcile_invalid_database_url');
  }
}

async function main(): Promise<void> {
  const execute = process.argv.slice(2).includes('--execute');
  const databaseName = configuredDatabaseName();
  if (databaseName !== 'bcb_webapp_dev') {
    throw new Error(`reconcile_refuses_database:${databaseName || 'unknown'}`);
  }
  const db = createDbPort();
  const candidates = await runWithOrganizationPrincipal(ORGANIZATION_ID, () =>
    getIntegratorDrizzleSession(db)
      .select({ id: reminderRules.integratorRuleId })
      .from(reminderRules)
      .where(
        and(
          eq(reminderRules.organizationId, ORGANIZATION_ID),
          inArray(reminderRules.integratorRuleId, [...ORPHAN_RULE_IDS]),
          isNull(reminderRules.platformUserId),
          eq(reminderRules.isEnabled, true),
        ),
      ),
  );
  console.log(JSON.stringify({ databaseName, mode: execute ? 'execute' : 'dry-run', candidates }));
  if (!execute) return;
  if (candidates.length !== ORPHAN_RULE_IDS.length) {
    throw new Error(
      `reconcile_expected_${ORPHAN_RULE_IDS.length}_active_orphans_found_${candidates.length}`,
    );
  }
  const updated = await runWithOrganizationPrincipal(ORGANIZATION_ID, () =>
    db.tx(async (tx) =>
      getIntegratorDrizzleSession(tx)
        .update(reminderRules)
        .set({ isEnabled: false, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(reminderRules.organizationId, ORGANIZATION_ID),
            inArray(reminderRules.integratorRuleId, [...ORPHAN_RULE_IDS]),
            isNull(reminderRules.platformUserId),
            eq(reminderRules.isEnabled, true),
          ),
        )
        .returning({ id: reminderRules.integratorRuleId }),
    ),
  );
  if (updated.length !== ORPHAN_RULE_IDS.length) {
    throw new Error(
      `reconcile_atomic_update_expected_${ORPHAN_RULE_IDS.length}_updated_${updated.length}`,
    );
  }
  console.log(JSON.stringify({ reconciled: updated }));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'reconcile_unknown_failure');
    process.exitCode = 1;
  })
  .finally(() => closeDb());
