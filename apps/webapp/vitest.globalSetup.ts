/**
 * Runs once before all tests.
 * When DATABASE_URL is set (e.g. from .env), runs Drizzle migrations.
 * Legacy SQL migrations are opt-in only via VITEST_USE_LEGACY_MIGRATIONS=true.
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
  const useLegacyMigrations =
    process.env.VITEST_USE_LEGACY_MIGRATIONS === "true" ||
    process.env.WEBAPP_TEST_USE_LEGACY_MIGRATIONS === "true";
  const failOnMigrationError =
    process.env.CI === "true" || process.env.VITEST_REQUIRE_DB_MIGRATIONS === "true";
  try {
    if (useLegacyMigrations) {
      execSync("pnpm run migrate:legacy", {
        encoding: "utf-8",
        cwd: __dirname,
        env: {
          ...process.env,
          DATABASE_URL: dbUrl,
          WEBAPP_LEGACY_MIGRATIONS_MODE: "bootstrap",
        },
      });
    }
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
