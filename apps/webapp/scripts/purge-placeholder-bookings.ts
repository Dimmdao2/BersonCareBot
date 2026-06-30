#!/usr/bin/env tsx
/**
 * One-off: удаление ЗАПИСЕЙ служебных плейсхолдер-аккаунтов (НЕ аккаунтов!).
 *
 * Контекст: владелец создавал служебные «записи» под плейсхолдер-аккаунтами:
 *   - «БЛОК ОКНА» (тел. +70000000000) — ручная блокировка слота;
 *   - «Дмитрий Берсон» (тел. +79189000782) — свои тестовые брони.
 * Это не реальные пациенты — их брони мусорят историю и календарь. Удаляем ТОЛЬКО записи
 * (be_appointments + проекции + appointment-маппинги), сами platform_users НЕ трогаем.
 *
 * ⚠ ЭТОТ СКРИПТ НЕ УДАЛЯЕТ НИ ОДНОГО АККАУНТА (platform_users). Только записи.
 *
 * Что удаляет (в одной транзакции при --commit):
 *   1. be_external_entity_mappings (entity_type='appointment') для целевых записей;
 *   2. be_appointments целевых (CASCADE снесёт audit-детей: events/history/reschedules/
 *      cancellations/staff_comments/form_submissions; payments/patient_bookings → SET NULL);
 *   3. patient_bookings проекции этих плейсхолдеров;
 *   4. appointment_records (legacy) проекции этих плейсхолдеров.
 *
 * Цель = записи, где platform_user_id принадлежит НЕ-admin плейсхолдеру с целевым телефоном,
 *   ИЛИ phone_normalized/contact_phone — целевой телефон. Admin-аккаунты исключены by design.
 *
 * Безопасность:
 *   - Dry-run по умолчанию; запись ТОЛЬКО с --commit (одна транзакция, ROLLBACK при ошибке).
 *   - Идемпотентно: повторный прогон удаляет 0.
 *   - Жёсткая защита: целевые user-id берутся только с role <> 'admin'; перед удалением
 *     проверяем, что среди них нет admin — иначе abort.
 *   - dev = реальные ПДн: печатаем id/числа/имя-плейсхолдера.
 *   - Audit-лог (commit): .tmp/placeholder-purge/applied-<ts>.json.
 *
 * Запуск:
 *   set -a && source apps/webapp/.env.dev && set +a
 *   pnpm --dir apps/webapp run purge-placeholder-bookings              # dry-run
 *   pnpm --dir apps/webapp run purge-placeholder-bookings -- --commit
 */

import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

const COMMIT = process.argv.slice(2).includes("--commit");
const PHONES = ["+70000000000", "+79189000782"];

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("MISSING DATABASE_URL — сначала: set -a && source apps/webapp/.env.dev && set +a");
  process.exit(1);
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = await pool.connect();
  const stats: Record<string, number> = {};
  const audit: Record<string, unknown> = {};

  try {
    const phoneList = PHONES.map((p) => `'${p}'`).join(",");

    // ── target placeholder users (НЕ-admin, с целевым телефоном) — только для матчинга записей ──
    const users = await db.query<{ id: string; display_name: string; phone_normalized: string; role: string }>(
      `SELECT id, display_name, phone_normalized, role FROM platform_users
        WHERE phone_normalized IN (${phoneList}) AND role IS DISTINCT FROM 'admin'`,
    );
    const userIds = users.rows.map((u) => u.id);
    audit.targetUsers = users.rows.map((u) => ({ id: u.id, name: u.display_name, phone: u.phone_normalized }));
    console.log("\n=== ЦЕЛЕВЫЕ ПЛЕЙСХОЛДЕР-АККАУНТЫ (НЕ удаляются, только их записи) ===");
    for (const u of users.rows) console.log(`  ${u.id}  ${u.display_name}  ${u.phone_normalized}  role=${u.role}`);

    // защита: ни один целевой не должен быть admin
    const adminGuard = await db.query(
      `SELECT id FROM platform_users WHERE id = ANY($1::uuid[]) AND role = 'admin'`,
      [userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]],
    );
    if (adminGuard.rowCount && adminGuard.rowCount > 0) {
      throw new Error(`ABORT: среди целевых оказался admin: ${adminGuard.rows.map((r) => r.id).join(",")}`);
    }

    const userArr = userIds.length ? `ARRAY[${userIds.map((i) => `'${i}'::uuid`).join(",")}]` : `ARRAY[]::uuid[]`;
    // условие «целевая запись»: по плейсхолдер-user ИЛИ по телефону
    const apptWhere = `(platform_user_id = ANY(${userArr}) OR phone_normalized IN (${phoneList}))`;

    // ── собрать id целевых be_appointments (для маппингов + отчёта) ──
    const apptIdsRes = await db.query<{ id: string }>(`SELECT id FROM be_appointments WHERE ${apptWhere}`);
    const apptIds = apptIdsRes.rows.map((r) => r.id);
    stats.be_appointments_to_delete = apptIds.length;
    audit.appointmentIds = apptIds;
    const apptArr = apptIds.length ? `ARRAY[${apptIds.map((i) => `'${i}'::uuid`).join(",")}]` : `ARRAY[]::uuid[]`;

    stats.appointment_mappings_to_delete = (
      await db.query(
        `SELECT count(*)::int n FROM be_external_entity_mappings
          WHERE entity_type='appointment' AND canonical_id = ANY(${apptArr})`,
      )
    ).rows[0]!.n as number;
    stats.patient_bookings_to_delete = (
      await db.query(
        `SELECT count(*)::int n FROM patient_bookings
          WHERE platform_user_id = ANY(${userArr}) OR contact_phone IN (${phoneList})`,
      )
    ).rows[0]!.n as number;
    stats.appointment_records_to_delete = (
      await db.query(
        `SELECT count(*)::int n FROM appointment_records
          WHERE platform_user_id = ANY(${userArr}) OR phone_normalized IN (${phoneList})`,
      )
    ).rows[0]!.n as number;

    if (COMMIT) {
      await db.query("BEGIN");
      await db.query(
        `DELETE FROM be_external_entity_mappings WHERE entity_type='appointment' AND canonical_id = ANY(${apptArr})`,
      );
      await db.query(`DELETE FROM be_appointments WHERE ${apptWhere}`);
      await db.query(
        `DELETE FROM patient_bookings WHERE platform_user_id = ANY(${userArr}) OR contact_phone IN (${phoneList})`,
      );
      await db.query(
        `DELETE FROM appointment_records WHERE platform_user_id = ANY(${userArr}) OR phone_normalized IN (${phoneList})`,
      );
      await db.query("COMMIT");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const dir = resolvePath(process.cwd(), "../../.tmp/placeholder-purge");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolvePath(dir, `applied-${stamp}.json`), JSON.stringify({ audit, stats }, null, 2));
      console.log(`\nAudit log → ${resolvePath(dir, `applied-${stamp}.json`)}`);
    }
  } catch (err) {
    if (COMMIT) await db.query("ROLLBACK");
    console.error("FAILED, rolled back:", err);
    process.exitCode = 1;
  } finally {
    db.release();
    await pool.end();
  }

  console.log("\n=== SUMMARY (records only; НЕ удаляются аккаунты) ===");
  console.table(stats);
  if (!COMMIT) console.log("\nDRY-RUN — изменений не вносилось. Повтори с --commit для записи.");
}

main();
