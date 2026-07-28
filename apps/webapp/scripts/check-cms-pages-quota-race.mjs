#!/usr/bin/env node
/**
 * #1069 executable last-slot proof for cms_pages. It starts a private PostgreSQL 16 cluster below
 * /tmp, extracts the authoritative trigger function from the CMS quota migration, and runs two
 * independent connections against it. It never reads application env files or a configured DB.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { userInfo } from "node:os";
import net from "node:net";
import path from "node:path";
import pg from "pg";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pgBin = "/usr/lib/postgresql/16/bin";
const osUser = userInfo().username;
const migrationDir = path.join(root, "apps/webapp/db/drizzle-migrations");

function fail(message) {
  throw new Error(`CMS pages quota race proof failed: ${message}`);
}

const migrationNames = readdirSync(migrationDir).filter((name) =>
  name.endsWith("_cms_pages_snapshot_quota.sql"),
);
if (migrationNames.length !== 1) {
  fail(`expected exactly one *_cms_pages_snapshot_quota.sql migration, found ${migrationNames.length}`);
}
const migrationPath = path.join(migrationDir, migrationNames[0]);

export function extractQuotaFunction(migration) {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION app.enforce_cms_pages_snapshot_quota()");
  const end = migration.indexOf("ALTER FUNCTION app.enforce_cms_pages_snapshot_quota()", start);
  if (start < 0 || end < 0) {
    fail("could not extract app.enforce_cms_pages_snapshot_quota from the CMS quota migration");
  }
  return migration.slice(start, end);
}

export function extractUsageFunction(migration) {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION app.cms_pages_snapshot_usage(");
  const end = migration.indexOf("ALTER FUNCTION app.cms_pages_snapshot_usage(uuid)", start);
  if (start < 0 || end < 0) {
    fail("could not extract app.cms_pages_snapshot_usage from the CMS quota migration");
  }
  return migration.slice(start, end);
}

function selfTest() {
  const migration = readFileSync(migrationPath, "utf8");
  const functionSql = extractQuotaFunction(migration);
  const usageSql = extractUsageFunction(migration);
  for (const fragment of [
    "current_setting('transaction_isolation') <> 'read committed'",
    "cms_pages_quota_requires_read_committed",
    "pg_advisory_xact_lock",
    "'saas_quota:cms_pages:' || NEW.organization_id::text",
    "existing_page.section = NEW.section",
    "existing_page.slug = NEW.slug",
    "app.cms_pages_snapshot_usage(NEW.organization_id)",
    "saas_quota_reached:cms_pages",
    "(v_count + 1) * 5 >= v_limit * 4",
  ]) {
    if (!functionSql.includes(fragment)) fail(`migration function is missing ${fragment}`);
  }
  if (functionSql.indexOf("pg_advisory_xact_lock") > functionSql.indexOf("app.cms_pages_snapshot_usage(NEW.organization_id)")) {
    fail("migration recount is not ordered after its transaction advisory lock");
  }
  for (const fragment of [
    "FROM public.content_pages",
    "WHERE organization_id = p_organization_id",
  ]) {
    if (!usageSql.includes(fragment)) fail(`migration usage function is missing ${fragment}`);
  }
  for (const fragment of [
    "ALTER FUNCTION app.cms_pages_snapshot_usage(uuid) OWNER TO app_owner",
    "GRANT SELECT ON TABLE public.content_pages TO app_owner",
    "ALTER FUNCTION app.enforce_cms_pages_snapshot_quota() OWNER TO app_owner",
  ]) {
    if (!migration.includes(fragment)) fail(`migration deploy ACL is missing ${fragment}`);
  }
  console.log("CMS pages quota race proof self-test: OK (no PostgreSQL required)");
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(`/tmp/bcb_cms_pages_quota_race_${stamp}_`);
const data = path.join(dir, "data");
const socket = path.join(dir, "socket");
const log = path.join(dir, "postgres.log");
const db = `bcb_cms_pages_quota_race_${stamp}`;
const safeEnv = { LANG: "C", LC_ALL: "C", PATH: `${pgBin}:/usr/bin:/bin` };
let serverStarted = false;
let port;

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", env: safeEnv });
  if (result.error || result.status !== 0) fail(`${label}: ${result.stderr ?? result.error}`);
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

function client() {
  return new pg.Client({ host: socket, port, database: db, user: osUser, ssl: false });
}

async function withClient(fn) {
  const connection = client();
  await connection.connect();
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

async function installSchema() {
  const migration = readFileSync(migrationPath, "utf8");
  const quotaFunction = extractQuotaFunction(migration);
  const usageFunction = extractUsageFunction(migration);
  await withClient(async (connection) => {
    await connection.query(`
      CREATE EXTENSION pgcrypto;
      CREATE SCHEMA app;
      CREATE ROLE app_owner NOLOGIN BYPASSRLS;
      GRANT USAGE, CREATE ON SCHEMA app TO app_owner;
      CREATE TABLE public.be_organizations (
        id uuid PRIMARY KEY,
        tariff_id uuid,
        is_active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE public.saas_tariffs (
        id uuid PRIMARY KEY,
        quotas jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE TABLE public.saas_organization_trials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        tariff_id uuid NOT NULL,
        ends_at timestamptz NOT NULL,
        grace_ends_at timestamptz NOT NULL,
        post_trial_behavior text NOT NULL,
        post_trial_tariff_id uuid,
        status text NOT NULL
      );
      CREATE TABLE public.saas_org_entitlement_overrides (
        organization_id uuid NOT NULL,
        mechanic text NOT NULL,
        quota jsonb,
        expires_at timestamptz,
        PRIMARY KEY (organization_id, mechanic)
      );
      CREATE TABLE public.content_pages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        section text NOT NULL,
        slug text NOT NULL,
        title text NOT NULL,
        deleted_at timestamptz,
        UNIQUE (section, slug)
      );
      GRANT SELECT ON TABLE
        public.be_organizations,
        public.saas_tariffs,
        public.saas_organization_trials,
        public.saas_org_entitlement_overrides,
        public.content_pages
      TO app_owner;
      INSERT INTO public.saas_tariffs (id, quotas) VALUES (
        '10000000-0000-4000-8000-000000000001',
        '{"cms_pages":{"kind":"numeric","limit":1,"unit":"items","period":"snapshot","usagePolicy":"snapshot"}}'
      );
      INSERT INTO public.be_organizations (id, tariff_id) VALUES (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001'
      );
      ${usageFunction}
      ALTER FUNCTION app.cms_pages_snapshot_usage(uuid) OWNER TO app_owner;
      ${quotaFunction}
      ALTER FUNCTION app.enforce_cms_pages_snapshot_quota() OWNER TO app_owner;
      CREATE TRIGGER content_pages_snapshot_quota_guard
        BEFORE INSERT ON public.content_pages
        FOR EACH ROW EXECUTE FUNCTION app.enforce_cms_pages_snapshot_quota();
    `);
  });
}

async function proveLastSlotRace() {
  const first = client();
  const second = client();
  await Promise.all([first.connect(), second.connect()]);
  try {
    await first.query("BEGIN");
    await second.query("BEGIN");
    await first.query(
      "INSERT INTO public.content_pages (organization_id, section, slug, title) VALUES ($1, $2, $3, $4)",
      ["20000000-0000-4000-8000-000000000001", "lessons", "first", "First"],
    );
    const secondInsert = second.query(
      "INSERT INTO public.content_pages (organization_id, section, slug, title) VALUES ($1, $2, $3, $4)",
      ["20000000-0000-4000-8000-000000000001", "lessons", "second", "Second"],
    );
    await first.query("COMMIT");
    await secondInsert.then(
      () => fail("second concurrent last-slot insert unexpectedly succeeded"),
      (error) => {
        if (!String(error.message).includes("saas_quota_reached:cms_pages")) throw error;
      },
    );
    await second.query("ROLLBACK");
    const count = await withClient(async (connection) => {
      const result = await connection.query("SELECT count(*)::int AS count FROM public.content_pages");
      return result.rows[0]?.count;
    });
    if (count !== 1) fail(`expected exactly one committed CMS page, found ${count}`);
  } finally {
    await Promise.allSettled([first.query("ROLLBACK"), second.query("ROLLBACK")]);
    await Promise.all([first.end(), second.end()]);
  }
}

async function proveAtLimitUpsert() {
  await withClient(async (connection) => {
    const result = await connection.query(
      `INSERT INTO public.content_pages (organization_id, section, slug, title)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (section, slug) DO UPDATE SET title = EXCLUDED.title
       RETURNING title`,
      ["20000000-0000-4000-8000-000000000001", "lessons", "first", "Updated"],
    );
    if (result.rows[0]?.title !== "Updated") {
      fail("at-limit upsert did not update the existing CMS page");
    }
    const countResult = await connection.query(
      "SELECT count(*)::int AS count FROM public.content_pages",
    );
    if (countResult.rows[0]?.count !== 1) {
      fail(`at-limit upsert consumed a new slot; found ${countResult.rows[0]?.count} pages`);
    }
  });
}

async function proveRepeatableReadFailsClosed() {
  await withClient(async (connection) => {
    await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    try {
      await connection.query(
        "INSERT INTO public.content_pages (organization_id, section, slug, title) VALUES ($1, $2, $3, $4)",
        ["20000000-0000-4000-8000-000000000001", "lessons", "repeatable-read", "RR"],
      );
      fail("REPEATABLE READ insert unexpectedly bypassed the fail-closed isolation guard");
    } catch (error) {
      if (!String(error.message).includes("cms_pages_quota_requires_read_committed")) {
        throw error;
      }
    } finally {
      await connection.query("ROLLBACK");
    }
  });
}

try {
  if (!existsSync(path.join(pgBin, "initdb"))) fail("PostgreSQL 16 binaries are unavailable");
  port = await reservePort();
  mkdirSync(socket, { recursive: true });
  run(path.join(pgBin, "initdb"), ["-D", data, "-A", "trust", "--no-locale"], "private initdb");
  run(
    path.join(pgBin, "pg_ctl"),
    ["-D", data, "-l", log, "-o", `-k ${socket} -p ${port} -c listen_addresses=''`, "-w", "start"],
    "private PostgreSQL startup",
  );
  serverStarted = true;
  run(
    path.join(pgBin, "createdb"),
    ["-h", socket, "-p", String(port), db],
    "private database creation",
  );
  await installSchema();
  await proveLastSlotRace();
  await proveAtLimitUpsert();
  await proveRepeatableReadFailsClosed();
  console.log(
    "CMS pages quota race proof: OK — owner ACL, final slot, at-limit upsert, and RR fail-closed",
  );
} finally {
  if (serverStarted) {
    spawnSync(
      path.join(pgBin, "pg_ctl"),
      ["-D", data, "-m", "fast", "-w", "stop"],
      { encoding: "utf8", env: safeEnv },
    );
  }
  rmSync(dir, { recursive: true, force: true });
}
