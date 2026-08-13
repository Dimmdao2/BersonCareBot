import { sql } from 'drizzle-orm';
import type { PlatformMergeDbClient } from './pgPlatformUserMerge.js';
import { runMergeSql, type MergeSqlExecutor } from './mergeSql.js';

/**
 * D15b/5 dual-write: mirror FIO columns from `platform_users` into `user_identity`.
 * Called after every identity projection write while columns still live on both tables.
 *
 * No `merged_into_id IS NULL` filter: readers dropped their COALESCE fallback, so every
 * `platform_users` row — merge tombstones included — must carry a mirror row or its FIO reads NULL
 * (migration 0381 backfilled the tombstones that 0377 skipped). Unlike `user_contacts`, this table
 * has no uniqueness that a tombstone could collide with: its key is `platform_user_id`.
 */
export async function syncUserIdentityFioMirror(
  db: PlatformMergeDbClient | MergeSqlExecutor,
  platformUserId: string,
): Promise<void> {
  await runMergeSql(
    db,
    sql`INSERT INTO public.user_identity (
       platform_user_id, first_name, last_name, patronymic, display_name, birth_date, updated_at
     )
     SELECT
       id, first_name, last_name, patronymic, COALESCE(display_name, ''), birth_date, now()
     FROM public.platform_users
     WHERE id = ${platformUserId}::uuid
     ON CONFLICT (platform_user_id) DO UPDATE SET
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       patronymic = EXCLUDED.patronymic,
       display_name = EXCLUDED.display_name,
       birth_date = EXCLUDED.birth_date,
       updated_at = now()`,
  );
}
