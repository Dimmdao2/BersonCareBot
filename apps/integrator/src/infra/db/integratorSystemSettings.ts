import { sql } from 'drizzle-orm';
import type { DbPort } from '../../kernel/contracts/index.js';
import { runIntegratorSql } from './runIntegratorSql.js';
import { parseSystemSettingStringValue, parseSystemSettingTrueLiteral } from './publicSystemSettings.js';

async function readMirrorValue(db: DbPort, key: string): Promise<unknown | null> {
  const result = await runIntegratorSql<{ value_json: unknown }>(db, sql`
    SELECT value_json
    FROM integrator.system_settings
    WHERE key = ${key}
      AND scope = 'admin'
      AND organization_id IS NULL
    LIMIT 1
  `);
  return result.rows[0]?.value_json ?? null;
}

/** Global operator SMS readiness is fail-closed and sourced only from the integrator mirror. */
export async function isGlobalOperatorSmsReady(db: DbPort): Promise<boolean> {
  try {
    const [enabled, apiKey] = await Promise.all([
      readMirrorValue(db, 'smsc_enabled'),
      readMirrorValue(db, 'smsc_api_key'),
    ]);
    return enabled !== null
      && parseSystemSettingTrueLiteral(enabled)
      && apiKey !== null
      && (parseSystemSettingStringValue(apiKey)?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
