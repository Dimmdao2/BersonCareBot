/**
 * Admin-флаг `debug_forward_to_admin` (`public.system_settings`, scope admin) управляет полнотой
 * серверных логов integrator (journalctl): `false` (default) — только значимое (warn/error/DLQ/retry-fail);
 * `true` — подробные operational `info`. Verbose-логи не содержат сырые params/payload/PII.
 */
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { fetchOperationalVerboseLogFlag } from '../publicSystemSettings.js';

const KEY = 'debug_forward_to_admin';

/** Reads `debug_forward_to_admin` from `public.system_settings` on demand. Fail-safe `false`. */
export async function getOperationalVerboseLogEnabled(db: DbPort): Promise<boolean> {
  try {
    return await fetchOperationalVerboseLogFlag(db);
  } catch (err) {
    logger.warn({ err, key: KEY }, '[operationalVerboseLog] query failed, default false');
    return false;
  }
}
