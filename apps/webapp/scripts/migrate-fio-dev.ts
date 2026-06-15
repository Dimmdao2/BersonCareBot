#!/usr/bin/env tsx
/**
 * FIO Data Migration Script — DEV DB ONLY
 *
 * PURPOSE:
 *   Parse existing display_name / first_name / last_name into patronymic for
 *   platform_users rows where patronymic IS NULL and display_name contains 3+ words
 *   that look like a Russian "Фамилия Имя Отчество" pattern.
 *
 *   In preview mode, writes a human-readable report of what would change.
 *   In apply mode, updates the DB with an audit log.
 *
 * ⚠️ REQUIRES OWNER REVIEW BEFORE RUNNING ⚠️
 *
 * Usage:
 *   pnpm tsx scripts/migrate-fio-dev.ts --preview   # show proposed changes, NO DB writes
 *   pnpm tsx scripts/migrate-fio-dev.ts --apply     # apply changes to DB with audit log
 *
 * DO NOT run on prod DB.
 *
 * Prerequisites:
 *   - DATABASE_URL env var pointing to the DEV database.
 *   - The patronymic column must already exist (migration 0129_add_patronymic.sql applied).
 */
import "dotenv/config";
import { Pool } from "pg";
import { parseFullName } from "../src/lib/parseFullName";

type UserRow = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  patronymic: string | null;
};

type ProposedChange = {
  userId: string;
  displayName: string | null;
  existingFirstName: string | null;
  existingLastName: string | null;
  proposedPatronymic: string;
  source: "display_name";
};

function parseCli() {
  const args = process.argv.slice(2);
  return {
    preview: args.includes("--preview"),
    apply: args.includes("--apply"),
  };
}

async function main() {
  const cli = parseCli();

  if (!cli.preview && !cli.apply) {
    console.error("Usage: tsx scripts/migrate-fio-dev.ts --preview | --apply");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("[ERROR] DATABASE_URL is not set");
    process.exit(1);
  }

  // Safety check: refuse to run on prod-like DB URLs
  if (url.includes("prod") || url.includes("production")) {
    console.error("[ERROR] DATABASE_URL looks like a production database. Refusing to run.");
    process.exit(1);
  }

  console.log(`\n=== FIO Data Migration [${cli.apply ? "APPLY" : "PREVIEW (no writes)"}] ===`);
  console.log(`DB: ${url.replace(/:[^:@/]*@/, ":***@").replace(/^.*@/, "")}`);

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    // Fetch users with NULL patronymic where display_name might contain 3+ words
    const result = await client.query<UserRow>(
      `SELECT id, display_name, first_name, last_name, patronymic
       FROM platform_users
       WHERE patronymic IS NULL
         AND role = 'client'
         AND merged_into_id IS NULL
         AND display_name IS NOT NULL
         AND display_name <> ''
       ORDER BY display_name`,
    );

    const rows = result.rows;
    console.log(`\nFound ${rows.length} client rows with NULL patronymic and non-empty display_name.\n`);

    const proposed: ProposedChange[] = [];

    for (const row of rows) {
      const dn = row.display_name?.trim() ?? "";
      const words = dn.split(/\s+/).filter(Boolean);

      // Only propose when display_name has 3+ words (likely FIO format)
      if (words.length < 3) continue;

      // If first_name and last_name are already filled from Rubitime, skip — we don't overwrite
      // Instead, we just use display_name to extract a 3rd word as patronymic
      const parsed = parseFullName(dn);
      if (!parsed.patronymic) continue;

      // Cross-check: if first_name and last_name match what we'd parse, extract patronymic safely
      // If they don't match (display_name was edited independently), skip — too risky
      const firstNameMatch =
        !row.first_name ||
        row.first_name.trim().toLowerCase() === parsed.firstName?.toLowerCase();
      const lastNameMatch =
        !row.last_name ||
        row.last_name.trim().toLowerCase() === parsed.lastName?.toLowerCase();

      if (!firstNameMatch || !lastNameMatch) {
        // Mismatch: log for review but don't propose a change
        console.log(
          `[SKIP] ${row.id} display="${dn}" first_name="${row.first_name ?? ""}" ` +
            `last_name="${row.last_name ?? ""}" — parts don't match parsed FIO, skipping.`,
        );
        continue;
      }

      proposed.push({
        userId: row.id,
        displayName: row.display_name,
        existingFirstName: row.first_name,
        existingLastName: row.last_name,
        proposedPatronymic: parsed.patronymic,
        source: "display_name",
      });
    }

    console.log(`Proposed patronymic backfills: ${proposed.length}`);

    if (proposed.length === 0) {
      console.log("Nothing to do.");
      await client.release();
      await pool.end();
      return;
    }

    // Print proposal table
    console.log("\n--- Proposed changes ---");
    for (const p of proposed) {
      console.log(
        `  ${p.userId.slice(0, 8)}…  dn="${p.displayName}"  ` +
          `fn="${p.existingFirstName ?? "(null)"}"  ln="${p.existingLastName ?? "(null)"}"  ` +
          `→ patronymic="${p.proposedPatronymic}"`,
      );
    }

    if (cli.preview) {
      console.log("\n[PREVIEW] No DB writes. Run with --apply to commit.");
      await client.release();
      await pool.end();
      return;
    }

    // APPLY mode: update rows
    console.log("\n[APPLY] Writing changes to DB…");
    let updated = 0;
    let errors = 0;

    for (const p of proposed) {
      try {
        await client.query(
          `UPDATE platform_users SET patronymic = $1, updated_at = now()
           WHERE id = $2::uuid AND patronymic IS NULL AND role = 'client'`,
          [p.proposedPatronymic, p.userId],
        );
        updated++;
        console.log(`  OK ${p.userId.slice(0, 8)}… → patronymic="${p.proposedPatronymic}"`);
      } catch (err) {
        errors++;
        console.error(
          `  ERR ${p.userId.slice(0, 8)}… — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    console.log(
      `\nDone. Updated: ${updated}/${proposed.length}. Errors: ${errors}.`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
