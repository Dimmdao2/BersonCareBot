import { sql } from 'drizzle-orm';
import type { PlatformMergeDbClient } from './pgPlatformUserMerge.js';
import { runMergeSql, type MergeSqlExecutor } from './mergeSql.js';

export type CanonicalContactMutation =
  | { action: 'upsert'; kind: 'phone' | 'email'; valueNormalized: string; isPrimary: boolean; confirmedAt: string | null; sourceOrigin: 'direct' | 'oauth' }
  | { action: 'promote'; kind: 'phone' | 'email'; valueNormalized: string }
  | { action: 'remove'; kind: 'phone' | 'email'; valueNormalized?: string }
  | { action: 'merge-from'; duplicatePlatformUserId: string }
  | { action: 'remove-all' };

function databaseErrorField(error: unknown, field: string): unknown {
  return typeof error === 'object' && error !== null ? Reflect.get(error, field) : undefined;
}

function canonicalContactConflict(error: unknown, kind: 'phone' | 'email'): Error | null {
  if (databaseErrorField(error, 'code') !== '23505') return null;
  if (databaseErrorField(error, 'constraint') !== `uq_user_contacts_${kind}`) return null;
  return new Error(`canonical_${kind}_contact_conflict`, { cause: error });
}

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
    if (mutation.action === 'promote') {
      const result = await runMergeSql(db, sql`WITH demoted_primary AS (
          UPDATE public.user_contacts
          SET is_primary = false, updated_at = now()
          WHERE platform_user_id = ${platformUserId}::uuid
            AND contact_kind = ${mutation.kind}::text
            AND is_primary = true
            AND value_normalized <> ${mutation.valueNormalized}::text
          RETURNING id
        ), promoted_value AS (
          UPDATE public.user_contacts
          SET is_primary = true, updated_at = now()
          WHERE platform_user_id = ${platformUserId}::uuid
            AND contact_kind = ${mutation.kind}::text
            AND value_normalized = ${mutation.valueNormalized}::text
            AND (SELECT count(*) FROM demoted_primary) >= 0
          RETURNING id
        )
        SELECT id FROM promoted_value`);
      if (result.rowCount === 0) {
        throw new Error(`canonical_${mutation.kind}_contact_missing`);
      }
      continue;
    }
    try {
      const result = await runMergeSql(db, sql`WITH existing_value AS MATERIALIZED (
          SELECT id, platform_user_id
          FROM public.user_contacts
          WHERE contact_kind = ${mutation.kind}::text
            AND value_normalized = ${mutation.valueNormalized}::text
          FOR UPDATE
        ), demoted_primary AS (
          UPDATE public.user_contacts
          SET is_primary = false, updated_at = now()
          WHERE ${mutation.isPrimary}::boolean
            AND platform_user_id = ${platformUserId}::uuid
            AND contact_kind = ${mutation.kind}::text
            AND is_primary = true
            AND value_normalized <> ${mutation.valueNormalized}::text
            AND NOT EXISTS (
              SELECT 1 FROM existing_value WHERE platform_user_id <> ${platformUserId}::uuid
            )
          RETURNING id
        ), updated_value AS (
          UPDATE public.user_contacts
          SET is_primary = ${mutation.isPrimary}::boolean,
              confirmed_at = COALESCE(${mutation.confirmedAt}::timestamptz, confirmed_at),
              source_origin = ${mutation.sourceOrigin}::text,
              updated_at = now()
          WHERE platform_user_id = ${platformUserId}::uuid
            AND contact_kind = ${mutation.kind}::text
            AND value_normalized = ${mutation.valueNormalized}::text
            AND (SELECT count(*) FROM demoted_primary) >= 0
          RETURNING id
        ), inserted_value AS (
          INSERT INTO public.user_contacts (
            platform_user_id, contact_kind, value_normalized,
            is_primary, confirmed_at, source_origin, updated_at
          )
          SELECT ${platformUserId}::uuid, ${mutation.kind}::text, ${mutation.valueNormalized}::text,
                 ${mutation.isPrimary}::boolean, ${mutation.confirmedAt}::timestamptz,
                 ${mutation.sourceOrigin}::text, now()
          WHERE NOT EXISTS (SELECT 1 FROM existing_value)
            AND (SELECT count(*) FROM demoted_primary) >= 0
          RETURNING id
        )
        SELECT id FROM updated_value
        UNION ALL
        SELECT id FROM inserted_value`);
      if (result.rowCount === 0) {
        throw new Error(`canonical_${mutation.kind}_contact_conflict`);
      }
    } catch (error: unknown) {
      const conflict = canonicalContactConflict(error, mutation.kind);
      if (conflict) throw conflict;
      throw error;
    }
  }
}
