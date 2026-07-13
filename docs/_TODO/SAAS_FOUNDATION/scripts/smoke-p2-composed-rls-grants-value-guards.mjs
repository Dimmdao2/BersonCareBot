#!/usr/bin/env node
/**
 * Phase 2 composed closeout smoke.
 *
 * Scratch-only representative proof that the Phase 2 layers work together:
 *   - P2-B protected principal context helpers, with role-derived app.is_staff();
 *   - P2-C1/C2/C3 patient value guards;
 *   - app_staff/app_patient-style grant surface, using P0.5b generator metadata for the selected
 *     target tables and column grants;
 *   - P0.9 generated enforce RLS policies for the selected SCOPED target tables.
 *
 * This is intentionally a bounded synthetic schema with real table/column names. It is not a full
 * production schema replay and does not replace the later disposable prod-copy rehearsal.
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
const p2c2SqlPath = path.join(repoRoot, "deploy/postgres/p2-c2-patient-value-guards.sql");
const p2c3SqlPath = path.join(repoRoot, "deploy/postgres/p2-c3-patient-booking-lfk-guards.sql");

const { getAppStaffGrantTables, getAppPatientGrantTables, appPatientColumnGrants } = await import(
  path.join(__dirname, "p0-5b-grants-sql.mjs")
);
const { getP09EnforceDescriptorByTable, renderP09EnforcePolicyStatements } = await import(
  path.join(__dirname, "p0-9-enforce-descriptors.mjs")
);

const scratchSuffix = `${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "_");
const dbName = `bcb_saas_p2_composed_scratch_${scratchSuffix}`;
const ownerRole = `bcb_saas_p2_composed_owner_scratch_${scratchSuffix}`;
const staffRole = `bcb_saas_p2_composed_staff_scratch_${scratchSuffix}`;
const patientRole = `bcb_saas_p2_composed_patient_scratch_${scratchSuffix}`;

const forbiddenDbPattern = /(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/i;

if (!dbName.startsWith("bcb_saas_") || !dbName.includes("scratch")) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}
if (forbiddenDbPattern.test(dbName) || /bcb_webapp_(dev|prod|test)|bersoncarebot_(dev|prod|test)/i.test(dbName)) {
  throw new Error("refusing dev/prod/test-shaped scratch DB name");
}
for (const roleName of [ownerRole, staffRole, patientRole]) {
  if (!roleName.startsWith("bcb_saas_") || !roleName.includes("scratch")) {
    throw new Error(`refusing unsafe scratch role name: ${roleName}`);
  }
}

function databaseNameFromUrl(value) {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/^\/+/, "");
    return pathname ? decodeURIComponent(pathname) : null;
  } catch {
    return null;
  }
}

function unsafeParentDbReason(name) {
  if (!name) return "empty or unparsable DB name";
  const normalized = name.toLowerCase();
  if (
    new Set([
      "bcb_webapp_prod",
      "bcb_webapp_test",
      "bcb_webapp_dev",
      "bersoncarebot_prod",
      "bersoncarebot_test",
      "bersoncarebot_dev",
      "production",
      "prod",
      "test",
      "dev",
    ]).has(normalized)
  ) {
    return `forbidden DB name ${name}`;
  }
  if (forbiddenDbPattern.test(normalized)) return `prod/test/dev-shaped DB name ${name}`;
  return null;
}

function assertNoUnsafeParentDbHints() {
  const candidates = [];
  if (process.env.DATABASE_URL) {
    candidates.push({ source: "DATABASE_URL", name: databaseNameFromUrl(process.env.DATABASE_URL) });
  }
  if (process.env.PGDATABASE) {
    candidates.push({ source: "PGDATABASE", name: process.env.PGDATABASE });
  }

  for (const candidate of candidates) {
    const reason = unsafeParentDbReason(candidate.name);
    if (reason) throw new Error(`${candidate.source}: ${reason}; refusing scratch smoke`);
  }
}

function sanitizedChildEnv() {
  const env = { ...process.env };
  for (const key of [
    "DATABASE_URL",
    "PGDATABASE",
    "PGHOST",
    "PGPASSWORD",
    "PGPASSFILE",
    "PGPORT",
    "PGSERVICE",
    "PGSERVICEFILE",
    "PGUSER",
  ]) {
    delete env[key];
  }
  return env;
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
    env: sanitizedChildEnv(),
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
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", database], {
    input: `${buildPsqlVariablePrelude(variables)}\n${sql}`,
    label: `sudo -n -u postgres psql -v ON_ERROR_STOP=1 -d ${database} < ${path.relative(repoRoot, filePath)} (psql variables redacted)`,
  });
}

function buildPsqlVariablePrelude(variables) {
  const assignments = Object.entries(variables).map(([key, value]) => {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      throw new Error(`unsafe psql variable key: ${key}`);
    }
    return `  ${quoteLiteral(value)} AS ${key}`;
  });

  return `SELECT\n${assignments.join(",\n")}\n\\gset`;
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

function findOrThrow(items, qualifiedName) {
  const found = items.find((item) => item.qualifiedName === qualifiedName);
  if (!found) throw new Error(`Expected ${qualifiedName} in P0.5b grant metadata`);
  return found;
}

function columnGrantOrThrow(qualifiedName, privilege) {
  const found = appPatientColumnGrants.find(
    (grant) => grant.qualifiedName === qualifiedName && grant.privilege === privilege,
  );
  if (!found) throw new Error(`Expected ${privilege} column grant for ${qualifiedName}`);
  return found;
}

function grantColumns(qualifiedName, privilege) {
  return columnGrantOrThrow(qualifiedName, privilege).columns.join(", ");
}

function generatedRlsSqlFor(tables) {
  return tables
    .flatMap((table) => renderP09EnforcePolicyStatements(getP09EnforceDescriptorByTable(table)))
    .join("\n");
}

const staffGrantTables = getAppStaffGrantTables();
const patientGrantTables = getAppPatientGrantTables();

const grantExpectations = [
  ["public.treatment_program_events", "SELECT"],
  ["public.user_channel_preferences", "SELECT"],
  ["public.be_appointment_cancellations", "SELECT, INSERT"],
  ["public.be_appointment_reschedules", "SELECT, INSERT"],
  ["public.be_appointments", "SELECT"],
  ["public.lfk_complexes", "SELECT"],
  ["public.online_intake_status_history", "SELECT"],
];
for (const [qualifiedName, expectedPrivileges] of grantExpectations) {
  const actual = findOrThrow(patientGrantTables, qualifiedName).privileges;
  if (actual !== expectedPrivileges) {
    throw new Error(`Unexpected app_patient base grant for ${qualifiedName}: ${actual}`);
  }
}
for (const qualifiedName of [
  "public.program_item_discussion_messages",
  "public.support_conversation_messages",
  "public.reminder_rules",
  "public.lfk_sessions",
  "public.online_intake_requests",
]) {
  findOrThrow(patientGrantTables, qualifiedName);
}
for (const qualifiedName of [
  "public.treatment_program_events",
  "public.user_channel_preferences",
  "public.be_appointment_cancellations",
  "public.be_appointment_reschedules",
  "public.be_appointments",
  "public.lfk_complexes",
]) {
  findOrThrow(staffGrantTables, qualifiedName);
}

const ownerIdent = quoteIdent(ownerRole);
const staffIdent = quoteIdent(staffRole);
const patientIdent = quoteIdent(patientRole);
const secret = randomBytes(32).toString("hex");

const orgA = "92000000-0000-4000-8000-0000000000a1";
const orgB = "92000000-0000-4000-8000-0000000000b1";
const patientA = "92000000-0000-4000-8000-00000000a101";
const patientA2 = "92000000-0000-4000-8000-00000000a102";
const patientB = "92000000-0000-4000-8000-00000000b101";
const staffUser = "92000000-0000-4000-8000-00000000f101";
const instanceA = "92000000-0000-4000-8000-00000000aa01";
const instanceB = "92000000-0000-4000-8000-00000000bb01";
const stageA = "92000000-0000-4000-8000-00000000aa02";
const stageB = "92000000-0000-4000-8000-00000000bb02";
const itemA = "92000000-0000-4000-8000-00000000aa03";
const itemB = "92000000-0000-4000-8000-00000000bb03";
const conversationA = "92000000-0000-4000-8000-00000000ac01";
const conversationA2 = "92000000-0000-4000-8000-00000000ac02";
const conversationB = "92000000-0000-4000-8000-00000000bc01";
const requestA = "92000000-0000-4000-8000-00000000ad01";
const requestB = "92000000-0000-4000-8000-00000000bd01";
const appointmentCancel = "92000000-0000-4000-8000-00000000ae02";
const appointmentReschedule = "92000000-0000-4000-8000-00000000ae03";
const appointmentA2 = "92000000-0000-4000-8000-00000000ae04";
const appointmentB = "92000000-0000-4000-8000-00000000be01";
const cancellationRow = "92000000-0000-4000-8000-00000000af01";
const rescheduleRow = "92000000-0000-4000-8000-00000000af02";
const complexA = "92000000-0000-4000-8000-00000000ca01";
const complexB = "92000000-0000-4000-8000-00000000cb01";
const sessionA = "92000000-0000-4000-8000-00000000da01";
const futureEpoch = Math.floor(Date.now() / 1000) + 120;
const patientNonce = `patient_${scratchSuffix}`;
const staffNonce = `staff_${scratchSuffix}`;

const generatedRlsTables = [
  "public.treatment_program_instances",
  "public.treatment_program_instance_stages",
  "public.treatment_program_instance_stage_items",
  "public.program_item_discussion_messages",
  "public.support_conversations",
  "public.support_conversation_messages",
  "public.treatment_program_events",
  "public.online_intake_requests",
  "public.online_intake_status_history",
  "public.reminder_rules",
  "public.be_appointments",
  "public.be_appointment_cancellations",
  "public.be_appointment_reschedules",
  "public.be_appointment_events",
  "public.be_appointment_history_events",
  "public.lfk_complexes",
  "public.lfk_sessions",
  "public.platform_users",
  "public.user_channel_preferences",
];

const schemaSql = String.raw`
CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY,
  role text NOT NULL DEFAULT 'patient',
  integrator_user_id bigint,
  calendar_timezone text,
  reminder_muted_until timestamptz
);

CREATE TABLE public.treatment_program_instances (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  patient_user_id uuid NOT NULL
);

CREATE TABLE public.treatment_program_instance_stages (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  instance_id uuid NOT NULL
);

CREATE TABLE public.treatment_program_instance_stage_items (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  stage_id uuid NOT NULL
);

CREATE TABLE public.program_item_discussion_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
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
  organization_id uuid NOT NULL,
  platform_user_id uuid,
  integrator_conversation_id text NOT NULL,
  source text,
  admin_scope text,
  status text,
  opened_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  closed_at timestamptz,
  close_reason text,
  channel_code text,
  channel_external_id text
);

CREATE TABLE public.support_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
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
  organization_id uuid NOT NULL,
  instance_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  target_type text,
  target_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.online_intake_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  type text,
  summary text,
  status text NOT NULL DEFAULT 'new',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.online_intake_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE UNIQUE INDEX idx_p2_composed_one_auth_pref
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

CREATE TABLE public.be_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid,
  room_id uuid,
  specialist_id uuid,
  service_id uuid,
  platform_user_id uuid,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  original_start_at timestamptz,
  reschedule_count integer NOT NULL DEFAULT 0,
  payment_ref text,
  package_usage_ref text,
  phone_normalized text,
  attribution_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE public.be_appointment_cancellations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  actor_type text NOT NULL,
  actor_id uuid,
  cancellation_type text NOT NULL,
  reason text,
  was_free boolean NOT NULL,
  was_penalized boolean NOT NULL,
  package_session_charged boolean NOT NULL,
  prepayment_retained boolean NOT NULL,
  prepayment_refunded boolean NOT NULL,
  staff_comment text,
  notifications_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
  manual_override boolean NOT NULL DEFAULT false,
  applied_policy_id uuid,
  applied_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.be_appointment_reschedules (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  from_start_at timestamptz NOT NULL,
  from_end_at timestamptz NOT NULL,
  to_start_at timestamptz NOT NULL,
  to_end_at timestamptz NOT NULL,
  actor_type text NOT NULL,
  actor_id uuid,
  was_in_free_reschedule_window boolean NOT NULL,
  free_cancellation_available_at_reschedule boolean NOT NULL,
  free_cancellation_available_after boolean NOT NULL,
  applied_policy_id uuid,
  applied_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  staff_comment text,
  notifications_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
  manual_override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.be_appointment_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.be_appointment_history_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lfk_complexes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id text,
  platform_user_id uuid,
  title text NOT NULL,
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'assigned_by_specialist')),
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  symptom_tracking_id uuid,
  region_ref_id uuid,
  side text,
  diagnosis_text text,
  diagnosis_ref_id uuid
);

CREATE TABLE public.lfk_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid NOT NULL,
  complex_id uuid NOT NULL,
  completed_at timestamptz NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz,
  duration_minutes smallint,
  difficulty_0_10 smallint,
  pain_0_10 smallint,
  comment text
);

INSERT INTO public.platform_users (id, role, integrator_user_id, calendar_timezone) VALUES
  (${quoteLiteral(patientA)}::uuid, 'patient', 920001, 'Europe/Moscow'),
  (${quoteLiteral(patientA2)}::uuid, 'patient', 920003, 'Europe/Moscow'),
  (${quoteLiteral(patientB)}::uuid, 'patient', 920002, 'Europe/Moscow'),
  (${quoteLiteral(staffUser)}::uuid, 'doctor', NULL, 'Europe/Moscow');

INSERT INTO public.treatment_program_instances (id, organization_id, patient_user_id) VALUES
  (${quoteLiteral(instanceA)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid),
  (${quoteLiteral(instanceB)}::uuid, ${quoteLiteral(orgB)}::uuid, ${quoteLiteral(patientB)}::uuid);

INSERT INTO public.treatment_program_instance_stages (id, organization_id, instance_id) VALUES
  (${quoteLiteral(stageA)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(instanceA)}::uuid),
  (${quoteLiteral(stageB)}::uuid, ${quoteLiteral(orgB)}::uuid, ${quoteLiteral(instanceB)}::uuid);

INSERT INTO public.treatment_program_instance_stage_items (id, organization_id, stage_id) VALUES
  (${quoteLiteral(itemA)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(stageA)}::uuid),
  (${quoteLiteral(itemB)}::uuid, ${quoteLiteral(orgB)}::uuid, ${quoteLiteral(stageB)}::uuid);

INSERT INTO public.support_conversations (
  id, organization_id, platform_user_id, integrator_conversation_id, source, admin_scope, status, opened_at
) VALUES
  (${quoteLiteral(conversationA)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid, 'conv-a', 'webapp', 'patient', 'open', now()),
  (${quoteLiteral(conversationA2)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA2)}::uuid, 'conv-a2', 'webapp', 'patient', 'open', now()),
  (${quoteLiteral(conversationB)}::uuid, ${quoteLiteral(orgB)}::uuid, ${quoteLiteral(patientB)}::uuid, 'conv-b', 'webapp', 'patient', 'open', now());

INSERT INTO public.online_intake_requests (id, user_id, organization_id, type, summary, status) VALUES
  (${quoteLiteral(requestA)}::uuid, ${quoteLiteral(patientA)}::uuid, ${quoteLiteral(orgA)}::uuid, 'lfk', 'own', 'new'),
  (${quoteLiteral(requestB)}::uuid, ${quoteLiteral(patientB)}::uuid, ${quoteLiteral(orgB)}::uuid, 'lfk', 'other', 'new');

INSERT INTO public.be_appointments (
  id, organization_id, platform_user_id, start_at, end_at, duration_minutes,
  source, status, original_start_at, reschedule_count
) VALUES
  (${quoteLiteral(appointmentCancel)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid, '2030-01-01 10:00+00', '2030-01-01 11:00+00', 60, 'native', 'confirmed', '2030-01-01 10:00+00', 0),
  (${quoteLiteral(appointmentReschedule)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid, '2030-01-02 10:00+00', '2030-01-02 11:00+00', 60, 'native', 'confirmed', '2030-01-02 10:00+00', 0),
  (${quoteLiteral(appointmentA2)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA2)}::uuid, '2030-01-04 10:00+00', '2030-01-04 11:00+00', 60, 'native', 'confirmed', '2030-01-04 10:00+00', 0),
  (${quoteLiteral(appointmentB)}::uuid, ${quoteLiteral(orgB)}::uuid, ${quoteLiteral(patientB)}::uuid, '2030-01-03 10:00+00', '2030-01-03 11:00+00', 60, 'native', 'confirmed', '2030-01-03 10:00+00', 0);

INSERT INTO public.lfk_complexes (id, organization_id, user_id, platform_user_id, title) VALUES
  (${quoteLiteral(complexA)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}, ${quoteLiteral(patientA)}::uuid, 'own complex'),
  (${quoteLiteral(complexB)}::uuid, ${quoteLiteral(orgB)}::uuid, ${quoteLiteral(patientB)}, ${quoteLiteral(patientB)}::uuid, 'other complex');
`;

const grantSql = String.raw`
GRANT USAGE ON SCHEMA public TO ${staffIdent}, ${patientIdent};

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${staffIdent};

GRANT SELECT ON TABLE
  public.platform_users,
  public.treatment_program_instances,
  public.treatment_program_instance_stages,
  public.treatment_program_instance_stage_items,
  public.support_conversations,
  public.online_intake_requests,
  public.lfk_complexes
TO ${patientIdent};

GRANT SELECT, INSERT ON TABLE public.program_item_discussion_messages TO ${patientIdent};
GRANT SELECT, INSERT ON TABLE public.support_conversation_messages TO ${patientIdent};
GRANT SELECT, INSERT ON TABLE public.be_appointment_events TO ${patientIdent};
GRANT SELECT, INSERT ON TABLE public.be_appointment_history_events TO ${patientIdent};
GRANT ${findOrThrow(patientGrantTables, "public.reminder_rules").privileges} ON TABLE public.reminder_rules TO ${patientIdent};
GRANT ${findOrThrow(patientGrantTables, "public.lfk_sessions").privileges} ON TABLE public.lfk_sessions TO ${patientIdent};

GRANT ${findOrThrow(patientGrantTables, "public.be_appointments").privileges} ON TABLE public.be_appointments TO ${patientIdent};
GRANT INSERT (${grantColumns("public.be_appointments", "INSERT")}) ON TABLE public.be_appointments TO ${patientIdent};
GRANT UPDATE (${grantColumns("public.be_appointments", "UPDATE")}) ON TABLE public.be_appointments TO ${patientIdent};

GRANT ${findOrThrow(patientGrantTables, "public.be_appointment_cancellations").privileges} ON TABLE public.be_appointment_cancellations TO ${patientIdent};
GRANT UPDATE (${grantColumns("public.be_appointment_cancellations", "UPDATE")}) ON TABLE public.be_appointment_cancellations TO ${patientIdent};
GRANT ${findOrThrow(patientGrantTables, "public.be_appointment_reschedules").privileges} ON TABLE public.be_appointment_reschedules TO ${patientIdent};
GRANT UPDATE (${grantColumns("public.be_appointment_reschedules", "UPDATE")}) ON TABLE public.be_appointment_reschedules TO ${patientIdent};

GRANT ${findOrThrow(patientGrantTables, "public.treatment_program_events").privileges} ON TABLE public.treatment_program_events TO ${patientIdent};
GRANT INSERT (${grantColumns("public.treatment_program_events", "INSERT")}) ON TABLE public.treatment_program_events TO ${patientIdent};

GRANT ${findOrThrow(patientGrantTables, "public.online_intake_status_history").privileges} ON TABLE public.online_intake_status_history TO ${patientIdent};
GRANT INSERT (${grantColumns("public.online_intake_status_history", "INSERT")}) ON TABLE public.online_intake_status_history TO ${patientIdent};

GRANT ${findOrThrow(patientGrantTables, "public.user_channel_preferences").privileges} ON TABLE public.user_channel_preferences TO ${patientIdent};
GRANT INSERT (${grantColumns("public.user_channel_preferences", "INSERT")}) ON TABLE public.user_channel_preferences TO ${patientIdent};
GRANT UPDATE (${grantColumns("public.user_channel_preferences", "UPDATE")}) ON TABLE public.user_channel_preferences TO ${patientIdent};

GRANT ${findOrThrow(patientGrantTables, "public.lfk_complexes").privileges} ON TABLE public.lfk_complexes TO ${patientIdent};
GRANT INSERT (${grantColumns("public.lfk_complexes", "INSERT")}) ON TABLE public.lfk_complexes TO ${patientIdent};
`;

const rlsSql = generatedRlsSqlFor(generatedRlsTables);

const patientSignatureSql = String.raw`
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
), 'hex') AS p2_composed_patient_signature \gset

SET SESSION AUTHORIZATION ${patientIdent};
SELECT app.install_signed_context(
  ${quoteLiteral(patientNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA)}::uuid,
  NULL,
  :'p2_composed_patient_signature'
);
`;

const proofSql = String.raw`
${patientSignatureSql}

SELECT (count(*) = 1)::int AS composed_patient_reads_own_appt
FROM public.be_appointments
WHERE id = ${quoteLiteral(appointmentCancel)}::uuid \gset
${fatal("composed_patient_reads_own_appt", "patient must read own appointment through RLS")}

SELECT (count(*) = 0)::int AS composed_patient_cannot_read_other_appt
FROM public.be_appointments
WHERE id = ${quoteLiteral(appointmentB)}::uuid \gset
${fatal("composed_patient_cannot_read_other_appt", "patient must not read other org/patient appointment through RLS")}

INSERT INTO public.program_item_discussion_messages (
  organization_id, instance_stage_item_id, patient_user_id, sender_role, origin, body
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(itemA)}::uuid, ${quoteLiteral(patientA)}::uuid,
  'patient', 'patient_observation', 'own discussion'
);

\set ON_ERROR_STOP off
INSERT INTO public.program_item_discussion_messages (
  organization_id, instance_stage_item_id, patient_user_id, sender_role, origin, body
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(itemA)}::uuid, ${quoteLiteral(patientA)}::uuid,
  'admin', 'support_admin_reply', 'forged'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks forged program discussion sender/origin.'
\else
\echo 'FATAL: composed proof allowed forged program discussion sender/origin.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO public.program_item_discussion_messages (
  organization_id, instance_stage_item_id, patient_user_id, sender_role, origin, body
) VALUES (
  ${quoteLiteral(orgB)}::uuid, ${quoteLiteral(itemB)}::uuid, ${quoteLiteral(patientA)}::uuid,
  'patient', 'patient_observation', 'cross org'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks cross-org program discussion write.'
\else
\echo 'FATAL: composed proof allowed cross-org program discussion write.'
SELECT 1/0;
\endif

INSERT INTO public.support_conversation_messages (
  organization_id, integrator_message_id, conversation_id, sender_role, text, source
) VALUES (
  ${quoteLiteral(orgA)}::uuid, 'support-own', ${quoteLiteral(conversationA)}::uuid,
  'user', 'hello', 'webapp'
);

\set ON_ERROR_STOP off
INSERT INTO public.support_conversation_messages (
  organization_id, integrator_message_id, conversation_id, sender_role, text, source
) VALUES (
  ${quoteLiteral(orgA)}::uuid, 'support-forged', ${quoteLiteral(conversationA)}::uuid,
  'admin', 'forged', 'webapp'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks forged support sender.'
\else
\echo 'FATAL: composed proof allowed forged support sender.'
SELECT 1/0;
\endif

INSERT INTO public.treatment_program_events (
  organization_id, instance_id, event_type, target_type, target_id, payload
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(instanceA)}::uuid,
  'status_changed', 'stage_item', ${quoteLiteral(itemA)}::uuid, '{}'::jsonb
);
SELECT (actor_id = ${quoteLiteral(patientA)}::uuid)::int AS composed_event_actor_filled
FROM public.treatment_program_events
WHERE instance_id = ${quoteLiteral(instanceA)}::uuid \gset
${fatal("composed_event_actor_filled", "P2-C1 must fill treatment_program_events.actor_id under column grant exclusion")}

\set ON_ERROR_STOP off
INSERT INTO public.treatment_program_events (
  organization_id, instance_id, actor_id, event_type, target_type, target_id, payload
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(instanceA)}::uuid, ${quoteLiteral(staffUser)}::uuid,
  'status_changed', 'stage_item', ${quoteLiteral(itemA)}::uuid, '{}'::jsonb
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks explicit treatment_program_events.actor_id forgery.'
\else
\echo 'FATAL: composed proof allowed explicit treatment_program_events.actor_id forgery.'
SELECT 1/0;
\endif

INSERT INTO public.online_intake_status_history (
  request_id, organization_id, from_status, to_status
) VALUES (
  ${quoteLiteral(requestA)}::uuid, ${quoteLiteral(orgA)}::uuid, NULL, 'new'
);

\set ON_ERROR_STOP off
INSERT INTO public.online_intake_status_history (
  request_id, organization_id, from_status, to_status, changed_by, note
) VALUES (
  ${quoteLiteral(requestA)}::uuid, ${quoteLiteral(orgA)}::uuid, 'new', 'closed',
  ${quoteLiteral(staffUser)}::uuid, 'forged'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks changed_by/note intake forgery.'
\else
\echo 'FATAL: composed proof allowed changed_by/note intake forgery.'
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
\echo 'CONFIRMED: composed proof blocks other patient/org intake history.'
\else
\echo 'FATAL: composed proof allowed other patient/org intake history.'
SELECT 1/0;
\endif

INSERT INTO public.user_channel_preferences (
  user_id, platform_user_id, channel_code, is_preferred_for_auth
) VALUES (
  ${quoteLiteral(patientA)}, ${quoteLiteral(patientA)}::uuid, 'telegram', true
);

UPDATE public.user_channel_preferences
SET is_preferred_for_auth = false
WHERE user_id = ${quoteLiteral(patientA)} AND channel_code = 'telegram';

INSERT INTO public.user_channel_preferences (
  user_id, platform_user_id, channel_code, is_preferred_for_auth
) VALUES (
  ${quoteLiteral(patientA)}, ${quoteLiteral(patientA)}::uuid, 'sms', true
);

\set ON_ERROR_STOP off
INSERT INTO public.user_channel_preferences (
  user_id, platform_user_id, channel_code, is_preferred_for_auth
) VALUES (
  ${quoteLiteral(patientA)}, ${quoteLiteral(patientA)}::uuid, 'web_push', true
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks non-auth preferred channel.'
\else
\echo 'FATAL: composed proof allowed non-auth preferred channel.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
INSERT INTO public.user_channel_preferences (
  user_id, platform_user_id, channel_code, is_preferred_for_auth
) VALUES (
  ${quoteLiteral(patientB)}, ${quoteLiteral(patientB)}::uuid, 'email', false
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks other-user channel preference write.'
\else
\echo 'FATAL: composed proof allowed other-user channel preference write.'
SELECT 1/0;
\endif

INSERT INTO public.reminder_rules (
  integrator_rule_id, organization_id, platform_user_id, integrator_user_id, category,
  linked_object_type, reminder_intent, notification_topic_code
) VALUES (
  'rr-own', ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid, 920001, 'lfk',
  'lfk_complex', 'generic', 'appointment_reminders'
);
SELECT (notification_topic_code = 'training_reminders')::int AS composed_reminder_topic_normalized
FROM public.reminder_rules
WHERE integrator_rule_id = 'rr-own' \gset
${fatal("composed_reminder_topic_normalized", "P2-C2 must normalize patient reminder notification topic")}

\set ON_ERROR_STOP off
INSERT INTO public.reminder_rules (
  integrator_rule_id, organization_id, platform_user_id, integrator_user_id, category,
  linked_object_type, reminder_intent, notification_topic_code
) VALUES (
  'rr-other', ${quoteLiteral(orgB)}::uuid, ${quoteLiteral(patientB)}::uuid, 920002, 'lfk',
  'lfk_complex', 'generic', 'training_reminders'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks other patient reminder rule.'
\else
\echo 'FATAL: composed proof allowed other patient reminder rule.'
SELECT 1/0;
\endif

INSERT INTO public.be_appointments (
  organization_id, platform_user_id, start_at, end_at, duration_minutes,
  source, status, original_start_at, reschedule_count
) VALUES (
  ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid,
  '2030-02-01 10:00+00', '2030-02-01 11:00+00', 60, 'public_widget', 'confirmed',
  '2030-02-01 10:00+00', 0
);

\set ON_ERROR_STOP off
INSERT INTO public.be_appointments (
  id, organization_id, platform_user_id, start_at, end_at, duration_minutes,
  source, status, original_start_at, reschedule_count, payment_ref
) VALUES (
  '92000000-0000-4000-8000-00000000bad1'::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(patientA)}::uuid,
  '2030-02-02 10:00+00', '2030-02-02 11:00+00', 60, 'native', 'confirmed',
  '2030-02-02 10:00+00', 0, 'forged'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks booking payment_ref column grant forgery.'
\else
\echo 'FATAL: composed proof allowed booking payment_ref column grant forgery.'
SELECT 1/0;
\endif

UPDATE public.be_appointments
SET status = 'cancelled_by_patient', updated_at = '2030-01-01 09:10+00'
WHERE id = ${quoteLiteral(appointmentCancel)}::uuid;

INSERT INTO public.be_appointment_cancellations (
  id, organization_id, appointment_id, actor_type, actor_id, cancellation_type,
  was_free, was_penalized, package_session_charged, prepayment_retained, prepayment_refunded,
  manual_override, notifications_sent
) VALUES (
  ${quoteLiteral(cancellationRow)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(appointmentCancel)}::uuid,
  'patient', ${quoteLiteral(patientA)}::uuid, 'free',
  true, false, false, false, true, false, '{}'::jsonb
);
UPDATE public.be_appointment_cancellations
SET notifications_sent = '{"patient":"sent"}'::jsonb
WHERE id = ${quoteLiteral(cancellationRow)}::uuid;

\set ON_ERROR_STOP off
UPDATE public.be_appointment_cancellations
SET staff_comment = 'forged'
WHERE id = ${quoteLiteral(cancellationRow)}::uuid;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks cancellation non-notification update.'
\else
\echo 'FATAL: composed proof allowed cancellation non-notification update.'
SELECT 1/0;
\endif

UPDATE public.be_appointments
SET status = 'rescheduled', updated_at = '2030-01-02 09:10+00'
WHERE id = ${quoteLiteral(appointmentReschedule)}::uuid;
UPDATE public.be_appointments
SET start_at = '2030-01-09 10:00+00',
    end_at = '2030-01-09 11:00+00',
    duration_minutes = 60,
    original_start_at = '2030-01-02 10:00+00',
    reschedule_count = 1,
    status = 'confirmed',
    updated_at = '2030-01-02 09:11+00'
WHERE id = ${quoteLiteral(appointmentReschedule)}::uuid;

INSERT INTO public.be_appointment_reschedules (
  id, organization_id, appointment_id, from_start_at, from_end_at, to_start_at, to_end_at,
  actor_type, actor_id, was_in_free_reschedule_window, free_cancellation_available_at_reschedule,
  free_cancellation_available_after, manual_override, notifications_sent
) VALUES (
  ${quoteLiteral(rescheduleRow)}::uuid, ${quoteLiteral(orgA)}::uuid, ${quoteLiteral(appointmentReschedule)}::uuid,
  '2030-01-02 10:00+00', '2030-01-02 11:00+00', '2030-01-09 10:00+00', '2030-01-09 11:00+00',
  'patient', ${quoteLiteral(patientA)}::uuid, true, true, true, false, '{}'::jsonb
);
UPDATE public.be_appointment_reschedules
SET notifications_sent = '{"staff":"failed"}'::jsonb
WHERE id = ${quoteLiteral(rescheduleRow)}::uuid;

\set ON_ERROR_STOP off
UPDATE public.be_appointment_reschedules
SET reason = 'forged'
WHERE id = ${quoteLiteral(rescheduleRow)}::uuid;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks reschedule non-notification update.'
\else
\echo 'FATAL: composed proof allowed reschedule non-notification update.'
SELECT 1/0;
\endif

\set ON_ERROR_STOP off
UPDATE public.be_appointments
SET deleted_at = now()
WHERE id = ${quoteLiteral(appointmentCancel)}::uuid;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks booking soft-delete column update.'
\else
\echo 'FATAL: composed proof allowed booking soft-delete column update.'
SELECT 1/0;
\endif

INSERT INTO public.lfk_sessions (
  id, user_id, complex_id, completed_at, source, recorded_at, comment
) VALUES (
  ${quoteLiteral(sessionA)}::uuid, ${quoteLiteral(patientA)}::uuid, ${quoteLiteral(complexA)}::uuid,
  '2030-03-01 10:00+00', 'webapp', '2030-03-01 10:00+00', 'done'
);
SELECT (organization_id = ${quoteLiteral(orgA)}::uuid)::int AS composed_lfk_org_stamped
FROM public.lfk_sessions
WHERE id = ${quoteLiteral(sessionA)}::uuid \gset
${fatal("composed_lfk_org_stamped", "P2-C3 must stamp lfk_sessions.organization_id")}

\set ON_ERROR_STOP off
INSERT INTO public.lfk_sessions (
  user_id, complex_id, completed_at, source
) VALUES (
  ${quoteLiteral(patientA)}::uuid, ${quoteLiteral(complexB)}::uuid,
  '2030-03-02 10:00+00', 'webapp'
);
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED: composed proof blocks other-org LFK session.'
\else
\echo 'FATAL: composed proof allowed other-org LFK session.'
SELECT 1/0;
\endif

SELECT app.release_principal_context();
RESET SESSION AUTHORIZATION;

SELECT encode(app_ext.hmac(
  concat_ws(
    '|',
    'v1',
    ${quoteLiteral(staffNonce)},
    pg_backend_pid()::text,
    ${futureEpoch}::text,
    ${quoteLiteral(orgA)},
    ${quoteLiteral(patientA)},
    ''
  ),
  ${quoteLiteral(secret)},
  'sha256'
), 'hex') AS p2_composed_staff_signature \gset

SET SESSION AUTHORIZATION ${staffIdent};
SELECT (app.is_staff() = true)::int AS composed_staff_role_derived \gset
${fatal("composed_staff_role_derived", "staff bypass must be role-derived")}

SELECT app.install_signed_context(
  ${quoteLiteral(staffNonce)},
  pg_backend_pid(),
  ${futureEpoch},
  ${quoteLiteral(orgA)}::uuid,
  ${quoteLiteral(patientA)}::uuid,
  NULL,
  :'p2_composed_staff_signature'
);

SELECT (count(*) = 1)::int AS composed_staff_reads_same_org_other_patient_row
FROM public.be_appointments
WHERE id = ${quoteLiteral(appointmentA2)}::uuid \gset
${fatal("composed_staff_reads_same_org_other_patient_row", "staff role must bypass patient wall through app.is_staff()")}

INSERT INTO public.support_conversation_messages (
  organization_id, integrator_message_id, conversation_id, sender_role, text, source
) VALUES (
  ${quoteLiteral(orgA)}::uuid, 'staff-cross-patient', ${quoteLiteral(conversationA2)}::uuid,
  'admin', 'staff across patients', 'webapp'
);

UPDATE public.be_appointments
SET payment_ref = 'staff-payment-ok'
WHERE id = ${quoteLiteral(appointmentA2)}::uuid;

SELECT app.release_principal_context();
RESET SESSION AUTHORIZATION;

\echo 'P2 composed RLS + grants + value guards smoke: all assertions CONFIRMED.'
`;

let dbCreated = false;
let rolesCreated = false;
let cleaned = false;

function cleanup() {
  if (cleaned) return;
  cleaned = true;

  if (dbCreated) {
    try {
      run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
    } catch (error) {
      console.error(`smoke-p2-composed: cleanup dropdb failed: ${error.message}`);
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
      console.error(`smoke-p2-composed: cleanup role drop failed: ${error.message}`);
    }
  }
}

for (const [signal, exitCode] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.once(signal, () => {
    cleanup();
    process.exit(exitCode);
  });
}

try {
  assertNoUnsafeParentDbHints();

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

  console.log("--- p2-composed: applying protected context artifact ---");
  psqlFile(p2bSqlPath, {
    p2_b_owner_role: ownerRole,
    p2_b_staff_role: staffRole,
    p2_b_patient_role: patientRole,
    p2_b_signing_secret: secret,
  });

  console.log("--- p2-composed: creating representative synthetic schema ---");
  psql(schemaSql);

  console.log("--- p2-composed: applying P2-C value guard artifacts ---");
  psqlFile(p2c1SqlPath, {
    p2_c1_staff_role: staffRole,
    p2_c1_patient_role: patientRole,
  });
  psqlFile(p2c2SqlPath, {
    p2_c2_staff_role: staffRole,
    p2_c2_patient_role: patientRole,
  });
  psqlFile(p2c3SqlPath, {
    p2_c3_staff_role: staffRole,
    p2_c3_patient_role: patientRole,
  });

  console.log("--- p2-composed: applying representative P0.5b grants from generator metadata ---");
  psql(grantSql);

  console.log("--- p2-composed: applying generated P0.9 enforce RLS policies for representative targets ---");
  psql(rlsSql);

  console.log("--- p2-composed: proving composed RLS, grants, and value guards ---");
  psql(proofSql);

  console.log(`smoke-p2-composed-rls-grants-value-guards: OK (${dbName})`);
} finally {
  cleanup();
}
