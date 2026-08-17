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
import { reconcileExactPatientReminderOrphans } from './reconcile-dev-patient-reminder-orphans-core.js';

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
  const listExactActiveOrphans = (session: ReturnType<typeof getIntegratorDrizzleSession>) =>
    session
      .select({ id: reminderRules.integratorRuleId })
      .from(reminderRules)
      .where(
        and(
          eq(reminderRules.organizationId, ORGANIZATION_ID),
          inArray(reminderRules.integratorRuleId, [...ORPHAN_RULE_IDS]),
          isNull(reminderRules.platformUserId),
          eq(reminderRules.isEnabled, true),
        ),
      );
  if (!execute) {
    const candidates = await runWithOrganizationPrincipal(ORGANIZATION_ID, () =>
      listExactActiveOrphans(getIntegratorDrizzleSession(db)),
    );
    console.log(JSON.stringify({ databaseName, mode: 'dry-run', candidates }));
    return;
  }

  const result = await runWithOrganizationPrincipal(ORGANIZATION_ID, () =>
    reconcileExactPatientReminderOrphans(
      {
        tx: (work) =>
          db.tx(async (tx) => {
            const session = getIntegratorDrizzleSession(tx);
            return work({
              listExactActiveOrphans: () => listExactActiveOrphans(session),
              disableExactActiveOrphans: () =>
                session
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
            });
          }),
      },
      ORPHAN_RULE_IDS,
    ),
  );
  console.log(
    JSON.stringify({ databaseName, mode: 'execute', candidates: result.candidates, reconciled: result.updated }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'reconcile_unknown_failure');
    process.exitCode = 1;
  })
  .finally(() => closeDb());
