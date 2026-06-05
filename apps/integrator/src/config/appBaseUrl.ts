/**
 * Публичный origin веб-приложения (HTTPS): `system_settings.app_base_url` (admin), fallback `APP_BASE_URL` в env.
 * Должен совпадать с webapp и с URL мини-приложения в кабинете мессенджера.
 */
import type { DbPort } from '../kernel/contracts/index.js';
import { env } from './env.js';
import { logger } from '../infra/observability/logger.js';
import { readPublicSystemSettingString } from '../infra/db/publicSystemSettings.js';

const KEY = 'app_base_url';
const TTL_MS = 60_000;

type CacheEntry = { url: string; expiresAt: number };
let cache: CacheEntry | null = null;

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeBase(s: string): string {
  return s.trim().replace(/\/$/, '');
}

/**
 * Резолвит базовый URL вебаппа из `public.system_settings` с кэшем 60s, иначе env.
 */
export async function getAppBaseUrl(db: DbPort): Promise<string> {
  const envFallback = normalizeBase(env.APP_BASE_URL ?? '');
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.url || envFallback;
  }

  let dbValue: string | null = null;
  try {
    const raw = await readPublicSystemSettingString(db, KEY);
    if (raw != null && raw !== '' && isValidHttpUrl(raw)) {
      dbValue = normalizeBase(raw);
    } else if (raw != null && raw !== '') {
      logger.warn({ raw, key: KEY }, '[appBaseUrl] invalid URL in system_settings, using env fallback');
    }
  } catch (err) {
    logger.warn({ err, key: KEY }, '[appBaseUrl] query failed, using env fallback');
  }

  const resolved = dbValue || envFallback;
  cache = { url: resolved, expiresAt: now + TTL_MS };
  return resolved;
}

/**
 * Синхронное чтение последнего закэшированного значения или env (до первого async `getAppBaseUrl`).
 */
export function getAppBaseUrlSync(): string {
  const envFallback = normalizeBase(env.APP_BASE_URL ?? '');
  const now = Date.now();
  if (cache && cache.expiresAt > now && cache.url) {
    return cache.url;
  }
  return envFallback;
}

/** Сброс кэша (например после синка настроек из webapp). */
export function invalidateAppBaseUrlCache(): void {
  cache = null;
}
