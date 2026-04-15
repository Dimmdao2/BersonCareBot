/**
 * Полное удаление клиента из webapp (+ опционально integrator), как `purge-by-id` в user-phone-admin.
 * Вызывать только после явного подтверждения (например из API кабинета врача для заархивированных).
 *
 * Строгий сценарий (S3, advisory lock, audit): `runStrictPurgePlatformUser` в `strictPlatformUserPurge.ts`.
 */
import pg, { type Pool, type PoolClient } from "pg";
import { getPool } from "@/infra/db/client";

const { Pool: PgPool } = pg;

/** Pools keyed by final connection string (unified DB uses `search_path=integrator,public`). */
const integratorPurgePools = new Map<string, Pool>();

function trimEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function isUsablePostgresUrl(raw: string): boolean {
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname;
    if (host === "base") return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * When webapp and integrator share one PostgreSQL, force `search_path` so unqualified
 * `contacts` / `identities` / `users` resolve to `integrator.*` (not `public.*`).
 */
export function appendIntegratorSearchPathToConnectionString(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    u.searchParams.set("options", "-c search_path=integrator,public");
    return u.toString();
  } catch {
    return connectionString;
  }
}

/**
 * Pool for post-commit integrator cleanup during strict purge / merge preview checks.
 * - Legacy: `INTEGRATOR_DATABASE_URL` | `USER_PHONE_ADMIN_INTEGRATOR_DATABASE_URL` | `SOURCE_DATABASE_URL` only.
 * - Unified: falls back to `DATABASE_URL` with `search_path=integrator,public`.
 * - If explicit integrator URL equals `DATABASE_URL`, same `search_path` is applied (single cluster, integrator schema).
 */
export function getIntegratorPoolForPurge(): Pool | null {
  const explicit =
    trimEnv("INTEGRATOR_DATABASE_URL") ||
    trimEnv("USER_PHONE_ADMIN_INTEGRATOR_DATABASE_URL") ||
    trimEnv("SOURCE_DATABASE_URL");
  const databaseUrl = trimEnv("DATABASE_URL");

  let baseUrl: string | null = null;
  let useIntegratorSearchPath = false;

  if (explicit && isUsablePostgresUrl(explicit)) {
    baseUrl = explicit;
    if (databaseUrl && explicit === databaseUrl) {
      useIntegratorSearchPath = true;
    }
  } else if (databaseUrl && isUsablePostgresUrl(databaseUrl)) {
    baseUrl = databaseUrl;
    useIntegratorSearchPath = true;
  }

  if (!baseUrl) return null;

  const connectionString = useIntegratorSearchPath ? appendIntegratorSearchPathToConnectionString(baseUrl) : baseUrl;

  let pool = integratorPurgePools.get(connectionString);
  if (!pool) {
    pool = new PgPool({ connectionString, max: 3 });
    integratorPurgePools.set(connectionString, pool);
  }
  return pool;
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
     )
        OR platform_user_id IN (
          SELECT id FROM platform_users
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

export type PurgeArtifactKeys = {
  intakeS3Keys: string[];
  /** media_files rows that need post-commit cleanup; `s3Key = null` means DB-only row delete. */
  mediaFiles: { id: string; s3Key: string | null }[];
};

/**
 * Collect external-cleanup artifacts still referenced in DB for this user. Must run inside the purge transaction
 * **after** `pg_advisory_xact_lock` and **before** any DELETE that cascades to `online_intake_attachments`
 * / clears media ownership.
 */
export async function collectPurgeArtifactKeys(client: PoolClient, userId: string): Promise<PurgeArtifactKeys> {
  const intakeRes = await client.query<{ s3_key: string }>(
    `SELECT a.s3_key
       FROM online_intake_attachments a
       INNER JOIN online_intake_requests r ON r.id = a.request_id
      WHERE r.user_id = $1::uuid
        AND a.s3_key IS NOT NULL`,
    [userId],
  );
  const intakeS3Keys = intakeRes.rows.map((r) => r.s3_key).filter((k): k is string => typeof k === "string" && k.length > 0);

  const mediaRes = await client.query<{ id: string; s3_key: string | null }>(
    `SELECT id::text AS id, s3_key
       FROM media_files
      WHERE uploaded_by = $1::uuid`,
    [userId],
  );
  const mediaFiles = mediaRes.rows.map((r) => ({ id: r.id, s3Key: r.s3_key ?? null }));

  return { intakeS3Keys, mediaFiles };
}

export type PurgePlatformUserRow = {
  id: string;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  role: string;
};

/**
 * Core webapp DELETE sequence (single transaction). Caller must hold advisory lock and have called `collectPurgeArtifactKeys` first when strict S3 cleanup is required.
 */
export async function runWebappPurgeCoreInTransaction(client: PoolClient, user: PurgePlatformUserRow): Promise<void> {
  if (user.phone_normalized?.trim()) {
    await deletePhoneKeyedWebappRows(client, user.phone_normalized);
  }

  await clearPlatformUserDeleteBlockers(client, user.id);
  await deleteSymptomAndLfkDiaryForUser(client, user.id);
  await deleteContentTablesForUser(client, user.id);

  if (user.integrator_user_id && /^\d+$/.test(user.integrator_user_id)) {
    await deleteWebappProjectionByIntegratorUserId(client, user.integrator_user_id);
  }

  await client.query(
    `DELETE FROM message_log
       WHERE user_id = $1::text OR platform_user_id = $1::uuid`,
    [user.id],
  );

  for (const { table, column } of IDENTITY_TABLES) {
    await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [user.id]);
  }

  await client.query(`DELETE FROM platform_users WHERE id = $1`, [user.id]);
}

/** Messenger rows in webapp `user_channel_bindings` that map to integrator `identities.resource`. */
const INTEGRATOR_CLEANUP_CHANNEL_CODES = new Set(["telegram", "max"]);

export type MessengerBindingForIntegratorCleanup = {
  channel_code: string;
  external_id: string;
};

/** Load bindings before webapp deletes `user_channel_bindings` (same purge transaction). */
export async function fetchMessengerBindingsForIntegratorCleanup(
  client: PoolClient,
  userId: string,
): Promise<MessengerBindingForIntegratorCleanup[]> {
  const r = await client.query<{ channel_code: string; external_id: string }>(
    `SELECT channel_code, external_id FROM user_channel_bindings
     WHERE user_id = $1::uuid AND channel_code IN ('telegram', 'max')`,
    [userId],
  );
  return r.rows;
}

export async function resolveIntegratorUserIds(
  integratorDb: Pool | null,
  digs: string,
  webappIntegratorUserId: string | null,
  messengerBindings?: ReadonlyArray<MessengerBindingForIntegratorCleanup>,
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
  if (messengerBindings && messengerBindings.length > 0) {
    for (const b of messengerBindings) {
      if (!INTEGRATOR_CLEANUP_CHANNEL_CODES.has(b.channel_code)) continue;
      const ext = typeof b.external_id === "string" ? b.external_id.trim() : "";
      if (!ext) continue;
      const r = await integratorDb.query<{ user_id: string }>(
        `SELECT user_id::text AS user_id FROM identities
         WHERE resource = $1 AND external_id = $2 LIMIT 1`,
        [b.channel_code, ext],
      );
      const id = r.rows[0]?.user_id;
      if (id && /^\d+$/.test(id)) ids.add(id);
    }
  }
  return [...ids];
}

async function clearMessengerAttributedPhonesForBindings(
  client: PoolClient,
  bindings: ReadonlyArray<MessengerBindingForIntegratorCleanup>,
): Promise<void> {
  for (const b of bindings) {
    if (!INTEGRATOR_CLEANUP_CHANNEL_CODES.has(b.channel_code)) continue;
    const ext = typeof b.external_id === "string" ? b.external_id.trim() : "";
    if (!ext) continue;
    await client.query(
      `DELETE FROM contacts c
       USING identities i
       WHERE i.resource = $1 AND i.external_id = $2
         AND c.user_id = i.user_id
         AND c.type = 'phone'
         AND c.label = $1`,
      [b.channel_code, ext],
    );
  }
}

export async function deleteIntegratorPhoneData(
  integratorDb: Pool,
  digs: string,
  integratorUserIds: string[],
  messengerBindings?: ReadonlyArray<MessengerBindingForIntegratorCleanup>,
): Promise<void> {
  const client = await integratorDb.connect();
  try {
    await client.query("BEGIN");

    if (messengerBindings && messengerBindings.length > 0) {
      await clearMessengerAttributedPhonesForBindings(client, messengerBindings);
    }

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

export type IntegratorPurgeCleanupResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; message: string };

/**
 * Same as `deleteIntegratorPhoneData` but never throws; used for post-commit strict purge (parallel with S3).
 */
export async function deleteIntegratorPhoneDataWithResult(
  integratorDb: Pool | null,
  digs: string,
  integratorUserIds: string[],
  messengerBindings?: ReadonlyArray<MessengerBindingForIntegratorCleanup>,
): Promise<IntegratorPurgeCleanupResult> {
  if (!integratorDb) {
    return { ok: true, skipped: true };
  }
  try {
    await deleteIntegratorPhoneData(integratorDb, digs, integratorUserIds, messengerBindings);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message };
  }
}

/** Mirrors `runStrictPurgePlatformUser` — see `strictPlatformUserPurge.ts`. */
export type StrictPurgeOutcome = "completed" | "partial_failed" | "needs_retry";

export type PurgePlatformUserResult =
  | { ok: true; integratorSkipped: boolean; outcome?: StrictPurgeOutcome }
  | { ok: false; error: "invalid_uuid" | "not_found" | "not_client" | "transaction_failed" };

/**
 * Удаляет строку `platform_users` и связанные данные (см. CONTENT_TABLES / скрипт purge-by-id).
 * Делегирует в `runStrictPurgePlatformUser` (advisory lock, S3, integrator, audit при необходимости).
 */
export async function purgePlatformUserByPlatformId(rawId: string): Promise<PurgePlatformUserResult> {
  const { runStrictPurgePlatformUser } = await import("@/infra/strictPlatformUserPurge");
  const r = await runStrictPurgePlatformUser({ targetId: rawId, actorId: null, audit: { enabled: true } });
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  return {
    ok: true,
    integratorSkipped: r.integratorSkipped,
    outcome: r.outcome,
  };
}

async function loadPurgeUserRow(db: Pool, id: string): Promise<PurgePlatformUserRow | null> {
  const userRes = await db.query<PurgePlatformUserRow>(
    `SELECT id, phone_normalized, integrator_user_id::text AS integrator_user_id, role
     FROM platform_users WHERE id = $1`,
    [id],
  );
  return userRes.rows[0] ?? null;
}

/** For tests / diagnostics: load user row without deleting. */
export async function getPurgePlatformUserRowForTests(rawId: string): Promise<PurgePlatformUserRow | null> {
  const id = rawId.trim();
  if (!isPlatformUserUuid(id)) return null;
  return loadPurgeUserRow(getPool(), id);
}
