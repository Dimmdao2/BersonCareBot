#!/usr/bin/env tsx
/**
 * Reconcile canonical `be_appointments` with legacy `appointment_records` (Rubitime).
 *
 * WHY: KPI/list historically read legacy; the calendar reads canonical. The 2026-06-13 Rubitime
 * CSV backfill landed only in legacy → ~119 historical records (Feb–Mar 2026) never projected to
 * canonical. Goal of D1: canonical is the single source of truth. See
 * docs/DOCTOR_UI_REBUILD_REVIEW/APPOINTMENTS_PARITY_S0.md.
 *
 * S0 dev findings (2026-06-13):
 *  - Future records are already in canonical (continuous inbound sync works).
 *  - The real gap is historical singles + 9 test/block rows + 7 small duplicate clusters.
 *  - Duplicate clusters each resolve to ONE canonical row (distinct_canonical = 1) → they do NOT
 *    create double-bookings; extra Rubitime ids are sync-safe (future webhooks update the same row).
 *  - The batch `projectAppointmentRecords` has no per-record try/catch → a single `no_overlap`
 *    conflict aborts the whole batch. This script runs projection PER-RECORD (tolerant) instead,
 *    so one bad row never blocks the rest, and collects conflicts for review.
 *
 * This script reuses the production bridge (`upsertCanonicalFromRubitimeRecord`) — it does NOT
 * re-implement matching/dedup, and does NOT modify the bridge.
 *
 * SAFETY: dry-run by default (read-only diagnosis). All writes require `--commit`. Legacy rows are
 * only ever soft-deleted (`deleted_at`), never hard-deleted; canonical/raw are untouched here.
 *
 * Test/block markers treated as deletable (owner 2026-06-13 / 2026-07-14): explicit
 * approved phone variants and exact safe name markers only. No fuzzy matching.
 *
 * Usage (set webapp DATABASE_URL; on dev use a CLEAN prod snapshot for a trustworthy run):
 *   pnpm backfill-canonical-from-legacy-appointments                    # DRY-RUN: diagnosis only, no writes
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit        # tolerant per-record projection
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit --delete-test    # + soft-delete test/block first
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit --collapse-dups  # + collapse duplicate clusters
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit --cleanup-only --delete-test --collapse-canceled-dups  # approved narrow cleanup only, no projection
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit --cleanup-only --delete-non-confirmed  # + soft-delete canceled/moved/non-confirmed statuses
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit --historical-owner-doctor-phone=<phone> --csv=records.csv  # owner-approved pre-webapp history import
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit --drop-legacy=8361933,8448355  # soft-delete stale ext-ids (audited, no ad-hoc SQL)
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit --drop-stale-from-csv          # AUTO: soft-delete legacy absent from the Rubitime CSV (within its date range)
 *   pnpm backfill-canonical-from-legacy-appointments -- --csv=../../.tmp/rubitime-import/records.csv  # CSV path (default)
 *   pnpm backfill-canonical-from-legacy-appointments -- --org=<uuid>    # override organization id
 *   pnpm backfill-canonical-from-legacy-appointments -- --summary-only   # PII-safe output: counts/categories only
 *
 * STALE / ERRONEOUS records (resolve against the Rubitime CSV = source of truth, .tmp/rubitime-import/records.csv):
 *  - Records present in legacy but ABSENT from the current CSV within its date range (deleted/moved in Rubitime) →
 *    auto-detected in diagnosis and removed by `--drop-stale-from-csv` (or list them to `--drop-legacy`).
 *  - Erroneous canonical rows (e.g. a manual double-booking onto an occupied slot) are NOT handled here — delete them via
 *    the doctor cabinet UI / proper flow; this script only touches legacy appointment_records + projection.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { sql, type SQL } from "drizzle-orm";
import {
  resolveRubitimeStatusFromPayload,
  type RubitimeNormalizedStatus,
} from "@bersoncare/booking-rubitime-sync";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { createPgBookingEnginePort } from "@/infra/repos/pgBookingEngine";
import { createPgBookingRubitimeBridgePort } from "@/infra/repos/pgBookingRubitimeBridge";
import type {
  RubitimeCanonicalProjectionAction,
  RubitimeCanonicalProjectionInput,
} from "@/modules/booking-rubitime-bridge/ports";

const TEST_BLOCK_PHONES = [
  "+79189000782",
  "+70000000000",
  "+79000000000",
  "+79999999999",
  "+79876543210",
];
const TEST_BLOCK_NAME_MARKERS = ["тест", "test", "дмитрий берсон", "берсон", "блок окна"];
const DEFAULT_CSV = "../../.tmp/rubitime-import/records.csv";
const NON_CONFIRMED_CLEANUP_STATUSES = new Set<RubitimeNormalizedStatus>([
  "canceled",
  "awaiting_confirmation",
  "in_cart",
  "moved_awaiting",
]);

type Cli = {
  commit: boolean;
  org: string | null;
  deleteTest: boolean;
  collapseDups: boolean;
  collapseCanceledDups: boolean;
  deleteNonConfirmed: boolean;
  cleanupOnly: boolean;
  dropLegacy: string[];
  csvPath: string;
  dropStaleFromCsv: boolean;
  summaryOnly: boolean;
  historicalOwnerDoctorPhone: string | null;
};

function parseCli(): Cli {
  const argv = process.argv.slice(2);
  let org: string | null = null;
  let dropLegacy: string[] = [];
  let csvPath = DEFAULT_CSV;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a.startsWith("--org=")) org = a.slice("--org=".length).trim() || null;
    else if (a === "--org" && argv[i + 1]) org = (argv[++i] ?? "").trim() || null;
    else if (a.startsWith("--drop-legacy=")) {
      dropLegacy = a.slice("--drop-legacy=".length).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith("--csv=")) csvPath = a.slice("--csv=".length).trim() || DEFAULT_CSV;
  }
  return {
    commit: argv.includes("--commit"),
    org,
    deleteTest: argv.includes("--delete-test"),
    collapseDups: argv.includes("--collapse-dups"),
    collapseCanceledDups: argv.includes("--collapse-canceled-dups"),
    deleteNonConfirmed: argv.includes("--delete-non-confirmed"),
    cleanupOnly: argv.includes("--cleanup-only"),
    dropLegacy,
    csvPath,
    dropStaleFromCsv: argv.includes("--drop-stale-from-csv"),
    summaryOnly: argv.includes("--summary-only") || argv.includes("--pii-safe"),
    historicalOwnerDoctorPhone:
      argv.find((a) => a.startsWith("--historical-owner-doctor-phone="))?.slice("--historical-owner-doctor-phone=".length).trim()
      || null,
  };
}

/** Minimal CSV parser (delimiter `;`, quotes, BOM, CRLF) — mirrors backfill-rubitime-records-and-clients.ts. */
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

/** "dd/mm/yyyy HH:MM" (Europe/Moscow) → epoch ms, or null. */
function parseRuDate(raw: string): number | null {
  const m = (raw ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

type CsvIndex = { ids: Set<string>; minDay: number; maxDay: number };

/** Load Rubitime export: set of record ids (col 0 `#`) + covered date range (col 10 «Дата записи»). */
function loadCsvIndex(csvPath: string): CsvIndex | null {
  const abs = resolvePath(process.cwd(), csvPath);
  if (!existsSync(abs)) return null;
  const rows = parseCsv(readFileSync(abs, "utf8"));
  const ids = new Set<string>();
  let minDay = Infinity, maxDay = -Infinity;
  for (const r of rows.slice(1)) {
    const id = (r[0] ?? "").trim();
    if (id) ids.add(id);
    const d = parseRuDate(r[10] ?? "");
    if (d != null) { if (d < minDay) minDay = d; if (d > maxDay) maxDay = d; }
  }
  if (ids.size === 0) return null;
  return { ids, minDay, maxDay };
}

type Rows = unknown[] | { rows?: unknown[] };
function rows<T = unknown>(r: Rows): T[] {
  return (Array.isArray(r) ? r : (r.rows ?? [])) as T[];
}

/** Build a SQL `(v1, v2, …)` list for use with `IN` (drizzle array interpolation ≠ pg array). */
function list(values: readonly string[]) {
  return sql`(${sql.join(values.map((v) => sql`${v}`), sql`, `)})`;
}

function matchesTestBlockName(nameExpr: SQL) {
  return sql`(${sql.join(
    TEST_BLOCK_NAME_MARKERS.map((marker) => sql`${nameExpr} LIKE ${`%${marker}%`}`),
    sql` OR `,
  )})`;
}

type CountRow = {
  legacy_live: number;
  canonical_projection: number;
};

type UnmappedBucketRow = {
  total: number;
  test_block: number;
  cancelled: number;
  real_active: number;
  future: number;
};

type DuplicateClusterRow = {
  slot: string;
  phone: string | null;
  rows: number;
  distinct_canonical: number;
};

type LegacyStatusInput = {
  status: string | null;
  lastEvent?: string | null;
  payloadJson?: unknown;
};

type HistoricalOwnerFallback = {
  organizationId: string;
  specialistId: string;
  reason: string;
};

export function phoneTail10(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? { ...(payload as Record<string, unknown>) }
    : {};
}

export function buildHistoricalFallbackPayload(
  payload: unknown,
  rubitimeBranchId: string | null,
): Record<string, unknown> {
  const patchedPayload = payloadRecord(payload);
  if (rubitimeBranchId && patchedPayload.branch_id == null) {
    patchedPayload.branch_id = rubitimeBranchId;
  }
  return patchedPayload;
}

export function resolveNonConfirmedCleanupStatus(input: LegacyStatusInput): RubitimeNormalizedStatus | null {
  if (input.status === "canceled") return "canceled";
  return resolveRubitimeStatusFromPayload(input.payloadJson, input.status ?? input.lastEvent ?? undefined);
}

export function isNonConfirmedLegacyAppointment(input: LegacyStatusInput): boolean {
  const normalized = resolveNonConfirmedCleanupStatus(input);
  return normalized != null && NON_CONFIRMED_CLEANUP_STATUSES.has(normalized);
}

function summarizeStatuses(statuses: readonly RubitimeNormalizedStatus[]): string {
  const tally = new Map<RubitimeNormalizedStatus, number>();
  for (const status of statuses) tally.set(status, (tally.get(status) ?? 0) + 1);
  return [...tally.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ");
}

async function resolveHistoricalOwnerFallback(phone: string): Promise<HistoricalOwnerFallback> {
  const tail10 = phoneTail10(phone);
  if (tail10.length !== 10) {
    throw new Error("--historical-owner-doctor-phone must contain at least 10 digits");
  }
  const db = getDrizzle();
  const result = rows<{
    matched_users: number;
    organizations: number;
    organization_id: string | null;
    active_specialists: number;
    top_specialist_id: string | null;
    top_live_rubitime_projection: number;
    second_live_rubitime_projection: number;
  }>(
    await db.execute(sql`
      WITH candidate_users AS (
        SELECT id
        FROM platform_users
        WHERE right(regexp_replace(coalesce(phone_normalized, ''), '\\D', '', 'g'), 10) = ${tail10}
        UNION
        SELECT platform_user_id
        FROM platform_user_contacts
        WHERE right(regexp_replace(coalesce(value_normalized, value, ''), '\\D', '', 'g'), 10) = ${tail10}
      ),
      orgs AS (
        SELECT DISTINCT organization_id
        FROM be_organization_members
        WHERE platform_user_id IN (SELECT id FROM candidate_users)
          AND status = 'active'
      ),
      specialists AS (
        SELECT s.id, s.organization_id
        FROM be_specialists s
        JOIN orgs o ON o.organization_id = s.organization_id
        WHERE s.is_active = true
      ),
      ranked AS (
        SELECT
          s.id,
          s.organization_id,
          count(a.*) FILTER (
            WHERE a.deleted_at IS NULL AND a.source = 'rubitime_projection'
          )::int AS live_rubitime_projection,
          row_number() OVER (
            ORDER BY count(a.*) FILTER (
              WHERE a.deleted_at IS NULL AND a.source = 'rubitime_projection'
            ) DESC, s.id::text
          ) AS rn
        FROM specialists s
        LEFT JOIN be_appointments a ON a.specialist_id = s.id
        GROUP BY s.id, s.organization_id
      )
      SELECT
        (SELECT count(*)::int FROM candidate_users) AS matched_users,
        (SELECT count(*)::int FROM orgs) AS organizations,
        (SELECT organization_id::text FROM orgs LIMIT 1) AS organization_id,
        (SELECT count(*)::int FROM specialists) AS active_specialists,
        (SELECT id::text FROM ranked WHERE rn = 1) AS top_specialist_id,
        coalesce((SELECT live_rubitime_projection FROM ranked WHERE rn = 1), 0)::int AS top_live_rubitime_projection,
        coalesce((SELECT live_rubitime_projection FROM ranked WHERE rn = 2), -1)::int AS second_live_rubitime_projection`),
  )[0];
  if (!result || result.matched_users !== 1 || result.organizations !== 1 || !result.organization_id) {
    throw new Error("Historical fallback phone must resolve to exactly one active platform user organization");
  }
  if (!result.top_specialist_id || result.active_specialists < 1) {
    throw new Error("Historical fallback organization has no active specialist");
  }
  if (result.active_specialists > 1 && result.top_live_rubitime_projection <= result.second_live_rubitime_projection) {
    throw new Error("Historical fallback specialist is ambiguous; no unique dominant Rubitime-history specialist");
  }
  return {
    organizationId: result.organization_id,
    specialistId: result.top_specialist_id,
    reason: "owner_pre_webapp_history_phone_dominant_rubitime_specialist",
  };
}

async function countHistoricalOwnerFallbackCandidates(csv: CsvIndex): Promise<number> {
  const csvIds = [...csv.ids];
  const result = rows<{ count: number }>(
    await getDrizzle().execute(sql`
      WITH mapped AS (
        SELECT external_id
        FROM be_external_entity_mappings
        WHERE external_system = 'rubitime' AND entity_type = 'appointment'
      )
      SELECT count(*)::int AS count
      FROM appointment_records ar
      JOIN branches b ON b.id = ar.branch_id
      WHERE ar.deleted_at IS NULL
        AND ar.record_at IS NOT NULL
        AND ar.status <> 'canceled'
        AND ar.integrator_record_id IN ${list(csvIds)}
        AND NOT EXISTS (SELECT 1 FROM mapped m WHERE m.external_id = ar.integrator_record_id)`),
  )[0];
  return result?.count ?? 0;
}

async function findNonConfirmedCleanupCandidates(): Promise<
  { id: string; integratorRecordId: string; normalizedStatus: RubitimeNormalizedStatus }[]
> {
  const db = getDrizzle();
  const live = rows<{
    id: string;
    integrator_record_id: string;
    status: string | null;
    last_event: string | null;
    payload_json: unknown;
  }>(
    await db.execute(sql`
      SELECT id::text, integrator_record_id, status, last_event, payload_json
      FROM appointment_records
      WHERE deleted_at IS NULL AND record_at IS NOT NULL`),
  );
  const candidates: { id: string; integratorRecordId: string; normalizedStatus: RubitimeNormalizedStatus }[] = [];
  for (const r of live) {
    const normalizedStatus = resolveNonConfirmedCleanupStatus({
      status: r.status,
      lastEvent: r.last_event,
      payloadJson: r.payload_json,
    });
    if (normalizedStatus && NON_CONFIRMED_CLEANUP_STATUSES.has(normalizedStatus)) {
      candidates.push({
        id: r.id,
        integratorRecordId: r.integrator_record_id,
        normalizedStatus,
      });
    }
  }
  return candidates;
}

async function diagnose(csv: CsvIndex | null, opts: { summaryOnly: boolean }): Promise<void> {
  const db = getDrizzle();
  const counts = rows<CountRow>(
    await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM appointment_records WHERE record_at IS NOT NULL AND deleted_at IS NULL) AS legacy_live,
        (SELECT count(*)::int FROM be_appointments WHERE source = 'rubitime_projection' AND deleted_at IS NULL) AS canonical_projection`),
  )[0];
  console.log(`\nLegacy live (appointment_records):              ${counts.legacy_live}`);
  console.log(`Canonical rubitime_projection (be_appointments): ${counts.canonical_projection}`);

  // Unmapped legacy buckets (records with no canonical mapping)
  const buckets = rows<UnmappedBucketRow>(
    await db.execute(sql`
      WITH unmapped AS (
        SELECT ar.*, coalesce(ar.payload_json->>'name', ar.payload_json->>'contact_name') AS nm
        FROM appointment_records ar
        LEFT JOIN be_external_entity_mappings m
          ON m.external_system='rubitime' AND m.entity_type='appointment' AND m.external_id = ar.integrator_record_id
        WHERE ar.deleted_at IS NULL AND ar.record_at IS NOT NULL AND m.canonical_id IS NULL
      )
      SELECT
        count(*)::int AS total,
        count(*) FILTER (
          WHERE phone_normalized IN ${list(TEST_BLOCK_PHONES)}
             OR ${matchesTestBlockName(sql`lower(coalesce(nm, ''))`)}
        )::int AS test_block,
        count(*) FILTER (WHERE status = 'canceled')::int AS cancelled,
        count(*) FILTER (
          WHERE status <> 'canceled'
            AND phone_normalized NOT IN ${list(TEST_BLOCK_PHONES)}
            AND NOT ${matchesTestBlockName(sql`lower(coalesce(nm, ''))`)}
        )::int AS real_active,
        count(*) FILTER (WHERE record_at >= now())::int AS future
      FROM unmapped`),
  )[0];
  console.log(`\nUNMAPPED legacy (no canonical projection): ${buckets.total}`);
  console.log(`  • test/block (deletable):  ${buckets.test_block}`);
  console.log(`  • cancelled:               ${buckets.cancelled}`);
  console.log(`  • real active:             ${buckets.real_active}`);
  console.log(`  • future (should be ~0):   ${buckets.future}`);

  // Duplicate clusters (same slot+phone, >1 live row)
  const dups = rows<DuplicateClusterRow>(
    await db.execute(sql`
      WITH live AS (
        SELECT ar.record_at, ar.phone_normalized, ar.integrator_record_id, m.canonical_id
        FROM appointment_records ar
        LEFT JOIN be_external_entity_mappings m
          ON m.external_system='rubitime' AND m.entity_type='appointment' AND m.external_id = ar.integrator_record_id
        WHERE ar.deleted_at IS NULL AND ar.record_at IS NOT NULL
      )
      SELECT to_char(record_at AT TIME ZONE 'Europe/Moscow','YYYY-MM-DD HH24:MI') AS slot,
             phone_normalized AS phone,
             count(*)::int AS rows,
             count(distinct canonical_id)::int AS distinct_canonical
      FROM live GROUP BY record_at, phone_normalized HAVING count(*) > 1
      ORDER BY count(*) DESC`),
  );
  console.log(`\nDUPLICATE clusters (same slot+phone): ${dups.length}`);
  if (opts.summaryOnly) {
    const multipleCanonical = dups.filter((d) => d.distinct_canonical > 1).length;
    console.log(`  • clusters with multiple canonical rows: ${multipleCanonical}`);
    console.log(`  • detail rows suppressed by --summary-only`);
  } else {
    for (const d of dups) {
      const flag = d.distinct_canonical > 1 ? "  ⚠ MULTIPLE canonical (double-booking!)" : "";
      console.log(`  ${d.slot} ${d.phone}: ${d.rows} rows → ${d.distinct_canonical} canonical${flag}`);
    }
  }

  // Stale-by-CSV cross-reference (Rubitime export = source of truth)
  if (csv) {
    const stale = await findStaleFromCsv(csv);
    console.log(`\nSTALE vs Rubitime CSV (absent from export, within its date range → deleted in Rubitime): ${stale.length}`);
    if (opts.summaryOnly) {
      console.log(`  • detail rows suppressed by --summary-only`);
    } else {
      for (const s of stale.slice(0, 30)) console.log(`  ${s.slot} ${s.phone} «${s.name}» ext=${s.id}`);
      if (stale.length > 30) console.log(`  … +${stale.length - 30} more`);
    }
    console.log(`  (use --drop-stale-from-csv --commit to soft-delete these)`);
  } else {
    console.log(`\nSTALE vs CSV: skipped (no CSV at given path; pass --csv=<path>)`);
  }

  const nonConfirmed = await findNonConfirmedCleanupCandidates();
  console.log(`\nNON-CONFIRMED legacy cleanup candidates: ${nonConfirmed.length}`);
  if (nonConfirmed.length > 0) {
    console.log(`  • by normalized status: ${summarizeStatuses(nonConfirmed.map((r) => r.normalizedStatus))}`);
  }
}

/**
 * Legacy records ABSENT from the Rubitime CSV whose record_at falls within the CSV's covered date
 * range → confidently stale (deleted/moved in Rubitime, our mirror kept them). Records outside the
 * CSV range are NOT judged (the export may predate them). CSV = source of truth.
 */
async function findStaleFromCsv(csv: CsvIndex): Promise<{ id: string; slot: string; phone: string; name: string }[]> {
  const db = getDrizzle();
  const live = rows<{ ext: string; record_at: string | Date; phone: string | null; name: string | null }>(
    await db.execute(sql`
      SELECT integrator_record_id AS ext, record_at,
             phone_normalized AS phone,
             coalesce(payload_json->>'name', payload_json->>'contact_name') AS name
      FROM appointment_records
      WHERE deleted_at IS NULL AND record_at IS NOT NULL`),
  );
  const hi = csv.maxDay + 86_400_000; // include the whole max day
  const out: { id: string; slot: string; phone: string; name: string }[] = [];
  for (const r of live) {
    const id = String(r.ext);
    if (csv.ids.has(id)) continue; // present in Rubitime → real
    const t = new Date(r.record_at).getTime();
    if (!Number.isFinite(t) || t < csv.minDay || t > hi) continue; // outside CSV coverage → cannot judge
    out.push({ id, slot: new Date(r.record_at).toISOString().slice(0, 16), phone: r.phone ?? "?", name: r.name ?? "?" });
  }
  return out;
}

/** Soft-delete test/block legacy rows. Returns the integrator_record_ids affected. */
async function deleteTestBlock(): Promise<string[]> {
  const db = getDrizzle();
  const res = await db.execute(sql`
    UPDATE appointment_records
    SET deleted_at = now()
    WHERE deleted_at IS NULL
      AND ( phone_normalized IN ${list(TEST_BLOCK_PHONES)}
            OR ${matchesTestBlockName(sql`lower(coalesce(payload_json->>'name', payload_json->>'contact_name', ''))`)} )
    RETURNING integrator_record_id`);
  return rows<{ integrator_record_id: string }>(res).map((r) => r.integrator_record_id);
}

/**
 * Soft-delete the CANONICAL be_appointments rows mapped to these Rubitime ids (column `deleted_at`,
 * F1b). Needed because legacy soft-delete alone leaves the canonical row visible on the calendar /
 * slot-availability / KPI. Use ONLY for records that should NOT exist (test/block, stale, drop-legacy)
 * — NOT for duplicate-collapse losers (they share the winner's canonical row). Returns rows hidden.
 */
async function softDeleteCanonicalByExternalIds(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await getDrizzle().execute(sql`
    UPDATE be_appointments SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND id IN (
      SELECT canonical_id FROM be_external_entity_mappings
      WHERE external_system='rubitime' AND entity_type='appointment' AND external_id IN ${list(ids as string[])}
    )
    RETURNING id`);
  return rows(res).length;
}

async function softDeleteCanonicalRubitimeProjectionByExternalIds(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await getDrizzle().execute(sql`
    UPDATE be_appointments SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL
      AND source = 'rubitime_projection'
      AND id IN (
        SELECT canonical_id FROM be_external_entity_mappings
        WHERE external_system='rubitime' AND entity_type='appointment' AND external_id IN ${list(ids as string[])}
      )
    RETURNING id`);
  return rows(res).length;
}

async function softDeleteCanonicalStaleByExternalIds(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await getDrizzle().execute(sql`
    UPDATE be_appointments ba SET deleted_at = now(), updated_at = now()
    WHERE ba.deleted_at IS NULL
      AND ba.id IN (
        SELECT stale_map.canonical_id
        FROM be_external_entity_mappings stale_map
        WHERE stale_map.external_system='rubitime'
          AND stale_map.entity_type='appointment'
          AND stale_map.external_id IN ${list(ids as string[])}
      )
      AND NOT EXISTS (
        SELECT 1
        FROM be_external_entity_mappings live_map
        JOIN appointment_records live_ar
          ON live_ar.deleted_at IS NULL
         AND live_ar.integrator_record_id = live_map.external_id
        WHERE live_map.external_system='rubitime'
          AND live_map.entity_type='appointment'
          AND live_map.canonical_id = ba.id
          AND live_map.external_id NOT IN ${list(ids as string[])}
      )
    RETURNING ba.id`);
  return rows(res).length;
}

async function deleteNonConfirmedLegacyAppointments(): Promise<{
  legacy: number;
  canonical: number;
  statuses: RubitimeNormalizedStatus[];
}> {
  const candidates = await findNonConfirmedCleanupCandidates();
  const ids = candidates.map((r) => r.id);
  const externalIds = candidates.map((r) => r.integratorRecordId);
  if (ids.length > 0) {
    await getDrizzle().execute(sql`
      UPDATE appointment_records SET deleted_at = now()
      WHERE deleted_at IS NULL AND id::text IN ${list(ids)}`);
  }
  const canonical = await softDeleteCanonicalRubitimeProjectionByExternalIds(externalIds);
  return { legacy: ids.length, canonical, statuses: candidates.map((r) => r.normalizedStatus) };
}

/**
 * Collapse duplicate clusters: keep the best row per (slot, phone), soft-delete the rest.
 * Keep-rule (owner 2026-06-13): mapped-to-canonical > non-cancelled > most-recent updated_at.
 * Safe because each cluster resolves to ONE canonical row (verified) — losers' mappings keep
 * pointing at the same canonical row, so inbound sync stays correct.
 */
async function collapseDuplicates(): Promise<{ clusters: number; softDeleted: number }> {
  const db = getDrizzle();
  type CollapseLiveRow = {
    id: string;
    record_at: string | Date;
    phone: string | null;
    status: string;
    updated_at: string | Date;
    mapped: boolean;
  };
  const live = rows<CollapseLiveRow>(
    await db.execute(sql`
      SELECT ar.id, ar.record_at, ar.phone_normalized AS phone, ar.status, ar.updated_at,
             (m.canonical_id IS NOT NULL) AS mapped
      FROM appointment_records ar
      LEFT JOIN be_external_entity_mappings m
        ON m.external_system='rubitime' AND m.entity_type='appointment' AND m.external_id = ar.integrator_record_id
      WHERE ar.deleted_at IS NULL AND ar.record_at IS NOT NULL`),
  );
  const groups = new Map<string, CollapseLiveRow[]>();
  for (const r of live) {
    const key = `${new Date(r.record_at).toISOString()}|${r.phone ?? ""}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  let clusters = 0;
  const losers: string[] = [];
  for (const g of groups.values()) {
    if (g.length <= 1) continue;
    clusters++;
    g.sort((a, b) => {
      if (a.mapped !== b.mapped) return a.mapped ? -1 : 1; // mapped first
      const aCanc = a.status === "canceled", bCanc = b.status === "canceled";
      if (aCanc !== bCanc) return aCanc ? 1 : -1; // non-cancelled first
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(); // most recent first
    });
    for (const loser of g.slice(1)) losers.push(loser.id);
  }
  if (losers.length > 0) {
    await db.execute(sql`UPDATE appointment_records SET deleted_at = now() WHERE id::text IN ${list(losers)}`);
  }
  return { clusters, softDeleted: losers.length };
}

/**
 * Collapse only cancelled duplicate losers.
 *
 * Rule: for each live duplicate cluster `(record_at, phone_normalized)`, delete only rows whose
 * legacy status is `canceled`. If the whole cluster is cancelled, keep one representative using the
 * same deterministic winner order as broad duplicate collapse and soft-delete the rest. Non-cancelled
 * rows are never soft-deleted by this narrow cleanup flag.
 */
async function collapseCanceledDuplicates(): Promise<{ clusters: number; softDeleted: number }> {
  const db = getDrizzle();
  type CollapseLiveRow = {
    id: string;
    record_at: string | Date;
    phone: string | null;
    status: string;
    updated_at: string | Date;
    mapped: boolean;
  };
  const live = rows<CollapseLiveRow>(
    await db.execute(sql`
      SELECT ar.id, ar.record_at, ar.phone_normalized AS phone, ar.status, ar.updated_at,
             (m.canonical_id IS NOT NULL) AS mapped
      FROM appointment_records ar
      LEFT JOIN be_external_entity_mappings m
        ON m.external_system='rubitime' AND m.entity_type='appointment' AND m.external_id = ar.integrator_record_id
      WHERE ar.deleted_at IS NULL AND ar.record_at IS NOT NULL`),
  );
  const groups = new Map<string, CollapseLiveRow[]>();
  for (const r of live) {
    const key = `${new Date(r.record_at).toISOString()}|${r.phone ?? ""}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  let clusters = 0;
  const losers: string[] = [];
  for (const g of groups.values()) {
    if (g.length <= 1) continue;
    const canceled = g.filter((r) => r.status === "canceled");
    if (canceled.length === 0) continue;
    clusters++;
    const nonCanceledCount = g.length - canceled.length;
    if (nonCanceledCount > 0) {
      for (const loser of canceled) losers.push(loser.id);
      continue;
    }
    canceled.sort((a, b) => {
      if (a.mapped !== b.mapped) return a.mapped ? -1 : 1; // mapped representative first
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(); // most recent first
    });
    for (const loser of canceled.slice(1)) losers.push(loser.id);
  }
  if (losers.length > 0) {
    await db.execute(sql`UPDATE appointment_records SET deleted_at = now() WHERE id::text IN ${list(losers)}`);
  }
  return { clusters, softDeleted: losers.length };
}

/** Tolerant per-record projection — never aborts the batch; collects conflicts. */
async function projectTolerant(
  orgId: string,
  bridge: ReturnType<typeof createPgBookingRubitimeBridgePort>,
  opts: {
    summaryOnly: boolean;
    csv: CsvIndex | null;
    historicalOwnerFallback: HistoricalOwnerFallback | null;
  },
) {
  const db = getDrizzle();
  type ProjectionLegacyRow = {
    integrator_record_id: string;
    platform_user_id: string | null;
    phone_normalized: string | null;
    record_at: string | Date | null;
    status: string;
    last_event: string | null;
    payload_json: RubitimeCanonicalProjectionInput["payloadJson"];
    nm: string | null;
    rubitime_branch_id: string | null;
  };
  let legacy: ProjectionLegacyRow[];
  if (opts.historicalOwnerFallback) {
    if (!opts.csv) {
      throw new Error("--historical-owner-doctor-phone requires --csv so stale rows are not imported");
    }
    const csvIds = [...opts.csv.ids];
    legacy = rows<ProjectionLegacyRow>(
      await db.execute(sql`
        WITH mapped AS (
          SELECT external_id
          FROM be_external_entity_mappings
          WHERE external_system = 'rubitime' AND entity_type = 'appointment'
        )
        SELECT
          ar.integrator_record_id,
          ar.platform_user_id,
          ar.phone_normalized,
          ar.record_at,
          ar.status,
          ar.last_event,
          ar.payload_json,
          coalesce(ar.payload_json->>'name', ar.payload_json->>'contact_name') AS nm,
          b.integrator_branch_id::text AS rubitime_branch_id
        FROM appointment_records ar
        JOIN branches b ON b.id = ar.branch_id
        WHERE ar.deleted_at IS NULL
          AND ar.record_at IS NOT NULL
          AND ar.status <> 'canceled'
          AND ar.integrator_record_id IN ${list(csvIds)}
          AND NOT EXISTS (SELECT 1 FROM mapped m WHERE m.external_id = ar.integrator_record_id)
        ORDER BY ar.record_at`),
    );
    console.log(`\nHistorical owner fallback projection candidates: ${legacy.length}`);
  } else {
    legacy = rows<ProjectionLegacyRow>(
      await db.execute(sql`
        SELECT integrator_record_id, platform_user_id, phone_normalized, record_at, status, last_event, payload_json,
               coalesce(payload_json->>'name', payload_json->>'contact_name') AS nm,
               null::text AS rubitime_branch_id
        FROM appointment_records
        WHERE deleted_at IS NULL AND record_at IS NOT NULL
        ORDER BY record_at`),
    );
  }
  const tally: Partial<Record<RubitimeCanonicalProjectionAction | "conflict", number>> = {};
  const conflicts: Array<{ slot: string; phone: string; name: string; ext: string; error: string }> = [];
  for (const r of legacy) {
    try {
      const patchedPayload = opts.historicalOwnerFallback
        ? buildHistoricalFallbackPayload(r.payload_json, r.rubitime_branch_id)
        : payloadRecord(r.payload_json);
      const res = await bridge.upsertCanonicalFromRubitimeRecord({
        organizationId: orgId,
        externalId: r.integrator_record_id,
        platformUserId: r.platform_user_id ?? null,
        phoneNormalized: r.phone_normalized ?? null,
        recordAt: r.record_at ? new Date(r.record_at).toISOString() : null,
        legacyStatus: r.status,
        lastEvent: r.last_event ?? "",
        payloadJson: patchedPayload,
        scopeOverride: opts.historicalOwnerFallback
          ? {
              specialistId: opts.historicalOwnerFallback.specialistId,
              reason: opts.historicalOwnerFallback.reason,
            }
          : undefined,
      });
      tally[res.action] = (tally[res.action] ?? 0) + 1;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      tally["conflict"] = (tally["conflict"] ?? 0) + 1;
      conflicts.push({
        slot: r.record_at ? new Date(r.record_at).toISOString() : "?",
        phone: r.phone_normalized ?? "?",
        name: r.nm ?? "?",
        ext: r.integrator_record_id,
        error: (error.match(/be_appointments_[a-z_]+/)?.[0]) ?? error.slice(0, 80),
      });
    }
  }
  console.log(`\nProjection actions (tolerant per-record):`);
  for (const [k, v] of Object.entries(tally).sort()) console.log(`  ${k}: ${v}`);
  if (conflicts.length > 0) {
    console.log(`\n⚠ CONFLICTS (${conflicts.length}) — skipped, need review:`);
    if (opts.summaryOnly) {
      const byError = conflicts.reduce<Record<string, number>>((acc, c) => {
        acc[c.error] = (acc[c.error] ?? 0) + 1;
        return acc;
      }, {});
      for (const [error, count] of Object.entries(byError).sort()) console.log(`  ${error}: ${count}`);
      console.log(`  detail rows suppressed by --summary-only`);
    } else {
      for (const c of conflicts) console.log(`  ${c.slot} ${c.phone} «${c.name}» ext=${c.ext} → ${c.error}`);
    }
  }
}

async function main() {
  const cli = parseCli();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  console.log(`\n=== Canonical ← legacy reconciliation [${cli.commit ? "COMMIT" : "DRY-RUN (read-only)"}] ===`);
  console.log(`DB host: ${url.replace(/:[^:@/]*@/, ":***@").replace(/^.*@/, "")}`);

  const orgId = cli.org ?? (await createPgBookingEnginePort().getDefaultOrganizationId());
  console.log(`Organization: ${orgId}`);
  const bridge = createPgBookingRubitimeBridgePort();
  const enabled = await bridge.isBridgeEnabled();
  console.log(`Rubitime bridge enabled: ${enabled}`);
  const csv = loadCsvIndex(cli.csvPath);
  console.log(
    csv
      ? `Rubitime CSV: ${cli.csvPath} (${csv.ids.size} ids, ${new Date(csv.minDay).toISOString().slice(0, 10)}…${new Date(csv.maxDay).toISOString().slice(0, 10)})`
      : `Rubitime CSV: not found at ${cli.csvPath} (stale-by-CSV detection disabled)`,
  );
  if (cli.summaryOnly) console.log(`Output mode: summary-only (PII-safe; detail rows suppressed)`);
  const historicalOwnerFallback = cli.historicalOwnerDoctorPhone
    ? await resolveHistoricalOwnerFallback(cli.historicalOwnerDoctorPhone)
    : null;
  if (historicalOwnerFallback) {
    if (historicalOwnerFallback.organizationId !== orgId) {
      console.error(`\n✗ Historical owner fallback resolved a different organization than --org/default.`);
      process.exit(1);
    }
    console.log(`Historical owner fallback: enabled (owner-provided doctor phone; PII suppressed)`);
  }

  console.log(`\n----- DIAGNOSIS (before) -----`);
  await diagnose(csv, { summaryOnly: cli.summaryOnly });
  if (historicalOwnerFallback) {
    if (!csv) {
      console.error(`\n✗ Historical owner fallback requires a CSV to avoid importing stale rows.`);
      process.exit(1);
    }
    const candidates = await countHistoricalOwnerFallbackCandidates(csv);
    console.log(`\nHISTORICAL OWNER FALLBACK import candidates (CSV-present active unmapped): ${candidates}`);
  }

  if (!cli.commit) {
    console.log(`\nDRY-RUN: no writes. Commit flags: [--delete-test] [--delete-non-confirmed] [--collapse-dups] [--collapse-canceled-dups] [--cleanup-only] [--drop-stale-from-csv] [--drop-legacy=ids]. Default commit = tolerant projection.`);
    process.exit(0);
  }
  if (!cli.cleanupOnly && !enabled && !historicalOwnerFallback) {
    console.error(`\n✗ Bridge disabled — projection would no-op. Aborting.`);
    process.exit(1);
  }

  if (cli.deleteTest) {
    const ids = await deleteTestBlock();
    const canon = await softDeleteCanonicalByExternalIds(ids);
    console.log(`\n✓ Soft-deleted test/block: legacy ${ids.length} + canonical ${canon}`);
  }
  if (cli.deleteNonConfirmed) {
    const { legacy, canonical, statuses } = await deleteNonConfirmedLegacyAppointments();
    const byStatus = statuses.length > 0 ? ` (${summarizeStatuses(statuses)})` : "";
    console.log(`\n✓ Soft-deleted non-confirmed legacy statuses: legacy ${legacy} + canonical ${canonical}${byStatus}`);
  }
  if (cli.dropLegacy.length > 0) {
    const res = await getDrizzle().execute(sql`
      UPDATE appointment_records SET deleted_at = now()
      WHERE deleted_at IS NULL AND integrator_record_id IN ${list(cli.dropLegacy)}
      RETURNING integrator_record_id`);
    const canon = await softDeleteCanonicalByExternalIds(cli.dropLegacy);
    console.log(`\n✓ --drop-legacy: legacy ${rows(res).length}/${cli.dropLegacy.length} + canonical ${canon}: ${cli.dropLegacy.join(", ")}`);
  }
  if (cli.dropStaleFromCsv) {
    if (!csv) {
      console.error(`\n✗ --drop-stale-from-csv requires a CSV (not found at ${cli.csvPath}).`);
      process.exit(1);
    }
    const stale = await findStaleFromCsv(csv);
    const ids = stale.map((s) => s.id);
    if (ids.length > 0) {
      await getDrizzle().execute(sql`
        UPDATE appointment_records SET deleted_at = now()
        WHERE deleted_at IS NULL AND integrator_record_id IN ${list(ids)}`);
    }
    const canon = await softDeleteCanonicalStaleByExternalIds(ids);
    console.log(`\n✓ --drop-stale-from-csv: legacy ${ids.length} + canonical ${canon}`);
  }
  if (cli.collapseDups) {
    const { clusters, softDeleted } = await collapseDuplicates();
    console.log(`\n✓ Collapsed ${clusters} duplicate clusters → soft-deleted ${softDeleted} loser rows.`);
  }
  if (cli.collapseCanceledDups) {
    const { clusters, softDeleted } = await collapseCanceledDuplicates();
    console.log(`\n✓ Collapsed ${clusters} duplicate clusters with cancelled losers → soft-deleted ${softDeleted} cancelled loser rows.`);
  }

  if (cli.cleanupOnly) {
    console.log(`\nCleanup-only mode: skipped tolerant projection.`);
  } else {
    await projectTolerant(orgId, bridge, {
      summaryOnly: cli.summaryOnly,
      csv,
      historicalOwnerFallback,
    });
  }

  console.log(`\n----- DIAGNOSIS (after) -----`);
  await diagnose(csv, { summaryOnly: cli.summaryOnly });
  console.log(`\n✓ Done.`);
  process.exit(0);
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  main().catch((err) => {
    console.error("\n✗ Reconciliation failed:", err);
    process.exit(1);
  });
}
