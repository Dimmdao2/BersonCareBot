#!/usr/bin/env node
/**
 * P2-C2 patient value-level guards smoke.
 *
 * Scratch-only proof for deploy/postgres/p2-c2-patient-value-guards.sql. It applies the P2-B
 * protected context artifact first, then applies P2-C2 triggers against a synthetic schema carrying
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
const p2c2SqlPath = path.join(repoRoot, "deploy/postgres/p2-c2-patient-value-guards.sql");

const scratchSuffix = `${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "_");
const dbName = `bcb_saas_p2_c2_value_guard_scratch_${scratchSuffix}`;
const ownerRole = `bcb_p2_c2_context_owner_${scratchSuffix}`;
const staffRole = `bcb_p2_c2_app_staff_${scratchSuffix}`;
const patientRole = `bcb_p2_c2_app_patient_${scratchSuffix}`;

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

const orgA = "30000000-0000-4000-8000-0000000000a1";
const orgB = "30000000-0000-4000-8000-0000000000b1";
const patientA = "30000000-0000-4000-8000-00000000a101";
const patientB = "30000000-0000-4000-8000-00000000b101";
const requestA = "30000000-0000-4000-8000-00000000aa01";
const requestB = "30000000-0000-4000-8000-00000000bb01";
const requestClosed = "30000000-0000-4000-8000-00000000cc01";
const legacyUserA = `legacy-user-a-${scratchSuffix}`;
const futureEpoch = Math.floor(Date.now() / 1000) + 120;
const patientNonce = `patient_${scratchSuffix}`;
const staffWithPatientContextNonce = `staff_patient_context_${scratchSuffix}`;
let dbCreated = false;
let rolesCreated = false;

const schemaSql = String.raw`
CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY,
  integrator_user_id bigint
);

CREATE TABLE public.online_intake_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'new'
);

CREATE TABLE public.online_intake_status_history (
  request_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid,
  note text
);

CREATE TABLE public.user_channel_preferences (
  user_id text NOT NULL,
  platform_user_id uuid,
  channel_code text NOT NULL CHECK (channel_code = ANY (ARRAY['telegram'::text, 'max'::text, 'vk'::text, 'sms'::text, 'email'::text, 'web_push'::text])),
  is_enabled_for_messages boolean NOT NULL DEFAULT true,
  is_enabled_for_notifications boolean NOT NULL DEFAULT true,
  is_preferred_for_auth boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_code)
);
CREATE UNIQUE INDEX idx_user_channel_preferences_one_auth_pref
  ON public.user_channel_preferences (user_id)
  WHERE is_preferred_for_auth = true;

CREATE TABLE public.reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_rule_id text NOT NULL UNIQUE,
  organization_id uuid NOT NULL,
  platform_user_id uuid,
  integrator_user_id bigint,
  category text NOT NULL,
  linked_object_type text,
  reminder_intent text,
  notification_topic_code text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_users (id, integrator_user_id) VALUES
  (${quoteLiteral(patientA)}, 700001),
  (${quoteLiteral(patientB)}, 700002);

INSERT INTO public.online_intake_requests (id, user_id, organization_id, status) VALUES
  (${quoteLiteral(requestA)}, ${quoteLiteral(patientA)}, ${quoteLiteral(orgA)}, 'new'),
  (${quoteLiteral(requestB)}, ${quoteLiteral(patientB)}, ${quoteLiteral(orgB)}, 'new'),
  (${quoteLiteral(requestClosed)}, ${quoteLiteral(patientA)}, ${quoteLiteral(orgA)}, 'submitted');

GRANT USAGE ON SCHEMA public TO ${patientIdent}, ${staffIdent};
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ${patientIdent}, ${staffIdent};
`;

const explicitGrantProofSql = String.raw`
WITH expected_functions(signature) AS (
  VALUES
    ('app.p2_c2_is_patient_context()'),
    ('app.p2_c2_user_channel_preference_is_owned(text, uuid)'),
    ('app.p2_c2_expected_reminder_notification_topic_code(text, text, text)'),
    ('app.p2_c2_guard_online_intake_status_history()'),
    ('app.p2_c2_guard_user_channel_preferences()'),
    ('app.p2_c2_guard_reminder_rules()')
),
resolved_functions AS (
  SELECT signature, to_regprocedure(signature) AS function_oid
  FROM expected_functions
)
SELECT (
  count(*) = 6
  AND count(*) FILTER (WHERE function_oid IS NOT NULL) = 6
  AND NOT EXISTS (
    SELECT 1
    FROM resolved_functions resolved
    JOIN pg_proc proc ON proc.oid = resolved.function_oid
    CROSS JOIN LATERAL aclexplode(COALESCE(proc.proacl, acldefault('f', proc.proowner))) acl
    WHERE acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  )
)::int AS p2_c2_public_execute_revoked
FROM resolved_functions \gset
${fatal("p2_c2_public_execute_revoked", "P2-C2 functions must revoke PUBLIC EXECUTE")}

WITH expected_functions(signature) AS (
  VALUES
    ('app.p2_c2_is_patient_context()'),
    ('app.p2_c2_user_channel_preference_is_owned(text, uuid)'),
    ('app.p2_c2_expected_reminder_notification_topic_code(text, text, text)'),
    ('app.p2_c2_guard_online_intake_status_history()'),
    ('app.p2_c2_guard_user_channel_preferences()'),
    ('app.p2_c2_guard_reminder_rules()')
)
SELECT (
  bool_and(has_function_privilege(${quoteLiteral(patientRole)}, signature, 'EXECUTE'))
  AND bool_and(has_function_privilege(${quoteLiteral(staffRole)}, signature, 'EXECUTE'))
)::int AS p2_c2_explicit_execute_granted
FROM expected_functions \gset
${fatal("p2_c2_explicit_execute_granted", "P2-C2 functions must grant EXECUTE to explicit app roles")}

SET SESSION AUTHORIZATION ${patientIdent};
SELECT app.p2_c2_is_patient_context() AS p2_c2_patient_can_execute_helper;
RESET SESSION AUTHORIZATION;

\echo 'P2-C2 explicit function grants CONFIRMED.'
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
), 'hex') AS p2_c2_patient_signature \gset

SET SESSION AUTHORIZATION ${patientIdent};

SELECT app.install_signed_context(
  ${quoteLiteral(patientNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA)}::uuid,
  NULL,
  :'p2_c2_patient_signature'
);

INSERT INTO public.online_intake_status_history (
  request_id, organization_id, from_status, to_status
) VALUES (
  ${quoteLiteral(requestA)}::uuid, ${quoteLiteral(orgA)}::uuid, NULL, 'new'
);

\set ON_ERROR_STOP off
INSERT INTO public.online_intake_status_history (
  request_id, organization_id, from_status, to_status
) VALUES (
  ${quoteLiteral(requestA)}::uuid, ${quoteLiteral(orgA)}::uuid, NULL, 'new'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot create duplicate initial online intake history.'
\else
\echo 'FATAL: patient created duplicate initial online intake history.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO public.online_intake_status_history (
  request_id, organization_id, from_status, to_status
) VALUES (
  ${quoteLiteral(requestClosed)}::uuid, ${quoteLiteral(orgA)}::uuid, NULL, 'new'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot create initial online intake history when request is not new.'
\else
\echo 'FATAL: patient created initial online intake history when request is not new.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO public.online_intake_status_history (
  request_id, organization_id, from_status, to_status
) VALUES (
  ${quoteLiteral(requestA)}::uuid, ${quoteLiteral(orgA)}::uuid, 'new', 'closed'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot forge online intake status history transition.'
\else
\echo 'FATAL: patient forged online intake status history transition.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO public.online_intake_status_history (
  request_id, organization_id, from_status, to_status
) VALUES (
  ${quoteLiteral(requestB)}::uuid, ${quoteLiteral(orgB)}::uuid, NULL, 'new'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot write online intake history for another org/request.'
\else
\echo 'FATAL: patient wrote online intake history for another org/request.'
SELECT 1/0;
\endif

INSERT INTO public.user_channel_preferences (
  user_id, platform_user_id, channel_code, is_preferred_for_auth
) VALUES (
  ${quoteLiteral(patientA)}, ${quoteLiteral(patientA)}::uuid, 'telegram', true
);

INSERT INTO public.user_channel_preferences (
  user_id, platform_user_id, channel_code, is_enabled_for_notifications
) VALUES (
  ${quoteLiteral(legacyUserA)}, ${quoteLiteral(patientA)}::uuid, 'max', true
);

UPDATE public.user_channel_preferences
SET is_enabled_for_notifications = false
WHERE user_id = ${quoteLiteral(legacyUserA)}
  AND platform_user_id = ${quoteLiteral(patientA)}::uuid
  AND channel_code = 'max';

SELECT (is_enabled_for_notifications = false)::int AS p2_c2_legacy_platform_owned_update_allowed
FROM public.user_channel_preferences
WHERE user_id = ${quoteLiteral(legacyUserA)}
  AND platform_user_id = ${quoteLiteral(patientA)}::uuid
  AND channel_code = 'max' \gset
${fatal("p2_c2_legacy_platform_owned_update_allowed", "patient must update legacy channel preference rows owned by platform_user_id")}

DO $$
BEGIN
  INSERT INTO public.user_channel_preferences (
    user_id, platform_user_id, channel_code, is_preferred_for_auth
  ) VALUES (
    ${quoteLiteral(legacyUserA)}, ${quoteLiteral(patientA)}::uuid, 'email', true
  );

  RAISE EXCEPTION 'patient created a second preferred auth channel through a mixed legacy row';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'patient_channel_preference_auth_preferred_already_exists' THEN
      RAISE;
    END IF;
END;
$$;
\echo 'CONFIRMED: patient cannot create a second preferred auth channel through a mixed legacy row.'

DO $$
BEGIN
  INSERT INTO public.user_channel_preferences (
    user_id, platform_user_id, channel_code, is_preferred_for_auth
  ) VALUES (
    ${quoteLiteral(patientA)}, ${quoteLiteral(patientA)}::uuid, 'web_push', true
  );

  RAISE EXCEPTION 'patient preferred a non-auth channel';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'patient_channel_preference_auth_channel_forbidden' THEN
      RAISE;
    END IF;
END;
$$;
\echo 'CONFIRMED: patient cannot prefer a non-auth channel.'

DO $$
BEGIN
  INSERT INTO public.user_channel_preferences (
    user_id, platform_user_id, channel_code, is_preferred_for_auth
  ) VALUES (
    ${quoteLiteral(patientB)}, ${quoteLiteral(patientB)}::uuid, 'sms', false
  );

  RAISE EXCEPTION 'patient inserted channel preference for another user';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'patient_channel_preference_new_row_not_owned' THEN
      RAISE;
    END IF;
END;
$$;
\echo 'CONFIRMED: patient cannot insert channel preference for another user.'

DO $$
BEGIN
  INSERT INTO public.user_channel_preferences (
    user_id, platform_user_id, channel_code, is_preferred_for_auth
  ) VALUES (
    ${quoteLiteral(patientA)}, ${quoteLiteral(patientA)}::uuid, 'sms', true
  );

  RAISE EXCEPTION 'patient created two preferred auth channels for one user';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'patient_channel_preference_auth_preferred_already_exists' THEN
      RAISE;
    END IF;
END;
$$;
\echo 'CONFIRMED: unique index keeps one preferred auth channel per user.'

UPDATE public.user_channel_preferences
SET is_preferred_for_auth = false
WHERE user_id = ${quoteLiteral(patientA)} AND channel_code = 'telegram';

INSERT INTO public.user_channel_preferences (
  user_id, platform_user_id, channel_code, is_preferred_for_auth
) VALUES (
  ${quoteLiteral(patientA)}, ${quoteLiteral(patientA)}::uuid, 'sms', true
);

DO $$
BEGIN
  UPDATE public.user_channel_preferences
  SET channel_code = 'web_push'
  WHERE user_id = ${quoteLiteral(patientA)} AND channel_code = 'sms';

  RAISE EXCEPTION 'patient updated preferred auth channel to a non-auth channel';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'patient_channel_preference_auth_channel_forbidden' THEN
      RAISE;
    END IF;
END;
$$;
\echo 'CONFIRMED: patient cannot update preferred auth channel to a non-auth channel.'

INSERT INTO public.reminder_rules (
  integrator_rule_id, organization_id, platform_user_id, integrator_user_id, category,
  linked_object_type, reminder_intent, notification_topic_code
) VALUES (
  'rr-lfk', ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid, 700001, 'lfk',
  'lfk_complex', 'generic', 'appointment_reminders'
);

SELECT (notification_topic_code = 'training_reminders')::int AS p2_c2_lfk_topic_normalized
FROM public.reminder_rules
WHERE integrator_rule_id = 'rr-lfk' \gset
${fatal("p2_c2_lfk_topic_normalized", "patient reminder lfk topic must normalize to training_reminders")}

UPDATE public.reminder_rules
SET reminder_intent = 'warmup', notification_topic_code = 'appointment_reminders'
WHERE integrator_rule_id = 'rr-lfk';

SELECT (notification_topic_code = 'warmup_reminders')::int AS p2_c2_warmup_topic_normalized
FROM public.reminder_rules
WHERE integrator_rule_id = 'rr-lfk' \gset
${fatal("p2_c2_warmup_topic_normalized", "patient reminder warmup topic must normalize to warmup_reminders")}

INSERT INTO public.reminder_rules (
  integrator_rule_id, organization_id, platform_user_id, integrator_user_id, category,
  linked_object_type, reminder_intent, notification_topic_code
) VALUES (
  'rr-important', ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid, 700001, 'important',
  NULL, 'warmup', 'training_reminders'
);

SELECT (notification_topic_code IS NULL)::int AS p2_c2_important_topic_normalized
FROM public.reminder_rules
WHERE integrator_rule_id = 'rr-important' \gset
${fatal("p2_c2_important_topic_normalized", "patient reminder important topic must normalize to NULL")}

\set ON_ERROR_STOP off
INSERT INTO public.reminder_rules (
  integrator_rule_id, organization_id, platform_user_id, integrator_user_id, category,
  linked_object_type, reminder_intent, notification_topic_code
) VALUES (
  'rr-other-user', ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientB)}::uuid, 700002, 'lfk',
  'lfk_complex', 'generic', 'training_reminders'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: patient cannot write reminder rule for another user.'
\else
\echo 'FATAL: patient wrote reminder rule for another user.'
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
), 'hex') AS p2_c2_staff_patient_context_signature \gset

SET SESSION AUTHORIZATION ${staffIdent};

SELECT app.install_signed_context(
  ${quoteLiteral(staffWithPatientContextNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA)}::uuid,
  NULL,
  :'p2_c2_staff_patient_context_signature'
);

INSERT INTO public.user_channel_preferences (
  user_id, platform_user_id, channel_code, is_preferred_for_auth
) VALUES (
  ${quoteLiteral(patientB)}, ${quoteLiteral(patientB)}::uuid, 'web_push', true
);
INSERT INTO public.online_intake_status_history (
  request_id, organization_id, from_status, to_status, changed_by, note
) VALUES (
  ${quoteLiteral(requestA)}::uuid, ${quoteLiteral(orgA)}::uuid, 'new', 'closed',
  ${quoteLiteral(patientA)}::uuid, 'staff status change shape bypasses patient guard'
);
INSERT INTO public.reminder_rules (
  integrator_rule_id, organization_id, platform_user_id, integrator_user_id, category,
  linked_object_type, reminder_intent, notification_topic_code
) VALUES (
  'rr-staff', ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientB)}::uuid, 700002, 'lfk',
  'lfk_complex', 'generic', 'appointment_reminders'
);
SELECT app.release_principal_context();
RESET SESSION AUTHORIZATION;

\echo 'P2-C2 patient value guards smoke: all assertions CONFIRMED.'
`;

try {
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);
  dbCreated = true;
  psql(
    [
      `CREATE ROLE ${ownerIdent} NOLOGIN NOBYPASSRLS;`,
      `CREATE ROLE ${staffIdent} NOLOGIN NOBYPASSRLS;`,
      `CREATE ROLE ${patientIdent} NOLOGIN NOBYPASSRLS;`,
      "",
    ].join("\n"),
  );
  rolesCreated = true;

  console.log("--- p2-c2: applying protected context artifact ---");
  psqlFile(p2bSqlPath, {
    p2_b_owner_role: ownerRole,
    p2_b_staff_role: staffRole,
    p2_b_patient_role: patientRole,
    p2_b_signing_secret: secret,
  });

  console.log("--- p2-c2: creating synthetic schema ---");
  psql(schemaSql);

  console.log("--- p2-c2: applying patient value guard artifact ---");
  psqlFile(p2c2SqlPath, {
    p2_c2_staff_role: staffRole,
    p2_c2_patient_role: patientRole,
  });

  console.log("--- p2-c2: proving explicit C2 function grants under disposable app roles ---");
  psql(explicitGrantProofSql);

  console.log("--- p2-c2: proving patient value guards under disposable app roles ---");
  psql(proofSql);

  console.log(`smoke-p2-c2-patient-value-guards: OK (${dbName})`);
} finally {
  if (dbCreated) {
    try {
      run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
    } catch (error) {
      console.error(`smoke-p2-c2-patient-value-guards: cleanup dropdb failed: ${error.message}`);
    }
  }
  if (rolesCreated) {
    try {
      run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
        input: [
          `DROP ROLE IF EXISTS ${patientIdent};`,
          `DROP ROLE IF EXISTS ${staffIdent};`,
          `DROP ROLE IF EXISTS ${ownerIdent};`,
          "",
        ].join("\n"),
      });
    } catch (error) {
      console.error(`smoke-p2-c2-patient-value-guards: cleanup role drop failed: ${error.message}`);
    }
  }
}
