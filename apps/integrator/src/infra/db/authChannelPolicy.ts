import { sql } from 'drizzle-orm';
import type { DbPort } from '../../kernel/contracts/index.js';
import { runIntegratorSql } from './runIntegratorSql.js';
import { parseSystemSettingTrueLiteral } from './publicSystemSettings.js';

export type AuthChannel = 'email' | 'sms' | 'telegram' | 'max';

const SETTING_BY_CHANNEL: Readonly<Record<AuthChannel, string>> = {
  email: 'auth_email_enabled',
  sms: 'auth_sms_enabled',
  telegram: 'auth_telegram_enabled',
  max: 'auth_max_enabled',
};

/**
 * Fixed allowlist capability for the four global auth-channel enable flags. The integrator
 * runtime login receives EXECUTE on the function, never table SELECT.
 */
async function fetchAuthChannelSettingValueJson(
  db: DbPort,
  key: string,
): Promise<unknown | null> {
  const result = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT app.read_integrator_auth_channel_setting(${key}) AS value_json`,
  );
  return result.rows[0]?.value_json ?? null;
}

/**
 * Canonical auth-channel policy: a missing row, an unreadable row, and an explicit `false` are
 * all the same safe default — disabled. Only an explicit `true` (or the string `'true'`) enables
 * the channel; a read failure (denied/unreachable) fails closed the same way.
 */
export async function isAuthChannelEnabled(db: DbPort, channel: AuthChannel): Promise<boolean> {
  try {
    const valueJson = await fetchAuthChannelSettingValueJson(db, SETTING_BY_CHANNEL[channel]);
    if (valueJson === null) return false;
    return parseSystemSettingTrueLiteral(valueJson);
  } catch {
    return false;
  }
}
