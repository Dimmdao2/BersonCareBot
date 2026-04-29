/**
 * Runs once before all tests. When DATABASE_URL is set (e.g. from .env), runs migrations
 * so the dev/test DB has symptom_entries and lfk_sessions. E2e tests then use this DB
 * and add sample data (addLfkSession / addSymptomEntry).
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  config({ path: path.join(__dirname, ".env"), quiet: true });
  if (!process.env.DATABASE_URL) {
    config({ path: path.join(__dirname, ".env.dev"), quiet: true });
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl === "") {
    return;
  }
  const failOnMigrationError =
    process.env.CI === "true" || process.env.VITEST_REQUIRE_DB_MIGRATIONS === "true";
  try {
    execSync("pnpm run migrate:legacy", {
      encoding: "utf-8",
      cwd: __dirname,
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
    execSync("pnpm run migrate", {
      encoding: "utf-8",
      cwd: __dirname,
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
  } catch (e) {
    if (failOnMigrationError) {
      throw new Error("vitest globalSetup: migrations failed while DB migrations are required", {
        cause: e,
      });
    }
    const short = e instanceof Error ? e.message : String(e);
    console.warn(
      "vitest globalSetup: migrations failed (DB may be down). Tests may use in-memory. " + short,
    );
  }
}
