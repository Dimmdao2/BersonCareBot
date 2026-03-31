/**
 * Атомарная очистка всех дневниковых данных пользователя (симптомы + ЛФК).
 * Не удаляет platform_users и не трогает профиль вне таблиц дневника.
 */
import { getPool } from "@/infra/db/client";

export async function purgeAllDiaryDataForUserPg(userId: string): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE lfk_complexes SET symptom_tracking_id = NULL, updated_at = now() WHERE user_id = $1`,
      [userId]
    );

    await client.query(
      `UPDATE patient_lfk_assignments
       SET complex_id = NULL
       WHERE complex_id IN (SELECT id FROM lfk_complexes WHERE user_id = $1)`,
      [userId]
    );

    await client.query(`DELETE FROM symptom_trackings WHERE user_id = $1`, [userId]);

    await client.query(`DELETE FROM lfk_complexes WHERE user_id = $1`, [userId]);

    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}
