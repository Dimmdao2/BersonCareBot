#!/usr/bin/env node
/**
 * Disposable PostgreSQL 16 proof for the locked-patient support activity capability.
 *
 * Creates a scratch database and unique runtime roles, installs the real protected principal
 * context plus migration 0234, and proves own/current-message success with cross-patient,
 * cross-organization, stale-message and forged-message rejection. Never opens dev/test/prod.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..");
const contextPath = path.join(repoRoot, "deploy/postgres/p2-b-protected-principal-context.sql");
const migrationPath = path.join(
  repoRoot,
  "apps/webapp/db/drizzle-migrations/0234_current_patient_support_activity.sql",
);
const stamp = `${process.pid}_${Date.now()}`.replaceAll(/[^a-zA-Z0-9_]/g, "_");
const dbName = `bcb_saas_support_activity_scratch_${stamp}`;
const ownerRole = `bcb_support_activity_owner_${stamp}`;
const staffRole = `bcb_support_activity_staff_${stamp}`;
const patientRole = `bcb_support_activity_patient_${stamp}`;
const secret = randomBytes(32).toString("hex");
const futureEpoch = Math.floor(Date.now() / 1000) + 180;

if (!dbName.startsWith("bcb_saas_") || !dbName.includes("scratch")) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}
if (/bcb_webapp_(dev|prod|test)|bersoncarebot_test/.test(dbName)) {
  throw new Error("refusing dev/prod/test-shaped scratch DB name");
}

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function run(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
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

function psql(sql) {
  run(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", dbName],
    sql,
  );
}

function psqlFile(filePath, variables = {}) {
  const variableArgs = Object.entries(variables).flatMap(([key, value]) => [
    "-v",
    `${key}=${value}`,
  ]);
  run(
    "sudo",
    [
      "-n",
      "-u",
      "postgres",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      dbName,
      ...variableArgs,
    ],
    readFileSync(filePath, "utf8"),
  );
}

const ownerIdent = quoteIdent(ownerRole);
const staffIdent = quoteIdent(staffRole);
const patientIdent = quoteIdent(patientRole);
const orgA = "81410000-0000-4000-8000-00000000000a";
const orgB = "81410000-0000-4000-8000-00000000000b";
const patientA = "81410000-0000-4000-8000-000000000001";
const patientB = "81410000-0000-4000-8000-000000000002";
const conversationOwn = "81410000-0000-4000-8000-00000000001a";
const conversationOtherPatient = "81410000-0000-4000-8000-00000000001b";
const conversationOtherOrg = "81410000-0000-4000-8000-00000000001c";
const messageOwn = "81410000-0000-4000-8000-00000000002a";
const messageOtherPatient = "81410000-0000-4000-8000-00000000002b";
const messageOtherOrg = "81410000-0000-4000-8000-00000000002c";
const messageForgedRole = "81410000-0000-4000-8000-00000000002d";
const messageStale = "81410000-0000-4000-8000-00000000002e";
const nonce = `support_activity_${stamp}`;

const schemaSql = String.raw`
CREATE TABLE public.org_enrollments (
  organization_id uuid NOT NULL,
  platform_user_id uuid NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (organization_id, platform_user_id)
);
CREATE TABLE public.support_conversations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  platform_user_id uuid NOT NULL,
  source text NOT NULL,
  admin_scope text NOT NULL,
  status text NOT NULL,
  last_message_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE public.support_conversation_messages (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id),
  sender_role text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL
);

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversation_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY support_conversation_patient_wall
  ON public.support_conversations
  FOR ALL TO ${patientIdent}
  USING (
    organization_id = app.current_org_id()
    AND platform_user_id = app.current_patient_user_id()
  )
  WITH CHECK (
    organization_id = app.current_org_id()
    AND platform_user_id = app.current_patient_user_id()
  );
CREATE POLICY support_message_patient_wall
  ON public.support_conversation_messages
  FOR ALL TO ${patientIdent}
  USING (
    organization_id = app.current_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.support_conversations AS conversation
      WHERE conversation.id = conversation_id
        AND conversation.organization_id = app.current_org_id()
        AND conversation.platform_user_id = app.current_patient_user_id()
    )
  )
  WITH CHECK (
    organization_id = app.current_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.support_conversations AS conversation
      WHERE conversation.id = conversation_id
        AND conversation.organization_id = app.current_org_id()
        AND conversation.platform_user_id = app.current_patient_user_id()
    )
  );

GRANT USAGE ON SCHEMA public TO ${ownerIdent}, ${staffIdent}, ${patientIdent};
GRANT USAGE ON SCHEMA app_ext TO ${ownerIdent};
GRANT SELECT ON public.org_enrollments, public.support_conversations,
  public.support_conversation_messages TO ${ownerIdent};
GRANT UPDATE ON public.support_conversations TO ${ownerIdent};
GRANT SELECT ON public.support_conversations, public.support_conversation_messages TO ${patientIdent};
GRANT INSERT ON public.support_conversation_messages TO ${patientIdent};

INSERT INTO public.org_enrollments (organization_id, platform_user_id, status) VALUES
  (${quoteLiteral(orgA)}, ${quoteLiteral(patientA)}, 'active'),
  (${quoteLiteral(orgA)}, ${quoteLiteral(patientB)}, 'active'),
  (${quoteLiteral(orgB)}, ${quoteLiteral(patientA)}, 'active');
INSERT INTO public.support_conversations (
  id, organization_id, platform_user_id, source, admin_scope, status, last_message_at, updated_at
) VALUES
  (${quoteLiteral(conversationOwn)}, ${quoteLiteral(orgA)}, ${quoteLiteral(patientA)},
    'webapp', 'support', 'open', '2026-01-01', '2026-01-01'),
  (${quoteLiteral(conversationOtherPatient)}, ${quoteLiteral(orgA)}, ${quoteLiteral(patientB)},
    'webapp', 'support', 'open', '2026-01-01', '2026-01-01'),
  (${quoteLiteral(conversationOtherOrg)}, ${quoteLiteral(orgB)}, ${quoteLiteral(patientA)},
    'webapp', 'support', 'open', '2026-01-01', '2026-01-01');
INSERT INTO public.support_conversation_messages (
  id, organization_id, conversation_id, sender_role, source, created_at
) VALUES (
  ${quoteLiteral(messageStale)}, ${quoteLiteral(orgA)}, ${quoteLiteral(conversationOwn)},
  'user', 'webapp', now()
);
`;

const proofSql = String.raw`
ALTER FUNCTION app.touch_current_patient_support_conversation_activity(uuid)
  OWNER TO ${ownerIdent};
REVOKE ALL ON FUNCTION app.touch_current_patient_support_conversation_activity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.touch_current_patient_support_conversation_activity(uuid)
  TO ${patientIdent};

SELECT 1 / (
  has_function_privilege(
    ${quoteLiteral(patientRole)},
    'app.touch_current_patient_support_conversation_activity(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    ${quoteLiteral(staffRole)},
    'app.touch_current_patient_support_conversation_activity(uuid)',
    'EXECUTE'
  )
  AND NOT has_column_privilege(
    ${quoteLiteral(patientRole)},
    'public.support_conversations',
    'last_message_at',
    'UPDATE'
  )
  AND NOT has_column_privilege(
    ${quoteLiteral(patientRole)},
    'public.support_conversations',
    'status',
    'UPDATE'
  )
)::int;

BEGIN;
INSERT INTO public.support_conversation_messages (
  id, organization_id, conversation_id, sender_role, source, created_at
) VALUES
  (${quoteLiteral(messageOtherPatient)}, ${quoteLiteral(orgA)},
    ${quoteLiteral(conversationOtherPatient)}, 'user', 'webapp', now()),
  (${quoteLiteral(messageOtherOrg)}, ${quoteLiteral(orgB)},
    ${quoteLiteral(conversationOtherOrg)}, 'user', 'webapp', now()),
  (${quoteLiteral(messageForgedRole)}, ${quoteLiteral(orgA)},
    ${quoteLiteral(conversationOwn)}, 'admin', 'webapp', now());

SELECT encode(app_ext.hmac(
  concat_ws(
    '|', 'v1', ${quoteLiteral(nonce)}, pg_backend_pid()::text, ${futureEpoch}::text,
    ${quoteLiteral(orgA)}, ${quoteLiteral(patientA)}, ''
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS support_activity_signature \gset

SET SESSION AUTHORIZATION ${patientIdent};
SELECT app.install_signed_context(
  ${quoteLiteral(nonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA)}::uuid,
  NULL,
  :'support_activity_signature'
);

INSERT INTO public.support_conversation_messages (
  id, organization_id, conversation_id, sender_role, source, created_at
) VALUES (
  ${quoteLiteral(messageOwn)}, ${quoteLiteral(orgA)}, ${quoteLiteral(conversationOwn)},
  'user', 'webapp', transaction_timestamp() + interval '10 years'
);

SELECT 1 / app.touch_current_patient_support_conversation_activity(
  ${quoteLiteral(messageOwn)}::uuid
)::int;
SELECT 1 / (NOT app.touch_current_patient_support_conversation_activity(
  ${quoteLiteral(messageOtherPatient)}::uuid
))::int;
SELECT 1 / (NOT app.touch_current_patient_support_conversation_activity(
  ${quoteLiteral(messageOtherOrg)}::uuid
))::int;
SELECT 1 / (NOT app.touch_current_patient_support_conversation_activity(
  ${quoteLiteral(messageForgedRole)}::uuid
))::int;
SELECT 1 / (NOT app.touch_current_patient_support_conversation_activity(
  ${quoteLiteral(messageStale)}::uuid
))::int;
SELECT 1 / (
  (
    SELECT conversation.status = 'open'
      AND conversation.last_message_at = transaction_timestamp()
      AND conversation.last_message_at < message.created_at
    FROM public.support_conversations AS conversation
    JOIN public.support_conversation_messages AS message
      ON message.conversation_id = conversation.id
    WHERE conversation.id = ${quoteLiteral(conversationOwn)}::uuid
      AND message.id = ${quoteLiteral(messageOwn)}::uuid
  )
)::int;

SELECT app.release_principal_context();
RESET SESSION AUTHORIZATION;
COMMIT;
SELECT 'PASS: locked patient support activity capability' AS result;
`;

try {
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);
  psql([
    `CREATE ROLE ${ownerIdent} NOLOGIN BYPASSRLS;`,
    `CREATE ROLE ${staffIdent} NOLOGIN NOBYPASSRLS;`,
    `CREATE ROLE ${patientIdent} NOLOGIN NOBYPASSRLS;`,
  ].join("\n"));
  psqlFile(contextPath, {
    p2_b_owner_role: ownerRole,
    p2_b_staff_role: staffRole,
    p2_b_patient_role: patientRole,
    p2_b_signing_secret: secret,
  });
  psql(schemaSql);
  psqlFile(migrationPath);
  psql(proofSql);
} finally {
  run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
  run(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", "postgres"],
    [
      `DROP ROLE IF EXISTS ${patientIdent};`,
      `DROP ROLE IF EXISTS ${staffIdent};`,
      `DROP ROLE IF EXISTS ${ownerIdent};`,
    ].join("\n"),
  );
}
