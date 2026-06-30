#!/usr/bin/env tsx
/**
 * One-off sanitation: be_appointments.reschedule_count → источник истины.
 *
 * Контекст (R28 / BOOKING_REWORK):
 *   Мост проекции Rubitime инфлировал reschedule_count: при каждом прогоне проекции/бэкфилле
 *   делал +1, если время проекции разошлось (timeChanged), БЕЗ строки в be_appointment_reschedules.
 *   Итог в проде/dev: реальных переносов в be_appointment_reschedules ≈ 1, а reschedule_count = 3-4
 *   у сотен записей (source=rubitime_projection). Инкремент в мосте убран в коде
 *   (apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts) — этот скрипт чинит уже накопленные значения.
 *
 * Что делает (две идемпотентные ветки, обе трогают только строки с расхождением):
 *   1. source = 'rubitime_projection'  → reschedule_count = 0.
 *        Для исторических rubitime-проекций реальные переносы в каноне неизвестны;
 *        по решению владельца — честный 0, а не выдуманный счётчик.
 *   2. остальные source (admin_manual / native / patient) → reschedule_count = (count строк
 *        be_appointment_reschedules для этой записи). Эти записи мост тоже мог инфлировать
 *        (bidirectional inbound по смапленным native-записям), а реальные переносы через движок
 *        у них фиксируются строками в таблице — приводим колонку к этому источнику истины.
 *
 * Источник истины переносов: таблица be_appointment_reschedules (её ведёт только настоящий путь
 *   переноса pgBookingAppointmentLifecycle). KPI «Переносов» уже считается по ней и корректен.
 *
 * Безопасность:
 *   - Dry-run по умолчанию; запись ТОЛЬКО с --commit (всё в одной транзакции, ROLLBACK при ошибке).
 *   - Идемпотентно: повторный прогон после фикса не меняет строк (WHERE … <> target).
 *   - Можно ограничить организацией: --org=<uuid>.
 *   - В commit-режиме пишет audit-лог (counts + sample id) в
 *     .tmp/reschedule-count-sanitation/applied-<ts>.json.
 *   - dev = реальные ПДн: ПДн не печатаем (только id/числа).
 *
 * Запуск (env обязателен — иначе pg уйдёт в локальный сокет):
 *   set -a && source apps/webapp/.env.dev && set +a
 *   pnpm --dir apps/webapp run sanitize-reschedule-count           # dry-run
 *   pnpm --dir apps/webapp run sanitize-reschedule-count -- --commit
 *   # опц.: -- --org=<organization_uuid>
 */

import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(`--${name}`);
const getOpt = (name: string): string | null => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const COMMIT = hasFlag("commit");
const ORG = getOpt("org");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("MISSING DATABASE_URL — сначала: set -a && source apps/webapp/.env.dev && set +a");
  process.exit(1);
}

const orgClause = ORG ? "AND organization_id = $1::uuid" : "";
const orgArgs = ORG ? [ORG] : [];

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = await pool.connect();

  const stats: Record<string, number> = {
    projectionMismatch: 0, // rubitime_projection с reschedule_count <> 0
    nativeMismatch: 0, // прочие source, где count <> реальные строки reschedules
    projectionFixed: 0,
    nativeFixed: 0,
  };
  const sample: { projection: string[]; native: string[] } = { projection: [], native: [] };

  try {
    // ── Диагностика ДО ───────────────────────────────────────────────────────
    const projDiag = await db.query<{ id: string; reschedule_count: number }>(
      `SELECT id, reschedule_count
         FROM be_appointments
        WHERE source = 'rubitime_projection' AND reschedule_count <> 0 ${orgClause}
        ORDER BY reschedule_count DESC
        LIMIT 100000`,
      orgArgs,
    );
    stats.projectionMismatch = projDiag.rowCount ?? 0;
    sample.projection = projDiag.rows.slice(0, 5).map((r) => `${r.id}:${r.reschedule_count}`);

    const nativeDiag = await db.query<{ id: string; reschedule_count: number; real: number }>(
      `SELECT a.id,
              a.reschedule_count,
              (SELECT count(*)::int FROM be_appointment_reschedules r WHERE r.appointment_id = a.id) AS real
         FROM be_appointments a
        WHERE a.source <> 'rubitime_projection' ${ORG ? "AND a.organization_id = $1::uuid" : ""}
          AND a.reschedule_count <> (SELECT count(*)::int FROM be_appointment_reschedules r WHERE r.appointment_id = a.id)
        ORDER BY a.reschedule_count DESC
        LIMIT 100000`,
      orgArgs,
    );
    stats.nativeMismatch = nativeDiag.rowCount ?? 0;
    sample.native = nativeDiag.rows.slice(0, 5).map((r) => `${r.id}:${r.reschedule_count}->${r.real}`);

    console.log("\n=== ДО (расхождения) ===");
    console.table(stats);
    if (sample.projection.length) console.log("projection sample (id:count):", sample.projection.join(", "));
    if (sample.native.length) console.log("native sample (id:count->real):", sample.native.join(", "));

    if (COMMIT) {
      await db.query("BEGIN");

      const proj = await db.query(
        `UPDATE be_appointments
            SET reschedule_count = 0, updated_at = now()
          WHERE source = 'rubitime_projection' AND reschedule_count <> 0 ${orgClause}`,
        orgArgs,
      );
      stats.projectionFixed = proj.rowCount ?? 0;

      const nat = await db.query(
        `UPDATE be_appointments a
            SET reschedule_count = (SELECT count(*)::int FROM be_appointment_reschedules r WHERE r.appointment_id = a.id),
                updated_at = now()
          WHERE a.source <> 'rubitime_projection' ${ORG ? "AND a.organization_id = $1::uuid" : ""}
            AND a.reschedule_count <> (SELECT count(*)::int FROM be_appointment_reschedules r WHERE r.appointment_id = a.id)`,
        orgArgs,
      );
      stats.nativeFixed = nat.rowCount ?? 0;

      await db.query("COMMIT");

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const dir = resolvePath(process.cwd(), "../../.tmp/reschedule-count-sanitation");
      mkdirSync(dir, { recursive: true });
      const logPath = resolvePath(dir, `applied-${stamp}.json`);
      writeFileSync(logPath, JSON.stringify({ org: ORG, stats, sample }, null, 2));
      console.log(`\nAudit log → ${logPath}`);
    }
  } catch (err) {
    if (COMMIT) await db.query("ROLLBACK");
    console.error("FAILED, rolled back:", err);
    process.exitCode = 1;
  } finally {
    db.release();
    await pool.end();
  }

  console.log("\n=== SUMMARY ===");
  console.table(stats);
  if (!COMMIT) console.log("\nDRY-RUN — изменений не вносилось. Повтори с --commit для записи.");
}

main();
