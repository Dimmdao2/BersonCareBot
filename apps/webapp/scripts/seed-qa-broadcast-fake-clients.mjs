/**
 * DEV-ONLY seed: Q-A hidden broadcast test clients.
 *
 * Seeds 2 fake platform_users (+79000000000, +79999999999) into the dev DB.
 * These are the «Q-A test audience» for the hidden broadcast category:
 *   - Real numbers that will never be assigned to real people (out-of-service ranges)
 *   - No channel bindings → the integrator redirect SUPPRESSES all actual sends (D7 safe)
 *   - The broadcast preview shows 2 recipients; the actual delivery lands on Дмитрий Берсон
 *     via the pre-fork dev-redirect at the integrator dispatchPort
 *
 * Idempotent: ON CONFLICT (phone_normalized) DO UPDATE (no-op if unchanged).
 * NEVER run in production (guard below).
 *
 * Usage: node apps/webapp/scripts/seed-qa-broadcast-fake-clients.mjs
 * (loads DATABASE_URL from .env or env)
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.dev or .env from webapp root
function loadEnv() {
  for (const name of [".env.dev", ".env"]) {
    try {
      const path = resolve(__dirname, "..", name);
      const content = readFileSync(path, "utf8");
      for (const line of content.split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      // file not found — skip
    }
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL not set");
  process.exit(1);
}

// Hard production guard
if (
  DATABASE_URL.includes("prod") ||
  DATABASE_URL.includes("production") ||
  process.env.NODE_ENV === "production"
) {
  console.error("❌  Refusing to run seed in production environment");
  process.exit(1);
}

// Stable deterministic UUIDs so the seed is truly idempotent across re-runs
// (ON CONFLICT key is phone_normalized, but having stable IDs helps FK refs)
const FAKE_CLIENTS = [
  {
    // UUID namespace: sha1('qa-fake-broadcast-client:+79000000000') — offline-stable
    id: "fa9e0000-0000-4000-8000-790000000000",
    phone_normalized: "+79000000000",
    display_name: "[QA] Тест Один",
    first_name: "Тест",
    last_name: "Один",
  },
  {
    id: "fa9e9999-9999-4999-8999-799999999999",
    phone_normalized: "+79999999999",
    display_name: "[QA] Тест Два",
    first_name: "Тест",
    last_name: "Два",
  },
];

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const u of FAKE_CLIENTS) {
      // phone_normalized unique constraint is DEFERRABLE so ON CONFLICT DO UPDATE is
      // not usable; use explicit select + insert/update pattern.
      const existing = await client.query(
        `SELECT id FROM platform_users WHERE phone_normalized = $1`,
        [u.phone_normalized],
      );
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE platform_users
           SET display_name = $1, first_name = $2, last_name = $3, updated_at = now()
           WHERE phone_normalized = $4`,
          [u.display_name, u.first_name, u.last_name, u.phone_normalized],
        );
        console.log(`  ↺  ${u.display_name} (${u.phone_normalized}) → updated`);
      } else {
        await client.query(
          `INSERT INTO platform_users
             (id, phone_normalized, display_name, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5, 'client')`,
          [u.id, u.phone_normalized, u.display_name, u.first_name, u.last_name],
        );
        console.log(`  ✓  ${u.display_name} (${u.phone_normalized}) → ${u.id}`);
      }
    }

    await client.query("COMMIT");
    console.log("Seed complete — 2 Q-A fake broadcast clients upserted.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌  Seed failed, rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
