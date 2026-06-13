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
 * Test/block markers treated as deletable (owner 2026-06-13): phone +79189000782 («Берсон»),
 * +70000000000 («БЛОК ОКНА»).
 *
 * Usage (set webapp DATABASE_URL; on dev use a CLEAN prod snapshot for a trustworthy run):
 *   pnpm backfill-canonical-from-legacy-appointments                    # DRY-RUN: diagnosis only, no writes
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit        # tolerant per-record projection
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit --delete-test    # + soft-delete test/block first
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit --collapse-dups  # + collapse duplicate clusters
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit --drop-legacy=8361933,8448355  # soft-delete stale ext-ids (audited, no ad-hoc SQL)
 *   pnpm backfill-canonical-from-legacy-appointments -- --commit --drop-stale-from-csv          # AUTO: soft-delete legacy absent from the Rubitime CSV (within its date range)
 *   pnpm backfill-canonical-from-legacy-appointments -- --csv=../../.tmp/rubitime-import/records.csv  # CSV path (default)
 *   pnpm backfill-canonical-from-legacy-appointments -- --org=<uuid>    # override organization id
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
import { sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { createPgBookingEnginePort } from "@/infra/repos/pgBookingEngine";
import { createPgBookingRubitimeBridgePort } from "@/infra/repos/pgBookingRubitimeBridge";

const TEST_BLOCK_PHONES = ["+79189000782", "+70000000000"];
const DEFAULT_CSV = "../../.tmp/rubitime-import/records.csv";

type Cli = {
  commit: boolean;
  org: string | null;
  deleteTest: boolean;
  collapseDups: boolean;
  dropLegacy: string[];
  csvPath: string;
  dropStaleFromCsv: boolean;
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
    dropLegacy,
    csvPath,
    dropStaleFromCsv: argv.includes("--drop-stale-from-csv"),
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
function rows<T = any>(r: Rows): T[] {
  return (Array.isArray(r) ? r : (r.rows ?? [])) as T[];
}

/** Build a SQL `(v1, v2, …)` list for use with `IN` (drizzle array interpolation ≠ pg array). */
function list(values: readonly string[]) {
  return sql`(${sql.join(values.map((v) => sql`${v}`), sql`, `)})`;
}

async function diagnose(csv: CsvIndex | null): Promise<void> {
  const db = getDrizzle();
  const counts = rows(
    await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM appointment_records WHERE record_at IS NOT NULL AND deleted_at IS NULL) AS legacy_live,
        (SELECT count(*)::int FROM be_appointments WHERE source = 'rubitime_projection' AND deleted_at IS NULL) AS canonical_projection`),
  )[0];
  console.log(`\nLegacy live (appointment_records):              ${counts.legacy_live}`);
  console.log(`Canonical rubitime_projection (be_appointments): ${counts.canonical_projection}`);

  // Unmapped legacy buckets (records with no canonical mapping)
  const buckets = rows(
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
        count(*) FILTER (WHERE phone_normalized IN ${list(TEST_BLOCK_PHONES)} OR nm ILIKE '%берсон%' OR nm ILIKE '%блок окна%')::int AS test_block,
        count(*) FILTER (WHERE status = 'canceled')::int AS cancelled,
        count(*) FILTER (WHERE status <> 'canceled' AND phone_normalized NOT IN ${list(TEST_BLOCK_PHONES)})::int AS real_active,
        count(*) FILTER (WHERE record_at >= now())::int AS future
      FROM unmapped`),
  )[0];
  console.log(`\nUNMAPPED legacy (no canonical projection): ${buckets.total}`);
  console.log(`  • test/block (deletable):  ${buckets.test_block}`);
  console.log(`  • cancelled:               ${buckets.cancelled}`);
  console.log(`  • real active:             ${buckets.real_active}`);
  console.log(`  • future (should be ~0):   ${buckets.future}`);

  // Duplicate clusters (same slot+phone, >1 live row)
  const dups = rows(
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
  for (const d of dups) {
    const flag = d.distinct_canonical > 1 ? "  ⚠ MULTIPLE canonical (double-booking!)" : "";
    console.log(`  ${d.slot} ${d.phone}: ${d.rows} rows → ${d.distinct_canonical} canonical${flag}`);
  }

  // Stale-by-CSV cross-reference (Rubitime export = source of truth)
  if (csv) {
    const stale = await findStaleFromCsv(csv);
    console.log(`\nSTALE vs Rubitime CSV (absent from export, within its date range → deleted in Rubitime): ${stale.length}`);
    for (const s of stale.slice(0, 30)) console.log(`  ${s.slot} ${s.phone} «${s.name}» ext=${s.id}`);
    if (stale.length > 30) console.log(`  … +${stale.length - 30} more`);
    console.log(`  (use --drop-stale-from-csv --commit to soft-delete these)`);
  } else {
    console.log(`\nSTALE vs CSV: skipped (no CSV at given path; pass --csv=<path>)`);
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
            OR coalesce(payload_json->>'name', payload_json->>'contact_name') ILIKE '%блок окна%' )
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

/**
 * Collapse duplicate clusters: keep the best row per (slot, phone), soft-delete the rest.
 * Keep-rule (owner 2026-06-13): mapped-to-canonical > non-cancelled > most-recent updated_at.
 * Safe because each cluster resolves to ONE canonical row (verified) — losers' mappings keep
 * pointing at the same canonical row, so inbound sync stays correct.
 */
async function collapseDuplicates(): Promise<{ clusters: number; softDeleted: number }> {
  const db = getDrizzle();
  const live = rows(
    await db.execute(sql`
      SELECT ar.id, ar.record_at, ar.phone_normalized AS phone, ar.status, ar.updated_at,
             (m.canonical_id IS NOT NULL) AS mapped
      FROM appointment_records ar
      LEFT JOIN be_external_entity_mappings m
        ON m.external_system='rubitime' AND m.entity_type='appointment' AND m.external_id = ar.integrator_record_id
      WHERE ar.deleted_at IS NULL AND ar.record_at IS NOT NULL`),
  );
  const groups = new Map<string, any[]>();
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

/** Tolerant per-record projection — never aborts the batch; collects conflicts. */
async function projectTolerant(orgId: string, bridge: ReturnType<typeof createPgBookingRubitimeBridgePort>) {
  const db = getDrizzle();
  const legacy = rows(
    await db.execute(sql`
      SELECT integrator_record_id, platform_user_id, phone_normalized, record_at, status, last_event, payload_json,
             coalesce(payload_json->>'name', payload_json->>'contact_name') AS nm
      FROM appointment_records
      WHERE deleted_at IS NULL AND record_at IS NOT NULL
      ORDER BY record_at`),
  );
  const tally: Record<string, number> = {};
  const conflicts: Array<{ slot: string; phone: string; name: string; ext: string; error: string }> = [];
  for (const r of legacy) {
    try {
      const res = await bridge.upsertCanonicalFromRubitimeRecord({
        organizationId: orgId,
        externalId: r.integrator_record_id,
        platformUserId: r.platform_user_id ?? null,
        phoneNormalized: r.phone_normalized ?? null,
        recordAt: r.record_at ? new Date(r.record_at).toISOString() : null,
        legacyStatus: r.status,
        lastEvent: r.last_event,
        payloadJson: r.payload_json,
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
    for (const c of conflicts) console.log(`  ${c.slot} ${c.phone} «${c.name}» ext=${c.ext} → ${c.error}`);
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

  console.log(`\n----- DIAGNOSIS (before) -----`);
  await diagnose(csv);

  if (!cli.commit) {
    console.log(`\nDRY-RUN: no writes. Commit flags: [--delete-test] [--collapse-dups] [--drop-stale-from-csv] [--drop-legacy=ids]. Default commit = tolerant projection.`);
    process.exit(0);
  }
  if (!enabled) {
    console.error(`\n✗ Bridge disabled — projection would no-op. Aborting.`);
    process.exit(1);
  }

  if (cli.deleteTest) {
    const ids = await deleteTestBlock();
    const canon = await softDeleteCanonicalByExternalIds(ids);
    console.log(`\n✓ Soft-deleted test/block: legacy ${ids.length} + canonical ${canon}`);
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
    const canon = await softDeleteCanonicalByExternalIds(ids);
    console.log(`\n✓ --drop-stale-from-csv: legacy ${ids.length} + canonical ${canon}`);
  }
  if (cli.collapseDups) {
    const { clusters, softDeleted } = await collapseDuplicates();
    console.log(`\n✓ Collapsed ${clusters} duplicate clusters → soft-deleted ${softDeleted} loser rows.`);
  }

  await projectTolerant(orgId, bridge);

  console.log(`\n----- DIAGNOSIS (after) -----`);
  await diagnose(csv);
  console.log(`\n✓ Done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Reconciliation failed:", err);
  process.exit(1);
});
