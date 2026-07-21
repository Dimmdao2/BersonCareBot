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
const migrations = [
  "0220_patient_portal_invites.sql",
  "0221_lfk_personal_exercises.sql",
  "0222_patient_invite_unbound_email_claim.sql",
].map((name) => path.join(repoRoot, "apps/webapp/db/drizzle-migrations", name));
const overlay = path.join(repoRoot, "deploy/postgres/patient-invites-rls.sql");
const { Client } = createRequire(path.join(repoRoot, "apps/webapp/package.json"))("pg");

const orgA = "10000000-0000-4000-8000-000000000001";
const orgB = "10000000-0000-4000-8000-000000000002";
const patientA = "20000000-0000-4000-8000-000000000001";
const patientB = "20000000-0000-4000-8000-000000000002";
const patientC = "20000000-0000-4000-8000-000000000003";
const patientD = "20000000-0000-4000-8000-000000000004";
const patientE = "20000000-0000-4000-8000-000000000005";
const patientF = "20000000-0000-4000-8000-000000000006";
const foreignEmailOwner = "20000000-0000-4000-8000-000000000099";
const staff = "30000000-0000-4000-8000-000000000001";
const enrollmentA = "40000000-0000-4000-8000-000000000001";
const enrollmentB = "40000000-0000-4000-8000-000000000002";
const enrollmentC = "40000000-0000-4000-8000-000000000003";
const enrollmentD = "40000000-0000-4000-8000-000000000004";
const enrollmentE = "40000000-0000-4000-8000-000000000005";
const enrollmentF = "40000000-0000-4000-8000-000000000006";
const oldInvite = "50000000-0000-4000-8000-000000000001";
const newInvite = "50000000-0000-4000-8000-000000000002";
const foreignInvite = "50000000-0000-4000-8000-000000000003";
const unboundInvite = "50000000-0000-4000-8000-000000000004";
const conflictInvite = "50000000-0000-4000-8000-000000000005";
const raceInvite = "50000000-0000-4000-8000-000000000006";
const raceRegistrant = "20000000-0000-4000-8000-000000000098";
const legacyOrg = "10000000-0000-4000-8000-000000000010";
const legacyPatient = "20000000-0000-4000-8000-000000000010";
const legacyStaff = "30000000-0000-4000-8000-000000000010";
const legacyEnrollment = "40000000-0000-4000-8000-000000000010";
const legacyInvite = "50000000-0000-4000-8000-000000000010";
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
    psqlFile(migrations[0]);
    psqlFile(migrations[1]);
    psql(legacyBoundFixtureSql());
    psqlFile(migrations[2]);
    psqlFile(overlay);
    psql(seedAndReissueSql());

    const admin = client();
    await admin.connect();
    try {
      await proveForwardState(admin);
      await proveBearerAndProof(admin);
      await proveConcurrentRedeem();
      await proveUnboundClaim(admin);
      await proveRepeatedConflict(admin);
      await proveRegistrationRace();
      await proveConcurrentIssue();
      await proveStaffCrossOrg(admin);
      await proveAclAndForce(admin);
      await proveRollback(admin);
    } finally {
      await admin.end();
    }
    process.stdout.write("patient-invite-disposable-proof: PASS (0220→0221→legacy-bound fixture→0222, retry-safe claim, rollback guard, reissue, single-use, cross-org, concurrent redeem/claim/issue/registration)\n");
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
  email text, email_normalized text, email_verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_platform_users_email_normalized_active
  ON public.platform_users(email_normalized)
  WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL;
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
CREATE TABLE public.lfk_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_kind text NOT NULL DEFAULT 'organization',
  organization_id uuid, is_archived boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.patient_care_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_user_id uuid NOT NULL REFERENCES public.platform_users(id)
);
`;
}

function seedAndReissueSql() {
  return `
INSERT INTO public.be_organizations(id,title,is_active) VALUES
  ('${orgA}','Org A',true), ('${orgB}','Org B',true);
INSERT INTO public.platform_users(id,role,email_normalized) VALUES
  ('${patientA}','client','patient-a@example.test'),
  ('${patientB}','client','patient-b@example.test'),
  ('${patientC}','client',NULL),
  ('${patientD}','client',NULL),
  ('${patientE}','client',NULL),
  ('${patientF}','client',NULL),
  ('${foreignEmailOwner}','client','owned@example.test'),
  ('${staff}','doctor','staff@example.test');
INSERT INTO public.org_enrollments(id,organization_id,platform_user_id,status) VALUES
  ('${enrollmentA}','${orgA}','${patientA}','active'),
  ('${enrollmentB}','${orgB}','${patientB}','invited'),
  ('${enrollmentC}','${orgA}','${patientC}','invited'),
  ('${enrollmentD}','${orgA}','${patientD}','invited'),
  ('${enrollmentE}','${orgA}','${patientE}','invited'),
  ('${enrollmentF}','${orgA}','${patientF}','invited');
INSERT INTO public.patient_care_refs(patient_user_id) VALUES ('${patientC}'),('${patientD}'),('${patientE}');
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
INSERT INTO public.patient_invites(
  id, organization_id, patient_user_id, enrollment_id, token_hash, created_by_platform_user_id,
  invited_email_normalized, recipient_binding, expires_at
) VALUES
  ('${unboundInvite}','${orgA}','${patientC}','${enrollmentC}','unbound-token','${staff}',NULL,'unbound_email_claim',now()+interval '1 day'),
  ('${conflictInvite}','${orgA}','${patientD}','${enrollmentD}','conflict-token','${staff}',NULL,'unbound_email_claim',now()+interval '1 day'),
  ('${raceInvite}','${orgA}','${patientE}','${enrollmentE}','race-token','${staff}',NULL,'unbound_email_claim',now()+interval '1 day');
`;
}

function legacyBoundFixtureSql() {
  return `
INSERT INTO public.be_organizations(id,title,is_active)
VALUES ('${legacyOrg}','Legacy Org',true);
INSERT INTO public.platform_users(id,role,email,email_normalized) VALUES
  ('${legacyPatient}','client','legacy-local','legacy-local'),
  ('${legacyStaff}','doctor','legacy-staff','legacy-staff');
INSERT INTO public.org_enrollments(id,organization_id,platform_user_id,status)
VALUES ('${legacyEnrollment}','${legacyOrg}','${legacyPatient}','invited');
INSERT INTO public.patient_invites(
  id, organization_id, patient_user_id, enrollment_id, token_hash,
  created_by_platform_user_id, invited_email_normalized, expires_at
) VALUES (
  '${legacyInvite}','${legacyOrg}','${legacyPatient}','${legacyEnrollment}',
  'legacy-local-token','${legacyStaff}','legacy-local',now()+interval '1 day'
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
  const legacy = await db.query(`
    SELECT recipient_binding, invited_email_normalized
    FROM public.patient_invites WHERE id=$1
  `, [legacyInvite]);
  assert(legacy.rows[0]?.recipient_binding === "bound_email"
    && legacy.rows[0]?.invited_email_normalized === "legacy-local",
  "0222 rejected or rewrote a legal pre-0222 bound recipient without an at-sign");
}

async function proveBearerAndProof(db) {
  const first = await db.query("SELECT * FROM app.exchange_patient_invite($1,$2,now()+interval '10 min')", ["new-token", "continuation-a"]);
  assert(first.rows[0]?.ok === true, "first bearer exchange failed");
  const replay = await db.query("SELECT * FROM app.exchange_patient_invite($1,$2,now()+interval '10 min')", ["new-token", "continuation-b"]);
  assert(replay.rows[0]?.ok === false && replay.rows[0]?.code === "exchanged_token", "bearer replay was accepted");
  const proofExpiresEpoch = Math.floor(Date.now() / 1000) + 600;
  const proofExpiresAt = new Date(proofExpiresEpoch * 1000).toISOString();
  const wrongRecipientAuth = proofAuthorization("start", "continuation-a", "wrong@example.test", "wrong-proof-hash", proofExpiresEpoch);
  const wrongRecipient = await db.query("SELECT * FROM app.start_patient_invite_email_proof($1,$2,$3,$4,$5,$6,$7)", ["continuation-a", "wrong@example.test", "wrong-proof-hash", proofExpiresAt, wrongRecipientAuth.nonce, wrongRecipientAuth.expiresEpoch, wrongRecipientAuth.signature]);
  assert(wrongRecipient.rows[0]?.ok === false && wrongRecipient.rows[0]?.code === "wrong_recipient", "wrong recipient did not keep the correct recovery state");
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

async function prepareUnboundInvite(db, tokenHash, continuationHash, email, codeHash) {
  const exchanged = await db.query(
    "SELECT * FROM app.exchange_patient_invite($1,$2,now()+interval '10 min')",
    [tokenHash, continuationHash],
  );
  assert(exchanged.rows[0]?.ok === true, `unbound bearer exchange failed for ${continuationHash}`);
  assert(exchanged.rows[0]?.recipient_hint == null, "unbound exchange leaked a recipient hint");

  const proofExpiresEpoch = Math.floor(Date.now() / 1000) + 600;
  const proofExpiresAt = new Date(proofExpiresEpoch * 1000).toISOString();
  const startAuth = proofAuthorization("start", continuationHash, email, codeHash, proofExpiresEpoch);
  const started = await db.query(
    "SELECT * FROM app.start_patient_invite_email_proof($1,$2,$3,$4,$5,$6,$7)",
    [continuationHash, email, codeHash, proofExpiresAt, startAuth.nonce, startAuth.expiresEpoch, startAuth.signature],
  );
  assert(started.rows[0]?.ok === true, `unbound proof start failed for ${continuationHash}`);
  const verifyAuth = proofAuthorization("verify", continuationHash, email, codeHash, null);
  const verified = await db.query(
    "SELECT * FROM app.verify_patient_invite_email_proof($1,$2,$3,$4,$5,$6)",
    [continuationHash, email, codeHash, verifyAuth.nonce, verifyAuth.expiresEpoch, verifyAuth.signature],
  );
  assert(verified.rows[0]?.ok === true, `unbound proof verify failed for ${continuationHash}`);
}

async function claimUnbound(db, continuationHash, email) {
  const authorization = proofAuthorization("claim", continuationHash, email, "", null);
  return db.query(
    "SELECT * FROM app.claim_unbound_patient_invite_email($1,$2,$3,$4,$5)",
    [continuationHash, email, authorization.nonce, authorization.expiresEpoch, authorization.signature],
  );
}

async function proveUnboundClaim(db) {
  await prepareUnboundInvite(db, "unbound-token", "continuation-unbound", "new@example.test", "unbound-code");
  const first = client();
  const second = client();
  await Promise.all([first.connect(), second.connect()]);
  try {
    await Promise.all([first.query("SET ROLE app_patient"), second.query("SET ROLE app_patient")]);
    const [a, b] = await Promise.all([
      claimUnbound(first, "continuation-unbound", "new@example.test"),
      claimUnbound(second, "continuation-unbound", "new@example.test"),
    ]);
    const rows = [a.rows[0], b.rows[0]];
    assert(rows.filter((row) => row?.ok === true
      && row?.organization_id === orgA && row?.patient_user_id === patientC).length === 2,
    "concurrent same-principal claims did not converge on the canonical organization and patient");
  } finally {
    await Promise.all([first.end(), second.end()]);
  }
  const state = await db.query(`
    SELECT patient.email_normalized, patient.email_verified_at,
      enrollment.platform_user_id, enrollment.status, enrollment.portal_activated_at,
      invite.patient_user_id AS invite_patient_user_id, invite.status AS invite_status,
      (SELECT count(*)::int FROM public.patient_care_refs ref WHERE ref.patient_user_id=$1) AS care_ref_count
    FROM public.platform_users patient
    JOIN public.org_enrollments enrollment ON enrollment.id=$2
    JOIN public.patient_invites invite ON invite.id=$3
    WHERE patient.id=$1
  `, [patientC, enrollmentC, unboundInvite]);
  const row = state.rows[0];
  assert(row?.email_normalized === "new@example.test" && row?.email_verified_at != null,
    "unbound claim did not attach the verified email to the placeholder");
  assert(row?.platform_user_id === patientC && row?.invite_patient_user_id === patientC && row?.care_ref_count === 1,
    "unbound claim rebound an existing patient FK");
  assert(row?.status === "active" && row?.portal_activated_at != null && row?.invite_status === "accepted",
    "unbound claim left a partial activation");

  const retryVerifyAuth = proofAuthorization(
    "verify", "continuation-unbound", "new@example.test", "unbound-code", null,
  );
  const retryVerify = await db.query(
    "SELECT * FROM app.verify_patient_invite_email_proof($1,$2,$3,$4,$5,$6)",
    ["continuation-unbound", "new@example.test", "unbound-code", retryVerifyAuth.nonce,
      retryVerifyAuth.expiresEpoch, retryVerifyAuth.signature],
  );
  assert(retryVerify.rows[0]?.ok === true,
    "accepted unbound invite did not retain the exact valid proof for session retry");
  const retryLookup = await db.query(
    "SELECT * FROM app.lookup_patient_invite_continuation($1)",
    ["continuation-unbound"],
  );
  assert(retryLookup.rows[0]?.ok === true && retryLookup.rows[0]?.recipient_hint == null,
    "accepted unbound invite could not reopen the confirm route after session failure");
  const retryClaim = await claimUnbound(db, "continuation-unbound", "new@example.test");
  assert(retryClaim.rows[0]?.ok === true
    && retryClaim.rows[0]?.organization_id === orgA
    && retryClaim.rows[0]?.patient_user_id === patientC,
  "post-commit retry did not return the same trusted organization and patient ids");

  const wrongCodeAuth = proofAuthorization(
    "verify", "continuation-unbound", "new@example.test", "wrong-code", null,
  );
  const wrongCode = await db.query(
    "SELECT * FROM app.verify_patient_invite_email_proof($1,$2,$3,$4,$5,$6)",
    ["continuation-unbound", "new@example.test", "wrong-code", wrongCodeAuth.nonce,
      wrongCodeAuth.expiresEpoch, wrongCodeAuth.signature],
  );
  assert(wrongCode.rows[0]?.ok === false && wrongCode.rows[0]?.code === "invalid_code",
    "accepted unbound invite reopened for a different proof");
  const wrongEmailClaim = await claimUnbound(db, "continuation-unbound", "other@example.test");
  assert(wrongEmailClaim.rows[0]?.ok === false
    && wrongEmailClaim.rows[0]?.organization_id == null
    && wrongEmailClaim.rows[0]?.patient_user_id == null,
  "accepted unbound invite exposed trusted ids to a different email identity");
}

async function proveRepeatedConflict(db) {
  await prepareUnboundInvite(db, "conflict-token", "continuation-conflict", "owned@example.test", "conflict-code");
  const first = await claimUnbound(db, "continuation-conflict", "owned@example.test");
  const second = await claimUnbound(db, "continuation-conflict", "owned@example.test");
  assert(first.rows[0]?.ok === false && first.rows[0]?.code === "conflicting_identity",
    "occupied email was not rejected");
  assert(second.rows[0]?.ok === false && second.rows[0]?.code === "conflicting_identity",
    "repeated occupied email was not deterministically rejected");
  const state = await db.query(`
    SELECT patient.email_normalized, enrollment.status, enrollment.portal_activated_at,
      invite.status AS invite_status,
      (SELECT count(*)::int FROM public.patient_merge_candidates candidate
        WHERE candidate.organization_id=$4 AND candidate.anchor_user_id=$1
          AND candidate.candidate_user_id=$5 AND candidate.reason='invite_redeem_identity_conflict'
          AND candidate.status='pending') AS candidate_count
    FROM public.platform_users patient
    JOIN public.org_enrollments enrollment ON enrollment.id=$2
    JOIN public.patient_invites invite ON invite.id=$3
    WHERE patient.id=$1
  `, [patientD, enrollmentD, conflictInvite, orgA, foreignEmailOwner]);
  const row = state.rows[0];
  assert(row?.email_normalized == null && row?.status === "invited" && row?.portal_activated_at == null,
    "conflict partially mutated the placeholder or enrollment");
  assert(row?.invite_status === "pending" && row?.candidate_count === 1,
    "conflict was not exact-org deduplicated");
}

async function proveRegistrationRace() {
  const admin = client();
  await admin.connect();
  try {
    await prepareUnboundInvite(admin, "race-token", "continuation-race", "race@example.test", "race-code");
  } finally {
    await admin.end();
  }
  const registration = client();
  const claimant = client();
  await Promise.all([registration.connect(), claimant.connect()]);
  try {
    await claimant.query("SET ROLE app_patient");
    const [registrationResult, claimResult] = await Promise.allSettled([
      registration.query(
        "INSERT INTO public.platform_users(id,role,email,email_normalized) VALUES($1,'client',$2,$2) RETURNING id",
        [raceRegistrant, "race@example.test"],
      ),
      claimUnbound(claimant, "continuation-race", "race@example.test"),
    ]);
    const claimRow = claimResult.status === "fulfilled" ? claimResult.value.rows[0] : null;
    const registrationWon = registrationResult.status === "fulfilled";
    assert(
      (registrationWon && claimRow?.ok === false && claimRow?.code === "conflicting_identity")
      || (!registrationWon && claimRow?.ok === true && claimRow?.patient_user_id === patientE),
      "registration-vs-claim race did not resolve to one canonical owner",
    );
  } finally {
    await Promise.all([registration.end(), claimant.end()]);
  }
  const check = client();
  await check.connect();
  try {
    const owners = await check.query(
      "SELECT id FROM public.platform_users WHERE email_normalized=$1 AND merged_into_id IS NULL",
      ["race@example.test"],
    );
    assert(owners.rowCount === 1, "registration race produced duplicate active email owners");
    const placeholderWon = owners.rows[0]?.id === patientE;
    const state = await check.query(`
      SELECT patient.email_normalized, enrollment.status, enrollment.portal_activated_at,
        invite.status AS invite_status,
        (SELECT count(*)::int FROM public.patient_merge_candidates candidate
          WHERE candidate.organization_id=$4 AND candidate.anchor_user_id=$1
            AND candidate.reason='invite_redeem_identity_conflict' AND candidate.status='pending') AS candidate_count
      FROM public.platform_users patient
      JOIN public.org_enrollments enrollment ON enrollment.id=$2
      JOIN public.patient_invites invite ON invite.id=$3
      WHERE patient.id=$1
    `, [patientE, enrollmentE, raceInvite, orgA]);
    const row = state.rows[0];
    if (placeholderWon) {
      assert(row?.email_normalized === "race@example.test" && row?.status === "active"
        && row?.portal_activated_at != null && row?.invite_status === "accepted",
      "claim winner did not atomically activate the original placeholder");
    } else {
      assert(row?.email_normalized == null && row?.status === "invited"
        && row?.portal_activated_at == null && row?.invite_status === "pending" && row?.candidate_count === 1,
      "registration winner left partial claim state or no merge candidate");
    }
  } finally {
    await check.end();
  }
}

async function issueUnboundInvite(db, id, tokenHash) {
  await db.query("BEGIN");
  try {
    const enrollment = await db.query(
      "SELECT id FROM public.org_enrollments WHERE organization_id=$1 AND platform_user_id=$2 FOR UPDATE",
      [orgA, patientF],
    );
    const previous = await db.query(
      "SELECT id FROM public.patient_invites WHERE organization_id=$1 AND patient_user_id=$2 AND status='pending' LIMIT 1",
      [orgA, patientF],
    );
    await db.query(
      "UPDATE public.patient_invites SET status='superseded',superseded_by_invite_id=NULL WHERE organization_id=$1 AND patient_user_id=$2 AND status='pending'",
      [orgA, patientF],
    );
    await db.query(`
      INSERT INTO public.patient_invites(
        id,organization_id,patient_user_id,enrollment_id,token_hash,created_by_platform_user_id,
        invited_email_normalized,recipient_binding,expires_at
      ) VALUES($1,$2,$3,$4,$5,$6,NULL,'unbound_email_claim',now()+interval '1 day')
    `, [id, orgA, patientF, enrollment.rows[0].id, tokenHash, staff]);
    if (previous.rows[0]?.id) {
      await db.query("UPDATE public.patient_invites SET superseded_by_invite_id=$1 WHERE id=$2", [id, previous.rows[0].id]);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function proveConcurrentIssue() {
  const first = client();
  const second = client();
  await Promise.all([first.connect(), second.connect()]);
  const firstId = "50000000-0000-4000-8000-000000000007";
  const secondId = "50000000-0000-4000-8000-000000000008";
  try {
    await Promise.all([
      issueUnboundInvite(first, firstId, "issue-token-a"),
      issueUnboundInvite(second, secondId, "issue-token-b"),
    ]);
  } finally {
    await Promise.all([first.end(), second.end()]);
  }
  const db = client();
  await db.connect();
  try {
    const state = await db.query(`
      SELECT count(*) FILTER (WHERE status='pending')::int AS pending_count,
        count(*) FILTER (WHERE status='superseded')::int AS superseded_count
      FROM public.patient_invites WHERE organization_id=$1 AND patient_user_id=$2
    `, [orgA, patientF]);
    assert(state.rows[0]?.pending_count === 1 && state.rows[0]?.superseded_count === 1,
      "concurrent issue did not leave exactly one pending replacement");
  } finally {
    await db.end();
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
      has_function_privilege('app_patient','app.claim_unbound_patient_invite_email(text,text,text,bigint,text)','EXECUTE') AS patient_claim,
      pg_get_userbyid(p.proowner) AS function_owner,
      (SELECT pg_get_userbyid(claim.proowner)
        FROM pg_proc claim
        WHERE claim.oid='app.claim_unbound_patient_invite_email(text,text,text,bigint,text)'::regprocedure
      ) AS claim_owner
    FROM pg_class c
    JOIN pg_proc p ON p.oid='app.redeem_patient_invite_email(text)'::regprocedure
    WHERE c.oid='public.patient_invites'::regclass
  `);
  const row = result.rows[0];
  assert(row?.relrowsecurity && row?.relforcerowsecurity, "RLS/FORCE is not active");
  assert(row?.patient_select === false && row?.patient_redeem === true && row?.patient_claim === true,
    "patient ACL boundary is wrong");
  assert(row?.function_owner === "app_owner" && row?.claim_owner === "app_owner",
    "patient invite function owner is not app_owner");
}

async function proveRollback(db) {
  let guardFailed = false;
  await db.query("BEGIN");
  try {
    await db.query("ALTER TABLE public.patient_invites ALTER COLUMN invited_email_normalized SET NOT NULL");
  } catch (error) {
    guardFailed = error && typeof error === "object" && "code" in error && error.code === "23502";
  } finally {
    await db.query("ROLLBACK");
  }
  assert(guardFailed, "rollback guard allowed unbound invite emails to become NOT NULL");
  const durable = await db.query(`
    SELECT patient.email_normalized, enrollment.status, enrollment.portal_activated_at, invite.status
    FROM public.platform_users patient
    JOIN public.org_enrollments enrollment ON enrollment.id=$2
    JOIN public.patient_invites invite ON invite.id=$3
    WHERE patient.id=$1
  `, [patientC, enrollmentC, unboundInvite]);
  assert(durable.rows[0]?.email_normalized === "new@example.test"
    && durable.rows[0]?.status === "accepted"
    && durable.rows[0]?.portal_activated_at != null,
  "rollback guard did not preserve the accepted claim state");

  await db.query(`
    DROP FUNCTION app.claim_unbound_patient_invite_email(text,text,text,bigint,text);
    DROP FUNCTION app.exchange_patient_invite(text,text,timestamptz);
    DROP FUNCTION app.lookup_patient_invite_continuation(text);
    DROP FUNCTION app.start_patient_invite_email_proof(text,text,text,timestamptz,text,bigint,text);
    DROP FUNCTION app.cancel_patient_invite_email_proof(text,text);
    DROP FUNCTION app.verify_patient_invite_email_proof(text,text,text,text,bigint,text);
    DROP FUNCTION app.redeem_patient_invite_email(text);
    DROP TABLE public.patient_invites;
    ALTER TABLE public.org_enrollments DROP CONSTRAINT org_enrollments_portal_activation_check;
    ALTER TABLE public.org_enrollments DROP COLUMN portal_activated_via, DROP COLUMN portal_activated_at;
    DROP INDEX public.idx_lfk_exercises_catalog_scope_owner;
    ALTER TABLE public.lfk_exercises DROP CONSTRAINT lfk_exercises_catalog_scope_check;
    ALTER TABLE public.lfk_exercises DROP COLUMN catalog_scope;
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
