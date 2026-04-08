/**
 * Полное удаление клиента из webapp (+ опционально integrator), как `purge-by-id` в user-phone-admin.
 * Вызывать только после явного подтверждения (например из API кабинета врача для заархивированных).
 */
import pg, { type Pool, type PoolClient } from "pg";
import { getPool } from "@/infra/db/client";

const { Pool: PgPool } = pg;

let integratorPoolSingleton: Pool | null = null;

function getIntegratorPool(): Pool | null {
  const raw = process.env.INTEGRATOR_DATABASE_URL?.trim() || process.env.USER_PHONE_ADMIN_INTEGRATOR_DATABASE_URL?.trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname;
    if (host === "base") return null;
  } catch {
    return null;
  }
  integratorPoolSingleton ??= new PgPool({ connectionString: raw, max: 3 });
  return integratorPoolSingleton;
}

/** Только цифры; для сопоставления записей по номеру. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Таблицы с данными клиента по `user_id` / `platform_user_id` (UUID или TEXT, совпадающий с UUID).
 * Не включает дневник симптомов/ЛФК — см. `deleteSymptomAndLfkDiaryForUser` (порядок FK: комплексы ↔ trackings).
 */
const CONTENT_TABLES: { table: string; column: string }[] = [
  { table: "patient_bookings", column: "platform_user_id" },
  { table: "reminder_rules", column: "platform_user_id" },
  { table: "doctor_notes", column: "user_id" },
  { table: "support_conversations", column: "platform_user_id" },
  { table: "patient_lfk_assignments", column: "patient_user_id" },
  { table: "content_access_grants_webapp", column: "platform_user_id" },
  { table: "user_notification_topics", column: "user_id" },
  { table: "user_channel_preferences", column: "user_id" },
  { table: "news_item_views", column: "user_id" },
  { table: "online_intake_requests", column: "user_id" },
];

/** Дневники симптомов и ЛФК: порядок как в `pgDiaryPurge` (FK `lfk_complexes.symptom_tracking_id` → `symptom_trackings`). */
async function deleteSymptomAndLfkDiaryForUser(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE lfk_complexes SET symptom_tracking_id = NULL, updated_at = now() WHERE user_id = $1`,
    [userId],
  );
  await client.query(`DELETE FROM lfk_complexes WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM symptom_trackings WHERE user_id = $1`, [userId]);
}

const IDENTITY_TABLES: { table: string; column: string }[] = [
  { table: "user_channel_bindings", column: "user_id" },
  { table: "user_pins", column: "user_id" },
  { table: "login_tokens", column: "user_id" },
  { table: "user_oauth_bindings", column: "user_id" },
];

export function isPlatformUserUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

async function deletePhoneKeyedWebappRows(client: PoolClient, phoneNormalized: string): Promise<void> {
  const digs = phoneDigits(phoneNormalized);

  await client.query(
    `DELETE FROM phone_otp_locks WHERE regexp_replace(phone_normalized, '\\D', '', 'g') = $1`,
    [digs],
  );
  await client.query(`DELETE FROM phone_challenges WHERE regexp_replace(phone, '\\D', '', 'g') = $1`, [digs]);
  await client.query(
    `DELETE FROM appointment_records
     WHERE phone_normalized IS NOT NULL
       AND regexp_replace(phone_normalized, '\\D', '', 'g') = $1`,
    [digs],
  );
  await client.query(
    `DELETE FROM message_log
     WHERE user_id IN (
       SELECT id::text FROM platform_users
       WHERE phone_normalized IS NOT NULL
         AND regexp_replace(phone_normalized, '\\D', '', 'g') = $1
     )`,
    [digs],
  );
}

async function deleteWebappProjectionByIntegratorUserId(client: PoolClient, integratorUserId: string): Promise<void> {
  if (!/^\d+$/.test(integratorUserId.trim())) return;
  const id = integratorUserId.trim();

  await client.query(`DELETE FROM reminder_delivery_events WHERE integrator_user_id = $1::bigint`, [id]);
  await client.query(`DELETE FROM reminder_occurrence_history WHERE integrator_user_id = $1::bigint`, [id]);
  await client.query(`DELETE FROM reminder_rules WHERE integrator_user_id = $1::bigint`, [id]);
  await client.query(`DELETE FROM content_access_grants_webapp WHERE integrator_user_id = $1::bigint`, [id]);
  await client.query(`DELETE FROM user_subscriptions_webapp WHERE integrator_user_id = $1::bigint`, [id]);
  await client.query(`DELETE FROM mailing_logs_webapp WHERE integrator_user_id = $1::bigint`, [id]);
  await client.query(
    `DELETE FROM support_question_messages WHERE question_id IN (
       SELECT id FROM support_questions WHERE conversation_id IN (
         SELECT id FROM support_conversations WHERE integrator_user_id = $1::bigint
       )
     )`,
    [id],
  );
  await client.query(
    `DELETE FROM support_questions WHERE conversation_id IN (
       SELECT id FROM support_conversations WHERE integrator_user_id = $1::bigint
     )`,
    [id],
  );
  await client.query(`DELETE FROM support_conversations WHERE integrator_user_id = $1::bigint`, [id]);
}

async function clearPlatformUserDeleteBlockers(client: PoolClient, userId: string): Promise<void> {
  await client.query(`UPDATE platform_users SET blocked_by = NULL WHERE blocked_by = $1`, [userId]);
  await client.query(`UPDATE patient_lfk_assignments SET assigned_by = NULL WHERE assigned_by = $1`, [userId]);
  await client.query(`DELETE FROM patient_lfk_assignments WHERE patient_user_id = $1`, [userId]);
  await client.query(`DELETE FROM online_intake_requests WHERE user_id = $1`, [userId]);
  await client.query(`UPDATE lfk_complex_templates SET created_by = NULL WHERE created_by = $1`, [userId]);
  await client.query(`UPDATE lfk_exercises SET created_by = NULL WHERE created_by = $1`, [userId]);
  await client.query(`UPDATE system_settings SET updated_by = NULL WHERE updated_by = $1`, [userId]);
  await client.query(`UPDATE doctor_notes SET author_id = user_id WHERE author_id = $1 AND user_id <> $1`, [userId]);
}

async function deleteContentTablesForUser(client: PoolClient, userId: string): Promise<void> {
  for (const { table, column } of CONTENT_TABLES) {
    if (table === "doctor_notes") {
      await client.query(`DELETE FROM doctor_notes WHERE user_id = $1 OR author_id = $1`, [userId]);
    } else {
      await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [userId]);
    }
  }
}

async function resolveIntegratorUserIds(
  integratorDb: Pool | null,
  digs: string,
  webappIntegratorUserId: string | null,
): Promise<string[]> {
  if (!integratorDb) return [];
  const ids = new Set<string>();
  if (webappIntegratorUserId && /^\d+$/.test(webappIntegratorUserId)) {
    ids.add(webappIntegratorUserId);
  }
  if (digs.length >= 10) {
    const r = await integratorDb.query<{ user_id: string }>(
      `SELECT DISTINCT user_id::text AS user_id FROM contacts
       WHERE type = 'phone'
         AND regexp_replace(value_normalized, '\\D', '', 'g') = $1`,
      [digs],
    );
    for (const row of r.rows) ids.add(row.user_id);
  }
  return [...ids];
}

async function deleteIntegratorPhoneData(
  integratorDb: Pool,
  digs: string,
  integratorUserIds: string[],
): Promise<void> {
  const client = await integratorDb.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM rubitime_events e
       USING rubitime_records rr
       WHERE e.rubitime_record_id IS NOT NULL
         AND e.rubitime_record_id = rr.rubitime_record_id
         AND rr.phone_normalized IS NOT NULL
         AND regexp_replace(rr.phone_normalized, '\\D', '', 'g') = $1`,
      [digs],
    );

    await client.query(
      `DELETE FROM rubitime_records
       WHERE phone_normalized IS NOT NULL
         AND regexp_replace(phone_normalized, '\\D', '', 'g') = $1`,
      [digs],
    );

    await client.query(
      `DELETE FROM rubitime_create_retry_jobs
       WHERE regexp_replace(phone_normalized, '\\D', '', 'g') = $1`,
      [digs],
    );

    if (integratorUserIds.length > 0) {
      await client.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [integratorUserIds]);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type PurgePlatformUserResult =
  | { ok: true; integratorSkipped: boolean }
  | { ok: false; error: "invalid_uuid" | "not_found" | "not_client" };

/**
 * Удаляет строку `platform_users` и связанные данные (см. CONTENT_TABLES / скрипт purge-by-id).
 * Integrator очищается, если задан `INTEGRATOR_DATABASE_URL`.
 */
export async function purgePlatformUserByPlatformId(rawId: string): Promise<PurgePlatformUserResult> {
  const id = rawId.trim();
  if (!isPlatformUserUuid(id)) {
    return { ok: false, error: "invalid_uuid" };
  }

  const db = getPool();
  const userRes = await db.query<{
    id: string;
    phone_normalized: string | null;
    integrator_user_id: string | null;
    role: string;
  }>(
    `SELECT id, phone_normalized, integrator_user_id::text AS integrator_user_id, role
     FROM platform_users WHERE id = $1`,
    [id],
  );
  const user = userRes.rows[0];
  if (!user) return { ok: false, error: "not_found" };
  if (user.role !== "client") return { ok: false, error: "not_client" };

  const integratorPool = getIntegratorPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    if (user.phone_normalized?.trim()) {
      await deletePhoneKeyedWebappRows(client, user.phone_normalized);
    }

    await clearPlatformUserDeleteBlockers(client, user.id);
    await deleteSymptomAndLfkDiaryForUser(client, user.id);
    await deleteContentTablesForUser(client, user.id);

    if (user.integrator_user_id && /^\d+$/.test(user.integrator_user_id)) {
      await deleteWebappProjectionByIntegratorUserId(client, user.integrator_user_id);
    }

    await client.query(`DELETE FROM message_log WHERE user_id = $1`, [user.id]);

    for (const { table, column } of IDENTITY_TABLES) {
      await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [user.id]);
    }

    await client.query(`DELETE FROM platform_users WHERE id = $1`, [user.id]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const digs = user.phone_normalized?.trim() ? phoneDigits(user.phone_normalized) : "";
  const intIds = await resolveIntegratorUserIds(integratorPool, digs, user.integrator_user_id);

  if (integratorPool) {
    await deleteIntegratorPhoneData(integratorPool, digs, intIds);
    return { ok: true, integratorSkipped: false };
  }

  return { ok: true, integratorSkipped: true };
}
