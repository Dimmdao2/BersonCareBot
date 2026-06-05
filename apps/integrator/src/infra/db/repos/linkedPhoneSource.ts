/**
 * Runtime policy for how integrator resolves `linkedPhone` vs legacy `integrator.contacts`.
 * Stored in `public.system_settings` (admin scope), edited from webapp Admin Settings.
 */
import { z } from 'zod';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import {
  fetchPublicSystemSettingValueJson,
  parseSystemSettingInnerWithSchema,
} from '../publicSystemSettings.js';

const KEY = 'integrator_linked_phone_source';
const TTL_MS = 60_000;

export type IntegratorLinkedPhoneSource = 'public_then_contacts' | 'public_only' | 'contacts_only';

const integratorLinkedPhoneSourceInnerSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : v),
  z.enum(['public_then_contacts', 'public_only', 'contacts_only']),
);

type CacheEntry = { value: IntegratorLinkedPhoneSource; expiresAt: number };
let cache: CacheEntry | null = null;

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
 * Reads `integrator_linked_phone_source` from `public.system_settings` (TTL cache).
 * Default `public_then_contacts` for safe staged rollout.
 */
export async function getIntegratorLinkedPhoneSource(db: DbPort): Promise<IntegratorLinkedPhoneSource> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }
  try {
    const valueJson = await fetchPublicSystemSettingValueJson(db, KEY);
    const parsed =
      valueJson !== null
        ? parseSystemSettingInnerWithSchema(valueJson, integratorLinkedPhoneSourceInnerSchema)
        : null;
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
