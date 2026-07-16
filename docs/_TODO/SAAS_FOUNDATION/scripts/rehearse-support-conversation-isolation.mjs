#!/usr/bin/env node
/** Disposable PostgreSQL 16 + FORCE-RLS proof; never opens dev/test/prod. */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..");
const pgBin = "/usr/lib/postgresql/16/bin";
const stamp = `${process.pid}_${randomBytes(4).toString("hex")}`;
const root = `/tmp/bcb_support_conversation_scratch_${stamp}`;
const data = path.join(root, "data");
const socket = path.join(root, "socket");
const port = String(56432 + (process.pid % 700));
let started = false;

function run(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, PGHOST: socket, PGPORT: port, PGUSER: "postgres" },
    input,
    stdio: input === undefined ? "inherit" : ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} failed with status ${result.status ?? "unknown"}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

function assertRepositoryContract() {
  const source = readFileSync(
    path.join(repoRoot, "apps/webapp/src/infra/repos/pgSupportCommunication.ts"),
    "utf8",
  );
  for (const fragment of [
    "webappOrganizationConversationId(principalOrganizationId, platformUserId)",
    "WHERE organization_id = $1::uuid",
    "if (getCurrentDbPrincipalOrganizationId())",
  ]) {
    if (!source.includes(fragment)) throw new Error(`repository contract missing: ${fragment}`);
  }
}

const sql = String.raw`
\set ON_ERROR_STOP on
CREATE ROLE app_owner NOLOGIN NOBYPASSRLS;
CREATE ROLE app_staff LOGIN NOBYPASSRLS;
CREATE SCHEMA app AUTHORIZATION app_owner;
SET ROLE app_owner;
CREATE TABLE app.principal_context (backend_pid integer PRIMARY KEY, organization_id uuid NOT NULL);
REVOKE ALL ON app.principal_context FROM PUBLIC;
CREATE FUNCTION app.current_organization_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, app
AS 'SELECT organization_id FROM app.principal_context WHERE backend_pid = pg_backend_pid()';
REVOKE ALL ON FUNCTION app.current_organization_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_organization_id() TO app_staff;
CREATE TABLE app.support_conversations (
  id uuid PRIMARY KEY,
  integrator_conversation_id text NOT NULL UNIQUE,
  platform_user_id uuid NOT NULL,
  organization_id uuid,
  source text NOT NULL,
  admin_scope text NOT NULL,
  status text NOT NULL DEFAULT 'open'
);
ALTER TABLE app.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.support_conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY support_org_wall ON app.support_conversations FOR ALL TO app_staff
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
GRANT USAGE ON SCHEMA app TO app_staff;
GRANT SELECT, INSERT, UPDATE ON app.support_conversations TO app_staff;
CREATE FUNCTION app.ensure_support(p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, app AS $fn$
DECLARE v_org uuid := app.current_organization_id(); v_id uuid; v_key text;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'missing organization principal'; END IF;
  v_key := 'webapp:organization:' || v_org || ':platform:' || p_user;
  SELECT id INTO v_id FROM app.support_conversations
  WHERE organization_id = v_org AND platform_user_id = p_user
    AND source = 'webapp' AND admin_scope = 'support'
  ORDER BY (integrator_conversation_id = v_key) DESC LIMIT 1;
  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO app.support_conversations
      (id, integrator_conversation_id, platform_user_id, organization_id, source, admin_scope)
    VALUES (v_id, v_key, p_user, v_org, 'webapp', 'support');
  END IF;
  RETURN v_id;
END $fn$;
GRANT EXECUTE ON FUNCTION app.ensure_support(uuid) TO app_staff;
RESET ROLE;
DO $p$ BEGIN
  IF has_table_privilege('app_staff', 'app.principal_context', 'INSERT') THEN
    RAISE EXCEPTION 'app_staff can forge principal context';
  END IF;
END $p$;

-- Clinic A legacy row for a patient shared with Clinic B.
INSERT INTO app.principal_context VALUES (pg_backend_pid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SET ROLE app_staff;
INSERT INTO app.support_conversations VALUES (
  'aaaaaaaa-0000-4000-8000-000000000001',
  'webapp:platform:99999999-9999-4999-8999-999999999999',
  '99999999-9999-4999-8999-999999999999',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'webapp', 'support', 'open');
RESET ROLE;

-- B cannot see A; B gets one scoped row and repeat ensure is idempotent.
UPDATE app.principal_context SET organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE app_staff;
DO $p$ DECLARE first_id uuid; second_id uuid; BEGIN
  IF (SELECT count(*) FROM app.support_conversations) <> 0 THEN RAISE EXCEPTION 'B sees A'; END IF;
  first_id := app.ensure_support('99999999-9999-4999-8999-999999999999');
  second_id := app.ensure_support('99999999-9999-4999-8999-999999999999');
  IF first_id <> second_id OR (SELECT count(*) FROM app.support_conversations) <> 1 THEN
    RAISE EXCEPTION 'B ensure is not idempotent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.support_conversations WHERE integrator_conversation_id =
    'webapp:organization:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:platform:99999999-9999-4999-8999-999999999999')
  THEN RAISE EXCEPTION 'B scoped row missing'; END IF;
END $p$;
RESET ROLE;

-- A still sees/reuses only its legacy row; no global merge absorbed B.
UPDATE app.principal_context SET organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE app_staff;
DO $p$ DECLARE ensured uuid; BEGIN
  ensured := app.ensure_support('99999999-9999-4999-8999-999999999999');
  IF ensured <> 'aaaaaaaa-0000-4000-8000-000000000001'::uuid THEN RAISE EXCEPTION 'A legacy not reused'; END IF;
  IF (SELECT count(*) FROM app.support_conversations) <> 1 THEN RAISE EXCEPTION 'A sees B'; END IF;
END $p$;
RESET ROLE;

-- Superuser audit is used only to inspect the final cross-tenant state.
DO $p$ BEGIN
  IF (SELECT count(*) FROM app.support_conversations) <> 2 THEN RAISE EXCEPTION 'expected A+B rows'; END IF;
  IF EXISTS (SELECT 1 FROM app.support_conversations WHERE organization_id IS NULL OR status <> 'open') THEN
    RAISE EXCEPTION 'global row or merge side effect found';
  END IF;
END $p$;
SELECT 'PASS: FORCE-RLS shared-patient support isolation' AS result;
`;

try {
  assertRepositoryContract();
  run("mkdir", ["-p", root, socket]);
  run(path.join(pgBin, "initdb"), ["-D", data, "-A", "trust", "-U", "postgres", "--no-locale"]);
  run(path.join(pgBin, "pg_ctl"), ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-w", "start"]);
  started = true;
  run(path.join(pgBin, "psql"), ["-d", "postgres", "-X"], sql);
} finally {
  if (started) {
    spawnSync(path.join(pgBin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], { stdio: "inherit" });
  }
  rmSync(root, { recursive: true, force: true });
}
