import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

/**
 * Load order matches `src/config/loadEnv.ts`: `.env.dev` then `.env` override.
 * Canonical runtime validation of env (including `DATABASE_URL`) lives in `src/config/env.ts`
 * after `loadEnv`; this file only mirrors file loading for drizzle-kit CLI (no Zod).
 */
config({ path: path.resolve(process.cwd(), ".env.dev") });
config();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required for drizzle-kit (set in apps/webapp/.env.dev or .env)",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema",
  out: "./db/drizzle-migrations",
  dbCredentials: {
    url: databaseUrl,
  },
});
