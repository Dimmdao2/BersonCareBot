#!/usr/bin/env tsx
/**
 * Requeue dead rows in integrator `projection_outbox` (same DB as webapp when shared DATABASE_URL).
 *
 * Target use case (F-01): `appointment.record.upserted` events that died with platform_user_id / patient_bookings
 * errors before phone linking was fixed — after linking, reset to pending for another delivery attempt.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --dir apps/webapp exec tsx scripts/requeue-projection-outbox-dead.ts
 *   DATABASE_URL=... pnpm --dir apps/webapp exec tsx scripts/requeue-projection-outbox-dead.ts --commit
 *   DATABASE_URL=... pnpm --dir apps/webapp exec tsx scripts/requeue-projection-outbox-dead.ts --event-type=appointment.record.upserted
 */

import "dotenv/config";
import pg from "pg";

const args = process.argv.slice(2);
const isCommit = args.includes("--commit");
const eventTypeArg = args.find((a) => a.startsWith("--event-type="));
const eventTypeFilter = eventTypeArg?.slice("--event-type=".length).trim() || null;
const errorSubstrArg = args.find((a) => a.startsWith("--error-contains="));
const errorContains = errorSubstrArg?.slice("--error-contains=".length).trim() || "platform_user_id";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url });
  try {
    const before = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM projection_outbox
       WHERE status = 'dead'
         AND ($1::text IS NULL OR event_type = $1)
         AND ($2::text IS NULL OR last_error ILIKE $2)`,
      [eventTypeFilter, errorContains ? `%${errorContains}%` : null],
    );
    const n = Number(before.rows[0]?.c ?? "0");
    console.log(JSON.stringify({ mode: isCommit ? "commit" : "dry-run", deadMatching: n, eventTypeFilter, errorContains }, null, 2));

    if (!isCommit) {
      console.log("Dry-run only. Pass --commit to reset matching rows to pending.");
      return;
    }

    const upd = await pool.query(
      `UPDATE projection_outbox
       SET status = 'pending',
           attempts_done = 0,
           next_try_at = now(),
           last_error = NULL,
           updated_at = now()
       WHERE status = 'dead'
         AND ($1::text IS NULL OR event_type = $1)
         AND ($2::text IS NULL OR last_error ILIKE $2)`,
      [eventTypeFilter, errorContains ? `%${errorContains}%` : null],
    );
    console.log(JSON.stringify({ requeued: upd.rowCount }, null, 2));

    const after = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM projection_outbox
       WHERE status = 'dead'
         AND ($1::text IS NULL OR event_type = $1)
         AND ($2::text IS NULL OR last_error ILIKE $2)`,
      [eventTypeFilter, errorContains ? `%${errorContains}%` : null],
    );
    console.log(JSON.stringify({ deadRemainingAfter: Number(after.rows[0]?.c ?? "0") }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
