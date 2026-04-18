#!/usr/bin/env node
/**
 * Canonical webapp DB migration entrypoint (used by `pnpm run migrate`).
 * Runs Drizzle migrations from `db/drizzle-migrations` via `drizzle-kit migrate`.
 *
 * Legacy SQL under `apps/webapp/migrations/` is not executed here; use `pnpm run migrate:legacy`
 * when you still need that path (e.g. fresh DB bootstrap before Drizzle was consolidated).
 *
 * Requires DATABASE_URL (from env or `.env.dev` / `.env` in apps/webapp).
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappRoot = path.join(__dirname, "..");

config({ path: path.join(webappRoot, ".env.dev") });
config({ path: path.join(webappRoot, ".env") });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("[migrate] DATABASE_URL is not set (export it or use apps/webapp/.env.dev / .env)");
  process.exit(1);
}

const result = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
  cwd: webappRoot,
  stdio: "inherit",
  env: process.env,
  shell: false,
});

const code = typeof result.status === "number" ? result.status : 1;
if (code !== 0) {
  console.error(`
[migrate] Drizzle migration failed (exit ${code}).

If tables already exist but drizzle.__drizzle_migrations is empty (DDL applied outside drizzle-kit), repair metadata only:
  pnpm --dir apps/webapp run db:seed-drizzle-meta
  pnpm --dir apps/webapp run migrate

If you need legacy SQL from apps/webapp/migrations (older bootstrap), run after fixing Drizzle state:
  pnpm --dir apps/webapp run migrate:legacy
`);
}
process.exit(code);
