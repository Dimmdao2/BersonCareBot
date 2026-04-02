#!/usr/bin/env tsx
/**
 * Backfill script: enrich rubitime_projection snapshot fields in patient_bookings
 * from appointment_records.payload_json (including nested record/data.record paths).
 *
 * Usage:
 *   DATABASE_URL=... pnpm --dir apps/webapp backfill-rubitime-compat-snapshots
 *   DATABASE_URL=... pnpm --dir apps/webapp backfill-rubitime-compat-snapshots --commit
 *   DATABASE_URL=... pnpm --dir apps/webapp backfill-rubitime-compat-snapshots --commit --limit=500
 */

import "dotenv/config";
import pg from "pg";

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

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  console.log("=== Backfill: rubitime compat snapshots ===");
  console.log(`Mode: ${isDryRun ? "DRY-RUN" : "COMMIT"}`);
  if (rowLimit > 0) console.log(`Limit: ${rowLimit} rows`);
  console.log("");

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
    console.log(`Found compat rows with missing snapshot fields: ${rows.length}`);
    console.log(`Can enrich from payload_json: ${candidates.length}`);
    console.log(`Still missing after extraction: ${stillMissing}`);

    if (isDryRun) {
      console.log("\nDry-run done. Use --commit to apply.");
      if (stillMissing > 0) {
        console.log("Tip: inspect payload shape for missing rows (likely no branch/service fields in Rubitime payload).");
      }
      return;
    }

    let updated = 0;
    for (const c of candidates) {
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
      updated += upd.rowCount ?? 0;
    }

    console.log(`\nCommitted. Updated rows: ${updated}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

