/**
 * Публичный origin веб-приложения (HTTPS): DB-backed runtime setting `app_base_url`.
 * Должен совпадать с webapp и с URL мини-приложения в кабинете мессенджера.
 */
import type { DbPort } from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { readGlobalServerRuntimeString } from '../infra/db/publicRuntimeSettings.js';
import { runWithBootstrapPrincipal } from '../infra/principal/organizationPrincipal.js';

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
 * Резолвит базовый URL вебаппа из server-runtime store с кэшем 60s.
 * Missing, invalid, or inaccessible DB config is a startup/runtime error; no env fallback exists.
 */
export async function getAppBaseUrl(db: DbPort): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.url;
  }

  try {
    const raw = await runWithBootstrapPrincipal(
      { source: 'integrator-server-runtime-config' },
      () => readGlobalServerRuntimeString(db, KEY),
    );
    if (raw == null || raw === '') {
      throw new Error('app_base_url_runtime_setting_missing');
    }
    if (!isValidHttpUrl(raw)) {
      throw new Error('app_base_url_runtime_setting_invalid');
    }
    const resolved = normalizeBase(raw);
    cache = { url: resolved, expiresAt: now + TTL_MS };
    return resolved;
  } catch (err) {
    logger.error({ err, key: KEY }, '[appBaseUrl] DB-backed runtime setting unavailable');
    throw err;
  }
}

/**
 * Синхронное чтение последнего успешного DB-backed значения.
 * Startup preflight must populate the cache before synchronous consumers are used.
 */
export function getAppBaseUrlSync(): string {
  if (cache?.url) {
    return cache.url;
  }
  throw new Error('app_base_url_runtime_setting_not_initialized');
}

/** Сброс кэша (например после синка настроек из webapp). */
export function invalidateAppBaseUrlCache(): void {
  cache = null;
}
