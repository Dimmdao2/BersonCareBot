#!/usr/bin/env tsx
/**
 * Управление пользователем по номеру телефона (prod/dev).
 *
 * Команды:
 *   info <phone>          — показывает пользователя и количество связанных записей.
 *
 *   reset-user <phone>   — удаляет identity (platform_users + channel_bindings + pins + login_tokens),
 *                           НЕ трогает контентные данные (дневник, записи, ЛФК, заметки и т.д.).
 *                           После повторной регистрации запустите reassign-user для привязки данных.
 *
 *   reassign-user <phone> <old-uuid>
 *                         — переносит контентные записи со старого UUID на текущего пользователя с данным телефоном.
 *
 * Использование (dev): задать DATABASE_URL на webapp БД (см. apps/webapp/.env.dev).
 *
 * Production-хост: не подставлять плейсхолдер — взять URL из env-файла (иначе возможен хост вроде
 * `base` из docker-only конфига → getaddrinfo EAI_AGAIN):
 *   set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
 *   pnpm --dir apps/webapp exec tsx scripts/user-phone-admin.ts info 79189000782
 *
 * Локально с явным URL:
 *   DATABASE_URL=postgresql://... pnpm --dir apps/webapp exec tsx scripts/user-phone-admin.ts reset-user 79189000782
 */

import pg from "pg";
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL не задан.");
  process.exit(1);
}

const db = new Pool({ connectionString });

function normalize(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("7") ? `+${digits}` : `+7${digits}`;
}

async function findUser(phone: string) {
  const norm = normalize(phone);
  const res = await db.query<{
    id: string;
    phone_normalized: string;
    display_name: string;
    role: string;
    created_at: string;
  }>(
    `SELECT id, phone_normalized, display_name, role, created_at::text
     FROM platform_users WHERE phone_normalized = $1`,
    [norm],
  );
  return res.rows[0] ?? null;
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

  const appts = await db.query(
    `SELECT count(*)::int AS cnt FROM appointment_records WHERE phone_normalized = $1`,
    [user.phone_normalized],
  );
  const apptCnt = appts.rows[0]?.cnt ?? 0;
  if (apptCnt > 0) console.log(`\nappointment_records (по телефону, не затрагиваются): ${apptCnt}`);
  console.log();
}

async function resetUser(phone: string): Promise<void> {
  const user = await findUser(phone);
  if (!user) {
    console.log(`Пользователь с номером ${normalize(phone)} не найден.`);
    return;
  }

  console.log(`\nСброс identity для: ${user.display_name} (${user.id})`);
  console.log(`Контентные данные НЕ удаляются. Старый UUID: ${user.id}\n`);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (const { table, column } of IDENTITY_TABLES) {
      const r = await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [user.id]);
      if ((r.rowCount ?? 0) > 0) console.log(`  Удалено из ${table}: ${r.rowCount}`);
    }

    const r = await client.query(`DELETE FROM platform_users WHERE id = $1`, [user.id]);
    console.log(`  Удалено из platform_users: ${r.rowCount}`);

    await client.query("COMMIT");
    console.log(`\n✓ Identity удалена. Старый UUID для reassign: ${user.id}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
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
      default:
        console.error("Команды: info | reset-user | reassign-user");
        process.exit(1);
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
