#!/usr/bin/env tsx
/**
 * Backfill script: enrich rubitime_projection rows in patient_bookings
 *
 * Phase 1 — snapshot fields from appointment_records.payload_json (nested paths).
 * Phase 2 — catalog lookup: branch_service_id + snapshots + compat_quality from booking_branch_services.
 *
 * Evidence / monitoring (run on DB before/after backfill):
 *   SELECT count(*), compat_quality FROM patient_bookings WHERE source = 'rubitime_projection' GROUP BY 2;
 *   SELECT count(*) FROM patient_bookings WHERE source = 'rubitime_projection' AND branch_service_id IS NOT NULL;
 *   JSON summary includes `catalog_degraded` (= lookup_miss + lookup_ambiguous), aligned with Stage 2 S2.T05 «degraded» signal.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --dir apps/webapp backfill-rubitime-compat-snapshots
 *   DATABASE_URL=... pnpm --dir apps/webapp backfill-rubitime-compat-snapshots --commit
 *   DATABASE_URL=... pnpm --dir apps/webapp backfill-rubitime-compat-snapshots --commit --limit=500
 */

import "dotenv/config";
import pg from "pg";
import { computeCompatSyncQuality } from "../src/modules/patient-booking/compatSyncQuality";

type CompatRow = {
  id: string;
  rubitime_id: string | null;
  branch_title_snapshot: string | null;
  service_title_snapshot: string | null;
  rubitime_branch_id_snapshot: string | null;
  rubitime_service_id_snapshot: string | null;
  payload_json: unknown;
};

type UpdateCandidate = {
  id: string;
  rubitimeId: string;
  nextBranchTitle: string | null;
  nextServiceTitle: string | null;
  nextRubitimeBranchId: string | null;
  nextRubitimeServiceId: string | null;
};

type CatalogRow = {
  id: string;
  slot_start: Date;
  slot_end: Date;
  branch_title_snapshot: string | null;
  service_title_snapshot: string | null;
  rubitime_branch_id_snapshot: string | null;
  rubitime_service_id_snapshot: string | null;
  rubitime_cooperator_id_snapshot: string | null;
  branch_service_id: string | null;
  compat_quality: string | null;
};

type LookupRow = {
  branch_service_id: string;
  branch_id: string;
  service_id: string;
  city_code: string;
  branch_title: string;
  service_title: string;
  duration_minutes: number;
  price_minor: number;
  rubitime_cooperator_id: string;
};

const args = process.argv.slice(2);
const isDryRun = !args.includes("--commit");
const limitArg = args.find((a) => a.startsWith("--limit="));
const MAX_LIMIT = 100_000;

function parseLimit(arg: string | undefined): number {
  if (!arg) return 0;
  const n = Number.parseInt(arg.slice(arg.indexOf("=") + 1), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_LIMIT) : 0;
}

const rowLimit = parseLimit(limitArg);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getByPath(root: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = root;
  for (const part of parts) {
    const rec = asRecord(cur);
    if (!rec) return undefined;
    cur = rec[part];
  }
  return cur;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return null;
}

function pickFirstString(root: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const value = asNonEmptyString(getByPath(root, path));
    if (value) return value;
  }
  return null;
}

const BRANCH_TITLE_PATHS = [
  "branch_name",
  "branch_title",
  "branchName",
  "record.branch_name",
  "record.branch_title",
  "record.branchName",
  "data.record.branch_name",
  "data.record.branch_title",
  "data.record.branchName",
];

const SERVICE_TITLE_PATHS = [
  "service_name",
  "service_title",
  "serviceName",
  "record.service_name",
  "record.service_title",
  "record.serviceName",
  "data.record.service_name",
  "data.record.service_title",
  "data.record.serviceName",
];

const BRANCH_ID_PATHS = [
  "branch_id",
  "branchId",
  "integratorBranchId",
  "record.branch_id",
  "record.branchId",
  "data.record.branch_id",
  "data.record.branchId",
];

const SERVICE_ID_PATHS = [
  "service_id",
  "serviceId",
  "integratorServiceId",
  "record.service_id",
  "record.serviceId",
  "data.record.service_id",
  "data.record.serviceId",
];

function buildCandidate(row: CompatRow): UpdateCandidate | null {
  if (!row.rubitime_id) return null;
  const payload = row.payload_json;
  const extractedBranchTitle = pickFirstString(payload, BRANCH_TITLE_PATHS);
  const extractedServiceTitle = pickFirstString(payload, SERVICE_TITLE_PATHS);
  const extractedBranchId = pickFirstString(payload, BRANCH_ID_PATHS);
  const extractedServiceId = pickFirstString(payload, SERVICE_ID_PATHS);

  const nextBranchTitle = row.branch_title_snapshot ?? extractedBranchTitle;
  const nextServiceTitle = row.service_title_snapshot ?? extractedServiceTitle;
  const nextRubitimeBranchId = row.rubitime_branch_id_snapshot ?? extractedBranchId;
  const nextRubitimeServiceId = row.rubitime_service_id_snapshot ?? extractedServiceId;

  const changed =
    nextBranchTitle !== row.branch_title_snapshot ||
    nextServiceTitle !== row.service_title_snapshot ||
    nextRubitimeBranchId !== row.rubitime_branch_id_snapshot ||
    nextRubitimeServiceId !== row.rubitime_service_id_snapshot;

  if (!changed) return null;
  return {
    id: row.id,
    rubitimeId: row.rubitime_id,
    nextBranchTitle,
    nextServiceTitle,
    nextRubitimeBranchId,
    nextRubitimeServiceId,
  };
}

async function lookupCatalog(
  pool: pg.Pool,
  rubitimeBranchId: string,
  rubitimeServiceId: string,
  rubitimeCooperatorId: string | null,
): Promise<{ result: LookupRow | null; ambiguous: boolean }> {
  const res = await pool.query<LookupRow>(
    `SELECT
       bs.id AS branch_service_id,
       b.id AS branch_id,
       s.id AS service_id,
       c.code AS city_code,
       b.title AS branch_title,
       s.title AS service_title,
       s.duration_minutes,
       s.price_minor,
       sp.rubitime_cooperator_id AS rubitime_cooperator_id
     FROM booking_branches b
     JOIN booking_cities c ON c.id = b.city_id
     JOIN booking_branch_services bs ON bs.branch_id = b.id
     JOIN booking_services s ON s.id = bs.service_id
     JOIN booking_specialists sp ON sp.id = bs.specialist_id
     WHERE b.rubitime_branch_id = $1
       AND bs.rubitime_service_id = $2
       AND bs.is_active = TRUE
       AND b.is_active = TRUE
       AND ($3::text IS NULL OR sp.rubitime_cooperator_id = $3)
     ORDER BY
       CASE WHEN $3::text IS NOT NULL AND sp.rubitime_cooperator_id = $3 THEN 0 ELSE 1 END,
       bs.updated_at DESC
     LIMIT 2`,
    [rubitimeBranchId, rubitimeServiceId, rubitimeCooperatorId],
  );
  const rows = res.rows;
  if (rows.length === 0) return { result: null, ambiguous: false };
  if (rows.length > 1 && (rubitimeCooperatorId == null || rubitimeCooperatorId === "")) {
    return { result: null, ambiguous: true };
  }
  return { result: rows[0] ?? null, ambiguous: false };
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  console.log("=== Backfill: rubitime compat snapshots + catalog enrich ===");
  console.log(`Mode: ${isDryRun ? "DRY-RUN" : "COMMIT"}`);
  if (rowLimit > 0) console.log(`Limit (phase 1 selection): ${rowLimit} rows`);
  console.log("");

  const stats = {
    snapshot_enriched: 0,
    snapshot_failed: 0,
    catalog_enriched: 0,
    catalog_unchanged: 0,
    catalog_skipped_no_ids: 0,
    catalog_lookup_miss: 0,
    catalog_lookup_ambiguous: 0,
    catalog_failed: 0,
  };

  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
  try {
    const query = `
      SELECT
        pb.id,
        pb.rubitime_id,
        pb.branch_title_snapshot,
        pb.service_title_snapshot,
        pb.rubitime_branch_id_snapshot,
        pb.rubitime_service_id_snapshot,
        ar.payload_json
      FROM patient_bookings pb
      JOIN appointment_records ar ON ar.integrator_record_id = pb.rubitime_id
      WHERE pb.source = 'rubitime_projection'
        AND pb.rubitime_id IS NOT NULL
        AND (
          pb.branch_title_snapshot IS NULL OR
          pb.service_title_snapshot IS NULL OR
          pb.rubitime_branch_id_snapshot IS NULL OR
          pb.rubitime_service_id_snapshot IS NULL
        )
      ORDER BY pb.created_at ASC
      ${rowLimit > 0 ? `LIMIT ${rowLimit}` : ""}
    `;

    const res = await pool.query<CompatRow>(query);
    const rows = res.rows;
    const candidates = rows
      .map(buildCandidate)
      .filter((x): x is UpdateCandidate => x !== null);

    const stillMissing = rows.length - candidates.length;
    console.log(`[Phase 1] compat rows with missing snapshot fields: ${rows.length}`);
    console.log(`[Phase 1] can enrich from payload_json: ${candidates.length}`);
    console.log(`[Phase 1] still missing after extraction: ${stillMissing}`);

    if (!isDryRun) {
      for (const c of candidates) {
        try {
          const upd = await pool.query(
            `UPDATE patient_bookings
             SET
               branch_title_snapshot = COALESCE(branch_title_snapshot, $2),
               service_title_snapshot = COALESCE(service_title_snapshot, $3),
               rubitime_branch_id_snapshot = COALESCE(rubitime_branch_id_snapshot, $4),
               rubitime_service_id_snapshot = COALESCE(rubitime_service_id_snapshot, $5),
               updated_at = now()
             WHERE id = $1`,
            [c.id, c.nextBranchTitle, c.nextServiceTitle, c.nextRubitimeBranchId, c.nextRubitimeServiceId],
          );
          stats.snapshot_enriched += upd.rowCount ?? 0;
        } catch {
          stats.snapshot_failed += 1;
        }
      }
    } else if (candidates.length > 0) {
      stats.snapshot_enriched = candidates.length;
    }

    console.log("\n[Phase 2] Catalog enrich (branch_service_id + compat_quality)…");

    const catalogQuery = `
      SELECT
        pb.id,
        pb.slot_start,
        pb.slot_end,
        pb.branch_title_snapshot,
        pb.service_title_snapshot,
        pb.rubitime_branch_id_snapshot,
        pb.rubitime_service_id_snapshot,
        pb.rubitime_cooperator_id_snapshot,
        pb.branch_service_id,
        pb.compat_quality
      FROM patient_bookings pb
      WHERE pb.source = 'rubitime_projection'
        AND pb.rubitime_branch_id_snapshot IS NOT NULL
        AND pb.rubitime_service_id_snapshot IS NOT NULL
      ORDER BY pb.created_at ASC
      ${rowLimit > 0 ? `LIMIT ${rowLimit}` : ""}
    `;

    const catRes = await pool.query<CatalogRow>(catalogQuery);
    for (const row of catRes.rows) {
      const rb = row.rubitime_branch_id_snapshot?.trim() ?? "";
      const rs = row.rubitime_service_id_snapshot?.trim() ?? "";
      if (!rb || !rs) {
        stats.catalog_skipped_no_ids += 1;
        continue;
      }
      const rc = row.rubitime_cooperator_id_snapshot?.trim() || null;
      try {
        const { result: lookup, ambiguous } = await lookupCatalog(pool, rb, rs, rc);
        if (ambiguous) {
          stats.catalog_lookup_ambiguous += 1;
          console.warn("[compat backfill] ambiguous lookup", { id: row.id, rb, rs });
          continue;
        }
        if (!lookup) {
          stats.catalog_lookup_miss += 1;
          continue;
        }

        const effectiveBranchTitle = row.branch_title_snapshot ?? lookup.branch_title;
        const effectiveServiceTitle = row.service_title_snapshot ?? lookup.service_title;
        const slotEndIso = new Date(row.slot_start.getTime() + lookup.duration_minutes * 60_000).toISOString();
        const nextQuality = computeCompatSyncQuality({
          branchServiceId: lookup.branch_service_id,
          cityCodeSnapshot: lookup.city_code,
          serviceTitleSnapshot: effectiveServiceTitle,
          branchTitleSnapshot: effectiveBranchTitle,
          rubitimeBranchId: rb,
          rubitimeServiceId: rs,
          slotEndExplicitFromWebhook: false,
          slotEndFromCatalogDuration: true,
        });

        const already =
          row.branch_service_id === lookup.branch_service_id &&
          row.compat_quality === nextQuality &&
          row.slot_end?.toISOString() === slotEndIso;
        if (already) {
          stats.catalog_unchanged += 1;
          continue;
        }

        if (isDryRun) {
          stats.catalog_enriched += 1;
          continue;
        }

        await pool.query(
          `UPDATE patient_bookings
           SET
             branch_id = $2::uuid,
             service_id = $3::uuid,
             branch_service_id = $4::uuid,
             city_code_snapshot = $5,
             branch_title_snapshot = COALESCE(branch_title_snapshot, $6),
             service_title_snapshot = COALESCE(service_title_snapshot, $7),
             duration_minutes_snapshot = $8,
             price_minor_snapshot = $9,
             rubitime_cooperator_id_snapshot = COALESCE(rubitime_cooperator_id_snapshot, $10),
             slot_end = $11::timestamptz,
             compat_quality = $12,
             updated_at = now()
           WHERE id = $1`,
          [
            row.id,
            lookup.branch_id,
            lookup.service_id,
            lookup.branch_service_id,
            lookup.city_code,
            lookup.branch_title,
            lookup.service_title,
            lookup.duration_minutes,
            lookup.price_minor,
            lookup.rubitime_cooperator_id,
            slotEndIso,
            nextQuality,
          ],
        );
        stats.catalog_enriched += 1;
      } catch {
        stats.catalog_failed += 1;
      }
    }

    console.log("\n--- Counters ---");
    const catalog_degraded = stats.catalog_lookup_miss + stats.catalog_lookup_ambiguous;
    console.log(JSON.stringify({ ...stats, catalog_degraded }, null, 2));
    if (isDryRun) {
      console.log("\nDry-run done. Use --commit to apply.");
    } else {
      console.log("\nCommitted.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
