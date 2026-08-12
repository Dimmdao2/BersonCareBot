import { sql } from 'drizzle-orm';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import type { DbPort } from '../../kernel/contracts/index.js';
import {
  getCurrentDatabasePrincipal,
  runWithBootstrapPrincipal,
} from '../principal/organizationPrincipal.js';
import { runIntegratorNamedRoot } from './runIntegratorSql.js';
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
  const result = await runWithDbInfraPrincipal({ source: 'integrator-server-runtime-config' }, () =>
    runIntegratorNamedRoot<{ value_json: unknown }>(
      db, 'app.read_integrator_auth_channel_setting(text)', [key],
      sql`SELECT app.read_integrator_auth_channel_setting(${key}) AS value_json`,
    ));
  return result.rows[0]?.value_json ?? null;
}

/**
 * Signed M2M auth routes have no tenant principal. The fixed-key accessor is part of the
 * integrator runtime-config capability, so classify only that no-principal read through the
 * existing locked-mode bootstrap source. Preserve an already established request/worker principal.
 */
function readAuthChannelSettingValueJson(db: DbPort, key: string): Promise<unknown | null> {
  const fetch = () => fetchAuthChannelSettingValueJson(db, key);
  if (getCurrentDatabasePrincipal()) return fetch();
  return runWithBootstrapPrincipal({ source: 'integrator-server-runtime-config' }, fetch);
}

/**
 * Canonical auth-channel policy: a missing row, an unreadable row, and an explicit `false` are
 * all the same safe default — disabled. Only an explicit `true` (or the string `'true'`) enables
 * the channel; a read failure (denied/unreachable) fails closed the same way.
 */
export async function isAuthChannelEnabled(db: DbPort, channel: AuthChannel): Promise<boolean> {
  try {
    const valueJson = await readAuthChannelSettingValueJson(db, SETTING_BY_CHANNEL[channel]);
    if (valueJson === null) return false;
    return parseSystemSettingTrueLiteral(valueJson);
  } catch {
    return false;
  }
}
