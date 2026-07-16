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

function redactMigrationDiagnostic(line) {
  return line
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/((?:failed\s+)?query\s*:).*/i, "$1 [redacted]")
    .replace(/((?:params?|values?)\s*:).*/i, "$1 [redacted]")
    .replace(/(Key\s*\([^)]*\)\s*=\s*)\([^)]*\)/gi, "$1([redacted])")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-db-url]")
    .replace(/\b([A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*\S+/gi, "$1=[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\+\d{7,15}\b/g, "[redacted-phone]")
    .slice(0, 600);
}

export function sanitizeMigrationFailureOutput(raw) {
  const safe = [];
  for (const original of String(raw ?? "").split(/\r?\n/)) {
    const line = original.trim();
    if (!line) continue;
    if (/^(?:failed\s+)?query\s*:/i.test(line)) {
      safe.push("query: [redacted]");
      continue;
    }
    if (/^(?:params?|values?)\s*:/i.test(line)) {
      safe.push("params: [redacted]");
      continue;
    }
    if (/^(?:detail|hint)\s*:/i.test(line)) {
      safe.push(`${line.split(":", 1)[0].toLowerCase()}: [redacted]`);
      continue;
    }
    if (/(?:error|cause|severity|code|sqlstate|detail|hint|message|permission|must be member)/i.test(line)) {
      safe.push(redactMigrationDiagnostic(line));
    }
    if (safe.length >= 16) break;
  }
  return [...new Set(safe)];
}

if (process.argv.includes("--self-test")) {
  const sample = [
    "PostgresError: must be member of role app_owner",
    "code: 42501",
    "Error: Failed query: INSERT INTO private_table VALUES ('TOP_SECRET')",
    "params: +79991234567 user@example.test",
    "detail: Key (token)=(hidden-query-value) already exists",
    "DATABASE_URL=postgres://user:password@example.test/private",
    "AUTH_TOKEN=raw-token-value",
  ].join("\n");
  const rendered = sanitizeMigrationFailureOutput(sample).join("\n");
  if (!rendered.includes("must be member of role app_owner") || !rendered.includes("42501")) {
    throw new Error("migration diagnostic self-test lost the DB error or SQLSTATE");
  }
  for (const forbidden of ["TOP_SECRET", "INSERT INTO", "+79991234567", "user@example.test", "hidden-query-value", "raw-token-value", "postgres://"]) {
    if (rendered.includes(forbidden)) throw new Error(`migration diagnostic self-test leaked ${forbidden}`);
  }
  console.log("run-webapp-drizzle-migrate diagnostic self-test: OK");
  process.exit(0);
}

config({ path: path.join(webappRoot, ".env.dev") });
config({ path: path.join(webappRoot, ".env") });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("[migrate] DATABASE_URL is not set (export it or use apps/webapp/.env.dev / .env)");
  process.exit(1);
}

const result = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
  cwd: webappRoot,
  stdio: ["inherit", "pipe", "pipe"],
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024,
  env: process.env,
  shell: false,
});

const code = typeof result.status === "number" ? result.status : 1;
if (code === 0) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}
if (code !== 0) {
  const diagnostics = sanitizeMigrationFailureOutput(
    `${result.stderr ?? ""}\n${result.stdout ?? ""}\n${result.error?.message ?? ""}`,
  );
  if (diagnostics.length > 0) {
    console.error("[migrate] Sanitized underlying diagnostics (query values redacted):");
    for (const line of diagnostics) console.error(`[migrate] ${line}`);
  } else {
    console.error("[migrate] Underlying migration process returned no safe diagnostic details.");
  }
  console.error(`
[migrate] Drizzle migration failed (exit ${code}).

If tables already exist but drizzle.__drizzle_migrations is empty (DDL applied outside drizzle-kit), repair metadata only:
  pnpm --dir apps/webapp run db:seed-drizzle-meta
  pnpm --dir apps/webapp run migrate

If you need legacy SQL from apps/webapp/migrations (emergency/bootstrap only), run explicitly:
  WEBAPP_LEGACY_MIGRATIONS_MODE=bootstrap pnpm --dir apps/webapp run migrate:legacy
`);
}
process.exit(code);
