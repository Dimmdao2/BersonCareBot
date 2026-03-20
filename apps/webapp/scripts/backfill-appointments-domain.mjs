#!/usr/bin/env node
/**
 * Backfills appointment records from integrator rubitime_records to webapp appointment_records.
 * Idempotent by integrator_record_id (rubitime_record_id).
 *
 * Usage:
 *   INTEGRATOR_DATABASE_URL=... DATABASE_URL=... node scripts/backfill-appointments-domain.mjs [--dry-run | --commit] [--limit=N]
 * Defaults to --dry-run.
 */
import "dotenv/config";
import pg from "pg";

const args = process.argv.slice(2);
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

const src = new pg.Client({ connectionString: sourceUrl });
const dst = new pg.Client({ connectionString: targetUrl });

async function main() {
  await src.connect();
  await dst.connect();
  try {
    const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
    const { rows } = await src.query(
      `SELECT rubitime_record_id, phone_normalized, record_at, status, payload_json, last_event, updated_at
       FROM rubitime_records ORDER BY updated_at ASC${limitClause}`
    );
    console.log(`Appointment records to backfill: ${rows.length}`);

    for (const row of rows) {
      if (!dryRun) {
        await dst.query(
          `INSERT INTO appointment_records (
            integrator_record_id, phone_normalized, record_at, status, payload_json, last_event, updated_at
          ) VALUES ($1, $2, $3::timestamptz, $4, $5::jsonb, $6, $7::timestamptz)
          ON CONFLICT (integrator_record_id) DO UPDATE SET
            phone_normalized = EXCLUDED.phone_normalized,
            record_at = EXCLUDED.record_at,
            status = EXCLUDED.status,
            payload_json = EXCLUDED.payload_json,
            last_event = EXCLUDED.last_event,
            updated_at = EXCLUDED.updated_at`,
          [
            String(row.rubitime_record_id ?? ""),
            row.phone_normalized,
            row.record_at,
            row.status,
            JSON.stringify(row.payload_json ?? {}),
            row.last_event ?? "",
            row.updated_at,
          ]
        );
      }
    }
  } finally {
    await src.end();
    await dst.end();
  }
  console.log(dryRun ? "[DRY-RUN] Done." : "Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
