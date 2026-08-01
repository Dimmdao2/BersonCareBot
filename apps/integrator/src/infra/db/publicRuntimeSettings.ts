/**
 * Narrow reads from the canonical server-runtime settings root.
 *
 * The database function is SECURITY DEFINER and exposes only global rows whose
 * audience is `server`; the integrator runtime receives EXECUTE, never table access.
 */
import { sql } from 'drizzle-orm';
import type { DbPort } from '../../kernel/contracts/index.js';
import { parseSystemSettingStringValue } from './publicSystemSettings.js';
import { runIntegratorSql } from './runIntegratorSql.js';

export async function readGlobalServerRuntimeString(
  db: DbPort,
  key: string,
): Promise<string | null> {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    throw new Error('server_runtime_setting_key_required');
  }

  const result = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT app.read_global_server_runtime_setting(${normalizedKey}) AS value_json`,
  );
  const row = result.rows[0];
  return row ? parseSystemSettingStringValue(row.value_json) : null;
}
