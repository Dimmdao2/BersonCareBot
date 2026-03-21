#!/usr/bin/env node
/**
 * Backfills appointment records from integrator rubitime_records to webapp appointment_records,
 * and fills branches + platform_users profile (first_name, last_name, email) from payload_json.
 * Idempotent by integrator_record_id (rubitime_record_id).
 *
 * Usage:
 *   INTEGRATOR_DATABASE_URL=... DATABASE_URL=... node scripts/backfill-appointments-domain.mjs [--dry-run | --commit] [--limit=N]
 * Defaults to --dry-run.
 */
import "dotenv/config";
import pg from "pg";
import { loadCutoverEnv } from "../../../scripts/load-cutover-env.mjs";

const args = process.argv.slice(2);
loadCutoverEnv();
const dryRun = !args.includes("--commit");
const limitArg = args.find((a) => a.startsWith("--limit="));
const MAX_BACKFILL_LIMIT = 500_000;
function parseBackfillLimit(arg) {
  if (!arg || !arg.includes("=")) return 0;
  const raw = arg.slice(arg.indexOf("=") + 1);
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_BACKFILL_LIMIT);
}
const limit = limitArg ? parseBackfillLimit(limitArg) : 0;

const sourceUrl = process.env.INTEGRATOR_DATABASE_URL || process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;

if (!sourceUrl) {
  console.error("INTEGRATOR_DATABASE_URL (or SOURCE_DATABASE_URL) is not set");
  process.exit(1);
}
if (!targetUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

if (dryRun) {
  console.log("[DRY-RUN] No writes will be performed. Pass --commit to write.");
}

/** Best-effort split: "Иванов Иван" -> { lastName: "Иванов", firstName: "Иван" }. */
function parseNameToFirstLast(name) {
  if (typeof name !== "string" || !name.trim()) return { firstName: null, lastName: null };
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { lastName: parts[0], firstName: parts.slice(1).join(" ") };
}

function asString(v) {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (v != null && typeof v !== "string") return String(v).trim() || null;
  return null;
}

const src = new pg.Client({ connectionString: sourceUrl });
const dst = new pg.Client({ connectionString: targetUrl });

async function main() {
  await src.connect();
  await dst.connect();
  const stats = {
    appointmentsProcessed: 0,
    branchesUpserted: 0,
    patientsUpdated: 0,
    patientsInserted: 0,
    appointmentsBranchLinked: 0,
  };
  const branchIdByIntegratorId = new Map(); // integrator_branch_id (number) -> webapp branch id (uuid)
  const uniqueBranchIdsInDryRun = new Set();

  try {
    const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
    const { rows } = await src.query(
      `SELECT rubitime_record_id, phone_normalized, record_at, status, payload_json, last_event, updated_at
       FROM rubitime_records ORDER BY updated_at ASC${limitClause}`
    );
    console.log(`Appointment records to backfill: ${rows.length}`);

    const BACKFILL_WRITE_BATCH = 500;
    for (let i = 0; i < rows.length; i += BACKFILL_WRITE_BATCH) {
      const chunk = rows.slice(i, i + BACKFILL_WRITE_BATCH);
      if (!dryRun) await dst.query("BEGIN");
      try {
        for (const row of chunk) {
      const payload = row.payload_json ?? {};
      const name = asString(payload.name);
      const email = asString(payload.email);
      const rawBranchId = payload.branch_id;
      const integratorBranchId =
        typeof rawBranchId === "number" && Number.isFinite(rawBranchId)
          ? rawBranchId
          : asString(rawBranchId)
            ? parseInt(String(rawBranchId), 10)
            : null;
      const branchName = asString(payload.branch_name) ?? asString(payload.branch_title);
      const { firstName, lastName } = parseNameToFirstLast(name);
      const displayName = name || [lastName, firstName].filter(Boolean).join(" ").trim() || null;

      let branchId = null;
      if (integratorBranchId != null && Number.isFinite(integratorBranchId)) {
        if (branchIdByIntegratorId.has(integratorBranchId)) {
          branchId = branchIdByIntegratorId.get(integratorBranchId);
        } else if (!dryRun) {
          const res = await dst.query(
            `INSERT INTO branches (integrator_branch_id, name, meta_json, updated_at)
             VALUES ($1, $2, '{}'::jsonb, now())
             ON CONFLICT (integrator_branch_id) DO UPDATE SET
               name = COALESCE(NULLIF(TRIM(EXCLUDED.name), ''), branches.name),
               updated_at = now()
             RETURNING id`,
            [integratorBranchId, branchName]
          );
          branchId = res.rows[0]?.id ?? null;
          if (branchId) {
            branchIdByIntegratorId.set(integratorBranchId, branchId);
            stats.branchesUpserted += 1;
          }
        } else {
          if (!uniqueBranchIdsInDryRun.has(integratorBranchId)) {
            uniqueBranchIdsInDryRun.add(integratorBranchId);
            stats.branchesUpserted += 1;
          }
        }
        if (branchId != null || integratorBranchId != null) stats.appointmentsBranchLinked += 1;
      }

      if (!dryRun && row.phone_normalized) {
        const byPhone = await dst.query(
          "SELECT id FROM platform_users WHERE phone_normalized = $1 LIMIT 1",
          [row.phone_normalized]
        );
        if (byPhone.rows.length > 0) {
          const r = await dst.query(
            `UPDATE platform_users SET first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name),
             email = COALESCE($4, email), display_name = COALESCE(NULLIF(TRIM($5), ''), display_name), updated_at = now()
             WHERE phone_normalized = $1`,
            [row.phone_normalized, firstName, lastName, email, displayName]
          );
          if (r.rowCount > 0) stats.patientsUpdated += 1;
        } else if (firstName || lastName || email || displayName) {
          const ins = await dst.query(
            `INSERT INTO platform_users (phone_normalized, first_name, last_name, email, display_name)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (phone_normalized) DO UPDATE SET
               first_name = COALESCE(EXCLUDED.first_name, platform_users.first_name),
               last_name = COALESCE(EXCLUDED.last_name, platform_users.last_name),
               email = COALESCE(EXCLUDED.email, platform_users.email),
               display_name = COALESCE(NULLIF(TRIM(EXCLUDED.display_name), ''), platform_users.display_name),
               updated_at = now()
             RETURNING id`,
            [row.phone_normalized, firstName, lastName, email, displayName ?? ""]
          );
          stats.patientsInserted += ins.rowCount ?? 0;
        }
      } else if (dryRun && row.phone_normalized && (firstName || lastName || email || name)) {
        stats.patientsUpdated += 1; // approximate: would update or insert
      }

      if (!dryRun) {
        await dst.query(
          `INSERT INTO appointment_records (
            integrator_record_id, phone_normalized, record_at, status, payload_json, last_event, updated_at, branch_id
          ) VALUES ($1, $2, $3::timestamptz, $4, $5::jsonb, $6, $7::timestamptz, $8::uuid)
          ON CONFLICT (integrator_record_id) DO UPDATE SET
            phone_normalized = EXCLUDED.phone_normalized,
            record_at = EXCLUDED.record_at,
            status = EXCLUDED.status,
            payload_json = EXCLUDED.payload_json,
            last_event = EXCLUDED.last_event,
            updated_at = EXCLUDED.updated_at,
            branch_id = EXCLUDED.branch_id`,
          [
            String(row.rubitime_record_id ?? ""),
            row.phone_normalized,
            row.record_at,
            row.status,
            JSON.stringify(row.payload_json ?? {}),
            row.last_event ?? "",
            row.updated_at,
            branchId,
          ]
        );
      }
      stats.appointmentsProcessed += 1;
        }
        if (!dryRun) await dst.query("COMMIT");
      } catch (err) {
        if (!dryRun) await dst.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await src.end();
    await dst.end();
  }

  console.log(
    dryRun ? "[DRY-RUN] Done." : "Done.",
    "\nReport:",
    JSON.stringify(
      {
        appointmentsProcessed: stats.appointmentsProcessed,
        branchesUpserted: stats.branchesUpserted,
        patientsUpdated: stats.patientsUpdated,
        patientsInserted: stats.patientsInserted,
        appointmentsBranchLinked: stats.appointmentsBranchLinked,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
