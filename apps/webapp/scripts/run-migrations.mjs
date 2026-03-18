#!/usr/bin/env node
/**
 * Runs SQL migrations from webapp/migrations in order.
 * Usage: node scripts/run-migrations.mjs
 * Requires DATABASE_URL (e.g. from .env or environment).
 */
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "migrations");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const path = join(migrationsDir, file);
    const sql = await readFile(path, "utf-8");
    console.log(`Running ${file}...`);
    await client.query(sql);
    console.log(`  done`);
  }

  await client.end();
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
