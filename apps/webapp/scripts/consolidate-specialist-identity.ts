#!/usr/bin/env tsx
/**
 * One-off: сведение дублей канонического специалиста к одному (solo-specialist модель).
 *
 * Контекст:
 *   Исторически запись шла через Rubitime, где для КАЖДОГО филиала заводился отдельный
 *   «специалист» (дубль одного человека). При проекции в канон это дало несколько строк
 *   be_specialists для одного физлица + часть rubitime-проекций с specialist_id = NULL
 *   (кооператор не был смаплен). Продуктовая модель booking-rework — ОДИН специалист на все
 *   филиалы. Этот скрипт приводит исторические данные к модели:
 *     1) repoint всех FK-ссылок дублей → на канонического (primary) специалиста (8 таблиц);
 *        для link-таблиц с UNIQUE по specialist_id — conflict-safe (удаляем дубль-строку,
 *        которая столкнулась бы с существующей primary-строкой по остальным колонкам ключа);
 *     2) remap be_external_entity_mappings (specialist:rubitime) дублей → primary
 *        (чтобы будущий inbound резолвил одного специалиста);
 *     3) deactivate дубль-строки be_specialists (is_active=false; НЕ hard-delete — сохраняем
 *        ссылочную историю и аудит). После этого в орге ровно один активный специалист →
 *        resolveDefaultSpecialistId и solo-fallback моста детерминированы;
 *     4) (опц., вкл по умолчанию) привязка be_appointments с specialist_id = NULL → primary
 *        (специалист один = владельца). Филиал (branch_id) НЕ трогаем — это отдельное измерение.
 *
 * Код-фикс рецидива — в apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts
 *   (resolveSoloSpecialistId: немапленный кооператор + единственный активный специалист → он).
 *
 * Безопасность:
 *   - Dry-run по умолчанию; запись ТОЛЬКО с --commit (одна транзакция, ROLLBACK при ошибке).
 *   - Идемпотентно: повторный прогон после сведения не находит дублей и меняет 0 строк.
 *   - Primary авто-детект: активный специалист с наибольшим числом записей среди тёзок;
 *     переопределяется --canonical=<uuid>.
 *   - Дубли = активные специалисты ТОЙ ЖЕ организации с тем же full_name (кроме primary).
 *     --merge-all снимает фильтр по имени (сливает всех прочих — использовать осознанно).
 *   - --no-assign-nulls отключает шаг 4.
 *   - dev = реальные ПДн: печатаем только id/числа/full_name специалиста (это владелец, не пациент).
 *   - Audit-лог (commit): .tmp/specialist-consolidation/applied-<ts>.json.
 *
 * Запуск:
 *   set -a && source apps/webapp/.env.dev && set +a
 *   pnpm --dir apps/webapp run consolidate-specialist-identity                 # dry-run
 *   pnpm --dir apps/webapp run consolidate-specialist-identity -- --commit
 *   # опц.: -- --canonical=<uuid> --org=<uuid> --merge-all --no-assign-nulls
 */

import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

const argv = process.argv.slice(2);
const hasFlag = (n: string) => argv.includes(`--${n}`);
const getOpt = (n: string): string | null => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : null;
};
const COMMIT = hasFlag("commit");
const MERGE_ALL = hasFlag("merge-all");
const ASSIGN_NULLS = !hasFlag("no-assign-nulls");
const CANONICAL = getOpt("canonical");
const ORG = getOpt("org");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("MISSING DATABASE_URL — сначала: set -a && source apps/webapp/.env.dev && set +a");
  process.exit(1);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
for (const [name, val] of [["canonical", CANONICAL], ["org", ORG]] as const) {
  if (val !== null && !UUID_RE.test(val)) {
    console.error(`--${name} должен быть uuid, получено: ${val}`);
    process.exit(1);
  }
}

// FK-таблицы со ссылкой specialist_id. Для link-таблиц с UNIQUE(specialist_id, …) указываем
// остальные колонки ключа — по ним делаем conflict-safe dedup (равенство `=` = NULLS DISTINCT).
const FK_TABLES: { table: string; uniqueOtherCols: string[] }[] = [
  { table: "be_appointments", uniqueOtherCols: [] },
  { table: "be_availability_rules", uniqueOtherCols: [] },
  { table: "be_schedule_blocks", uniqueOtherCols: [] },
  { table: "be_working_hours", uniqueOtherCols: [] },
  { table: "be_working_days", uniqueOtherCols: [] },
  { table: "be_specialist_locations", uniqueOtherCols: ["branch_id"] },
  { table: "be_specialist_rooms", uniqueOtherCols: ["room_id"] },
  {
    table: "be_specialist_service_availability",
    uniqueOtherCols: ["service_id", "branch_id", "room_id", "city_code"],
  },
];

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = await pool.connect();
  const stats: Record<string, number> = {};
  const audit: Record<string, unknown> = {};

  try {
    // ── primary ──────────────────────────────────────────────────────────────
    const orgFilter = ORG ? `AND s.organization_id = '${ORG}'::uuid` : "";
    let primaryId = CANONICAL;
    let primaryName: string | null = null;
    let primaryOrg: string | null = null;
    if (!primaryId) {
      const r = await db.query<{ id: string; full_name: string; organization_id: string; cnt: number }>(
        `SELECT s.id, s.full_name, s.organization_id,
                (SELECT count(*)::int FROM be_appointments a WHERE a.specialist_id = s.id) cnt
           FROM be_specialists s
          WHERE s.is_active = true ${orgFilter}
          ORDER BY cnt DESC, s.created_at ASC
          LIMIT 1`,
      );
      if (r.rowCount === 0) {
        console.error("Не найдено активных специалистов — нечего сводить.");
        return;
      }
      primaryId = r.rows[0]!.id;
      primaryName = r.rows[0]!.full_name;
      primaryOrg = r.rows[0]!.organization_id;
    } else {
      const r = await db.query<{ full_name: string; organization_id: string }>(
        `SELECT full_name, organization_id FROM be_specialists WHERE id = $1::uuid`,
        [primaryId],
      );
      if (r.rowCount === 0) {
        console.error(`--canonical ${primaryId} не найден в be_specialists.`);
        process.exitCode = 1;
        return;
      }
      primaryName = r.rows[0]!.full_name;
      primaryOrg = r.rows[0]!.organization_id;
    }

    // ── duplicates ───────────────────────────────────────────────────────────
    const nameClause = MERGE_ALL ? "" : "AND full_name = $2";
    const dupRows = await db.query<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM be_specialists
        WHERE organization_id = $1::uuid AND id <> $3::uuid ${nameClause}`,
      MERGE_ALL ? [primaryOrg, primaryId] : [primaryOrg, primaryName, primaryId],
    );
    const dupIds = dupRows.rows.map((d) => d.id);
    console.log("\n=== PLAN ===");
    console.log(`primary: ${primaryId} (${primaryName}) org=${primaryOrg}`);
    console.log(`duplicates (${dupIds.length}):`, dupIds.join(", ") || "—");
    audit.primaryId = primaryId;
    audit.primaryName = primaryName;
    audit.dupIds = dupIds;

    if (dupIds.length === 0 && !ASSIGN_NULLS) {
      console.log("Нет дублей и assign-nulls выключен — нечего делать.");
      return;
    }

    const dupList = dupIds.map((d) => `'${d}'::uuid`).join(",");

    // ── be_appointments: пропускаем активные записи дубля, пересекающиеся с активной
    //    записью primary (exclusion-constraint be_appointments_specialist_no_overlap) — это
    //    настоящий double-book (последствие per-branch специалистов), решает владелец вручную.
    const ACTIVE_STATUS = `status NOT IN ('cancelled_by_patient','cancelled_by_specialist','late_cancellation','no_show','completed','visit_confirmed')`;
    let apptSkipIds: string[] = [];
    if (dupIds.length > 0) {
      const r = await db.query<{ id: string; slot: string }>(
        `SELECT d.id, to_char(d.start_at,'YYYY-MM-DD HH24:MI') slot
           FROM be_appointments d
          WHERE d.specialist_id IN (${dupList}) AND d.deleted_at IS NULL AND d.${ACTIVE_STATUS}
            AND EXISTS (SELECT 1 FROM be_appointments p
                         WHERE p.specialist_id = '${primaryId}'::uuid AND p.deleted_at IS NULL AND p.${ACTIVE_STATUS}
                           AND tstzrange(p.start_at,p.end_at,'[)') && tstzrange(d.start_at,d.end_at,'[)'))`,
      );
      apptSkipIds = r.rows.map((x) => x.id);
      stats.be_appointments_skipped_overlap = apptSkipIds.length;
      audit.skippedOverlapAppointments = r.rows.map((x) => ({ id: x.id, slot: x.slot }));
      if (apptSkipIds.length > 0) {
        console.log(
          `\n⚠ ПРОПУЩЕНЫ (double-book, переносить нельзя) — решает владелец:`,
          r.rows.map((x) => x.slot).join(", "),
        );
      }
    }
    const apptSkipClause = apptSkipIds.length
      ? ` AND id NOT IN (${apptSkipIds.map((i) => `'${i}'::uuid`).join(",")})`
      : "";

    if (COMMIT) await db.query("BEGIN");

    // ── repoint FK tables ──────────────────────────────────────────────────────
    for (const { table, uniqueOtherCols } of FK_TABLES) {
      if (dupIds.length === 0) {
        stats[`${table}_repointed`] = 0;
        continue;
      }
      const extraClause = table === "be_appointments" ? apptSkipClause : "";
      // conflict-safe: удаляем дубль-строки, которые столкнулись бы с primary по остальным
      // колонкам UNIQUE (равенство `=` пропускает NULL — это и есть NULLS DISTINCT семантика).
      if (uniqueOtherCols.length > 0) {
        const eqJoin = uniqueOtherCols.map((c) => `p.${c} = d.${c}`).join(" AND ");
        const delSql = `DELETE FROM ${table} d
           WHERE d.specialist_id IN (${dupList})
             AND EXISTS (SELECT 1 FROM ${table} p WHERE p.specialist_id = '${primaryId}'::uuid AND ${eqJoin})`;
        const collideCount = (
          await db.query(
            `SELECT count(*)::int n FROM ${table} d WHERE d.specialist_id IN (${dupList})
               AND EXISTS (SELECT 1 FROM ${table} p WHERE p.specialist_id = '${primaryId}'::uuid AND ${eqJoin})`,
          )
        ).rows[0]!.n as number;
        stats[`${table}_collisions_deleted`] = collideCount;
        if (COMMIT && collideCount > 0) await db.query(delSql);
      }
      const cnt = (
        await db.query(
          `SELECT count(*)::int n FROM ${table} WHERE specialist_id IN (${dupList})${extraClause}`,
        )
      ).rows[0]!.n as number;
      stats[`${table}_repointed`] = cnt;
      if (COMMIT && cnt > 0) {
        await db.query(
          `UPDATE ${table} SET specialist_id = '${primaryId}'::uuid WHERE specialist_id IN (${dupList})${extraClause}`,
        );
      }
    }

    // ── remap external mappings (specialist:rubitime) ───────────────────────────
    if (dupIds.length > 0) {
      const mapCnt = (
        await db.query(
          `SELECT count(*)::int n FROM be_external_entity_mappings
            WHERE entity_type='specialist' AND external_system='rubitime' AND canonical_id IN (${dupList})`,
        )
      ).rows[0]!.n as number;
      stats.external_mappings_remapped = mapCnt;
      if (COMMIT && mapCnt > 0) {
        await db.query(
          `UPDATE be_external_entity_mappings SET canonical_id = '${primaryId}'::uuid, updated_at = now()
            WHERE entity_type='specialist' AND external_system='rubitime' AND canonical_id IN (${dupList})`,
        );
      }
    }

    // ── deactivate duplicate specialists ────────────────────────────────────────
    if (dupIds.length > 0) {
      stats.specialists_deactivated = dupIds.length;
      if (COMMIT) {
        await db.query(
          `UPDATE be_specialists SET is_active = false, updated_at = now() WHERE id IN (${dupList})`,
        );
      }
    }

    // ── assign NULL-specialist appointments → primary ──────────────────────────
    if (ASSIGN_NULLS) {
      const orgClause = ORG ? `AND organization_id = '${ORG}'::uuid` : `AND organization_id = '${primaryOrg}'::uuid`;
      const nullCnt = (
        await db.query(`SELECT count(*)::int n FROM be_appointments WHERE specialist_id IS NULL ${orgClause}`)
      ).rows[0]!.n as number;
      stats.null_appointments_assigned = nullCnt;
      if (COMMIT && nullCnt > 0) {
        await db.query(
          `UPDATE be_appointments SET specialist_id = '${primaryId}'::uuid, updated_at = now()
            WHERE specialist_id IS NULL ${orgClause}`,
        );
      }
    }

    if (COMMIT) {
      await db.query("COMMIT");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const dir = resolvePath(process.cwd(), "../../.tmp/specialist-consolidation");
      mkdirSync(dir, { recursive: true });
      const logPath = resolvePath(dir, `applied-${stamp}.json`);
      writeFileSync(logPath, JSON.stringify({ audit, stats }, null, 2));
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
