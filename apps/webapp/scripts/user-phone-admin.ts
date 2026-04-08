#!/usr/bin/env tsx
/**
 * Управление пользователем по номеру телефона (prod/dev).
 *
 * Команды:
 *   info <phone>          — показывает пользователя и количество связанных записей.
 *
 *   reset-user <phone>   — удаляет identity (platform_users + channel_bindings + pins + login_tokens),
 *                           строки по этому номеру в phone_otp_locks, phone_challenges, appointment_records
 *                           (сопоставление по цифрам номера). Затем снимает ссылки, мешающие FK
 *                           (patient_lfk_assignments, online_intake_requests и т.д.).
 *                           Остальной контент по user_id при возможности сохраняется для reassign-user (CONTENT_TABLES).
 *                           Удаление platform_users каскадно трогает таблицы с ON DELETE CASCADE — см. миграции.
 *                           Затем (если задан URL integrator БД) удаляет пользователя integrator по
 *                           contacts(phone) и platform_users.integrator_user_id, записи rubitime по номеру.
 *
 *   reassign-user <phone> <old-uuid>
 *                         — переносит контентные записи со старого UUID на текущего пользователя с данным телефоном.
 *
 *   integrator-clear-phone <phone>
 *                         — только БД integrator: rubitime по номеру + удаление строки users (и CASCADE contacts/identities/…),
 *                           если пользователь находится по contacts(phone). Нужен, если ранее сделали reset-user без
 *                           подключения к integrator — иначе в боте остаётся linkedPhone и не показывается запрос контакта.
 *
 *   purge-by-id <platform-user-uuid>
 *                         — полное удаление: контент по CONTENT_TABLES (включая doctor_notes как пациент и как author),
 *                           identity, platform_users, строки по номеру (если телефон был), затем integrator как у reset-user.
 *                           Удобно, когда нужно «убрать юзера отовсюду» по UUID (ошибка привязки номера и т.д.).
 *
 *   webapp-cleanup-by-integrator-id <bigint>
 *                         — только webapp: строки проекций, где нет привязки к platform_users UUID, а есть integrator_user_id
 *                           (reminder_occurrence_history, reminder_delivery_events, reminder_rules, content_access_grants_webapp,
 *                           user_subscriptions_webapp, mailing_logs_webapp, support_* по integrator_user_id).
 *                           Нужно, если platform_users уже удалили, а в журналах/подписках остались хвосты по id из integrator.
 *
 *   integrator-purge-user-id <bigint>
 *                         — только integrator: DELETE FROM users WHERE id = $1 (CASCADE identities/contacts/…). Когда известен
 *                           users.id в БД integrator, а не только телефон.
 *
 * DATABASE_URL:
 *   - Явно: `DATABASE_URL=postgresql://... pnpm --dir apps/webapp exec tsx scripts/user-phone-admin.ts ...`
 *   - Иначе скрипт подставляет URL из первого существующего файла (по порядку):
 *       USER_PHONE_ADMIN_ENV_FILE, ENV_FILE, /opt/env/bersoncarebot/webapp.prod, .env.dev (cwd = apps/webapp).
 *     Сначала dotenv, затем при необходимости `bash source` (для export и shell-формата).
 *   - Хост вроде `base` (имя сервиса только внутри Docker) отклоняется до подключения.
 *
 * Integrator DB (опционально для reset-user / info; обязательна для integrator-clear-phone):
 *   - `INTEGRATOR_DATABASE_URL` или `USER_PHONE_ADMIN_INTEGRATOR_DATABASE_URL`
 *   - иначе файлы: `USER_PHONE_ADMIN_INTEGRATOR_ENV_FILE`, затем `/opt/env/bersoncarebot/api.prod`
 *     (в файле — `INTEGRATOR_DATABASE_URL` или `DATABASE_URL` к БД integrator).
 *
 * Строгий режим (после reset-user завершиться с кодом 2, если integrator не очищен):
 *   `USER_PHONE_ADMIN_STRICT_INTEGRATOR=1`
 */

import { execFileSync } from "node:child_process";
import { config as loadDotenv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg, { type PoolClient } from "pg";
const { Pool } = pg;

/** Имена хостов из docker-compose, недоступные с хоста ОС при запуске tsx. */
const BLOCKED_DB_HOSTS = new Set(["base"]);

const DEFAULT_PROD_ENV = "/opt/env/bersoncarebot/webapp.prod";
const DEFAULT_INTEGRATOR_ENV = "/opt/env/bersoncarebot/api.prod";

function candidateEnvFiles(): string[] {
  const fromFlag = process.env.USER_PHONE_ADMIN_ENV_FILE?.trim();
  const fromEnvFile = process.env.ENV_FILE?.trim();
  const list: string[] = [];
  if (fromFlag) list.push(fromFlag);
  if (fromEnvFile) list.push(fromEnvFile);
  list.push(DEFAULT_PROD_ENV, path.resolve(process.cwd(), ".env.dev"));
  return list.map((p) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)));
}

/**
 * Файлы вроде `/opt/env/.../webapp.prod` часто пишут под `source` (export, подстановки),
 * dotenv их не всегда парсит — дублируем чтение через bash.
 */
function readDatabaseUrlViaBashSource(filePath: string): string | null {
  try {
    const out = execFileSync(
      "bash",
      [
        "-c",
        'set -a && source "$1" && set +a && printf "%s" "${DATABASE_URL-}"',
        "_",
        filePath,
      ],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        env: { ...process.env, DATABASE_URL: "" },
      },
    );
    const s = out.trim();
    return s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

function resolveConnectionString(): string {
  let raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    for (const abs of candidateEnvFiles()) {
      if (!fs.existsSync(abs)) continue;
      loadDotenv({ path: abs, override: false });
      raw = process.env.DATABASE_URL?.trim();
      if (!raw) raw = readDatabaseUrlViaBashSource(abs)?.trim();
      if (raw) break;
    }
  }
  if (!raw) {
    const checked = candidateEnvFiles().filter((p) => fs.existsSync(p));
    console.error(
      "DATABASE_URL не задан: ни в окружении, ни в проверенных env-файлах (после dotenv и bash source).\n" +
        "Укажите `DATABASE_URL=...` или проверьте строку DATABASE_URL в файле (см. список ниже).",
    );
    if (checked.length > 0) {
      console.error("Существующие кандидаты:");
      for (const p of checked) console.error(`  ${p}`);
    } else {
      console.error(
        `Ни один из путей не найден (USER_PHONE_ADMIN_ENV_FILE, ENV_FILE, ${DEFAULT_PROD_ENV}, .env.dev).`,
      );
    }
    process.exit(1);
  }

  let hostname: string;
  try {
    hostname = new URL(raw).hostname;
  } catch {
    console.error("DATABASE_URL: невалидный URL.");
    process.exit(1);
  }

  if (BLOCKED_DB_HOSTS.has(hostname)) {
    console.error(
      `DATABASE_URL указывает на хост «${hostname}» (обычно имя сервиса в Docker, с хоста ОС не резолвится).\n` +
        "Задайте URL к Postgres, доступный с этой машины (например из /opt/env/bersoncarebot/webapp.prod), " +
        "или удалите неверный DATABASE_URL из окружения и запустите скрипт снова — будет загружен prod-файл.",
    );
    process.exit(1);
  }

  return raw;
}

function candidateIntegratorEnvFiles(): string[] {
  const list: string[] = [];
  const fromFlag = process.env.USER_PHONE_ADMIN_INTEGRATOR_ENV_FILE?.trim();
  if (fromFlag) list.push(fromFlag);
  list.push(DEFAULT_INTEGRATOR_ENV);
  return list.map((p) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)));
}

/** Читает одну переменную из shell-env файла (как webapp DATABASE_URL). */
function readNamedVarFromBashSource(filePath: string, varName: "DATABASE_URL" | "INTEGRATOR_DATABASE_URL"): string | null {
  const script =
    varName === "DATABASE_URL"
      ? 'set -a && source "$1" && set +a && printf "%s" "${DATABASE_URL-}"'
      : 'set -a && source "$1" && set +a && printf "%s" "${INTEGRATOR_DATABASE_URL-}"';
  try {
    const out = execFileSync("bash", ["-c", script, "_", filePath], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      env: { ...process.env, DATABASE_URL: "", INTEGRATOR_DATABASE_URL: "" },
    });
    const s = out.trim();
    return s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

function readFirstIntegratorUrlFromFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const i1 = readNamedVarFromBashSource(filePath, "INTEGRATOR_DATABASE_URL");
  if (i1) return i1.trim();
  const i2 = readNamedVarFromBashSource(filePath, "DATABASE_URL");
  return i2?.trim() ?? null;
}

/** URL БД integrator; `null` — только webapp, без ошибки. */
function resolveIntegratorConnectionStringOptional(): string | null {
  let raw =
    process.env.INTEGRATOR_DATABASE_URL?.trim() ||
    process.env.USER_PHONE_ADMIN_INTEGRATOR_DATABASE_URL?.trim();
  if (!raw) {
    for (const abs of candidateIntegratorEnvFiles()) {
      raw = readFirstIntegratorUrlFromFile(abs) ?? "";
      if (raw) break;
    }
  }
  if (!raw) return null;

  let hostname: string;
  try {
    hostname = new URL(raw).hostname;
  } catch {
    console.error("INTEGRATOR_DATABASE_URL: невалидный URL — integrator пропущен.");
    return null;
  }
  if (BLOCKED_DB_HOSTS.has(hostname)) {
    console.error(
      `INTEGRATOR_DATABASE_URL: хост «${hostname}» недоступен с хоста ОС — integrator пропущен.`,
    );
    return null;
  }
  return raw;
}

const db = new Pool({ connectionString: resolveConnectionString() });
const integratorConnectionString = resolveIntegratorConnectionStringOptional();
const integratorDb = integratorConnectionString ? new Pool({ connectionString: integratorConnectionString }) : null;

function normalize(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("7") ? `+${digits}` : `+7${digits}`;
}

/** Только цифры; для сопоставления записей, где телефон могли сохранить в разном формате. */
function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function findUser(phone: string) {
  const norm = normalize(phone);
  const res = await db.query<{
    id: string;
    phone_normalized: string;
    display_name: string;
    role: string;
    created_at: string;
    integrator_user_id: string | null;
  }>(
    `SELECT id, phone_normalized, display_name, role, created_at::text,
            integrator_user_id::text AS integrator_user_id
     FROM platform_users WHERE phone_normalized = $1`,
    [norm],
  );
  return res.rows[0] ?? null;
}

function isPlatformUserUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

async function findUserById(id: string) {
  const res = await db.query<{
    id: string;
    phone_normalized: string | null;
    display_name: string;
    role: string;
    created_at: string;
    integrator_user_id: string | null;
  }>(
    `SELECT id, phone_normalized, display_name, role, created_at::text,
            integrator_user_id::text AS integrator_user_id
     FROM platform_users WHERE id = $1`,
    [id.trim()],
  );
  return res.rows[0] ?? null;
}

async function resolveIntegratorUserIds(
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

async function deleteIntegratorPhoneData(digs: string, integratorUserIds: string[]): Promise<void> {
  if (!integratorDb) return;

  const log = (label: string, rowCount: number) => {
    if (rowCount > 0) console.log(`  ${label}: ${rowCount}`);
  };

  const client = await integratorDb.connect();
  try {
    await client.query("BEGIN");

    let r = await client.query(
      `DELETE FROM rubitime_events e
       USING rubitime_records rr
       WHERE e.rubitime_record_id IS NOT NULL
         AND e.rubitime_record_id = rr.rubitime_record_id
         AND rr.phone_normalized IS NOT NULL
         AND regexp_replace(rr.phone_normalized, '\\D', '', 'g') = $1`,
      [digs],
    );
    log("Удалено из rubitime_events (по rubitime_records телефона)", r.rowCount ?? 0);

    r = await client.query(
      `DELETE FROM rubitime_records
       WHERE phone_normalized IS NOT NULL
         AND regexp_replace(phone_normalized, '\\D', '', 'g') = $1`,
      [digs],
    );
    log("Удалено из rubitime_records (по номеру)", r.rowCount ?? 0);

    r = await client.query(
      `DELETE FROM rubitime_create_retry_jobs
       WHERE regexp_replace(phone_normalized, '\\D', '', 'g') = $1`,
      [digs],
    );
    log("Удалено из rubitime_create_retry_jobs", r.rowCount ?? 0);

    if (integratorUserIds.length > 0) {
      r = await client.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [integratorUserIds]);
      log("Удалено из users (integrator, CASCADE identities/contacts/…)", r.rowCount ?? 0);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Tables that reference platform_users by UUID and hold user content data. */
const CONTENT_TABLES: { table: string; column: string }[] = [
  { table: "symptom_entries", column: "user_id" },
  { table: "symptom_trackings", column: "user_id" },
  { table: "patient_bookings", column: "platform_user_id" },
  { table: "reminder_rules", column: "platform_user_id" },
  { table: "doctor_notes", column: "user_id" },
  { table: "lfk_sessions", column: "user_id" },
  { table: "support_conversations", column: "platform_user_id" },
  { table: "patient_lfk_assignments", column: "patient_user_id" },
  { table: "content_access_grants_webapp", column: "platform_user_id" },
  { table: "user_notification_topics", column: "user_id" },
  { table: "user_channel_preferences", column: "user_id" },
  { table: "news_item_views", column: "user_id" },
  { table: "online_intake_requests", column: "user_id" },
];

/** Tables that hold identity/auth data — deleted on reset. */
const IDENTITY_TABLES: { table: string; column: string }[] = [
  { table: "user_channel_bindings", column: "user_id" },
  { table: "user_pins", column: "user_id" },
  { table: "login_tokens", column: "user_id" },
  { table: "user_oauth_bindings", column: "user_id" },
];

async function info(phone: string): Promise<void> {
  const user = await findUser(phone);
  if (!user) {
    console.log(`Пользователь с номером ${normalize(phone)} не найден.`);
    return;
  }
  console.log(`\nПользователь: ${user.display_name} (${user.role})`);
  console.log(`UUID: ${user.id}`);
  console.log(`Телефон: ${user.phone_normalized}`);
  console.log(`Создан: ${user.created_at}\n`);

  console.log("Контентные данные (сохраняются при reset):");
  for (const { table, column } of CONTENT_TABLES) {
    const r = await db.query(`SELECT count(*)::int AS cnt FROM ${table} WHERE ${column} = $1`, [user.id]);
    const cnt = r.rows[0]?.cnt ?? 0;
    if (cnt > 0) console.log(`  ${table}: ${cnt}`);
  }

  console.log("\nДанные identity (удаляются при reset):");
  for (const { table, column } of IDENTITY_TABLES) {
    const r = await db.query(`SELECT count(*)::int AS cnt FROM ${table} WHERE ${column} = $1`, [user.id]);
    const cnt = r.rows[0]?.cnt ?? 0;
    if (cnt > 0) console.log(`  ${table}: ${cnt}`);
  }

  const digs = phoneDigits(user.phone_normalized);
  const phonePred = `regexp_replace(phone_normalized, '\\D', '', 'g') = $1`;
  const otp = await db.query<{ cnt: number }>(`SELECT count(*)::int AS cnt FROM phone_otp_locks WHERE ${phonePred}`, [
    digs,
  ]);
  const ch = await db.query<{ cnt: number }>(
    `SELECT count(*)::int AS cnt FROM phone_challenges WHERE regexp_replace(phone, '\\D', '', 'g') = $1`,
    [digs],
  );
  const appts = await db.query<{ cnt: number }>(
    `SELECT count(*)::int AS cnt FROM appointment_records WHERE phone_normalized IS NOT NULL AND ${phonePred}`,
    [digs],
  );
  console.log("\nПо номеру телефона (удаляются при reset-user):");
  console.log(`  phone_otp_locks: ${otp.rows[0]?.cnt ?? 0}`);
  console.log(`  phone_challenges: ${ch.rows[0]?.cnt ?? 0}`);
  console.log(`  appointment_records: ${appts.rows[0]?.cnt ?? 0}`);

  if (integratorDb) {
    const intIds = await resolveIntegratorUserIds(digs, user.integrator_user_id);
    const rub = await integratorDb.query<{ cnt: number }>(
      `SELECT count(*)::int AS cnt FROM rubitime_records
       WHERE phone_normalized IS NOT NULL
         AND regexp_replace(phone_normalized, '\\D', '', 'g') = $1`,
      [digs],
    );
    const rj = await integratorDb.query<{ cnt: number }>(
      `SELECT count(*)::int AS cnt FROM rubitime_create_retry_jobs
       WHERE regexp_replace(phone_normalized, '\\D', '', 'g') = $1`,
      [digs],
    );
    console.log("\nIntegrator (очищается при reset-user):");
    console.log(`  users.id (удаление строки users + CASCADE): ${intIds.length ? intIds.join(", ") : "—"}`);
    console.log(`  rubitime_records: ${rub.rows[0]?.cnt ?? 0}`);
    console.log(`  rubitime_create_retry_jobs: ${rj.rows[0]?.cnt ?? 0}`);
  } else {
    console.log("\nIntegrator: URL не задан (INTEGRATOR_DATABASE_URL / api.prod) — блок integrator пропущен.");
  }
  console.log();
}

/** OTP-блокировки, челленджи и проекции записей по номеру — только webapp. */
async function deletePhoneKeyedWebappRows(client: PoolClient, phoneNormalized: string): Promise<void> {
  const digs = phoneDigits(phoneNormalized);
  const log = (label: string, rowCount: number) => {
    if (rowCount > 0) console.log(`  ${label}: ${rowCount}`);
  };

  let r = await client.query(
    `DELETE FROM phone_otp_locks WHERE regexp_replace(phone_normalized, '\\D', '', 'g') = $1`,
    [digs],
  );
  log("Удалено из phone_otp_locks", r.rowCount ?? 0);

  r = await client.query(`DELETE FROM phone_challenges WHERE regexp_replace(phone, '\\D', '', 'g') = $1`, [digs]);
  log("Удалено из phone_challenges", r.rowCount ?? 0);

  r = await client.query(
    `DELETE FROM appointment_records
     WHERE phone_normalized IS NOT NULL
       AND regexp_replace(phone_normalized, '\\D', '', 'g') = $1`,
    [digs],
  );
  log("Удалено из appointment_records (по номеру)", r.rowCount ?? 0);
}

/**
 * Проекции webapp с колонкой integrator_user_id (без обязательной связи с platform_users после SET NULL).
 * Вызывать внутри транзакции до DELETE platform_users или отдельной командой, если строки в platform_users уже нет.
 */
async function deleteWebappProjectionByIntegratorUserId(
  client: PoolClient,
  integratorUserId: string,
): Promise<void> {
  if (!/^\d+$/.test(integratorUserId.trim())) return;
  const id = integratorUserId.trim();
  const log = (label: string, rowCount: number) => {
    if (rowCount > 0) console.log(`  ${label}: ${rowCount}`);
  };

  let r = await client.query(`DELETE FROM reminder_delivery_events WHERE integrator_user_id = $1::bigint`, [id]);
  log("Удалено из reminder_delivery_events (integrator_user_id)", r.rowCount ?? 0);

  r = await client.query(`DELETE FROM reminder_occurrence_history WHERE integrator_user_id = $1::bigint`, [id]);
  log("Удалено из reminder_occurrence_history (integrator_user_id)", r.rowCount ?? 0);

  r = await client.query(`DELETE FROM reminder_rules WHERE integrator_user_id = $1::bigint`, [id]);
  log("Удалено из reminder_rules (integrator_user_id)", r.rowCount ?? 0);

  r = await client.query(`DELETE FROM content_access_grants_webapp WHERE integrator_user_id = $1::bigint`, [id]);
  log("Удалено из content_access_grants_webapp (integrator_user_id)", r.rowCount ?? 0);

  r = await client.query(`DELETE FROM user_subscriptions_webapp WHERE integrator_user_id = $1::bigint`, [id]);
  log("Удалено из user_subscriptions_webapp", r.rowCount ?? 0);

  r = await client.query(`DELETE FROM mailing_logs_webapp WHERE integrator_user_id = $1::bigint`, [id]);
  log("Удалено из mailing_logs_webapp", r.rowCount ?? 0);

  r = await client.query(
    `DELETE FROM support_question_messages WHERE question_id IN (
       SELECT id FROM support_questions WHERE conversation_id IN (
         SELECT id FROM support_conversations WHERE integrator_user_id = $1::bigint
       )
     )`,
    [id],
  );
  log("Удалено из support_question_messages (по integrator диалогам)", r.rowCount ?? 0);

  r = await client.query(
    `DELETE FROM support_questions WHERE conversation_id IN (
       SELECT id FROM support_conversations WHERE integrator_user_id = $1::bigint
     )`,
    [id],
  );
  log("Удалено из support_questions (по integrator диалогам)", r.rowCount ?? 0);

  r = await client.query(`DELETE FROM support_conversations WHERE integrator_user_id = $1::bigint`, [id]);
  log("Удалено из support_conversations (integrator_user_id)", r.rowCount ?? 0);
}

/**
 * Ссылки на platform_users(id) без ON DELETE CASCADE блокируют DELETE.
 * Снимаем их до удаления identity / строки пользователя.
 */
async function clearPlatformUserDeleteBlockers(client: PoolClient, userId: string): Promise<void> {
  const log = (label: string, rowCount: number) => {
    if (rowCount > 0) console.log(`  ${label}: ${rowCount}`);
  };

  let r = await client.query(`UPDATE platform_users SET blocked_by = NULL WHERE blocked_by = $1`, [userId]);
  log("platform_users.blocked_by → NULL", r.rowCount ?? 0);

  r = await client.query(
    `UPDATE patient_lfk_assignments SET assigned_by = NULL WHERE assigned_by = $1`,
    [userId],
  );
  log("patient_lfk_assignments.assigned_by → NULL", r.rowCount ?? 0);

  r = await client.query(`DELETE FROM patient_lfk_assignments WHERE patient_user_id = $1`, [userId]);
  log("Удалено из patient_lfk_assignments (patient_user_id)", r.rowCount ?? 0);

  r = await client.query(`DELETE FROM online_intake_requests WHERE user_id = $1`, [userId]);
  log("Удалено из online_intake_requests", r.rowCount ?? 0);

  r = await client.query(`UPDATE lfk_complex_templates SET created_by = NULL WHERE created_by = $1`, [userId]);
  log("lfk_complex_templates.created_by → NULL", r.rowCount ?? 0);

  r = await client.query(`UPDATE lfk_exercises SET created_by = NULL WHERE created_by = $1`, [userId]);
  log("lfk_exercises.created_by → NULL", r.rowCount ?? 0);

  r = await client.query(`UPDATE system_settings SET updated_by = NULL WHERE updated_by = $1`, [userId]);
  log("system_settings.updated_by → NULL", r.rowCount ?? 0);

  r = await client.query(
    `UPDATE doctor_notes SET author_id = user_id WHERE author_id = $1 AND user_id <> $1`,
    [userId],
  );
  log("doctor_notes: author_id → user_id (разные субъект/автор)", r.rowCount ?? 0);
}

async function resetUser(phone: string): Promise<void> {
  const user = await findUser(phone);
  if (!user) {
    console.log(`Пользователь с номером ${normalize(phone)} не найден.`);
    return;
  }

  console.log(`\nСброс identity для: ${user.display_name} (${user.id})`);
  console.log(`Старый UUID для reassign: ${user.id}`);
  console.log("(см. лог: данные по номеру → FK → identity)\n");

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    console.log("Удаление по номеру (webapp):");
    await deletePhoneKeyedWebappRows(client, user.phone_normalized);

    await clearPlatformUserDeleteBlockers(client, user.id);

    for (const { table, column } of IDENTITY_TABLES) {
      const r = await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [user.id]);
      if ((r.rowCount ?? 0) > 0) console.log(`  Удалено из ${table}: ${r.rowCount}`);
    }

    const r = await client.query(`DELETE FROM platform_users WHERE id = $1`, [user.id]);
    console.log(`  Удалено из platform_users: ${r.rowCount}`);

    await client.query("COMMIT");
    console.log(`\n✓ Webapp: identity удалена. Старый UUID для reassign: ${user.id}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const digs = phoneDigits(user.phone_normalized);
  const intIds = await resolveIntegratorUserIds(digs, user.integrator_user_id);
  if (integratorDb) {
    console.log("\nIntegrator:");
    await deleteIntegratorPhoneData(digs, intIds);
    console.log("✓ Integrator очищен.");
  } else {
    console.error("");
    console.error(
      "ВНИМАНИЕ: Integrator БД не подключена — в боте может остаться привязка телефона (linkedPhone).",
    );
    console.error(
      "  Тогда /start не покажет запрос контакта. Подключите integrator и повторите reset-user, либо выполните:",
    );
    console.error(`  USER_PHONE_ADMIN_INTEGRATOR_ENV_FILE=${DEFAULT_INTEGRATOR_ENV} ... integrator-clear-phone ${normalize(phone)}`);
    console.log("\n(Integrator БД не задана — пропуск.)");
    if (process.env.USER_PHONE_ADMIN_STRICT_INTEGRATOR === "1") {
      console.error("USER_PHONE_ADMIN_STRICT_INTEGRATOR=1 — выход с кодом 2.");
      process.exitCode = 2;
      return;
    }
  }
}

async function deleteContentTablesForUser(client: PoolClient, userId: string): Promise<void> {
  for (const { table, column } of CONTENT_TABLES) {
    if (table === "doctor_notes") {
      const r = await client.query(`DELETE FROM doctor_notes WHERE user_id = $1 OR author_id = $1`, [userId]);
      if ((r.rowCount ?? 0) > 0) console.log(`  Удалено из doctor_notes: ${r.rowCount}`);
    } else {
      const r = await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [userId]);
      if ((r.rowCount ?? 0) > 0) console.log(`  Удалено из ${table}: ${r.rowCount}`);
    }
  }
}

async function purgeUserByPlatformId(rawId: string): Promise<void> {
  const id = rawId.trim();
  if (!isPlatformUserUuid(id)) {
    console.error("Ожидается UUID пользователя webapp (platform_users.id), 36 символов с дефисами.");
    process.exitCode = 1;
    return;
  }

  const user = await findUserById(id);
  if (!user) {
    console.log(`Пользователь с id=${id} не найден в platform_users.`);
    console.log(
      "Если строку уже удалили раньше: webapp-cleanup-by-integrator-id <id> (хвосты журналов/подписок в webapp), " +
        "integrator-clear-phone <номер> или integrator-purge-user-id <id> (БД integrator).",
    );
    return;
  }

  console.log(
    `\nПолное удаление (webapp + integrator): ${user.display_name} (${user.id}), телефон: ${user.phone_normalized ?? "—"}\n`,
  );

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    if (user.phone_normalized?.trim()) {
      console.log("Удаление по номеру (webapp):");
      await deletePhoneKeyedWebappRows(client, user.phone_normalized);
    } else {
      console.log("(Телефон не задан — пропуск phone_otp_locks / phone_challenges / appointment_records по номеру.)\n");
    }

    console.log("Снятие FK-блокировок:");
    await clearPlatformUserDeleteBlockers(client, user.id);

    console.log("\nКонтент (полное удаление):");
    await deleteContentTablesForUser(client, user.id);

    if (user.integrator_user_id && /^\d+$/.test(user.integrator_user_id)) {
      console.log("\nПроекции webapp по integrator_user_id (журналы напоминаний, подписки, support по id integrator):");
      await deleteWebappProjectionByIntegratorUserId(client, user.integrator_user_id);
    }

    console.log("\nIdentity:");
    for (const { table, column } of IDENTITY_TABLES) {
      const r = await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [user.id]);
      if ((r.rowCount ?? 0) > 0) console.log(`  Удалено из ${table}: ${r.rowCount}`);
    }

    const r = await client.query(`DELETE FROM platform_users WHERE id = $1`, [user.id]);
    console.log(`  Удалено из platform_users: ${r.rowCount}`);

    await client.query("COMMIT");
    console.log(`\n✓ Webapp: пользователь ${user.id} удалён полностью.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const digs = user.phone_normalized?.trim() ? phoneDigits(user.phone_normalized) : "";
  const intIds = await resolveIntegratorUserIds(digs, user.integrator_user_id);
  if (integratorDb) {
    console.log("\nIntegrator:");
    await deleteIntegratorPhoneData(digs, intIds);
    console.log("✓ Integrator очищен.");
  } else {
    console.error("");
    console.error(
      "ВНИМАНИЕ: Integrator БД не подключена — в боте может остаться привязка телефона (linkedPhone).",
    );
    console.error(`  USER_PHONE_ADMIN_INTEGRATOR_ENV_FILE=${DEFAULT_INTEGRATOR_ENV} + integrator-clear-phone <номер>`);
    console.log("\n(Integrator БД не задана — пропуск.)");
    if (process.env.USER_PHONE_ADMIN_STRICT_INTEGRATOR === "1") {
      console.error("USER_PHONE_ADMIN_STRICT_INTEGRATOR=1 — выход с кодом 2.");
      process.exitCode = 2;
      return;
    }
  }
}

async function webappCleanupByIntegratorId(raw: string): Promise<void> {
  const id = raw.trim();
  if (!/^\d+$/.test(id)) {
    console.error(
      "Ожидается целый integrator_user_id (как в platform_users.integrator_user_id и проекциях webapp).",
    );
    process.exitCode = 1;
    return;
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    console.log(`\nОчистка webapp-проекций по integrator_user_id = ${id}\n`);
    await deleteWebappProjectionByIntegratorUserId(client, id);
    await client.query("COMMIT");
    console.log("\n✓ Webapp: проекции по integrator id очищены.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function integratorPurgeUserById(raw: string): Promise<void> {
  if (!integratorDb) {
    console.error("Integrator БД не задана (USER_PHONE_ADMIN_INTEGRATOR_ENV_FILE / INTEGRATOR_DATABASE_URL).");
    process.exitCode = 1;
    return;
  }
  const id = raw.trim();
  if (!/^\d+$/.test(id)) {
    console.error("Ожидается целый users.id в БД integrator (bigint).");
    process.exitCode = 1;
    return;
  }
  const r = await integratorDb.query(`DELETE FROM users WHERE id = $1::bigint`, [id]);
  const n = r.rowCount ?? 0;
  console.log(`\nIntegrator: DELETE FROM users WHERE id = ${id} → ${n} строк(а).`);
  if (n === 0) {
    console.log("(Пользователь с таким id не найден — возможно уже удалён.)");
  } else {
    console.log("✓ Строка users и CASCADE (identities, contacts, telegram_state, …) удалены.");
  }
}

/** Только integrator (например после reset-user без api.prod). Webapp по номеру не ищем. */
async function integratorClearPhone(phone: string): Promise<void> {
  if (!integratorDb) {
    console.error(
      "Integrator БД не задана. Укажите USER_PHONE_ADMIN_INTEGRATOR_ENV_FILE=/opt/env/bersoncarebot/api.prod или INTEGRATOR_DATABASE_URL.",
    );
    process.exitCode = 1;
    return;
  }
  const norm = normalize(phone);
  const digs = phoneDigits(norm);
  const intIds = await resolveIntegratorUserIds(digs, null);
  console.log(`\nIntegrator-only: номер ${norm}, user_id из contacts: ${intIds.length ? intIds.join(", ") : "—"}`);
  await deleteIntegratorPhoneData(digs, intIds);
  console.log("✓ Integrator очищен по номеру.");
}

async function reassignUser(phone: string, oldUuid: string): Promise<void> {
  const user = await findUser(phone);
  if (!user) {
    console.log(`Пользователь с номером ${normalize(phone)} не найден. Сначала зарегистрируйтесь заново.`);
    return;
  }
  if (user.id === oldUuid) {
    console.log("Старый и новый UUID совпадают, ничего делать не нужно.");
    return;
  }

  console.log(`\nПеренос данных: ${oldUuid} → ${user.id} (${user.display_name})\n`);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (const { table, column } of CONTENT_TABLES) {
      const r = await client.query(
        `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
        [user.id, oldUuid],
      );
      if ((r.rowCount ?? 0) > 0) console.log(`  ${table}: перенесено ${r.rowCount}`);
    }

    // doctor_notes.author_id — если автор тоже был тем же пользователем
    const dn = await client.query(
      `UPDATE doctor_notes SET author_id = $1 WHERE author_id = $2`,
      [user.id, oldUuid],
    );
    if ((dn.rowCount ?? 0) > 0) console.log(`  doctor_notes (author_id): перенесено ${dn.rowCount}`);

    await client.query("COMMIT");
    console.log(`\n✓ Данные перенесены на ${user.id}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const [, , cmd, arg1, arg2] = process.argv;

  try {
    switch (cmd) {
      case "info":
        if (!arg1) { console.error("Укажите номер: info 79189000782"); process.exit(1); }
        await info(arg1);
        break;
      case "reset-user":
        if (!arg1) { console.error("Укажите номер: reset-user 79189000782"); process.exit(1); }
        await resetUser(arg1);
        break;
      case "reassign-user":
        if (!arg1 || !arg2) {
          console.error("Укажите номер и старый UUID: reassign-user 79189000782 <old-uuid>");
          process.exit(1);
        }
        await reassignUser(arg1, arg2);
        break;
      case "integrator-clear-phone":
        if (!arg1) {
          console.error("Укажите номер: integrator-clear-phone 79189000782");
          process.exit(1);
        }
        await integratorClearPhone(arg1);
        break;
      case "purge-by-id":
        if (!arg1) {
          console.error("Укажите UUID: purge-by-id 05f08456-1205-41d7-9060-e132c12359b8");
          process.exit(1);
        }
        await purgeUserByPlatformId(arg1);
        break;
      case "webapp-cleanup-by-integrator-id":
        if (!arg1) {
          console.error("Укажите id: webapp-cleanup-by-integrator-id 12345");
          process.exit(1);
        }
        await webappCleanupByIntegratorId(arg1);
        break;
      case "integrator-purge-user-id":
        if (!arg1) {
          console.error("Укажите id: integrator-purge-user-id 12345");
          process.exit(1);
        }
        await integratorPurgeUserById(arg1);
        break;
      default:
        console.error(
          "Команды: info | reset-user | reassign-user | integrator-clear-phone | purge-by-id | webapp-cleanup-by-integrator-id | integrator-purge-user-id",
        );
        process.exit(1);
    }
  } finally {
    await db.end();
    if (integratorDb) await integratorDb.end();
  }
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException & { hostname?: string } {
  return err instanceof Error && "code" in err;
}

main().catch((err: unknown) => {
  if (isErrnoException(err) && err.code === "EAI_AGAIN" && err.hostname) {
    console.error(
      `DNS: не удалось разрешить хост «${err.hostname}». ` +
        "Если это имя сервиса из Docker — задайте DATABASE_URL с хоста (localhost или реальный Postgres), " +
        `см. ${DEFAULT_PROD_ENV}.`,
    );
  }
  console.error(err);
  process.exit(1);
});
