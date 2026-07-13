#!/usr/bin/env node
/**
 * P2-C1 patient value-level guards smoke.
 *
 * Scratch-only proof for deploy/postgres/p2-c1-patient-value-guards.sql. It applies the P2-B
 * protected context artifact first, then applies P2-C1 triggers against a synthetic schema carrying
 * the real table/column names needed by the guards.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const p2bSqlPath = path.join(repoRoot, "deploy/postgres/p2-b-protected-principal-context.sql");
const p2c1SqlPath = path.join(repoRoot, "deploy/postgres/p2-c1-patient-value-guards.sql");

const scratchSuffix = `${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "_");
const dbName = `bcb_saas_p2_c1_value_guard_scratch_${scratchSuffix}`;
const ownerRole = `bcb_p2_c1_context_owner_${scratchSuffix}`;
const staffRole = `bcb_p2_c1_app_staff_${scratchSuffix}`;
const patientRole = `bcb_p2_c1_app_patient_${scratchSuffix}`;

if (!dbName.startsWith("bcb_saas_") || !dbName.includes("scratch")) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}
if (/bcb_webapp_(dev|prod|test)|bersoncarebot_test/.test(dbName)) {
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
    input: options.input,
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    throw new Error(`${options.label ?? `${command} ${args.join(" ")}`} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${options.label ?? `${command} ${args.join(" ")}`} failed with ${result.status ?? "unknown status"}`);
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function psql(sql, { database = dbName } = {}) {
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", database], { input: sql });
}

function psqlFile(filePath, variables, { database = dbName } = {}) {
  const sql = readFileSync(filePath, "utf8");
  const variableArgs = Object.entries(variables).flatMap(([key, value]) => ["-v", `${key}=${value}`]);
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", database, ...variableArgs], {
    input: sql,
    label: `sudo -n -u postgres psql -v ON_ERROR_STOP=1 -d ${database} < ${path.relative(repoRoot, filePath)} (psql variables redacted)`,
  });
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

const orgA = "20000000-0000-4000-8000-0000000000a1";
const orgB = "20000000-0000-4000-8000-0000000000b1";
const patientA = "20000000-0000-4000-8000-00000000a101";
const patientB = "20000000-0000-4000-8000-00000000b101";
const staffUser = "20000000-0000-4000-8000-00000000f101";
const instanceA = "20000000-0000-4000-8000-00000000aa01";
const instanceB = "20000000-0000-4000-8000-00000000bb01";
const stageA = "20000000-0000-4000-8000-00000000aa02";
const itemA = "20000000-0000-4000-8000-00000000aa03";
const itemB = "20000000-0000-4000-8000-00000000bb03";
const conversationA = "20000000-0000-4000-8000-00000000ac01";
const conversationB = "20000000-0000-4000-8000-00000000bc01";
const futureEpoch = Math.floor(Date.now() / 1000) + 120;
const patientNonce = `patient_${scratchSuffix}`;
const staffWithPatientContextNonce = `staff_patient_context_${scratchSuffix}`;

const schemaSql = String.raw`
CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY
);

CREATE TABLE public.treatment_program_instances (
  id uuid PRIMARY KEY,
  organization_id uuid,
  patient_user_id uuid NOT NULL
);

CREATE TABLE public.treatment_program_instance_stages (
  id uuid PRIMARY KEY,
  organization_id uuid,
  instance_id uuid NOT NULL
);

CREATE TABLE public.treatment_program_instance_stage_items (
  id uuid PRIMARY KEY,
  organization_id uuid,
  stage_id uuid NOT NULL
);

CREATE TABLE public.program_item_discussion_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  instance_stage_item_id uuid NOT NULL,
  patient_user_id uuid NOT NULL,
  sender_role text NOT NULL,
  origin text NOT NULL,
  body text,
  media_file_id uuid,
  support_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_conversations (
  id uuid PRIMARY KEY,
  organization_id uuid,
  platform_user_id uuid,
  integrator_conversation_id text NOT NULL
);

CREATE TABLE public.support_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  integrator_message_id text NOT NULL,
  conversation_id uuid NOT NULL,
  sender_role text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  text text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.treatment_program_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  instance_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_users (id) VALUES
  (${quoteLiteral(patientA)}),
  (${quoteLiteral(patientB)}),
  (${quoteLiteral(staffUser)});

INSERT INTO public.treatment_program_instances (id, organization_id, patient_user_id) VALUES
  (${quoteLiteral(instanceA)}, ${quoteLiteral(orgA)}, ${quoteLiteral(patientA)}),
  (${quoteLiteral(instanceB)}, ${quoteLiteral(orgB)}, ${quoteLiteral(patientB)});

INSERT INTO public.treatment_program_instance_stages (id, organization_id, instance_id) VALUES
  (${quoteLiteral(stageA)}, ${quoteLiteral(orgA)}, ${quoteLiteral(instanceA)});

INSERT INTO public.treatment_program_instance_stage_items (id, organization_id, stage_id) VALUES
  (${quoteLiteral(itemA)}, ${quoteLiteral(orgA)}, ${quoteLiteral(stageA)}),
  (${quoteLiteral(itemB)}, ${quoteLiteral(orgB)}, ${quoteLiteral(stageA)});

INSERT INTO public.support_conversations (id, organization_id, platform_user_id, integrator_conversation_id) VALUES
  (${quoteLiteral(conversationA)}, ${quoteLiteral(orgA)}, ${quoteLiteral(patientA)}, 'conv-a'),
  (${quoteLiteral(conversationB)}, ${quoteLiteral(orgB)}, ${quoteLiteral(patientB)}, 'conv-b');

GRANT USAGE ON SCHEMA public TO ${patientIdent}, ${staffIdent};
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO ${patientIdent}, ${staffIdent};
`;

const explicitGrantProofSql = String.raw`
WITH expected_functions(signature) AS (
  VALUES
    ('app.p2_c1_is_patient_context()'),
    ('app.p2_c1_guard_program_item_discussion_messages()'),
    ('app.p2_c1_guard_support_conversation_messages()'),
    ('app.p2_c1_guard_treatment_program_events()')
),
resolved_functions AS (
  SELECT signature, to_regprocedure(signature) AS function_oid
  FROM expected_functions
)
SELECT (
  count(*) = 4
  AND count(*) FILTER (WHERE function_oid IS NOT NULL) = 4
  AND NOT EXISTS (
    SELECT 1
    FROM resolved_functions resolved
    JOIN pg_proc proc ON proc.oid = resolved.function_oid
    CROSS JOIN LATERAL aclexplode(COALESCE(proc.proacl, acldefault('f', proc.proowner))) acl
    WHERE acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  )
)::int AS p2_c1_public_execute_revoked
FROM resolved_functions \gset
${fatal("p2_c1_public_execute_revoked", "P2-C1 functions must revoke PUBLIC EXECUTE")}

WITH expected_functions(signature) AS (
  VALUES
    ('app.p2_c1_is_patient_context()'),
    ('app.p2_c1_guard_program_item_discussion_messages()'),
    ('app.p2_c1_guard_support_conversation_messages()'),
    ('app.p2_c1_guard_treatment_program_events()')
)
SELECT (
  bool_and(has_function_privilege(${quoteLiteral(patientRole)}, signature, 'EXECUTE'))
  AND bool_and(has_function_privilege(${quoteLiteral(staffRole)}, signature, 'EXECUTE'))
)::int AS p2_c1_explicit_execute_granted
FROM expected_functions \gset
${fatal("p2_c1_explicit_execute_granted", "P2-C1 functions must grant EXECUTE to explicit app roles")}

SET SESSION AUTHORIZATION ${patientIdent};
SELECT app.p2_c1_is_patient_context() AS p2_c1_patient_can_execute_helper;
RESET SESSION AUTHORIZATION;

\echo 'P2-C1 explicit function grants CONFIRMED.'
`;

const proofSql = String.raw`
SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(patientNonce)},
    pg_backend_pid()::text,
    ${futureEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA)},
    ''
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p2_c1_patient_signature \gset

SET SESSION AUTHORIZATION ${patientIdent};

SELECT app.install_signed_context(
  ${quoteLiteral(patientNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA)}::uuid,
  NULL,
  :'p2_c1_patient_signature'
);

INSERT INTO public.program_item_discussion_messages (
  organization_id, instance_stage_item_id, patient_user_id, sender_role, origin, body
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(itemA)}::uuid, ${quoteLiteral(patientA)}::uuid,
  'patient', 'patient_observation', 'ok'
);

\set ON_ERROR_STOP off
INSERT INTO public.program_item_discussion_messages (
  organization_id, instance_stage_item_id, patient_user_id, sender_role, origin, body
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(itemB)}::uuid, ${quoteLiteral(patientA)}::uuid,
  'patient', 'patient_observation', 'wrong item org'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot write discussion message on cross-org stage item.'
\else
\echo 'FATAL: patient wrote discussion message on cross-org stage item.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO public.program_item_discussion_messages (
  organization_id, instance_stage_item_id, patient_user_id, sender_role, origin, body
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(itemA)}::uuid, ${quoteLiteral(patientA)}::uuid,
  'admin', 'support_admin_reply', 'forged'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot forge program-item admin discussion message.'
\else
\echo 'FATAL: patient forged program-item admin discussion message.'
SELECT 1/0;
\endif

INSERT INTO public.support_conversation_messages (
  organization_id, integrator_message_id, conversation_id, sender_role, text, source
) VALUES (
  ${quoteLiteral(orgA)}::uuid, 'webapp-ok', ${quoteLiteral(conversationA)}::uuid,
  'user', 'hello', 'webapp'
);

\set ON_ERROR_STOP off
INSERT INTO public.support_conversation_messages (
  organization_id, integrator_message_id, conversation_id, sender_role, text, source
) VALUES (
  ${quoteLiteral(orgA)}::uuid, 'webapp-bad', ${quoteLiteral(conversationA)}::uuid,
  'admin', 'forged', 'webapp'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot forge support admin message.'
\else
\echo 'FATAL: patient forged support admin message.'
SELECT 1/0;
\endif

INSERT INTO public.treatment_program_events (
  organization_id, instance_id, event_type, target_type, target_id, payload
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(instanceA)}::uuid,
  'status_changed', 'stage_item', ${quoteLiteral(itemA)}::uuid, '{"source":"patient"}'::jsonb
);

SELECT (actor_id = ${quoteLiteral(patientA)}::uuid)::int AS p2_c1_event_actor_filled
FROM public.treatment_program_events
WHERE instance_id = ${quoteLiteral(instanceA)}::uuid
  AND event_type = 'status_changed' \gset
${fatal("p2_c1_event_actor_filled", "patient treatment event trigger must fill actor_id")}

\set ON_ERROR_STOP off
INSERT INTO public.treatment_program_events (
  organization_id, instance_id, actor_id, event_type, target_type, target_id, payload
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(instanceA)}::uuid, ${quoteLiteral(staffUser)}::uuid,
  'status_changed', 'stage_item', ${quoteLiteral(itemA)}::uuid, '{}'::jsonb
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot forge treatment_program_events.actor_id.'
\else
\echo 'FATAL: patient forged treatment_program_events.actor_id.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO public.treatment_program_events (
  organization_id, instance_id, event_type, target_type, target_id, payload
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(instanceA)}::uuid,
  'item_removed', 'stage_item', ${quoteLiteral(itemA)}::uuid, '{}'::jsonb
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot write forbidden treatment event shape.'
\else
\echo 'FATAL: patient wrote forbidden treatment event shape.'
SELECT 1/0;
\endif

SELECT app.release_principal_context();
RESET SESSION AUTHORIZATION;

SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(staffWithPatientContextNonce)},
    pg_backend_pid()::text,
    ${futureEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA)},
    ''
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p2_c1_staff_patient_context_signature \gset

SET SESSION AUTHORIZATION ${staffIdent};

SELECT app.install_signed_context(
  ${quoteLiteral(staffWithPatientContextNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA)}::uuid,
  NULL,
  :'p2_c1_staff_patient_context_signature'
);

INSERT INTO public.program_item_discussion_messages (
  organization_id, instance_stage_item_id, patient_user_id, sender_role, origin, body, support_message_id
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(itemA)}::uuid, ${quoteLiteral(patientA)}::uuid,
  'admin', 'support_admin_reply', 'staff reply', gen_random_uuid()
);
INSERT INTO public.support_conversation_messages (
  organization_id, integrator_message_id, conversation_id, sender_role, text, source
) VALUES (
  ${quoteLiteral(orgA)}::uuid, 'staff-ok', ${quoteLiteral(conversationA)}::uuid,
  'admin', 'staff', 'webapp'
);
INSERT INTO public.treatment_program_events (
  organization_id, instance_id, actor_id, event_type, target_type, target_id, payload
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(instanceA)}::uuid, ${quoteLiteral(staffUser)}::uuid,
  'item_removed', 'stage_item', ${quoteLiteral(itemA)}::uuid, '{}'::jsonb
);
SELECT app.release_principal_context();
RESET SESSION AUTHORIZATION;

\echo 'P2-C1 patient value guards smoke: all assertions CONFIRMED.'
`;

try {
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);
  psql(
    [
      `CREATE ROLE ${ownerIdent} NOLOGIN NOBYPASSRLS;`,
      `CREATE ROLE ${staffIdent} NOLOGIN NOBYPASSRLS;`,
      `CREATE ROLE ${patientIdent} NOLOGIN NOBYPASSRLS;`,
      "",
    ].join("\n"),
  );

  console.log("--- p2-c1: applying protected context artifact ---");
  psqlFile(p2bSqlPath, {
    p2_b_owner_role: ownerRole,
    p2_b_staff_role: staffRole,
    p2_b_patient_role: patientRole,
    p2_b_signing_secret: secret,
  });

  console.log("--- p2-c1: creating synthetic schema ---");
  psql(schemaSql);

  console.log("--- p2-c1: applying patient value guard artifact ---");
  psqlFile(p2c1SqlPath, {
    p2_c1_staff_role: staffRole,
    p2_c1_patient_role: patientRole,
  });

  console.log("--- p2-c1: proving explicit C1 function grants under disposable app roles ---");
  psql(explicitGrantProofSql);

  console.log("--- p2-c1: proving patient value guards under disposable app roles ---");
  psql(proofSql);

  console.log(`smoke-p2-c1-patient-value-guards: OK (${dbName})`);
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
