import { createDbPort } from '../client.js';
import { logger } from '../../observability/logger.js';

const TTL_MS = 60_000;

type CacheEntry = {
  value: string;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();

function readCache(key: string): string | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > TTL_MS) return null;
  return hit.value;
}

function writeCache(key: string, value: string): void {
  cache.set(key, { value, fetchedAt: Date.now() });
}

function normalizeStringValue(valueJson: unknown): string | null {
  if (valueJson === null || typeof valueJson !== 'object' || !('value' in valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resetAdminRuntimeConfigCache(): void {
  cache.clear();
}

export async function getAdminSettingString(key: string, envFallback: string): Promise<string> {
  const cached = readCache(key);
  if (cached !== null) return cached;

  // Keep tests deterministic and fast without DB dependency.
  if (process.env.NODE_ENV === 'test') {
    writeCache(key, envFallback);
    return envFallback;
  }

  try {
    const db = createDbPort();
    const res = await db.query<{ value_json: unknown }>(
      `SELECT value_json
       FROM system_settings
       WHERE key = $1 AND scope = 'admin'
       LIMIT 1`,
      [key],
    );
    const fromDb = normalizeStringValue(res.rows[0]?.value_json);
    const resolved = fromDb ?? envFallback;
    writeCache(key, resolved);
    return resolved;
  } catch (err) {
    logger.warn({ err, key }, '[adminRuntimeConfig] failed to read system_settings, using env fallback');
    writeCache(key, envFallback);
    return envFallback;
  }
}

export async function getAdminSettingBoolean(key: string, envFallback: boolean): Promise<boolean> {
  const raw = await getAdminSettingString(key, envFallback ? 'true' : '');
  if (!raw) return false;
  return /^(1|true|yes)$/i.test(raw);
}
