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

const OBJECT_CONFLICT_SQLSTATES = new Set(["23505", "42701", "42710", "42P06", "42P07"]);
const SCHEMA_MISMATCH_SQLSTATES = new Set(["3F000", "42703", "42883", "42P01"]);

function extractLabeledSqlstate(raw) {
  for (const line of String(raw ?? "").split(/\r?\n/)) {
    const match = line.match(
      /^\s*["']?(?:sqlstate|code)["']?\s*[:=]\s*["']?([0-9A-Z]{5})["']?\s*,?\s*$/i,
    );
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

function hasExactRoleMembershipError(raw) {
  return /(?:^|\n)(?:PostgresError|error):\s*must be member of role(?:\s+"?[a-z_][a-z0-9_]*"?)?\s*(?:\n|$)/im.test(
    String(raw ?? ""),
  );
}

export function classifyMigrationFailureOutput(raw) {
  const sqlstate = extractLabeledSqlstate(raw);
  let reason = "migration_failed";
  if (sqlstate === "42501") {
    reason = hasExactRoleMembershipError(raw) ? "role_membership_required" : "permission_denied";
  } else if (sqlstate === "28000" || sqlstate === "28P01") {
    reason = "permission_denied";
  } else if (sqlstate && OBJECT_CONFLICT_SQLSTATES.has(sqlstate)) {
    reason = "object_conflict";
  } else if (sqlstate && SCHEMA_MISMATCH_SQLSTATES.has(sqlstate)) {
    reason = "schema_mismatch";
  }
  return { reason, sqlstate };
}

export function renderMigrationFailureDiagnostic(raw) {
  const diagnostic = classifyMigrationFailureOutput(raw);
  return `[migrate] failure reason=${diagnostic.reason} sqlstate=${diagnostic.sqlstate ?? "unknown"}`;
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
    "Bearer eyJhbGciOiJIUzI1NiJ9.raw.signature",
    "plain phone 79991234567 and -79991234567",
    "path /opt/private/patient-export.json",
    "uuid 11111111-2222-4333-8444-555555555555",
    "Error\n    at secretStack (/private/source.ts:10:2)",
  ].join("\n");
  const rendered = renderMigrationFailureDiagnostic(sample);
  if (rendered !== "[migrate] failure reason=role_membership_required sqlstate=42501") {
    throw new Error("migration diagnostic self-test lost the allowlisted category or SQLSTATE");
  }
  for (const forbidden of [
    "TOP_SECRET", "INSERT INTO", "+79991234567", "79991234567", "user@example.test",
    "hidden-query-value", "raw-token-value", "postgres://", "eyJhbGci", "/opt/private",
    "11111111-2222-4333-8444-555555555555", "secretStack", "app_owner",
  ]) {
    if (rendered.includes(forbidden)) throw new Error(`migration diagnostic self-test leaked ${forbidden}`);
  }
  if (renderMigrationFailureDiagnostic("code: 42501\ndetail: arbitrary") !== "[migrate] failure reason=permission_denied sqlstate=42501") {
    throw new Error("migration diagnostic self-test failed permission classification");
  }
  if (renderMigrationFailureDiagnostic("unlabeled 42501 and arbitrary text") !== "[migrate] failure reason=migration_failed sqlstate=unknown") {
    throw new Error("migration diagnostic self-test accepted an unlabeled SQLSTATE");
  }
  if (renderMigrationFailureDiagnostic("query: SELECT 'code: 42501'") !== "[migrate] failure reason=migration_failed sqlstate=unknown") {
    throw new Error("migration diagnostic self-test accepted a query-embedded SQLSTATE");
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
  const diagnostic = renderMigrationFailureDiagnostic(
    `${result.stderr ?? ""}\n${result.stdout ?? ""}\n${result.error?.message ?? ""}`,
  );
  console.error(diagnostic);
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
