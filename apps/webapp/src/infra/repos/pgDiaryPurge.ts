/**
 * Атомарная очистка всех дневниковых данных пользователя (симптомы + ЛФК).
 * Не удаляет platform_users и не трогает профиль вне таблиц дневника.
 */
import { sql } from 'drizzle-orm';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient, runWebappSql } from '@/infra/db/runWebappSql';
import { platformUserMatchSql } from '@/infra/repos/platformUserMatchSql';
import { withUserLifecycleLock } from '@/infra/userLifecycleLock';
import type { PoolClient } from 'pg';

async function purgeDiaryTablesInTransaction(client: PoolClient, userId: string): Promise<void> {
  const db = getWebappSqlFromPgClient(client);

  await runWebappSql(
    db,
    sql`UPDATE lfk_complexes
       SET symptom_tracking_id = NULL, updated_at = now()
       WHERE ${platformUserMatchSql('lfk_complexes', userId)}`,
  );

  await runWebappSql(
    db,
    sql`UPDATE patient_lfk_assignments
       SET complex_id = NULL
       WHERE complex_id IN (
         SELECT id
         FROM lfk_complexes c
         WHERE ${platformUserMatchSql('c', userId)}
       )`,
  );

  await runWebappSql(
    db,
    sql`DELETE FROM symptom_trackings t WHERE ${platformUserMatchSql('t', userId)}`,
  );

  await runWebappSql(
    db,
    sql`DELETE FROM lfk_complexes c WHERE ${platformUserMatchSql('c', userId)}`,
  );
}

export async function purgeAllDiaryDataForUserPg(userId: string): Promise<void> {
  const pool = getPool();
  await withUserLifecycleLock(pool, userId, 'exclusive', async (client) => {
    await purgeDiaryTablesInTransaction(client, userId);
  });
}
