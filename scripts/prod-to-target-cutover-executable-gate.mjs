#!/usr/bin/env node

/**
 * Private-PostgreSQL executable acceptance gate for the systemic cutover invariants.
 *
 * It deliberately executes slices read from the product-owned cutover SQL, not a
 * JavaScript reconstruction.  The fixture contains only synthetic UUIDs and the
 * fresh-dump shapes that matter here: merged aliases/collisions, attributable and
 * honestly unmapped reminders, drafts, and historical operational statistics.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTrustedPostgresBinaries, SAFE_OPERATOR_PATH } from './a0-greenfield-baseline-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = Object.freeze({
  org: 'a0000000-0000-4000-8000-000000000001',
  specialist: 'c9515025-7224-4d9b-86b6-9cb7d26ea503',
  duplicateSpecialist: '518ea988-9b5e-4ad8-8194-a2d98f43bd7b',
  canonical: '10000000-0000-4000-8000-000000000001',
  alias: '10000000-0000-4000-8000-000000000002',
  clientWithoutFacts: '10000000-0000-4000-8000-000000000003',
  archived: '10000000-0000-4000-8000-000000000004',
  unmapped: '10000000-0000-4000-8000-000000000005',
});
const patientRelations = [
  'clinical_anamnesis_illness', 'clinical_anamnesis_lifestyle', 'clinical_anamnesis_trauma',
  'clinical_complaint', 'clinical_diagnosis', 'clinical_visit', 'doctor_patient_support',
  'media_folders', 'patient_comorbidity', 'patient_files', 'patient_lfk_assignments',
  'patient_payment', 'program_action_log', 'program_item_discussion_messages',
  'program_item_discussion_reads', 'specialist_tasks', 'test_attempts', 'treatment_program_instances',
];

function read(relative, sqlRoot = root) { return fs.readFileSync(path.join(sqlRoot, relative), 'utf8'); }
function slice(text, start, end) {
  const from = text.indexOf(start); const to = text.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`product SQL slice missing: ${start}`);
  return text.slice(from, to);
}
function productSlices(sqlRoot) {
  const data = read('deploy/postgres/prod-to-target-cutover-data.sql', sqlRoot);
  const owner = read('apps/webapp/scripts/consolidate-owner-identity.sql', sqlRoot);
  const executable = (sql) => sql
    // The production wrapper supplies psql variables.  psql deliberately does not interpolate
    // inside DO dollar-quoted bodies, so the hermetic harness uses the same already-established
    // cutover settings through PostgreSQL itself; transformation statements remain byte-for-byte.
    .replaceAll(":'canonical_organization_id'::uuid", "current_setting('bcb.cutover.canonical_organization_id')::uuid")
    .replaceAll(":'canonical_specialist_id'::uuid", "current_setting('bcb.cutover.canonical_specialist_id')::uuid");
  return {
    f5: executable(slice(data, '-- Copy every surviving relation', '-- Every source-only relation')),
    map: executable(slice(data, '-- Resolve the complete live platform_users merge graph once.', '-- Preserve a source-derived oracle')),
    f3: executable(slice(data, '-- Two live classes have uniqueness semantics', '-- Required tenant columns added after the source snapshot.')),
    f2: executable(slice(data, '-- reminder_occurrence_history predates', 'INSERT INTO integrator.user_reminder_occurrences')),
    f4: executable(slice(data, '-- Preserve actionable drafts', 'CREATE TEMP TABLE cutover_systemic_expected_counts')),
    membership: executable(slice(data, '-- Rebuild the initial organization membership', '-- Reseed serial/identity sequences')).replace(/\\ir prod-to-target-patient-membership-manifest\.sql\n/u, ''),
    f1: slice(owner, '-- ── 4. Консолидация дубля карточки специалиста', '-- В свежем PROD-дампе часть живых записей'),
    manifest: read('deploy/postgres/prod-to-target-patient-membership-manifest.sql', sqlRoot),
  };
}
function cleanEnv() { return { PATH: SAFE_OPERATOR_PATH, LANG: 'C.UTF-8' }; }
function run(bin, args, input, label) {
  const result = spawnSync(bin, args, { input, encoding: 'utf8', env: cleanEnv(), maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${label}: ${result.stderr || result.error?.message || result.status}`);
  return result.stdout;
}
function quote(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function bootstrapSql() {
  return `
CREATE SCHEMA integrator; CREATE SCHEMA cutover_source_public; CREATE SCHEMA cutover_source_integrator;
CREATE TABLE public.platform_users (id uuid PRIMARY KEY, role text NOT NULL, merged_into_id uuid, is_archived boolean NOT NULL DEFAULT false, integrator_user_id bigint);
CREATE TABLE cutover_source_public.platform_users (LIKE public.platform_users INCLUDING ALL);
CREATE TABLE public.be_specialists (id uuid PRIMARY KEY, organization_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.be_appointments (id uuid PRIMARY KEY, specialist_id uuid REFERENCES public.be_specialists(id), deleted_at timestamptz);
CREATE TABLE cutover_source_public.be_appointments (id uuid PRIMARY KEY, specialist_id uuid, deleted_at timestamptz, platform_user_id uuid);
CREATE TABLE public.be_specialist_service_availability (id uuid PRIMARY KEY, specialist_id uuid REFERENCES public.be_specialists(id), service_id uuid NOT NULL, branch_id uuid, room_id uuid, city_code text, is_active boolean NOT NULL DEFAULT true, price_minor_override integer, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.be_specialist_locations (id uuid PRIMARY KEY, specialist_id uuid REFERENCES public.be_specialists(id), branch_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.be_specialist_rooms (id uuid PRIMARY KEY, specialist_id uuid REFERENCES public.be_specialists(id), room_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.be_working_days (id uuid PRIMARY KEY, organization_id uuid NOT NULL, specialist_id uuid REFERENCES public.be_specialists(id), work_date date NOT NULL, branch_id uuid, room_id uuid, start_minute integer, end_minute integer, is_closed boolean NOT NULL DEFAULT false, breaks jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.user_channel_preferences (id uuid PRIMARY KEY, user_id text NOT NULL, channel_code text NOT NULL, is_enabled_for_messages boolean NOT NULL, is_enabled_for_notifications boolean NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, is_preferred_for_auth boolean NOT NULL, platform_user_id uuid NOT NULL);
CREATE TABLE public.media_playback_user_video_first_resolve (user_id uuid NOT NULL, media_id uuid NOT NULL, first_resolved_at timestamptz NOT NULL, organization_id uuid NOT NULL);
CREATE TABLE public.support_conversations (id uuid PRIMARY KEY, organization_id uuid NOT NULL, integrator_conversation_id text UNIQUE, platform_user_id uuid, integrator_user_id bigint, source text NOT NULL, admin_scope text, status text, opened_at timestamptz NOT NULL DEFAULT now(), last_message_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), pending_message_drafts jsonb NOT NULL DEFAULT '[]');
CREATE TABLE public.reminder_occurrence_history (id uuid PRIMARY KEY, integrator_user_id bigint NOT NULL, platform_user_id uuid);
CREATE TABLE cutover_source_public.reminder_occurrence_history (LIKE public.reminder_occurrence_history INCLUDING ALL);
CREATE TABLE integrator.delivery_attempt_logs (id uuid PRIMARY KEY, payload text, organization_id uuid);
CREATE TABLE cutover_source_integrator.delivery_attempt_logs (id uuid PRIMARY KEY, payload text);
CREATE TABLE public.media_playback_stats_hourly (id uuid PRIMARY KEY, delivery text, organization_id uuid);
CREATE TABLE cutover_source_public.media_playback_stats_hourly (id uuid PRIMARY KEY, delivery text);
INSERT INTO cutover_source_integrator.delivery_attempt_logs VALUES ('34000000-0000-4000-8000-000000000001', 'delivery');
INSERT INTO cutover_source_public.media_playback_stats_hourly VALUES ('35000000-0000-4000-8000-000000000001', 'hls');
CREATE TABLE integrator.identities (id text PRIMARY KEY, user_id bigint NOT NULL);
CREATE TABLE cutover_source_integrator.identities (LIKE integrator.identities INCLUDING ALL);
CREATE TABLE integrator.message_drafts (id text PRIMARY KEY, identity_id text NOT NULL, source text NOT NULL, external_chat_id text, external_message_id text, draft_text_current text, state text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE cutover_source_integrator.message_drafts (LIKE integrator.message_drafts INCLUDING ALL);
CREATE TABLE public.org_enrollments (organization_id uuid NOT NULL, platform_user_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE public.patient_specialist_links (organization_id uuid NOT NULL, patient_user_id uuid NOT NULL, specialist_id uuid NOT NULL, status text NOT NULL, created_via text);
CREATE TABLE public.be_organization_members (organization_id uuid, platform_user_id uuid, role text, specialist_id uuid, status text);
${patientRelations.map((name) => `CREATE TABLE cutover_source_public.${name} (patient_user_id uuid);`).join('\n')}
`;
}
function seedSql() {
  return `
INSERT INTO public.be_specialists VALUES (${quote(ids.specialist)}, ${quote(ids.org)}, true), (${quote(ids.duplicateSpecialist)}, ${quote(ids.org)}, true);
INSERT INTO public.be_appointments VALUES ('20000000-0000-4000-8000-000000000001', ${quote(ids.duplicateSpecialist)}, NULL), ('20000000-0000-4000-8000-000000000002', ${quote(ids.duplicateSpecialist)}, now());
INSERT INTO cutover_source_public.be_appointments (id, specialist_id, deleted_at) SELECT id, specialist_id, deleted_at FROM public.be_appointments;
INSERT INTO public.be_specialist_service_availability (id, specialist_id, service_id, branch_id) VALUES ('21000000-0000-4000-8000-000000000001', ${quote(ids.duplicateSpecialist)}, '22000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001');
INSERT INTO public.platform_users VALUES (${quote(ids.canonical)}, 'client', NULL, false, 10), (${quote(ids.alias)}, 'client', ${quote(ids.canonical)}, false, 11), (${quote(ids.clientWithoutFacts)}, 'client', NULL, false, 12), (${quote(ids.archived)}, 'client', NULL, true, 13);
INSERT INTO cutover_source_public.platform_users SELECT * FROM public.platform_users;
INSERT INTO public.user_channel_preferences VALUES ('30000000-0000-4000-8000-000000000001', ${quote(ids.alias)}, 'telegram', true, true, '2026-01-01', '2026-01-01', false, ${quote(ids.alias)}), ('30000000-0000-4000-8000-000000000002', ${quote(ids.canonical)}, 'telegram', false, false, '2026-01-02', '2026-01-02', true, ${quote(ids.canonical)});
INSERT INTO public.media_playback_user_video_first_resolve VALUES (${quote(ids.alias)}, '31000000-0000-4000-8000-000000000001', '2026-01-02T00:00:00Z', ${quote(ids.org)}), (${quote(ids.canonical)}, '31000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', ${quote(ids.org)});
INSERT INTO public.support_conversations (id, organization_id, integrator_conversation_id, platform_user_id, integrator_user_id, source) VALUES ('32000000-0000-4000-8000-000000000001', ${quote(ids.org)}, 'existing', ${quote(ids.alias)}, 10, 'telegram');
INSERT INTO public.reminder_occurrence_history VALUES ('33000000-0000-4000-8000-000000000001', 11, NULL), ('33000000-0000-4000-8000-000000000002', 999, NULL);
INSERT INTO cutover_source_public.reminder_occurrence_history SELECT * FROM public.reminder_occurrence_history;
INSERT INTO cutover_source_integrator.identities VALUES ('identity-a', 10);
INSERT INTO cutover_source_integrator.message_drafts VALUES ('draft-a', 'identity-a', 'telegram', 'chat', 'message', 'preserved body', 'pending_confirmation', '2026-01-01', '2026-01-02');
`;
}
function psqlArgs(socket, port) { return ['-X', '-h', socket, '-p', port, '-U', 'cutover_gate', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', `canonical_organization_id=${ids.org}`, '-v', `canonical_specialist_id=${ids.specialist}`, '-v', 'expected_database=postgres']; }
function query(psql, base, sql) { return run(psql, [...base, '-Atqc', sql], undefined, 'query').trim(); }
function exec(psql, base, sql, label) { run(psql, [...base, '-v', 'ON_ERROR_STOP=1'], sql, label); }
function assertState(psql, base) {
  assert.equal(query(psql, base, `SELECT count(*) FROM public.org_enrollments WHERE status='active' AND organization_id=${quote(ids.org)}`), '2', 'membership count');
  assert.equal(query(psql, base, `SELECT count(*) FROM public.patient_specialist_links WHERE status='active' AND specialist_id=${quote(ids.specialist)}`), '2', 'specialist-link count');
  assert.equal(query(psql, base, `SELECT count(*) FROM public.be_appointments WHERE specialist_id=${quote(ids.duplicateSpecialist)}`), '0', 'specialist rewrite');
  assert.equal(query(psql, base, `SELECT count(*) FROM public.reminder_occurrence_history WHERE platform_user_id=${quote(ids.canonical)}`), '1', 'reminder attribution');
  assert.equal(query(psql, base, `SELECT count(*) FROM public.reminder_occurrence_history WHERE platform_user_id IS NULL`), '1', 'honest reminder null');
  assert.equal(query(psql, base, `SELECT count(*) FROM public.support_conversations WHERE platform_user_id=${quote(ids.alias)}`), '0', 'merged live reference');
  assert.equal(query(psql, base, `SELECT user_id || ':' || is_enabled_for_messages FROM public.user_channel_preferences`), `${ids.canonical}:false`, 'latest preference collision');
  assert.equal(query(psql, base, `SELECT to_char(first_resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') FROM public.media_playback_user_video_first_resolve`), '2026-01-01 00:00', 'earliest resolve collision');
  assert.equal(query(psql, base, `SELECT pending_message_drafts->0->>'draftTextCurrent' FROM public.support_conversations WHERE pending_message_drafts <> '[]'`), 'preserved body', 'draft content');
  assert.equal(query(psql, base, `SELECT count(*) FROM integrator.delivery_attempt_logs WHERE organization_id=${quote(ids.org)}`), '1', 'delivery attribution');
  assert.equal(query(psql, base, `SELECT count(*) FROM public.media_playback_stats_hourly WHERE organization_id=${quote(ids.org)}`), '1', 'playback attribution');
}
function mutate(sqlRoot, mutant) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `bcb_cutover_mutant_${mutant}_`));
  for (const relative of ['deploy/postgres/prod-to-target-cutover-data.sql', 'deploy/postgres/prod-to-target-patient-membership-manifest.sql', 'apps/webapp/scripts/consolidate-owner-identity.sql']) {
    const destination = path.join(tmp, relative); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(path.join(root, relative), destination);
  }
  const file = mutant === 'f1' ? 'apps/webapp/scripts/consolidate-owner-identity.sql' : 'deploy/postgres/prod-to-target-cutover-data.sql';
  const target = path.join(tmp, file); let text = fs.readFileSync(target, 'utf8');
  const replacements = {
    membership: ["SELECT :'canonical_organization_id'::uuid, expected.platform_user_id, 'active'", "SELECT :'canonical_organization_id'::uuid, expected.platform_user_id, 'active' WHERE false"],
    f1: ["UPDATE %I.%I SET %I = $1 WHERE %I = $2", "UPDATE %I.%I SET %I = $1 WHERE false"],
    f2: ['SET platform_user_id = identity_map.canonical_id', 'SET platform_user_id = NULL'],
    f3: ["|| 'WHERE target.%I = identity_map.source_id '", "|| 'WHERE false AND target.%I = identity_map.source_id '"],
    f4: ["'draftTextCurrent', draft.draft_text_current", "'draftTextCurrent', NULL::text"],
    f5: ["AND relation.table_name NOT IN (", "AND relation.table_name NOT IN ('delivery_attempt_logs', 'media_playback_stats_hourly',"],
  };
  const [from, to] = replacements[mutant]; if (!text.includes(from)) throw new Error(`mutant anchor absent: ${mutant}`);
  fs.writeFileSync(target, text.replace(from, to));
  return tmp;
}
function runGate(sqlRoot = root) {
  const { initdb, pg_ctl: pgCtl, psql } = resolveTrustedPostgresBinaries(['initdb', 'pg_ctl', 'psql']);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'bcb_cutover_gate_')); const data = path.join(scratch, 'data'); const socket = path.join(scratch, 'socket'); fs.mkdirSync(socket, { mode: 0o700 });
  const port = String(46000 + Math.floor(Math.random() * 1000)); let started = false;
  try {
    run(initdb, ['-D', data, '--username=cutover_gate', '--auth=trust', '--no-locale'], undefined, 'initdb');
    run(pgCtl, ['-D', data, '-o', `-F -k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start', '-l', path.join(scratch, 'postgres.log')], undefined, 'pg_ctl start'); started = true;
    const base = psqlArgs(socket, port); const pieces = productSlices(sqlRoot);
    exec(psql, base, bootstrapSql(), 'fixture schema');
    // F5 must run before target/source rows used by the remaining product fragments.
    exec(psql, base, `SELECT set_config('bcb.cutover.canonical_organization_id', ${quote(ids.org)}, false);\n${pieces.f5}`, 'F5 product SQL');
    exec(psql, base, seedSql(), 'fixture seed');
    exec(psql, base, `BEGIN;\n${pieces.f1}\nCOMMIT;`, 'F1 product SQL');
    // These fragments exchange product temp tables (canonical map and membership manifest),
    // so they deliberately run through one real PostgreSQL session.
    exec(psql, base, `BEGIN;\nSELECT set_config('bcb.cutover.canonical_organization_id', ${quote(ids.org)}, false);\nSELECT set_config('bcb.cutover.canonical_specialist_id', ${quote(ids.specialist)}, false);\n${pieces.map}\n${pieces.f3}\n${pieces.f2}\n${pieces.f4}\n\\set patient_source_schema cutover_source_public\n${pieces.manifest}\n${pieces.membership}\nCOMMIT;`, 'F2-F4 and membership product SQL');
    assertState(psql, base);
  } finally {
    if (started) spawnSync(pgCtl, ['-D', data, '-m', 'immediate', 'stop'], { env: cleanEnv(), stdio: 'ignore' });
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
function main() {
  const mutant = process.argv.find((arg) => arg.startsWith('--mutant='))?.slice('--mutant='.length);
  if (mutant) {
    const temporaryRoot = mutate(root, mutant);
    try { runGate(temporaryRoot); } catch (error) { console.log(`RED ${mutant}: ${error instanceof Error ? error.message.split('\n')[0] : error}`); return; }
    finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
    throw new Error(`mutant unexpectedly passed: ${mutant}`);
  }
  runGate(); console.log('PASS executable cutover systemic gate');
}
main();
