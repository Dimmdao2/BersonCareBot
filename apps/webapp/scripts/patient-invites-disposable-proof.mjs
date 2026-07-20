#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pgBin = "/usr/lib/postgresql/16/bin";
const stamp = `${process.pid}_${randomBytes(4).toString("hex")}`;
const dbName = `bcb_saas_patient_invite_scratch_${stamp}`;
const root = `/tmp/${dbName}_pg`;
const data = path.join(root, "data");
const socket = path.join(root, "socket");
const port = String(56000 + Number.parseInt(randomBytes(2).toString("hex"), 16) % 7000);
const migration = path.join(repoRoot, "apps/webapp/db/drizzle-migrations/0220_patient_portal_invites.sql");
const overlay = path.join(repoRoot, "deploy/postgres/patient-invites-rls.sql");
const { Client } = createRequire(path.join(repoRoot, "apps/webapp/package.json"))("pg");

const orgA = "10000000-0000-4000-8000-000000000001";
const orgB = "10000000-0000-4000-8000-000000000002";
const patientA = "20000000-0000-4000-8000-000000000001";
const patientB = "20000000-0000-4000-8000-000000000002";
const staff = "30000000-0000-4000-8000-000000000001";
const enrollmentA = "40000000-0000-4000-8000-000000000001";
const enrollmentB = "40000000-0000-4000-8000-000000000002";
const oldInvite = "50000000-0000-4000-8000-000000000001";
const newInvite = "50000000-0000-4000-8000-000000000002";
const foreignInvite = "50000000-0000-4000-8000-000000000003";
const proofSecret = randomBytes(32).toString("hex");

let started = false;
let cleaning = false;

assertSafeName(dbName);
installSignals();

main().catch((error) => {
  process.stderr.write(`patient-invite-disposable-proof: FAIL: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

async function main() {
  try {
    mkdirSync(data, { recursive: true });
    mkdirSync(socket, { recursive: true });
    run(path.join(pgBin, "initdb"), ["-D", data, "-A", "trust", "--no-locale"]);
    run(path.join(pgBin, "pg_ctl"), [
      "-D", data,
      "-o", `-k ${socket} -p ${port} -c listen_addresses=''`,
      "-w", "start",
    ]);
    started = true;
    run(path.join(pgBin, "createdb"), ["-h", socket, "-p", port, dbName]);

    psql(setupSql());
    psqlFile(migration);
    psqlFile(overlay);
    psql(seedAndReissueSql());

    const admin = client();
    await admin.connect();
    try {
      await proveForwardState(admin);
      await proveBearerAndProof(admin);
      await proveConcurrentRedeem();
      await proveStaffCrossOrg(admin);
      await proveAclAndForce(admin);
      await proveRollback(admin);
    } finally {
      await admin.end();
    }
    process.stdout.write("patient-invite-disposable-proof: PASS (forward, rollback, reissue, single-use, cross-org, concurrent redeem, ACL/FORCE)\n");
  } finally {
    cleanup();
  }
}

function assertSafeName(name) {
  if (!/^bcb_saas_[a-z0-9_]+_scratch_[a-z0-9_]+$/.test(name)) {
    throw new Error(`unsafe disposable name: ${name}`);
  }
  if (/(^|_)(prod|production|test|testing|dev|development)(_|$)/.test(name)) {
    throw new Error(`runtime-shaped disposable name: ${name}`);
  }
}

function sanitizedEnv() {
  const env = { ...process.env };
  for (const key of [
    "DATABASE_URL", "PGDATABASE", "PGHOST", "PGOPTIONS", "PGPASSWORD", "PGPASSFILE",
    "PGPORT", "PGSERVICE", "PGSERVICEFILE", "PGUSER", "SUPERUSER_URL",
  ]) delete env[key];
  return env;
}

function run(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: sanitizedEnv(),
    encoding: "utf8",
    input,
    stdio: input == null ? "ignore" : ["pipe", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || result.error?.message || "unknown";
    throw new Error(`${path.basename(command)} failed: ${detail}`);
  }
}

function safeRun(command, args, input) {
  spawnSync(command, args, {
    cwd: repoRoot,
    env: sanitizedEnv(),
    encoding: "utf8",
    input,
    stdio: "ignore",
  });
}

function psql(sql) {
  run(path.join(pgBin, "psql"), ["-h", socket, "-p", port, "-d", dbName, "-X", "-v", "ON_ERROR_STOP=1"], sql);
}

function psqlFile(file) {
  run(path.join(pgBin, "psql"), ["-h", socket, "-p", port, "-d", dbName, "-X", "-v", "ON_ERROR_STOP=1", "-f", file]);
}

function client() {
  return new Client({ host: socket, port: Number(port), database: dbName });
}

function setupSql() {
  return `
CREATE ROLE app_owner NOLOGIN BYPASSRLS;
CREATE ROLE app_staff NOLOGIN NOBYPASSRLS;
CREATE ROLE app_patient NOLOGIN NOBYPASSRLS;
CREATE SCHEMA app_ext;
CREATE EXTENSION pgcrypto WITH SCHEMA app_ext;
CREATE SCHEMA app AUTHORIZATION app_owner;
GRANT USAGE ON SCHEMA app_ext TO app_owner;
CREATE FUNCTION app.is_staff() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.staff', true) = '1'
$$;
CREATE FUNCTION app.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.org', true), '')::uuid
$$;
CREATE TABLE app.context_signing_secrets (
  id boolean PRIMARY KEY DEFAULT true CHECK(id), secret text NOT NULL
);
ALTER TABLE app.context_signing_secrets OWNER TO app_owner;
INSERT INTO app.context_signing_secrets(id,secret) VALUES(true,'${proofSecret}');
CREATE TABLE app.patient_proof_principals (backend_pid integer PRIMARY KEY, patient_user_id uuid NOT NULL);
ALTER TABLE app.patient_proof_principals OWNER TO app_owner;
CREATE FUNCTION app.current_patient_user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog AS $$
  SELECT patient_user_id FROM app.patient_proof_principals WHERE backend_pid=pg_backend_pid()
$$;
ALTER FUNCTION app.current_patient_user_id() OWNER TO app_owner;
REVOKE ALL ON TABLE app.context_signing_secrets, app.patient_proof_principals FROM PUBLIC, app_staff, app_patient;
GRANT USAGE ON SCHEMA app, app_ext TO app_staff, app_patient;
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO app_patient;
CREATE TABLE public.be_organizations (
  id uuid PRIMARY KEY, title text NOT NULL, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY, role text NOT NULL, merged_into_id uuid,
  email_normalized text, email_verified_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.org_enrollments (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.be_organizations(id),
  platform_user_id uuid NOT NULL REFERENCES public.platform_users(id), status text NOT NULL
);
CREATE TABLE public.patient_merge_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
  anchor_user_id uuid NOT NULL, candidate_user_id uuid NOT NULL, reason text NOT NULL,
  status text NOT NULL, payload jsonb NOT NULL
);
CREATE UNIQUE INDEX patient_merge_candidates_pending_key
  ON public.patient_merge_candidates(anchor_user_id, candidate_user_id) WHERE status = 'pending';
`;
}

function seedAndReissueSql() {
  return `
INSERT INTO public.be_organizations(id,title,is_active) VALUES
  ('${orgA}','Org A',true), ('${orgB}','Org B',true);
INSERT INTO public.platform_users(id,role,email_normalized) VALUES
  ('${patientA}','client','patient-a@example.test'),
  ('${patientB}','client','patient-b@example.test'),
  ('${staff}','doctor','staff@example.test');
INSERT INTO public.org_enrollments(id,organization_id,platform_user_id,status) VALUES
  ('${enrollmentA}','${orgA}','${patientA}','active'),
  ('${enrollmentB}','${orgB}','${patientB}','invited');
INSERT INTO public.patient_invites(
  id, organization_id, patient_user_id, enrollment_id, token_hash, created_by_platform_user_id,
  invited_email_normalized, expires_at
) VALUES (
  '${oldInvite}','${orgA}','${patientA}','${enrollmentA}','old-token','${staff}',
  'patient-a@example.test',now()+interval '1 day'
);
UPDATE public.patient_invites SET status='superseded', superseded_by_invite_id=NULL WHERE id='${oldInvite}';
INSERT INTO public.patient_invites(
  id, organization_id, patient_user_id, enrollment_id, token_hash, created_by_platform_user_id,
  invited_email_normalized, expires_at
) VALUES (
  '${newInvite}','${orgA}','${patientA}','${enrollmentA}','new-token','${staff}',
  'patient-a@example.test',now()+interval '1 day'
);
UPDATE public.patient_invites SET superseded_by_invite_id='${newInvite}' WHERE id='${oldInvite}';
INSERT INTO public.patient_invites(
  id, organization_id, patient_user_id, enrollment_id, token_hash, created_by_platform_user_id,
  invited_email_normalized, expires_at
) VALUES (
  '${foreignInvite}','${orgB}','${patientB}','${enrollmentB}','foreign-token','${staff}',
  'patient-b@example.test',now()+interval '1 day'
);
`;
}

async function proveForwardState(db) {
  const result = await db.query(`
    SELECT enrollment.portal_activated_at, old.superseded_by_invite_id
    FROM public.org_enrollments enrollment
    JOIN public.patient_invites old ON old.id=$1
    WHERE enrollment.id=$2
  `, [oldInvite, enrollmentA]);
  assert(result.rows[0]?.portal_activated_at == null, "legacy active relationship was guessed as portal-linked");
  assert(result.rows[0]?.superseded_by_invite_id === newInvite, "replacement FK was not linked after insert");
}

async function proveBearerAndProof(db) {
  const first = await db.query("SELECT * FROM app.exchange_patient_invite($1,$2,now()+interval '10 min')", ["new-token", "continuation-a"]);
  assert(first.rows[0]?.ok === true, "first bearer exchange failed");
  const replay = await db.query("SELECT * FROM app.exchange_patient_invite($1,$2,now()+interval '10 min')", ["new-token", "continuation-b"]);
  assert(replay.rows[0]?.ok === false && replay.rows[0]?.code === "exchanged_token", "bearer replay was accepted");
  const proofExpiresEpoch = Math.floor(Date.now() / 1000) + 600;
  const proofExpiresAt = new Date(proofExpiresEpoch * 1000).toISOString();
  const startAuth = proofAuthorization("start", "continuation-a", "patient-a@example.test", "proof-hash", proofExpiresEpoch);
  const started = await db.query("SELECT * FROM app.start_patient_invite_email_proof($1,$2,$3,$4,$5,$6,$7)", ["continuation-a", "patient-a@example.test", "proof-hash", proofExpiresAt, startAuth.nonce, startAuth.expiresEpoch, startAuth.signature]);
  assert(started.rows[0]?.ok === true, "purpose proof start failed");
  const cooldown = await db.query("SELECT * FROM app.start_patient_invite_email_proof($1,$2,$3,$4,$5,$6,$7)", ["continuation-a", "patient-a@example.test", "proof-hash", proofExpiresAt, startAuth.nonce, startAuth.expiresEpoch, startAuth.signature]);
  assert(cooldown.rows[0]?.ok === false && cooldown.rows[0]?.code === "rate_limited", "proof resend cooldown was bypassed");
  const forged = await db.query("SELECT * FROM app.verify_patient_invite_email_proof($1,$2,$3,$4,$5,$6)", ["continuation-a", "patient-a@example.test", "proof-hash", randomUUID(), Math.floor(Date.now() / 1000) + 60, "0".repeat(64)]);
  assert(forged.rows[0]?.ok === false, "direct verify bypassed the signed proof receipt");
  const verifyAuth = proofAuthorization("verify", "continuation-a", "patient-a@example.test", "proof-hash", null);
  const verified = await db.query("SELECT * FROM app.verify_patient_invite_email_proof($1,$2,$3,$4,$5,$6)", ["continuation-a", "patient-a@example.test", "proof-hash", verifyAuth.nonce, verifyAuth.expiresEpoch, verifyAuth.signature]);
  assert(verified.rows[0]?.ok === true, "purpose proof verify failed");
}

async function proveConcurrentRedeem() {
  const first = client();
  const second = client();
  await Promise.all([first.connect(), second.connect()]);
  try {
    const [firstPid, secondPid] = await Promise.all([
      first.query("SELECT pg_backend_pid() AS pid"),
      second.query("SELECT pg_backend_pid() AS pid"),
    ]);
    const admin = client();
    await admin.connect();
    try {
      await admin.query("INSERT INTO app.patient_proof_principals(backend_pid,patient_user_id) VALUES($1,$3),($2,$3)", [firstPid.rows[0].pid, secondPid.rows[0].pid, patientA]);
    } finally {
      await admin.end();
    }
    await Promise.all([first.query("SET ROLE app_patient"), second.query("SET ROLE app_patient")]);
    const results = await Promise.all([
      first.query("SELECT * FROM app.redeem_patient_invite_email($1)", ["continuation-a"]),
      second.query("SELECT * FROM app.redeem_patient_invite_email($1)", ["continuation-a"]),
    ]);
    const rows = results.map((result) => result.rows[0]);
    assert(rows.filter((row) => row?.ok === true).length === 1, "concurrent redeem did not have one winner");
    assert(rows.filter((row) => row?.ok === false && row?.code === "already_linked").length === 1, "concurrent loser was not terminal");
  } finally {
    await Promise.all([first.end(), second.end()]);
  }
}

async function proveStaffCrossOrg(db) {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL ROLE app_staff");
    await db.query("SELECT set_config('app.staff','1',true), set_config('app.org',$1,true)", [orgA]);
    const result = await db.query("SELECT count(*)::int AS count FROM public.patient_invites WHERE organization_id=$1", [orgB]);
    assert(result.rows[0]?.count === 0, "staff RLS exposed a foreign organization invite");
  } finally {
    await db.query("ROLLBACK");
  }
}

async function proveAclAndForce(db) {
  const result = await db.query(`
    SELECT c.relrowsecurity, c.relforcerowsecurity,
      has_table_privilege('app_patient','public.patient_invites','SELECT') AS patient_select,
      has_function_privilege('app_patient','app.redeem_patient_invite_email(text)','EXECUTE') AS patient_redeem,
      pg_get_userbyid(p.proowner) AS function_owner
    FROM pg_class c
    JOIN pg_proc p ON p.oid='app.redeem_patient_invite_email(text)'::regprocedure
    WHERE c.oid='public.patient_invites'::regclass
  `);
  const row = result.rows[0];
  assert(row?.relrowsecurity && row?.relforcerowsecurity, "RLS/FORCE is not active");
  assert(row?.patient_select === false && row?.patient_redeem === true, "patient ACL boundary is wrong");
  assert(row?.function_owner === "app_owner", "redeem function owner is not app_owner");
}

async function proveRollback(db) {
  await db.query(`
    DROP FUNCTION app.exchange_patient_invite(text,text,timestamptz);
    DROP FUNCTION app.lookup_patient_invite_continuation(text);
    DROP FUNCTION app.start_patient_invite_email_proof(text,text,text,timestamptz,text,bigint,text);
    DROP FUNCTION app.cancel_patient_invite_email_proof(text,text);
    DROP FUNCTION app.verify_patient_invite_email_proof(text,text,text,text,bigint,text);
    DROP FUNCTION app.redeem_patient_invite_email(text);
    DROP TABLE public.patient_invites;
    ALTER TABLE public.org_enrollments DROP CONSTRAINT org_enrollments_portal_activation_check;
    ALTER TABLE public.org_enrollments DROP COLUMN portal_activated_via, DROP COLUMN portal_activated_at;
  `);
  const result = await db.query(`
    SELECT to_regclass('public.patient_invites') IS NULL AS table_gone,
      NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='org_enrollments' AND column_name='portal_activated_at'
      ) AS columns_gone
  `);
  assert(result.rows[0]?.table_gone && result.rows[0]?.columns_gone, "rollback proof failed");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function proofAuthorization(action, continuationHash, email, codeHash, proofExpiresEpoch) {
  const nonce = randomUUID();
  const expiresEpoch = Math.floor(Date.now() / 1000) + 60;
  const canonical = [
    "patient-invite-proof", "v1", action, nonce, String(expiresEpoch), continuationHash,
    email, codeHash, proofExpiresEpoch == null ? "" : String(proofExpiresEpoch),
  ].join("|");
  return {
    nonce,
    expiresEpoch,
    signature: createHmac("sha256", proofSecret).update(canonical).digest("hex"),
  };
}

function cleanup() {
  if (cleaning) return;
  cleaning = true;
  if (started) safeRun(path.join(pgBin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"]);
  if (root.startsWith("/tmp/bcb_saas_patient_invite_scratch_")) rmSync(root, { recursive: true, force: true });
}

function installSignals() {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      cleanup();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}
