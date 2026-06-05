/**
 * Admin-флаг `debug_forward_to_admin` (`public.system_settings`, scope admin) управляет полнотой
 * серверных логов integrator (journalctl): `false` (default) — только значимое (warn/error/DLQ/retry-fail);
 * `true` — подробные operational `info`. Verbose-логи не содержат сырые params/payload/PII. TTL-кэш.
 */
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import {
  fetchPublicSystemSettingValueJson,
  parseSystemSettingTrueLiteral,
} from '../publicSystemSettings.js';

const KEY = 'debug_forward_to_admin';
const TTL_MS = 60_000;

type CacheEntry = { value: boolean; expiresAt: number };
let cache: CacheEntry | null = null;

/** Reads `debug_forward_to_admin` from `public.system_settings` (TTL cache). Fail-safe `false`. */
export async function getOperationalVerboseLogEnabled(db: DbPort): Promise<boolean> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }
  try {
    const valueJson = await fetchPublicSystemSettingValueJson(db, KEY);
    const value = valueJson !== null ? parseSystemSettingTrueLiteral(valueJson) : false;
    cache = { value, expiresAt: now + TTL_MS };
    return value;
  } catch (err) {
    logger.warn({ err, key: KEY }, '[operationalVerboseLog] query failed, default false');
    return false;
  }
}

/** Drops cache so the next read reflects a freshly synced flag value (called from settings/sync). */
export function invalidateOperationalVerboseLogCache(): void {
  cache = null;
}

/** @internal */
export function resetOperationalVerboseLogCacheForTests(): void {
  cache = null;
}
