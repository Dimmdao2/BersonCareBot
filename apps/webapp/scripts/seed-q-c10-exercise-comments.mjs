/**
 * seed-q-c10-exercise-comments.mjs
 *
 * Seeds program_action_log records for Наташа Шалина's «Микроприседания с опорой»
 * exercise to populate the CMT exercise graph with ≥5 data points across ≥14 days,
 * with BOTH reps AND weightKg metrics so that the graph shows multiple crossing lines.
 *
 * Safe to re-run: uses unique created_at timestamps so duplicates are avoided.
 * Idempotent by checking for existing records at each timestamp before inserting.
 *
 * Usage: node apps/webapp/scripts/seed-q-c10-exercise-comments.mjs
 */

import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Config ──────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../..", ".env");

// Parse DATABASE_URL from .env
let DATABASE_URL;
try {
  const envContent = readFileSync(envPath, "utf8");
  const match = envContent.match(/^DATABASE_URL=(.+)$/m);
  if (match) {
    DATABASE_URL = match[1].trim();
  }
} catch {
  // fallback: use env var
}
DATABASE_URL = DATABASE_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not found in .env or environment");
  process.exit(1);
}

// ── Known IDs (discovered from DB exploration) ──────────────────────────────

const PATIENT_USER_ID = "8c2863c3-e1f3-4cbd-98a3-f0864e736647"; // Наташа Шалина
const INSTANCE_ID = "ac43fc3a-21bf-4a9e-a83b-eb6cdf3744e6";
const INSTANCE_STAGE_ITEM_ID = "d9b16f46-5093-4555-9cdb-7ab29d096ab6"; // Микроприседания с опорой

// ── Seed records ─────────────────────────────────────────────────────────────
// Spread across ≥14 days (June 2 to June 18), with reps + weightKg + perceivedDifficulty
// so the graph renders the reps line (green), weightKg line (blue), AND difficulty line (red)
// This creates 3 crossing lines for the multi-line CMT chart.
//
// Note: some dates already have entries with reps+difficulty only (no weightKg).
// These NEW records add weightKg, ensuring the blue "weight" line appears.

const seedRecords = [
  // June 2 — 16 days before June 18 (ensures ≥14 day spread)
  {
    created_at: "2026-06-02T10:30:00+02:00",
    reps: 12,
    weightKg: 2.0,
    perceivedDifficulty: "medium",
  },
  // June 4
  {
    created_at: "2026-06-04T09:45:00+02:00",
    reps: 14,
    weightKg: 2.5,
    perceivedDifficulty: "easy",
  },
  // June 7
  {
    created_at: "2026-06-07T11:00:00+02:00",
    reps: 10,
    weightKg: 3.0,
    perceivedDifficulty: "hard",
  },
  // June 9
  {
    created_at: "2026-06-09T08:30:00+02:00",
    reps: 16,
    weightKg: 2.0,
    perceivedDifficulty: "medium",
  },
  // June 11 — within 7-day window (note: an existing record on Jun 11 at 21:54 exists; this is at 10:30)
  {
    created_at: "2026-06-11T10:30:00+02:00",
    reps: 15,
    weightKg: 3.5,
    perceivedDifficulty: "hard",
  },
  // June 13 — within 7-day window (note: existing seed at 09:30; use 14:00)
  {
    created_at: "2026-06-13T14:00:00+02:00",
    reps: 18,
    weightKg: 2.5,
    perceivedDifficulty: "medium",
  },
  // June 15 — within 7-day window (note: existing seed at 10:15; use 15:00)
  {
    created_at: "2026-06-15T15:00:00+02:00",
    reps: 20,
    weightKg: 4.0,
    perceivedDifficulty: "easy",
  },
  // June 17 — within 7-day window (note: existing seed at 08:30; use 16:00)
  {
    created_at: "2026-06-17T16:00:00+02:00",
    reps: 22,
    weightKg: 3.0,
    perceivedDifficulty: "medium",
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("Connected to database.");

  let insertedCount = 0;
  let skippedCount = 0;

  try {
    for (const rec of seedRecords) {
      // Check if a record already exists at exactly this timestamp for this stage item
      const existingCheck = await client.query(
        `SELECT id FROM program_action_log
         WHERE instance_stage_item_id = $1
           AND created_at = $2::timestamptz
           AND action_type = 'done'`,
        [INSTANCE_STAGE_ITEM_ID, rec.created_at]
      );

      if (existingCheck.rows.length > 0) {
        console.log(`  SKIP  ${rec.created_at} — already exists (id=${existingCheck.rows[0].id})`);
        skippedCount++;
        continue;
      }

      const payload = {
        source: "seed_q_c10",
        itemType: "exercise",
        reps: rec.reps,
        weightKg: rec.weightKg,
        perceivedDifficulty: rec.perceivedDifficulty,
      };

      const result = await client.query(
        `INSERT INTO program_action_log
           (instance_id, instance_stage_item_id, patient_user_id, action_type, payload, note, created_at)
         VALUES ($1, $2, $3, 'done', $4::jsonb, NULL, $5::timestamptz)
         RETURNING id`,
        [
          INSTANCE_ID,
          INSTANCE_STAGE_ITEM_ID,
          PATIENT_USER_ID,
          JSON.stringify(payload),
          rec.created_at,
        ]
      );

      console.log(`  INSERT ${rec.created_at} — reps=${rec.reps}, weightKg=${rec.weightKg}, difficulty=${rec.perceivedDifficulty} — id=${result.rows[0].id}`);
      insertedCount++;
    }
  } finally {
    await client.end();
  }

  console.log("");
  console.log(`Done. Inserted: ${insertedCount}, Skipped (already existed): ${skippedCount}`);
  console.log("");
  console.log("Summary:");
  console.log(`  Patient user ID:         ${PATIENT_USER_ID}  (Наташа Шалина)`);
  console.log(`  Instance ID:             ${INSTANCE_ID}`);
  console.log(`  Instance stage item ID:  ${INSTANCE_STAGE_ITEM_ID}  (Микроприседания с опорой)`);
  console.log(`  Table:                   public.program_action_log`);
  console.log(`  Records span:            2026-06-02 → 2026-06-17 (16 days)`);
  console.log(`  Metrics present:         reps (green line), weightKg (blue line), difficulty (red line)`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
