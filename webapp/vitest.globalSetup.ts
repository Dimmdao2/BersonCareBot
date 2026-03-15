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
  config({ path: path.join(__dirname, ".env") });
  if (!process.env.DATABASE_URL) {
    config({ path: path.join(__dirname, ".env.dev") });
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl === "") {
    return;
  }
  try {
    execSync("node scripts/run-migrations.mjs", {
      encoding: "utf-8",
      cwd: __dirname,
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
  } catch (e) {
    console.warn("vitest globalSetup: migrations failed (DB may be down). Tests may use in-memory.", e);
  }
}
