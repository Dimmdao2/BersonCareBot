import { sql } from 'drizzle-orm';
import type { DbPort } from '../../kernel/contracts/index.js';
import { createDbPort } from './client.js';
import { runIntegratorSql } from './runIntegratorSql.js';
import {
  runWithInfraPrincipal,
  runWithOrganizationPrincipal,
} from '../principal/organizationPrincipal.js';

export type IntegratorWorkerTestSource =
  | 'worker:job-queue-drain'
  | 'worker:outgoing-delivery-tick';

const TEST_FIXTURE_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

async function readConnectionIdentity(
  db: DbPort,
): Promise<{ databaseName: string; currentRole: string }> {
  const result = await runIntegratorSql<{ database_name: string; current_role: string }>(
    db,
    sql`SELECT current_database() AS database_name, current_user AS current_role`,
  );
  const row = result.rows[0];
  return {
    databaseName: row?.database_name ?? '',
    currentRole: row?.current_role ?? '',
  };
}

function assertTestDatabaseName(name: string, principalLabel: string): void {
  if (!/_test$/i.test(name)) {
    throw new Error(
      `refusing ${principalLabel}: current_database="${name}" — expected a *_test database`,
    );
  }
}

/**
 * REAL-Postgres integration-test boundary:
 * - fixture setup/cleanup uses the existing app_staff role (the same role that owns INSERT/DELETE);
 * - the behavior under test uses the exact locked worker source, therefore the operational pool and
 *   its narrow app_operational_delivery_worker role.
 */
export function createRealPostgresIntegrationTestHarness(runtimeSource: IntegratorWorkerTestSource) {
  function withFixtures<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
    return runWithOrganizationPrincipal(TEST_FIXTURE_ORGANIZATION_ID, () => fn(createDbPort()));
  }

  function withRuntime<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
    return runWithInfraPrincipal({ source: runtimeSource }, () => fn(createDbPort()));
  }

  async function assertTestDatabases(): Promise<void> {
    const [fixtureIdentity, runtimeIdentity] = await Promise.all([
      withFixtures(readConnectionIdentity),
      withRuntime(readConnectionIdentity),
    ]);
    assertTestDatabaseName(fixtureIdentity.databaseName, 'fixture connection');
    assertTestDatabaseName(runtimeIdentity.databaseName, `${runtimeSource} connection`);
    if (fixtureIdentity.currentRole !== 'app_staff') {
      throw new Error(
        `fixture connection must run as app_staff, got "${fixtureIdentity.currentRole}"`,
      );
    }
    if (runtimeIdentity.currentRole !== 'app_operational_delivery_worker') {
      throw new Error(
        `${runtimeSource} connection must run as app_operational_delivery_worker, got "${runtimeIdentity.currentRole}"`,
      );
    }
  }

  return {
    assertTestDatabases,
    withFixtures,
    withRuntime,
  };
}
