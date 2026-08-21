import { sql } from 'drizzle-orm';
import type { PlatformMergeDbClient } from './pgPlatformUserMerge.js';
import { runMergeSql, type MergeSqlExecutor } from './mergeSql.js';

export type CanonicalContactMutation =
  | { action: 'upsert'; kind: 'phone' | 'email'; valueNormalized: string; isPrimary: boolean; confirmedAt: string | null; sourceOrigin: 'direct' | 'oauth' }
  | { action: 'remove'; kind: 'phone' | 'email'; valueNormalized?: string }
  | { action: 'merge-from'; duplicatePlatformUserId: string }
  | { action: 'remove-all' };

/** The single physical writer for canonical phone/e-mail contacts. */
export async function mutateCanonicalUserContacts(
  db: PlatformMergeDbClient | MergeSqlExecutor,
  platformUserId: string,
  mutations: readonly CanonicalContactMutation[],
): Promise<void> {
  for (const mutation of mutations) {
    if (mutation.action === 'remove-all') {
      await runMergeSql(db, sql`DELETE FROM public.user_contacts WHERE platform_user_id = ${platformUserId}::uuid`);
      continue;
    }
    if (mutation.action === 'merge-from') {
      await runMergeSql(db, sql`UPDATE public.user_contacts
        SET platform_user_id = ${platformUserId}::uuid,
            is_primary = CASE
              WHEN EXISTS (
                SELECT 1 FROM public.user_contacts target_primary
                WHERE target_primary.platform_user_id = ${platformUserId}::uuid
                  AND target_primary.contact_kind = public.user_contacts.contact_kind
                  AND target_primary.is_primary = true
              ) THEN false
              ELSE public.user_contacts.is_primary
            END,
            updated_at = now()
        WHERE platform_user_id = ${mutation.duplicatePlatformUserId}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM public.user_contacts target
            WHERE target.platform_user_id = ${platformUserId}::uuid
              AND target.contact_kind = public.user_contacts.contact_kind
              AND target.value_normalized = public.user_contacts.value_normalized
          )`);
      await runMergeSql(db, sql`DELETE FROM public.user_contacts
        WHERE platform_user_id = ${mutation.duplicatePlatformUserId}::uuid`);
      continue;
    }
    if (mutation.action === 'remove') {
      await runMergeSql(db, sql`DELETE FROM public.user_contacts
        WHERE platform_user_id = ${platformUserId}::uuid AND contact_kind = ${mutation.kind}::text
          AND (${mutation.valueNormalized ?? null}::text IS NULL OR value_normalized = ${mutation.valueNormalized ?? null}::text)`);
      continue;
    }
    if (mutation.isPrimary) {
      await runMergeSql(db, sql`UPDATE public.user_contacts SET is_primary = false, updated_at = now()
        WHERE platform_user_id = ${platformUserId}::uuid AND contact_kind = ${mutation.kind}::text
          AND is_primary = true AND value_normalized <> ${mutation.valueNormalized}::text`);
    }
    const values = sql`(${platformUserId}::uuid, ${mutation.kind}::text, ${mutation.valueNormalized}::text,
      ${mutation.isPrimary}::boolean, ${mutation.confirmedAt}::timestamptz, ${mutation.sourceOrigin}::text, now())`;
    const conflictUpdate = sql`DO UPDATE SET is_primary = EXCLUDED.is_primary,
      confirmed_at = COALESCE(EXCLUDED.confirmed_at, public.user_contacts.confirmed_at),
      source_origin = EXCLUDED.source_origin, updated_at = now()
      WHERE public.user_contacts.platform_user_id = EXCLUDED.platform_user_id`;
    if (mutation.kind === 'phone') {
      const result = await runMergeSql(db, sql`INSERT INTO public.user_contacts (
          platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at
        ) VALUES ${values}
        ON CONFLICT (value_normalized) WHERE contact_kind = 'phone' ${conflictUpdate}`);
      if (result.rowCount === 0) {
        throw new Error('canonical_phone_contact_conflict');
      }
    } else {
      const result = await runMergeSql(db, sql`INSERT INTO public.user_contacts (
          platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at
        ) VALUES ${values}
        ON CONFLICT (value_normalized) WHERE contact_kind = 'email' ${conflictUpdate}`);
      if (result.rowCount === 0) {
        throw new Error('canonical_email_contact_conflict');
      }
    }
  }
}
