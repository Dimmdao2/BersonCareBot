#!/usr/bin/env node
/**
 * Ops backfill: заполняет appointment_records.platform_user_id по телефону строки и истории номеров.
 * Usage: DATABASE_URL="postgresql://..." node scripts/backfill-appointment-records-platform-user-id.mjs [--dry-run]
 */
import pg from "pg";

const dryRun = process.argv.includes("--dry-run");
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const poolClient = new pg.Client({ connectionString: databaseUrl });
await poolClient.connect();

try {
  const pending = await poolClient.query(`
    SELECT id, phone_normalized
    FROM appointment_records
    WHERE deleted_at IS NULL
      AND phone_normalized IS NOT NULL
      AND btrim(phone_normalized) <> ''
      AND platform_user_id IS NULL
  `);

  let updated = 0;
  let ambiguous = 0;

  for (const row of pending.rows) {
    const phone = String(row.phone_normalized).trim();
    const pick = await poolClient.query(
      `
      SELECT id FROM (
        SELECT pu.id::uuid AS id
        FROM platform_users pu
        WHERE pu.merged_into_id IS NULL AND pu.phone_normalized = $1
        UNION
        SELECT DISTINCT h.platform_user_id AS id
        FROM user_phone_history h
        WHERE h.phone_normalized = $1
      ) x
      LIMIT 3
      `,
      [phone],
    );
    const ids = pick.rows.map((r) => r.id).filter(Boolean);
    if (ids.length !== 1) {
      ambiguous += 1;
      continue;
    }
    if (!dryRun) {
      await poolClient.query(`UPDATE appointment_records SET platform_user_id = $2::uuid WHERE id = $1::uuid`, [
        row.id,
        ids[0],
      ]);
    }
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        examined: pending.rows.length,
        updated,
        ambiguousOrSkipped: ambiguous,
      },
      null,
      2,
    ),
  );
} finally {
  await poolClient.end();
}
