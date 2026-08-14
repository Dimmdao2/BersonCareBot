import { sql } from 'drizzle-orm';
import type { PlatformMergeDbClient } from './pgPlatformUserMerge.js';
import { runMergeSql, type MergeSqlExecutor } from './mergeSql.js';

/**
 * D15b/6 dual-write: rebuild `user_contacts` for one user from the four source tables.
 * Called after contact writes while legacy columns/bindings remain authoritative.
 */
export async function syncUserContactsMirror(
  db: PlatformMergeDbClient | MergeSqlExecutor,
  platformUserId: string,
): Promise<void> {
  await runMergeSql(
    db,
    sql`DELETE FROM public.user_contacts WHERE platform_user_id = ${platformUserId}::uuid`,
  );

  await runMergeSql(
    db,
    sql`INSERT INTO public.user_contacts (
       platform_user_id, contact_kind, value_normalized,
       is_primary, confirmed_at, source_origin, updated_at
     )
     SELECT pu.id, 'phone', pu.phone_normalized,
            true, pu.patient_phone_trust_at, 'platform_users', now()
     FROM public.platform_users pu
     WHERE pu.id = ${platformUserId}::uuid AND pu.merged_into_id IS NULL AND pu.phone_normalized IS NOT NULL`,
  );

  await runMergeSql(
    db,
    sql`INSERT INTO public.user_contacts (
       platform_user_id, contact_kind, value_normalized,
       is_primary, confirmed_at, source_origin, updated_at
     )
     SELECT pu.id, 'email', pu.email_normalized,
            true, pu.email_verified_at, 'platform_users', now()
     FROM public.platform_users pu
     WHERE pu.id = ${platformUserId}::uuid AND pu.merged_into_id IS NULL AND pu.email_normalized IS NOT NULL`,
  );

  await runMergeSql(
    db,
    sql`INSERT INTO public.user_contacts (
       platform_user_id, contact_kind, value_normalized,
       is_primary, confirmed_at, source_origin, updated_at
     )
     SELECT ob.user_id, 'email', lower(btrim(ob.email)),
            false, ob.created_at, 'oauth_binding', now()
     FROM public.user_oauth_bindings ob
     INNER JOIN public.platform_users pu ON pu.id = ob.user_id
     WHERE ob.user_id = ${platformUserId}::uuid
       AND pu.merged_into_id IS NULL
       AND ob.email IS NOT NULL
       AND btrim(ob.email) <> ''`,
  );

  await runMergeSql(
    db,
    sql`INSERT INTO public.user_contacts (
       platform_user_id, contact_kind, value_normalized,
       is_primary, confirmed_at, source_origin, updated_at
     )
     SELECT uph.platform_user_id, 'phone', uph.phone_normalized,
            false, uph.valid_from, 'phone_history', now()
     FROM public.user_phone_history uph
     INNER JOIN public.platform_users pu ON pu.id = uph.platform_user_id
     WHERE uph.platform_user_id = ${platformUserId}::uuid
       AND uph.valid_to IS NULL
       AND pu.merged_into_id IS NULL`,
  );

  // No `channel` slice: messenger links live in `public.user_channel_bindings` and are read from
  // there (migration 0382 removed the mirrored copy — it was 131/131 identical and duplicated that
  // table's uniqueness, while the integrator hot path never read the mirror in the first place).
}

/**
 * Phone-only refresh for the integrator messenger bind boundary.
 * It preserves email mirror rows and therefore never needs direct access to OAuth credentials.
 */
export async function syncUserContactsPhoneMirror(
  db: PlatformMergeDbClient | MergeSqlExecutor,
  platformUserId: string,
): Promise<void> {
  await runMergeSql(
    db,
    sql`DELETE FROM public.user_contacts
     WHERE platform_user_id = ${platformUserId}::uuid AND contact_kind = 'phone'`,
  );

  await runMergeSql(
    db,
    sql`INSERT INTO public.user_contacts (
       platform_user_id, contact_kind, value_normalized,
       is_primary, confirmed_at, source_origin, updated_at
     )
     SELECT pu.id, 'phone', pu.phone_normalized,
            true, pu.patient_phone_trust_at, 'platform_users', now()
     FROM public.platform_users pu
     WHERE pu.id = ${platformUserId}::uuid
       AND pu.merged_into_id IS NULL
       AND pu.phone_normalized IS NOT NULL`,
  );

  await runMergeSql(
    db,
    sql`INSERT INTO public.user_contacts (
       platform_user_id, contact_kind, value_normalized,
       is_primary, confirmed_at, source_origin, updated_at
     )
     SELECT uph.platform_user_id, 'phone', uph.phone_normalized,
            false, uph.valid_from, 'phone_history', now()
     FROM public.user_phone_history uph
     INNER JOIN public.platform_users pu ON pu.id = uph.platform_user_id
     WHERE uph.platform_user_id = ${platformUserId}::uuid
       AND uph.valid_to IS NULL
       AND pu.merged_into_id IS NULL`,
  );
}

/** Remove duplicate mirror rows before rebuilding target contacts (post-D15b/6 uniqueness on user_contacts). */
export async function clearDuplicateUserContactsBeforeTargetMirror(
  db: PlatformMergeDbClient | MergeSqlExecutor,
  duplicateId: string,
): Promise<void> {
  await runMergeSql(
    db,
    sql`DELETE FROM public.user_contacts WHERE platform_user_id = ${duplicateId}::uuid`,
  );
}
