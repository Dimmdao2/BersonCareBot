/**
 * Атомарная очистка всех дневниковых данных пользователя (симптомы + ЛФК).
 * Не удаляет platform_users и не трогает профиль вне таблиц дневника.
 */
import { getPool } from "@/infra/db/client";
import { withUserLifecycleLock } from "@/infra/userLifecycleLock";
import type { PoolClient } from "pg";

function userMatchSql(tableAlias: string, userParamIndex: number): string {
  return `(${tableAlias}.platform_user_id = $${userParamIndex}::uuid OR (${tableAlias}.platform_user_id IS NULL AND ${tableAlias}.user_id = $${userParamIndex}::text))`;
}

async function purgeDiaryTablesInTransaction(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE lfk_complexes
       SET symptom_tracking_id = NULL, updated_at = now()
       WHERE ${userMatchSql("lfk_complexes", 1)}`,
    [userId],
  );

  await client.query(
    `UPDATE patient_lfk_assignments
       SET complex_id = NULL
       WHERE complex_id IN (
         SELECT id
         FROM lfk_complexes c
         WHERE ${userMatchSql("c", 1)}
       )`,
    [userId],
  );

  await client.query(`DELETE FROM symptom_trackings t WHERE ${userMatchSql("t", 1)}`, [userId]);

  await client.query(`DELETE FROM lfk_complexes c WHERE ${userMatchSql("c", 1)}`, [userId]);
}

export async function purgeAllDiaryDataForUserPg(userId: string): Promise<void> {
  const pool = getPool();
  await withUserLifecycleLock(pool, userId, "exclusive", async (client) => {
    await purgeDiaryTablesInTransaction(client, userId);
  });
}
