#!/usr/bin/env node
/**
 * Phase 1 locked-label proof package.
 *
 * Scratch-only proof for the accepted design:
 * - protected backend context table;
 * - signed SECURITY DEFINER setter;
 * - helper functions app.current_org_id(), app.current_patient_user_id(),
 *   app.current_integrator_user_id();
 * - app.is_staff() remains role-derived, not GUC-derived.
 *
 * This script creates a disposable database and unique disposable roles only.
 * It refuses dev/prod/test-shaped DB names and cleans all scratch resources in
 * finally. It does not read application DATABASE_URL or connect to runtime DBs.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

const scratchSuffix = `${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "_");
const dbName = `bcb_saas_phase1_locked_label_scratch_${scratchSuffix}`;
const ownerRole = `bcb_phase1_context_owner_${scratchSuffix}`;
const staffRole = `bcb_phase1_app_staff_${scratchSuffix}`;
const patientRole = `bcb_phase1_app_patient_${scratchSuffix}`;

if (!dbName.startsWith("bcb_saas_") || !dbName.includes("scratch")) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}
if (/bcb_webapp_(dev|prod|test)/.test(dbName)) {
  throw new Error("refusing dev/prod/test-shaped scratch DB name");
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : "inherit",
    input: options.input,
  });

  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status ?? "unknown status"}`);
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function psql(sql, { database = dbName } = {}) {
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", database], { input: sql });
}

function fatal(assertionVar, message) {
  return [
    `\\if :${assertionVar}`,
    "\\else",
    `\\echo 'FATAL: ${message}'`,
    "SELECT 1/0; -- forces a real error under ON_ERROR_STOP",
    "\\endif",
  ].join("\n");
}

const ownerIdent = quoteIdent(ownerRole);
const staffIdent = quoteIdent(staffRole);
const patientIdent = quoteIdent(patientRole);
const secret = randomBytes(32).toString("hex");

const orgA = "10000000-0000-4000-8000-0000000000a1";
const orgB = "10000000-0000-4000-8000-0000000000b1";
const patientA1 = "10000000-0000-4000-8000-00000000a101";
const patientA2 = "10000000-0000-4000-8000-00000000a102";
const integratorUserId = "424242001";
const futureEpoch = Math.floor(Date.now() / 1000) + 120;
const expiredEpoch = Math.floor(Date.now() / 1000) - 60;

const validNonce = `valid_${scratchSuffix}`;
const secondValidNonce = `valid2_${scratchSuffix}`;
const badNonce = `bad_${scratchSuffix}`;
const expiredNonce = `expired_${scratchSuffix}`;
const wrongBackendNonce = `wrong_backend_${scratchSuffix}`;

const bootstrapSql = String.raw`
CREATE ROLE ${ownerIdent} NOLOGIN NOBYPASSRLS;
CREATE ROLE ${staffIdent} NOLOGIN NOBYPASSRLS;
CREATE ROLE ${patientIdent} NOLOGIN NOBYPASSRLS;

CREATE SCHEMA app_ext;
CREATE EXTENSION pgcrypto WITH SCHEMA app_ext;
GRANT USAGE ON SCHEMA app_ext TO ${ownerIdent};

CREATE SCHEMA app AUTHORIZATION ${ownerIdent};

SET ROLE ${ownerIdent};

CREATE TABLE app.context_signing_secrets (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  secret text NOT NULL CHECK (length(secret) >= 32)
);

INSERT INTO app.context_signing_secrets (id, secret)
VALUES (true, ${quoteLiteral(secret)});

CREATE TABLE app.principal_context (
  backend_pid integer PRIMARY KEY CHECK (backend_pid > 0),
  org_id uuid NOT NULL,
  patient_user_id uuid,
  integrator_user_id bigint,
  nonce text NOT NULL,
  expires_epoch bigint NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE app.context_nonce_ledger (
  nonce text PRIMARY KEY,
  backend_pid integer NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_epoch bigint NOT NULL
);

CREATE OR REPLACE FUNCTION app.install_signed_context(
  p_nonce text,
  p_backend_pid integer,
  p_expires_epoch bigint,
  p_org_id uuid,
  p_patient_user_id uuid,
  p_integrator_user_id bigint,
  p_signature_hex text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, app_ext, pg_catalog
AS $$
DECLARE
  v_secret text;
  v_canonical text;
  v_expected text;
  v_now_epoch bigint;
BEGIN
  IF p_nonce IS NULL OR p_nonce !~ '^[a-zA-Z0-9_.:-]{8,160}$' THEN
    RAISE EXCEPTION 'invalid_nonce';
  END IF;

  IF p_backend_pid <> pg_backend_pid() THEN
    RAISE EXCEPTION 'wrong_backend';
  END IF;

  v_now_epoch := floor(extract(epoch FROM clock_timestamp()))::bigint;
  IF p_expires_epoch <= v_now_epoch THEN
    RAISE EXCEPTION 'expired_context';
  END IF;
  IF p_expires_epoch > v_now_epoch + 300 THEN
    RAISE EXCEPTION 'context_ttl_too_long';
  END IF;

  SELECT secret INTO STRICT v_secret
  FROM app.context_signing_secrets
  WHERE id = true;

  v_canonical := concat_ws(
    '|',
    'v1',
    p_nonce,
    p_backend_pid::text,
    p_expires_epoch::text,
    p_org_id::text,
    COALESCE(p_patient_user_id::text, ''),
    COALESCE(p_integrator_user_id::text, '')
  );
  v_expected := encode(app_ext.hmac(v_canonical, v_secret, 'sha256'), 'hex');

  IF lower(p_signature_hex) <> v_expected THEN
    RAISE EXCEPTION 'bad_signature';
  END IF;

  BEGIN
    INSERT INTO app.context_nonce_ledger (nonce, backend_pid, expires_epoch)
    VALUES (p_nonce, p_backend_pid, p_expires_epoch);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'replayed_context_signature';
  END;

  INSERT INTO app.principal_context (
    backend_pid,
    org_id,
    patient_user_id,
    integrator_user_id,
    nonce,
    expires_epoch
  )
  VALUES (
    p_backend_pid,
    p_org_id,
    p_patient_user_id,
    p_integrator_user_id,
    p_nonce,
    p_expires_epoch
  )
  ON CONFLICT (backend_pid) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    patient_user_id = EXCLUDED.patient_user_id,
    integrator_user_id = EXCLUDED.integrator_user_id,
    nonce = EXCLUDED.nonce,
    expires_epoch = EXCLUDED.expires_epoch,
    installed_at = clock_timestamp();
END;
$$;

CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
  SELECT org_id
  FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
    AND expires_epoch > floor(extract(epoch FROM clock_timestamp()))::bigint
$$;

CREATE OR REPLACE FUNCTION app.current_patient_user_id() RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
  SELECT patient_user_id
  FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
    AND expires_epoch > floor(extract(epoch FROM clock_timestamp()))::bigint
$$;

CREATE OR REPLACE FUNCTION app.current_integrator_user_id() RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
  SELECT integrator_user_id
  FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
    AND expires_epoch > floor(extract(epoch FROM clock_timestamp()))::bigint
$$;

CREATE OR REPLACE FUNCTION app.reset_principal_context() RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
  DELETE FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
$$;

CREATE OR REPLACE FUNCTION app.release_principal_context() RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
  DELETE FROM app.principal_context
  WHERE backend_pid = pg_backend_pid()
$$;

CREATE OR REPLACE FUNCTION app.is_staff() RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_user = ${quoteLiteral(staffRole)}
    OR pg_has_role(current_user, ${quoteLiteral(staffRole)}, 'member')
$$;

REVOKE ALL ON app.context_signing_secrets FROM PUBLIC;
REVOKE ALL ON app.principal_context FROM PUBLIC;
REVOKE ALL ON app.context_nonce_ledger FROM PUBLIC;

GRANT USAGE ON SCHEMA app TO ${staffIdent}, ${patientIdent};
GRANT EXECUTE ON FUNCTION app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)
  TO ${staffIdent}, ${patientIdent};
GRANT EXECUTE ON FUNCTION app.current_org_id() TO ${staffIdent}, ${patientIdent};
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO ${staffIdent}, ${patientIdent};
GRANT EXECUTE ON FUNCTION app.current_integrator_user_id() TO ${staffIdent}, ${patientIdent};
GRANT EXECUTE ON FUNCTION app.reset_principal_context() TO ${staffIdent}, ${patientIdent};
GRANT EXECUTE ON FUNCTION app.release_principal_context() TO ${staffIdent}, ${patientIdent};
GRANT EXECUTE ON FUNCTION app.is_staff() TO ${staffIdent}, ${patientIdent};

RESET ROLE;
`;

const proofSql = String.raw`
SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(validNonce)},
    pg_backend_pid()::text,
    ${futureEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA1)},
    ${integratorUserId}::text
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p1_valid_signature \gset

SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(secondValidNonce)},
    pg_backend_pid()::text,
    ${futureEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA1)},
    ${integratorUserId}::text
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p1_second_valid_signature \gset

SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(expiredNonce)},
    pg_backend_pid()::text,
    ${expiredEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA1)},
    ${integratorUserId}::text
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p1_expired_signature \gset

SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(wrongBackendNonce)},
    (pg_backend_pid() + 1)::text,
    ${futureEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA1)},
    ${integratorUserId}::text
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p1_wrong_backend_signature \gset

SET SESSION AUTHORIZATION ${patientIdent};

SELECT (app.is_staff() = false)::int AS p1_patient_not_staff \gset
${fatal("p1_patient_not_staff", "app_patient must not be staff through app.is_staff()")}

SET app.is_staff = 'true';
SELECT (app.is_staff() = false)::int AS p1_staff_guc_ignored \gset
${fatal("p1_staff_guc_ignored", "raw app.is_staff GUC must not affect role-derived app.is_staff()")}

\set ON_ERROR_STOP off
SELECT count(*) FROM app.principal_context;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: app_patient cannot read app.principal_context.'
\else
\echo 'FATAL: app_patient could read app.principal_context.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO app.principal_context (
  backend_pid,
  org_id,
  patient_user_id,
  integrator_user_id,
  nonce,
  expires_epoch
) VALUES (
  pg_backend_pid(),
  ${quoteLiteral(orgB)},
  ${quoteLiteral(patientA2)},
  999,
  'direct_write',
  ${futureEpoch}
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: app_patient cannot write app.principal_context.'
\else
\echo 'FATAL: app_patient could write app.principal_context.'
SELECT 1/0;
\endif

SET app.org = ${quoteLiteral(orgB)};
SET app.patient_user_id = ${quoteLiteral(patientA2)};
SET app.integrator_user_id = '999';
SELECT (
  app.current_org_id() IS NULL
  AND app.current_patient_user_id() IS NULL
  AND app.current_integrator_user_id() IS NULL
)::int AS p1_raw_gucs_untrusted_before_install \gset
${fatal("p1_raw_gucs_untrusted_before_install", "raw custom GUC SET must not install trusted helper context")}

\set ON_ERROR_STOP off
SELECT app.install_signed_context(
  ${quoteLiteral(badNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  '00bad'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: bad signature rejected.'
\else
\echo 'FATAL: bad signature accepted.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
SELECT app.install_signed_context(
  ${quoteLiteral(expiredNonce)},
  pg_backend_pid(),
  ${expiredEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  :'p1_expired_signature'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: expired signature rejected.'
\else
\echo 'FATAL: expired signature accepted.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
SELECT app.install_signed_context(
  ${quoteLiteral(wrongBackendNonce)},
  pg_backend_pid() + 1,
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  :'p1_wrong_backend_signature'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: wrong-backend signature rejected.'
\else
\echo 'FATAL: wrong-backend signature accepted.'
SELECT 1/0;
\endif

SELECT app.install_signed_context(
  ${quoteLiteral(validNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  :'p1_valid_signature'
);

SELECT (
  app.current_org_id() = ${quoteLiteral(orgA)}::uuid
  AND app.current_patient_user_id() = ${quoteLiteral(patientA1)}::uuid
  AND app.current_integrator_user_id() = ${integratorUserId}::bigint
)::int AS p1_valid_signed_payload_installed \gset
${fatal("p1_valid_signed_payload_installed", "valid signed payload must install helper-visible context")}

SET app.org = ${quoteLiteral(orgB)};
SET app.patient_user_id = ${quoteLiteral(patientA2)};
SET app.integrator_user_id = '999';
SELECT (
  app.current_org_id() = ${quoteLiteral(orgA)}::uuid
  AND app.current_patient_user_id() = ${quoteLiteral(patientA1)}::uuid
  AND app.current_integrator_user_id() = ${integratorUserId}::bigint
)::int AS p1_raw_gucs_untrusted_after_install \gset
${fatal("p1_raw_gucs_untrusted_after_install", "raw custom GUC SET must not override helper context")}

SELECT app.reset_principal_context();
SELECT (
  app.current_org_id() IS NULL
  AND app.current_patient_user_id() IS NULL
  AND app.current_integrator_user_id() IS NULL
)::int AS p1_reset_clears_context \gset
${fatal("p1_reset_clears_context", "reset cleanup must clear backend context")}

\set ON_ERROR_STOP off
SELECT app.install_signed_context(
  ${quoteLiteral(validNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  :'p1_valid_signature'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: replayed signature rejected.'
\else
\echo 'FATAL: replayed signature accepted.'
SELECT 1/0;
\endif

SELECT app.install_signed_context(
  ${quoteLiteral(secondValidNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA1)}::uuid,
  ${integratorUserId}::bigint,
  :'p1_second_valid_signature'
);
SELECT app.release_principal_context();
SELECT (
  app.current_org_id() IS NULL
  AND app.current_patient_user_id() IS NULL
  AND app.current_integrator_user_id() IS NULL
)::int AS p1_release_clears_context \gset
${fatal("p1_release_clears_context", "release cleanup must clear backend context")}

RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION ${staffIdent};
SELECT (app.is_staff() = true)::int AS p1_staff_role_is_staff \gset
${fatal("p1_staff_role_is_staff", "staff role must be staff through role-derived app.is_staff()")}
RESET SESSION AUTHORIZATION;

\echo 'Phase 1 locked-label proof: all assertions CONFIRMED.'
`;

try {
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);

  console.log("--- phase 1: scratch roles, protected context tables, signed setter, helper functions ---");
  psql(bootstrapSql);

  console.log("--- phase 2: locked-label proofs under disposable app roles ---");
  psql(proofSql);

  console.log(`smoke-phase1-locked-label-proof: OK (${dbName})`);
} finally {
  run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
    input: [
      `DROP ROLE IF EXISTS ${patientIdent};`,
      `DROP ROLE IF EXISTS ${staffIdent};`,
      `DROP ROLE IF EXISTS ${ownerIdent};`,
      "",
    ].join("\n"),
  });
}
