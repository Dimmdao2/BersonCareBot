/**
 * Runtime policy for how integrator resolves `linkedPhone` vs legacy `integrator.contacts`.
 * Stored in mirrored `system_settings` (admin scope), edited from webapp Admin Settings.
 */
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';

const ADMIN_SCOPE = 'admin';
const KEY = 'integrator_linked_phone_source';
const TTL_MS = 60_000;

export type IntegratorLinkedPhoneSource = 'public_then_contacts' | 'public_only' | 'contacts_only';

type CacheEntry = { value: IntegratorLinkedPhoneSource; expiresAt: number };
let cache: CacheEntry | null = null;

function parseValueJson(valueJson: unknown): IntegratorLinkedPhoneSource | null {
  if (valueJson !== null && typeof valueJson === 'object' && 'value' in (valueJson as Record<string, unknown>)) {
    const v = (valueJson as Record<string, unknown>).value;
    if (v === 'public_only' || v === 'contacts_only' || v === 'public_then_contacts') {
      return v;
    }
    if (typeof v === 'string') {
      const t = v.trim();
      if (t === 'public_only' || t === 'contacts_only' || t === 'public_then_contacts') return t;
    }
  }
  return null;
}

/** Merge public canon phone vs legacy messenger-labeled contact per admin policy. */
export function resolveLinkedPhoneNormalized(
  strategy: IntegratorLinkedPhoneSource,
  pubPhone: string | null | undefined,
  legacyContactPhone: string | null | undefined,
): string | null {
  const pub = pubPhone?.trim() ? pubPhone.trim() : null;
  const leg = legacyContactPhone?.trim() ? legacyContactPhone.trim() : null;
  if (strategy === 'public_only') return pub;
  if (strategy === 'contacts_only') return leg;
  return pub ?? leg;
}

/**
 * Reads `integrator_linked_phone_source` from `system_settings` (TTL cache).
 * Default `public_then_contacts` for safe staged rollout.
 */
export async function getIntegratorLinkedPhoneSource(db: DbPort): Promise<IntegratorLinkedPhoneSource> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }
  try {
    const res = await db.query<{ value_json: unknown }>(
      `SELECT value_json FROM system_settings WHERE key = $1 AND scope = $2 LIMIT 1`,
      [KEY, ADMIN_SCOPE],
    );
    const parsed = res.rows[0] ? parseValueJson(res.rows[0].value_json) : null;
    const value: IntegratorLinkedPhoneSource = parsed ?? 'public_then_contacts';
    cache = { value, expiresAt: now + TTL_MS };
    return value;
  } catch (err) {
    logger.warn({ err, key: KEY }, '[linkedPhoneSource] query failed, default public_then_contacts');
    return 'public_then_contacts';
  }
}

/** @internal */
export function resetIntegratorLinkedPhoneSourceCacheForTests(): void {
  cache = null;
}
