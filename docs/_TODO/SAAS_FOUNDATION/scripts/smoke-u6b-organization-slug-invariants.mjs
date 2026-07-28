#!/usr/bin/env node

/**
 * U6B executable slug-ownership proof. It starts a disposable PostgreSQL 16 cluster below /tmp,
 * applies the complete 0218 -> 0255 -> 0257 migration stack, then proves the owner rule:
 * a clinic can reclaim its own former slug, while another clinic can never take it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const pgBin = "/usr/lib/postgresql/16/bin";
const migrations = [
  "apps/webapp/db/drizzle-migrations/0218_u6b_organization_slug_claims.sql",
  "apps/webapp/db/drizzle-migrations/0255_organization_slug_same_org_reclaim.sql",
  "apps/webapp/db/drizzle-migrations/0257_specialist_signup_slug_reservation.sql",
];
const stamp = `${process.pid}_${Date.now()}`;
const scratchDir = mkdtempSync(`/tmp/bcb_u6b_slug_invariants_${stamp}_`);
const dataDir = path.join(scratchDir, "data");
const socketDir = path.join(scratchDir, "socket");
const logPath = path.join(scratchDir, "postgres.log");
const dbName = `bcb_saas_u6b_slug_scratch_${stamp}`;
const safeEnv = { LANG: "C", LC_ALL: "C", PATH: `${pgBin}:/usr/bin:/bin` };
const orgA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orgB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let serverStarted = false;
let port;

function fail(message) {
  throw new Error(`U6B organization slug invariant proof failed: ${message}`);
}

function run(command, args, label, input) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8", env: safeEnv, input });
  if (result.error || result.status !== 0) {
    fail(`${label}: ${result.stderr ?? result.error ?? `exit ${result.status}`}`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function psql(sql, label = "psql") {
  return run(
    path.join(pgBin, "psql"),
    ["-X", "-v", "ON_ERROR_STOP=1", "-h", socketDir, "-p", String(port), "-d", dbName],
    label,
    sql,
  );
}

function expectRejected(sql, message, label) {
  const result = spawnSync(
    path.join(pgBin, "psql"),
    ["-X", "-v", "ON_ERROR_STOP=1", "-h", socketDir, "-p", String(port), "-d", dbName],
    { cwd: repoRoot, encoding: "utf8", env: safeEnv, input: sql },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.error || result.status === 0 || !output.includes(message)) {
    fail(`${label}: expected rejection containing ${message}; got ${output}`);
  }
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") fail("private port reservation failed");
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

try {
  if (!existsSync(path.join(pgBin, "initdb"))) fail("PostgreSQL 16 binaries are unavailable");
  port = await reservePort();
  mkdirSync(socketDir, { recursive: true });
  run(path.join(pgBin, "initdb"), ["-D", dataDir, "-A", "trust", "--no-locale"], "private initdb");
  run(
    path.join(pgBin, "pg_ctl"),
    ["-D", dataDir, "-l", logPath, "-o", `-k ${socketDir} -p ${port} -c listen_addresses=''`, "-w", "start"],
    "private PostgreSQL startup",
  );
  serverStarted = true;
  run(path.join(pgBin, "createdb"), ["-h", socketDir, "-p", String(port), dbName], "private database creation");

  psql(`
    CREATE EXTENSION pgcrypto;
    CREATE SCHEMA app;
    CREATE ROLE app_staff;
    CREATE FUNCTION app.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION app.require_staff_security_self_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.be_organizations (id uuid PRIMARY KEY);
    CREATE TABLE public.platform_users (id uuid PRIMARY KEY);
    CREATE TABLE public.specialist_signup_intents (id uuid PRIMARY KEY, user_id uuid NOT NULL, status text NOT NULL);
    CREATE TABLE public.clinic_public_directory_entries (
      organization_id uuid PRIMARY KEY REFERENCES public.be_organizations(id),
      slug text NOT NULL UNIQUE,
      is_published boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.be_organizations (id) VALUES ('${orgA}'), ('${orgB}');
    INSERT INTO public.clinic_public_directory_entries (organization_id, slug) VALUES ('${orgA}', 'clinic-old');
  `, "schema setup");
  for (const migration of migrations) psql(readFileSync(path.join(repoRoot, migration), "utf8"), `apply ${migration}`);

  psql(`
    BEGIN;
    UPDATE public.organization_slug_claims SET slug = 'clinic-new'
      WHERE organization_id = '${orgA}' AND kind = 'current';
    UPDATE public.clinic_public_directory_entries SET slug = 'clinic-new' WHERE organization_id = '${orgA}';
    INSERT INTO public.organization_slug_claims (slug, kind, organization_id) VALUES ('clinic-old', 'alias', '${orgA}');
    INSERT INTO public.organization_slug_rename_events (organization_id, previous_slug, next_slug)
      VALUES ('${orgA}', 'clinic-old', 'clinic-new');
    COMMIT;
  `, "rename clinic A to clinic-new");

  // §12: the original organization may swap its current slug back to its own retained alias.
  psql(`
    BEGIN;
    UPDATE public.organization_slug_claims SET kind = 'alias'
      WHERE organization_id = '${orgA}' AND kind = 'current' AND slug = 'clinic-new';
    UPDATE public.organization_slug_claims SET kind = 'current'
      WHERE organization_id = '${orgA}' AND kind = 'alias' AND slug = 'clinic-old';
    UPDATE public.clinic_public_directory_entries SET slug = 'clinic-old' WHERE organization_id = '${orgA}';
    INSERT INTO public.organization_slug_rename_events (organization_id, previous_slug, next_slug)
      VALUES ('${orgA}', 'clinic-new', 'clinic-old');
    COMMIT;
    SELECT 1 / (count(*) = 1)::int FROM public.organization_slug_claims
      WHERE organization_id = '${orgA}' AND kind = 'current' AND slug = 'clinic-old';
  `, "same-organization reclaim");
  console.log("smoke-u6b: same organization reclaim: OK");

  // §12: the durable alias/current claim remains globally unique, so a different organization cannot take it.
  expectRejected(
    `INSERT INTO public.organization_slug_claims (slug, kind, organization_id) VALUES ('clinic-new', 'reservation', '${orgB}');`,
    "duplicate key value violates unique constraint \"uq_organization_slug_claims_slug\"",
    "other-organization claim",
  );
  console.log("smoke-u6b: other organization claim: rejected as required");
} finally {
  if (serverStarted) {
    spawnSync(path.join(pgBin, "pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"], { encoding: "utf8", env: safeEnv });
  }
  rmSync(scratchDir, { recursive: true, force: true });
}

console.log("smoke-u6b-organization-slug-invariants: OK (private scratch cluster removed)");
