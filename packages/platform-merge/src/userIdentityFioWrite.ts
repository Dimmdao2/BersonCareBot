import { sql } from 'drizzle-orm';
import type { PlatformMergeDbClient } from './pgPlatformUserMerge.js';
import { runMergeSql, type MergeSqlExecutor } from './mergeSql.js';

/**
 * D15b/5 dual-write: mirror FIO columns from `platform_users` into `user_identity`.
 * Called after every identity projection write while columns still live on both tables.
 */
export async function syncUserIdentityFioMirror(
  db: PlatformMergeDbClient | MergeSqlExecutor,
  platformUserId: string,
): Promise<void> {
  await runMergeSql(
    db,
    sql`INSERT INTO user_identity (
       platform_user_id, first_name, last_name, patronymic, display_name, birth_date, updated_at
     )
     SELECT
       id, first_name, last_name, patronymic, COALESCE(display_name, ''), birth_date, now()
     FROM platform_users
     WHERE id = ${platformUserId}::uuid AND merged_into_id IS NULL
     ON CONFLICT (platform_user_id) DO UPDATE SET
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       patronymic = EXCLUDED.patronymic,
       display_name = EXCLUDED.display_name,
       birth_date = EXCLUDED.birth_date,
       updated_at = now()`,
  );
}
