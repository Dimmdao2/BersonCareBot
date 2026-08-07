/**
 * Admin-флаг `debug_forward_to_admin` (`public.system_settings`, scope admin) управляет полнотой
 * серверных логов integrator (journalctl): `false` (default) — только значимое (warn/error/DLQ/retry-fail);
 * `true` — подробные operational `info`. Verbose-логи не содержат сырые params/payload/PII.
 */
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import {
  fetchOperationalVerboseLogFlag,
  fetchPublicSystemSettingValueJson,
  parseSystemSettingTrueLiteral,
} from '../publicSystemSettings.js';
import { getCurrentIntegratorTechnicalRuntimeRole } from '../withClient.js';

const KEY = 'debug_forward_to_admin';

/** Reads `debug_forward_to_admin` from `public.system_settings` on demand. Fail-safe `false`. */
export async function getOperationalVerboseLogEnabled(db: DbPort): Promise<boolean> {
  try {
    // Worker/scheduler contours read it through the capability: their roles cannot touch the
    // settings table, and before this every drained delivery logged a 42501 warn line for it.
    if (getCurrentIntegratorTechnicalRuntimeRole() !== undefined) {
      return await fetchOperationalVerboseLogFlag(db);
    }
    const valueJson = await fetchPublicSystemSettingValueJson(db, KEY);
    return valueJson !== null ? parseSystemSettingTrueLiteral(valueJson) : false;
  } catch (err) {
    logger.warn({ err, key: KEY }, '[operationalVerboseLog] query failed, default false');
    return false;
  }
}
