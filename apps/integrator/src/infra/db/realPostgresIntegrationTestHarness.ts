import { execFileSync } from 'node:child_process';
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

export type RealPostgresPrincipalContextMode = 'locked' | 'port-context';

// Организация, под которой работают фикстуры. Обязана СУЩЕСТВОВАТЬ в `be_organizations`: таблица под
// FORCE RLS, завести временную нельзя (deploy прямо ассертит отсутствие вставляющей политики у app_staff),
// а под несуществующей организацией построчная защита честно отдаёт ноль строк — снимок журнала выродится
// в «0 = 0» и ничего не докажет (поймано живым прогоном 31.07). Это идентификатор демо-организации тестовой
// базы; тест её данные только ЧИТАЕТ, а свои строки очереди метит уникальными идентификаторами события.
const TEST_FIXTURE_ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001';

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
  if (name !== 'bcb_webapp_dev' && !/_test$/i.test(name)) {
    throw new Error(
      `refusing ${principalLabel}: current_database="${name}" — expected bcb_webapp_dev or a *_test database`,
    );
  }
}

/**
 * REAL-Postgres integration-test boundary:
 * - fixture setup/cleanup uses the mode's real organization-principal role: app_staff in locked mode,
 *   app_tenant_service in port-context mode;
 * - the behavior under test uses the exact worker source and its narrow
 *   app_operational_delivery_worker role in both modes.
 */
export function createRealPostgresIntegrationTestHarness(
  runtimeSource: IntegratorWorkerTestSource,
  principalContextMode: RealPostgresPrincipalContextMode,
) {
  let adminDatabaseName: string | undefined;

  function withFixtures<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
    return runWithOrganizationPrincipal(TEST_FIXTURE_ORGANIZATION_ID, () => fn(createDbPort()));
  }

  function withRuntime<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
    return runWithInfraPrincipal({ source: runtimeSource }, () => fn(createDbPort()));
  }

  async function assertTestDatabases(): Promise<void> {
    if (process.env.DB_PRINCIPAL_CONTEXT_MODE !== principalContextMode) {
      throw new Error(
        `integration harness expected DB_PRINCIPAL_CONTEXT_MODE=${principalContextMode}, got "${process.env.DB_PRINCIPAL_CONTEXT_MODE ?? ''}"`,
      );
    }
    const [fixtureIdentity, runtimeIdentity] = await Promise.all([
      withFixtures(readConnectionIdentity),
      withRuntime(readConnectionIdentity),
    ]);
    assertTestDatabaseName(fixtureIdentity.databaseName, 'fixture connection');
    assertTestDatabaseName(runtimeIdentity.databaseName, `${runtimeSource} connection`);
    const expectedFixtureRole =
      principalContextMode === 'port-context' ? 'app_tenant_service' : 'app_staff';
    if (fixtureIdentity.currentRole !== expectedFixtureRole) {
      throw new Error(
        `fixture connection must run as ${expectedFixtureRole} in ${principalContextMode} mode, got "${fixtureIdentity.currentRole}"`,
      );
    }
    if (runtimeIdentity.currentRole !== 'app_operational_delivery_worker') {
      throw new Error(
        `${runtimeSource} connection must run as app_operational_delivery_worker, got "${runtimeIdentity.currentRole}"`,
      );
    }
    adminDatabaseName = fixtureIdentity.databaseName;
  }

  function withAdminSocket(sqlText: string): string {
    if (adminDatabaseName === undefined) {
      throw new Error('integration harness admin socket requires assertTestDatabases() first');
    }
    assertTestDatabaseName(adminDatabaseName, 'admin-socket fixture connection');
    return execFileSync(
      'sudo',
      ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
        '-h', '/var/run/postgresql', '-p', '5432', '-d', adminDatabaseName,
        '-v', 'ON_ERROR_STOP=1', '-f', '-'],
      { input: sqlText, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    ).trim();
  }

  return {
    assertTestDatabases,
    withAdminSocket,
    withFixtures,
    withRuntime,
  };
}
