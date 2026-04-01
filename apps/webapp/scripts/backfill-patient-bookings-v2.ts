#!/usr/bin/env tsx
/**
 * Backfill script: patient_bookings → v2 fields
 *
 * Maps legacy city/category fields to branch_service_id (and snapshot fields)
 * using the v2 catalog tables populated by the seed script.
 *
 * Usage:
 *   DATABASE_URL=... pnpm backfill-patient-bookings-v2               # dry-run (default)
 *   DATABASE_URL=... pnpm backfill-patient-bookings-v2 --commit       # actual write
 *   DATABASE_URL=... pnpm backfill-patient-bookings-v2 --limit=500    # process at most N rows
 *
 * Behavior:
 *   - Default mode: dry-run (no writes). Use --commit to apply.
 *   - Legacy fields (category, city) are preserved (not deleted).
 *   - Rows where match is ambiguous or impossible are logged + skipped (not failed).
 *   - A stats report is printed at the end: updated / skipped / conflicts.
 */

import "dotenv/config";
import pg from "pg";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isDryRun = !args.includes("--commit");
const limitArg = args.find((a) => a.startsWith("--limit="));
const MAX_LIMIT = 100_000;

function parseLimit(arg: string | undefined): number {
  if (!arg) return 0;
  const n = parseInt(arg.slice(arg.indexOf("=") + 1), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_LIMIT) : 0;
}

const rowLimit = parseLimit(limitArg);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LegacyBookingRow = {
  id: string;
  city: string | null;
  category: string | null;
  booking_type: string;
  slot_start: Date;
  branch_service_id: string | null;
};

type BranchServiceLookup = {
  branch_service_id: string;
  branch_id: string;
  service_id: string;
  specialist_id: string;
  city_code: string;
  branch_title: string;
  service_title: string;
  duration_minutes: number;
  price_minor: number;
  rubitime_branch_id: string;
  rubitime_cooperator_id: string;
  rubitime_service_id: string;
};

// ---------------------------------------------------------------------------
// Resolve mapping: city (TEXT) + category (TEXT) → branch_service_id
//
// The mapping is best-effort. For "Точка Здоровья" at launch, the only
// in-person category used was 'rehab_lfk'. We map:
//
//   city='moscow' + category='rehab_lfk' → branch 17356, default service = 60 min (67452)
//   city='spb'    + category='rehab_lfk' → branch 18265, default service = 60 min (67472)
//
// NOTE: There is no lossless way to recover the exact session duration from
//       legacy records — we use "60 min" as a safe default and mark duration
//       as ambiguous in the report. Rows with other category values are skipped.
// ---------------------------------------------------------------------------

const LEGACY_MAP: Record<string, { rubitime_branch_id: string; service_duration: number }> = {
  "moscow:rehab_lfk": { rubitime_branch_id: "17356", service_duration: 60 },
  "spb:rehab_lfk":    { rubitime_branch_id: "18265", service_duration: 60 },
};

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

type Stats = {
  total: number;
  alreadyFilled: number;
  updated: number;
  /** Rows matched and updated using the 60-min default duration (ambiguous match). */
  updatedWithDefaultDuration: number;
  skipped: number;
  conflicts: Array<{ id: string; reason: string }>;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL is not set");
    process.exit(1);
  }

  console.log("=== Backfill: patient_bookings v2 refs ===");
  console.log(`Mode: ${isDryRun ? "DRY-RUN (no writes)" : "COMMIT"}`);
  if (rowLimit > 0) console.log(`Limit: ${rowLimit} rows`);
  console.log();

  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });

  try {
    // 1. Build catalog lookup
    const catalogRes = await pool.query<BranchServiceLookup>(`
      SELECT
        bbs.id                          AS branch_service_id,
        bbs.branch_id,
        bbs.service_id,
        bbs.specialist_id,
        c.code                          AS city_code,
        br.title                        AS branch_title,
        svc.title                       AS service_title,
        svc.duration_minutes,
        svc.price_minor,
        br.rubitime_branch_id,
        sp.rubitime_cooperator_id,
        bbs.rubitime_service_id
      FROM booking_branch_services bbs
      JOIN booking_branches br  ON br.id  = bbs.branch_id
      JOIN booking_cities   c   ON c.id   = br.city_id
      JOIN booking_services svc ON svc.id = bbs.service_id
      JOIN booking_specialists sp ON sp.id = bbs.specialist_id
      WHERE bbs.is_active = TRUE
        AND br.is_active  = TRUE
        AND svc.is_active = TRUE
        AND sp.is_active  = TRUE
    `);

    if (catalogRes.rows.length === 0) {
      console.warn("⚠️  Catalog is empty. Run seed script first. Aborting.");
      return;
    }

    // Index catalog by (city_code, duration_minutes) for fast lookup
    const catalogIndex = new Map<string, BranchServiceLookup>();
    for (const row of catalogRes.rows) {
      catalogIndex.set(`${row.city_code}:${row.duration_minutes}`, row);
    }

    console.log(`Catalog loaded: ${catalogRes.rows.length} branch-service entries.`);

    // 2a. Count already-filled in-person rows (excluded from main query)
    const alreadyFilledRes = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM patient_bookings
       WHERE booking_type = 'in_person' AND branch_service_id IS NOT NULL`,
    );
    const alreadyFilledCount = Number(alreadyFilledRes.rows[0]?.count ?? "0");

    // 2b. Fetch legacy in-person bookings without v2 refs
    const query = `
      SELECT id, city, category, booking_type, slot_start, branch_service_id
      FROM patient_bookings
      WHERE booking_type = 'in_person'
        AND branch_service_id IS NULL
      ORDER BY created_at ASC
      ${rowLimit > 0 ? `LIMIT ${rowLimit}` : ""}
    `;

    const bookingsRes = await pool.query<LegacyBookingRow>(query);
    const rows = bookingsRes.rows;

    const stats: Stats = {
      total: rows.length,
      alreadyFilled: alreadyFilledCount,
      updated: 0,
      updatedWithDefaultDuration: 0,
      skipped: 0,
      conflicts: [],
    };

    console.log(`Found ${rows.length} in-person bookings without branch_service_id.`);
    console.log(`Already have branch_service_id: ${alreadyFilledCount}.\n`);

    // 3. Process each row
    for (const row of rows) {
      const cityKey = (row.city ?? "").toLowerCase().trim();
      const catKey = (row.category ?? "").toLowerCase().trim();
      const legacyKey = `${cityKey}:${catKey}`;

      const mapEntry = LEGACY_MAP[legacyKey];

      if (!mapEntry) {
        stats.skipped++;
        stats.conflicts.push({
          id: row.id,
          reason: `no legacy mapping for city="${cityKey}" category="${catKey}"`,
        });
        continue;
      }

      // Find catalog entry by branch + default duration (60 min)
      const catalogKey = `${cityKey}:${mapEntry.service_duration}`;
      const catalogEntry = catalogIndex.get(catalogKey);

      if (!catalogEntry) {
        stats.skipped++;
        stats.conflicts.push({
          id: row.id,
          reason: `catalog entry not found for key="${catalogKey}"`,
        });
        continue;
      }

      if (!isDryRun) {
        await pool.query(
          `UPDATE patient_bookings
           SET
             branch_id                      = $1,
             service_id                     = $2,
             branch_service_id              = $3,
             city_code_snapshot             = $4,
             branch_title_snapshot          = $5,
             service_title_snapshot         = $6,
             duration_minutes_snapshot      = $7,
             price_minor_snapshot           = $8,
             rubitime_branch_id_snapshot    = $9,
             rubitime_cooperator_id_snapshot = $10,
             rubitime_service_id_snapshot   = $11,
             updated_at = now()
           WHERE id = $12
             AND branch_service_id IS NULL`,
          [
            catalogEntry.branch_id,
            catalogEntry.service_id,
            catalogEntry.branch_service_id,
            catalogEntry.city_code,
            catalogEntry.branch_title,
            catalogEntry.service_title,
            catalogEntry.duration_minutes,
            catalogEntry.price_minor,
            catalogEntry.rubitime_branch_id,
            catalogEntry.rubitime_cooperator_id,
            catalogEntry.rubitime_service_id,
            row.id,
          ],
        );
      }

      stats.updated++;
      // All legacy matches use the default duration (60 min) — exact duration is unrecoverable
      stats.updatedWithDefaultDuration++;
    }

    // 4. Print report
    console.log("=== Backfill Report ===");
    console.log(`  Already had branch_service_id:          ${stats.alreadyFilled}`);
    console.log(`  Pending (without v2 refs, this run):    ${stats.total}`);
    console.log(`  Updated (or would update in dry-run):   ${stats.updated}`);
    console.log(`    ↳ with default 60-min duration:       ${stats.updatedWithDefaultDuration} (exact duration unrecoverable from legacy)`);
    console.log(`  Skipped (no match):                     ${stats.skipped}`);

    if (stats.conflicts.length > 0) {
      console.log(`\n  Skipped rows (${stats.conflicts.length}):`);
      for (const c of stats.conflicts.slice(0, 20)) {
        console.log(`    [${c.id}] ${c.reason}`);
      }
      if (stats.conflicts.length > 20) {
        console.log(`    ... and ${stats.conflicts.length - 20} more.`);
      }
    }

    if (isDryRun) {
      console.log("\nDry-run complete. Rerun with --commit to apply changes.");
    } else {
      console.log(`\n✓ Backfill committed. ${stats.updated} rows updated.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
