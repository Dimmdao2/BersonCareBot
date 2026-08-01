import type { QueryResultRow } from 'pg';

/**
 * Загрузочная проба на ОТДЕЛЬНОМ одноразовом соединении по сырому `DATABASE_URL`.
 *
 * Почему не общий порт: проба выполняется до того, как приложение обслуживает запросы, и по
 * построению не имеет принципала — маршрутный пул её бы отклонил (и правильно). Поэтому здесь
 * заводится собственный пул на одно соединение, который сразу же закрывается. Это единственное
 * место вне порта, которому разрешено трогать драйвер напрямую, и живёт оно в `infra/db` именно
 * поэтому: сырого клиента снаружи `infra/db` нет нигде.
 */
export async function runBootProbePgText<T extends QueryResultRow = QueryResultRow>(
  databaseUrl: string,
  queryText: string,
  values: readonly unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const result = await pool.query<T>(queryText, [...values]);
    return { rows: result.rows ?? [], rowCount: result.rowCount ?? 0 };
  } finally {
    await pool.end();
  }
}

/** The real probe. Kept separate from the assertion so the assertion stays unit-testable. */
export async function probeSessionRevocationColumn(databaseUrl: string): Promise<boolean> {
  // pg_catalog, NOT information_schema. `information_schema.columns` is PRIVILEGE-FILTERED: it only
  // shows columns the connecting role holds some privilege on. This connection uses the plain
  // DATABASE_URL role, which is the infra/worker login — it does not serve requests and has no grant
  // on session_epoch — so information_schema returned zero rows for a column that plainly exists, and
  // the guard refused to boot a perfectly healthy TEST while telling the operator to run a migration
  // that had already been applied. Verified live on 2026-07-26: the column was present in pg_attribute
  // for all three roles, and both roles that DO serve requests (staff and nonstaff logins) could read
  // it; only the probe's own role could not. pg_catalog is not privilege-filtered, so "absent" here
  // means genuinely absent — which is the only thing this guard is entitled to claim.
  const result = await runBootProbePgText(
    databaseUrl,
    `SELECT 1
         FROM pg_catalog.pg_attribute AS attribute
         JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
         JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'platform_users'
          AND attribute.attname = 'session_epoch'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped`,
  );
  return result.rowCount === 1;
}
