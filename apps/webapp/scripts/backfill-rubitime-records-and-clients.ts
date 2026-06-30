#!/usr/bin/env tsx
/**
 * One-off backfill: Rubitime CSV export → webapp canon (appointment_records + platform_users).
 *
 * Закрывает три пересекающихся пробела одним проходом «по телефону»:
 *   A. Записи из CSV, которых нет в appointment_records  → INSERT (с резолвом клиента/филиала).
 *   B. Клиенты из CSV, которых нет в platform_users       → создаются попутно (A) + хвост без записей.
 *   C. Записи в БД без platform_user_id (незаверш. relink) → resolve-or-create по телефону, проставить связь.
 *
 * Безопасность:
 *   - Dry-run по умолчанию; запись только с --commit (всё в одной транзакции, ROLLBACK при ошибке).
 *   - Идемпотентно: записи матчатся по integrator_record_id (UNIQUE), клиенты — по phone_normalized.
 *   - Нормализация телефона 1-в-1 с боевой `normalizeRuPhoneE164`
 *     (apps/webapp/src/shared/phone/normalizeRuPhoneE164.ts) — чтобы будущие записи/мессенджер-входы
 *     корректно мержились по телефону без дублей.
 *   - Резолв клиента 1-в-1 с боевой `findCanonicalUserIdByPhone`
 *     (apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts): ровно один канон по телефону → link;
 *     ноль → create; >1 (аномалия) → SKIP + репорт (НЕ плодим дубли).
 *   - В commit-режиме пишет аудит-лог применённого (созданные user id, вставленные/слинкованные записи)
 *     в .tmp/rubitime-import/backfill-applied-<ts>.json для проверки/отката.
 *
 * Запуск (env обязателен — иначе pg уйдёт в локальный сокет):
 *   set -a && source apps/webapp/.env.dev && set +a
 *   pnpm --dir apps/webapp run backfill-rubitime-records-and-clients -- \
 *     --records=../../.tmp/rubitime-import/records.csv \
 *     --clients=../../.tmp/rubitime-import/clients-2.csv
 *   # затем то же с --commit
 */

import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(`--${name}`);
const getOpt = (name: string, dflt: string) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const COMMIT = hasFlag("commit");
const RECORDS_PATH = resolvePath(process.cwd(), getOpt("records", "../../.tmp/rubitime-import/records.csv"));
const CLIENTS_PATH = resolvePath(process.cwd(), getOpt("clients", "../../.tmp/rubitime-import/clients-2.csv"));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("MISSING DATABASE_URL — сначала: set -a && source apps/webapp/.env.dev && set +a");
  process.exit(1);
}

// ── helpers (зеркала боевого кода — см. шапку) ──────────────────────────────────

/** MIRRORS apps/webapp/src/shared/phone/normalizeRuPhoneE164.ts — держать в синхроне. */
function normalizeRuPhoneE164(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  return `+${digits}`;
}
function isValidRuPhone(norm: string): boolean {
  return /^\+7\d{10}$/.test(norm);
}

/** Парсер RU-дат: "dd/mm/yyyy HH:MM" и "yyyy-mm-dd HH:MM:SS" → Date (Europe/Moscow = +03:00, без DST). */
function parseRuDateTime(raw: string): Date | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) { const [, dd, mm, yyyy, HH, MM, SS] = m; return new Date(`${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS ?? "00"}+03:00`); }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) { const [, yyyy, mm, dd, HH, MM, SS] = m; return new Date(`${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS ?? "00"}+03:00`); }
  return null;
}

/** CSV (RFC4180-ish): разделитель ';', кавычки '"', поддержка встроенных ';' и переводов строк. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "", inQuotes = false;
  let row: string[] = [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ";") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch === "\r") { /* skip */ }
    else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function mapStatus(statusTitle: string): "created" | "canceled" {
  return (statusTitle ?? "").trim().toLowerCase().startsWith("отмен") ? "canceled" : "created";
}

// ── client info из clients-2.csv (для обогащения создаваемых юзеров) ─────────────
type ClientInfo = { displayName: string; firstName: string | null; lastName: string | null; email: string | null };

function loadClientInfo(): Map<string, ClientInfo> {
  const map = new Map<string, ClientInfo>();
  const rows = parseCsv(readFileSync(CLIENTS_PATH, "utf8")); // #;Дата;Имя;Фамилия;Отчество;Телефон;Email;...
  for (const r of rows.slice(1)) {
    if (r.length < 7) continue;
    const phone = normalizeRuPhoneE164(r[5] ?? "");
    if (!isValidRuPhone(phone)) continue;
    const first = (r[2] ?? "").trim() || null;
    const last = (r[3] ?? "").trim() || null;
    const patr = (r[4] ?? "").trim();
    const email = (r[6] ?? "").trim() || null;
    const displayName = [last, first, patr].filter(Boolean).join(" ").trim() || phone;
    if (!map.has(phone)) map.set(phone, { displayName, firstName: first, lastName: last, email });
  }
  return map;
}

type Stats = {
  csvRecords: number; recSkippedExisting: number; recInserted: number; recInvalidPhone: number;
  recAmbiguous: number; recNoBranch: number;
  orphans: number; orphanRelinked: number; orphanAmbiguous: number; orphanNoPhone: number;
  clientsOnlyNoRecord: number;
  usersToCreate: number; // уникально (created или would_create)
};

type ResolveResult =
  | { status: "existing" | "created" | "would_create"; userId: string | null }
  | { status: "invalid_phone" | "ambiguous"; userId: null };

/** find-or-create по телефону; уникальное создание считается в stats.usersToCreate (кэш на прогон). */
function makeResolver(
  db: pg.PoolClient,
  clientInfo: Map<string, ClientInfo>,
  stats: Stats,
  createdUserIds: string[],
) {
  const cache = new Map<string, ResolveResult>();
  return async function resolveUser(rawPhone: string, fallbackName: string): Promise<ResolveResult> {
    const phone = normalizeRuPhoneE164(rawPhone ?? "");
    if (!isValidRuPhone(phone)) return { status: "invalid_phone", userId: null };
    const cached = cache.get(phone);
    if (cached) return cached;

    const r = await db.query<{ id: string }>(
      `SELECT id FROM platform_users
       WHERE phone_normalized = $1 AND merged_into_id IS NULL
       ORDER BY created_at ASC LIMIT 3`,
      [phone],
    );
    let res: ResolveResult;
    if (r.rows.length === 1) res = { status: "existing", userId: r.rows[0].id };
    else if (r.rows.length > 1) res = { status: "ambiguous", userId: null };
    else if (!COMMIT) { stats.usersToCreate++; res = { status: "would_create", userId: null }; }
    else {
      const info = clientInfo.get(phone);
      const display = (info?.displayName ?? fallbackName ?? "").trim().slice(0, 500) || phone;
      const email = info?.email ?? null;
      const ins = await db.query<{ id: string }>(
        `INSERT INTO platform_users
           (phone_normalized, display_name, role, patient_phone_trust_at, first_name, last_name, email, email_normalized)
         VALUES ($1, $2, 'client', now(), $3, $4, $5, $6)
         RETURNING id`,
        [phone, display, info?.firstName ?? null, info?.lastName ?? null, email, email ? email.toLowerCase() : null],
      );
      stats.usersToCreate++;
      createdUserIds.push(ins.rows[0].id);
      res = { status: "created", userId: ins.rows[0].id };
    }
    cache.set(phone, res);
    return res;
  };
}

// ── main ────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${COMMIT ? "COMMIT (writes)" : "DRY-RUN (no writes)"}`);
  console.log(`records: ${RECORDS_PATH}`);
  console.log(`clients: ${CLIENTS_PATH}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = await pool.connect();

  const stats: Stats = {
    csvRecords: 0, recSkippedExisting: 0, recInserted: 0, recInvalidPhone: 0, recAmbiguous: 0, recNoBranch: 0,
    orphans: 0, orphanRelinked: 0, orphanAmbiguous: 0, orphanNoPhone: 0,
    clientsOnlyNoRecord: 0, usersToCreate: 0,
  };
  const applied = { createdUsers: [] as string[], insertedRecords: [] as string[], relinkedRecords: [] as string[] };
  const invalidPhoneRecordIds: string[] = [];
  const recordPhones = new Set<string>(); // валидные телефоны из records.csv (для clientsOnly)

  try {
    if (COMMIT) await db.query("BEGIN");

    const br = await db.query<{ id: string; name: string }>(`SELECT id, name FROM branches`);
    const branchByName = new Map<string, string>();
    for (const b of br.rows) if (b.name) branchByName.set(b.name.trim().toLowerCase(), b.id);

    const clientInfo = loadClientInfo();
    const resolveUser = makeResolver(db, clientInfo, stats, applied.createdUsers);

    const exist = await db.query<{ integrator_record_id: string }>(`SELECT integrator_record_id FROM appointment_records`);
    const existingIds = new Set(exist.rows.map((x) => x.integrator_record_id));

    // ── Phase A: CSV records → appointment_records ───────────────────────────────
    const recRows = parseCsv(readFileSync(RECORDS_PATH, "utf8"));
    for (const r of recRows.slice(1)) {
      if (r.length < 14) continue;
      const rid = (r[0] ?? "").trim();
      if (!/^\d+$/.test(rid)) continue;
      stats.csvRecords++;

      const rawPhone = ((r[5] ?? "").trim() || (r[19] ?? "").trim());
      const phone = normalizeRuPhoneE164(rawPhone);
      if (isValidRuPhone(phone)) recordPhones.add(phone);

      if (existingIds.has(rid)) { stats.recSkippedExisting++; continue; }

      const branchTitle = (r[1] ?? "").trim();
      const fio = ((r[4] ?? "").trim() || (r[18] ?? "").trim());
      const email = (((r[6] ?? "").trim() || (r[20] ?? "").trim()) || null);
      const recordAt = parseRuDateTime(r[10] ?? "");
      const statusTitle = (r[12] ?? "").trim();
      const createdAt = parseRuDateTime(r[13] ?? "") ?? new Date();
      const status = mapStatus(statusTitle);
      const branchId = branchByName.get(branchTitle.toLowerCase()) ?? null;
      if (!branchId) stats.recNoBranch++;

      if (!isValidRuPhone(phone)) { stats.recInvalidPhone++; invalidPhoneRecordIds.push(rid); continue; }

      const user = await resolveUser(rawPhone, fio);
      if (user.status === "ambiguous") { stats.recAmbiguous++; continue; }

      const payload = {
        id: Number(rid), name: fio, phone, email, record: r[10]?.trim() ?? null,
        status_title: statusTitle, branch_title: branchTitle || null, service_title: (r[3] ?? "").trim() || null,
        price: (r[8] ?? "").trim() || null, duration: (r[11] ?? "").trim() || null,
        comment: (r[7] ?? "").trim() || null, source: (r[17] ?? "").trim() || null,
        created_at: r[13]?.trim() ?? null, _source: "csv_backfill",
      };

      stats.recInserted++;
      if (COMMIT) {
        await db.query(
          `INSERT INTO appointment_records
             (integrator_record_id, phone_normalized, record_at, status, payload_json, last_event,
              created_at, updated_at, branch_id, platform_user_id)
           VALUES ($1,$2,$3::timestamptz,$4,$5::jsonb,$6,$7::timestamptz, now(), $8::uuid, $9::uuid)
           ON CONFLICT (integrator_record_id) DO NOTHING`,
          [rid, phone, recordAt ? recordAt.toISOString() : null, status, JSON.stringify(payload),
           status === "canceled" ? "canceled" : "created", createdAt.toISOString(), branchId, user.userId],
        );
        applied.insertedRecords.push(rid);
      }
    }

    // ── Phase C: relink осиротевших appointment_records (platform_user_id IS NULL) ─
    const orphans = await db.query<{ id: string; phone_normalized: string | null; name: string | null }>(
      `SELECT id, phone_normalized, payload_json->>'name' AS name
       FROM appointment_records
       WHERE platform_user_id IS NULL AND coalesce(phone_normalized,'') <> ''`,
    );
    for (const o of orphans.rows) {
      stats.orphans++;
      const user = await resolveUser(o.phone_normalized!, o.name ?? "");
      if (user.status === "ambiguous") { stats.orphanAmbiguous++; continue; }
      if (user.status === "invalid_phone") { stats.orphanNoPhone++; continue; }
      stats.orphanRelinked++;
      if (COMMIT && user.userId) {
        await db.query(
          `UPDATE appointment_records SET platform_user_id = $1::uuid, updated_at = now()
           WHERE id = $2::uuid AND platform_user_id IS NULL`,
          [user.userId, o.id],
        );
        applied.relinkedRecords.push(o.id);
      }
    }

    // ── Phase B-tail: клиенты из clients-2.csv БЕЗ записей (нет в records.csv) и без platform_user ─
    for (const [phone, info] of clientInfo) {
      if (recordPhones.has(phone)) continue; // покрыт фазой A/C
      const r = await db.query<{ id: string }>(
        `SELECT id FROM platform_users WHERE phone_normalized = $1 AND merged_into_id IS NULL LIMIT 1`,
        [phone],
      );
      if (r.rows.length > 0) continue;
      stats.clientsOnlyNoRecord++;
      await resolveUser(phone, info.displayName); // создаст (счёт в usersToCreate)
    }

    if (COMMIT) {
      await db.query("COMMIT");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logPath = resolvePath(process.cwd(), `../../.tmp/rubitime-import/backfill-applied-${stamp}.json`);
      writeFileSync(logPath, JSON.stringify({ stats, applied }, null, 2));
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
  if (invalidPhoneRecordIds.length) console.log(`invalid-phone record ids (пропущены): ${invalidPhoneRecordIds.join(", ")}`);
  if (!COMMIT) console.log("\nDRY-RUN — изменений не вносилось. Повтори с --commit для записи.");
}

main();
