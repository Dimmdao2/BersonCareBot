import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

// These gates belong to whichever migration currently DEFINES the roots, not to the file that first
// introduced them: a forward migration that replaces a body must inherit every gate, and pinning the
// introducing file would leave the live definition unguarded from the next migration onwards.
const migrationsDir = new URL('../../../apps/webapp/db/drizzle-migrations/', import.meta.url);
const migrationSources = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(new URL(file, migrationsDir), 'utf8'));
const ledger = migrationSources.join('\n');
const migration = migrationSources
  .filter((source) => source.includes('CREATE OR REPLACE FUNCTION app.commit_patient_reminder_materialization'))
  .at(-1);
assert(migration, 'no migration defines app.commit_patient_reminder_materialization');
const repository = readFileSync(
  new URL('../../../apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts', import.meta.url),
  'utf8',
);

function requireCommitBoundary(source) {
  const commit = source.slice(
    source.indexOf('CREATE OR REPLACE FUNCTION app.commit_patient_reminder_materialization'),
  );
  assert.match(commit, /ON CONFLICT \(event_id\) DO NOTHING/);
  assert.doesNotMatch(commit, /ON CONFLICT \(event_id\) DO UPDATE/);
  const conflict = commit.slice(
    commit.indexOf('IF v_row_count = 0 THEN'),
    commit.indexOf('v_affected := v_affected + v_row_count'),
  );
  for (const invariant of [
    'queued.organization_id = v_org',
    "queued.kind = 'reminder_dispatch'",
    'queued.channel = v_channel',
    "queued.status IN ('pending', 'failed_retryable')",
    "(queued.payload_json - 'materializationFingerprint') = v_queue_payload",
    'FOR UPDATE',
    "RAISE EXCEPTION 'patient reminder queue conflict'",
  ]) assert.ok(conflict.includes(invariant), `missing queue conflict invariant: ${invariant}`);

  const fingerprint = commit.slice(commit.lastIndexOf('UPDATE public.outgoing_delivery_queue AS queued'));
  for (const invariant of [
    'queued.event_id = v_delivery',
    'queued.organization_id = v_org',
    "queued.kind = 'reminder_dispatch'",
    "queued.channel = v_delivery ->> 'channel'",
    "queued.payload_json ->> 'occurrenceId' = v_existing.id",
    "queued.payload_json ->> 'deliveryGeneration' = v_existing.delivery_generation::text",
    "queued.status IN ('pending', 'failed_retryable')",
    "RAISE EXCEPTION 'patient reminder fingerprint queue conflict'",
  ]) assert.ok(fingerprint.includes(invariant), `missing fingerprint invariant: ${invariant}`);

  for (const invariant of [
    "jsonb_typeof(v_delivery -> 'externalId') IS DISTINCT FROM 'string'",
    "jsonb_typeof(v_delivery -> 'logText') IS DISTINCT FROM 'string'",
    "jsonb_typeof(v_intent #> '{meta,occurredAt}') IS DISTINCT FROM 'string'",
    "v_intent #>> '{meta,source}' IS DISTINCT FROM v_channel",
    "v_intent #>> '{meta,userId}' IS DISTINCT FROM v_integrator_user_id",
    "v_intent_payload #>> '{message,text}'",
    "v_intent_payload #>> '{recipient,chatId}' IS DISTINCT FROM v_external_id",
    "v_intent_payload #>> '{recipient,userId}' IS DISTINCT FROM v_external_id",
    "v_intent_payload #>> '{recipient,email}' IS DISTINCT FROM v_external_id",
    "v_intent_payload #>> '{recipient,pushUserId}' IS DISTINCT FROM v_external_id",
    "v_intent_payload #> '{delivery,channels}' IS DISTINCT FROM jsonb_build_array(v_channel)",
    "RAISE EXCEPTION 'invalid patient reminder intent envelope'",
    "RAISE EXCEPTION 'invalid patient reminder channel recipient'",
  ]) assert.ok(commit.includes(invariant), `missing delivery-envelope invariant: ${invariant}`);
}

function requireOccurrenceConvergence(source) {
  const commit = source.slice(
    source.indexOf('CREATE OR REPLACE FUNCTION app.commit_patient_reminder_materialization'),
  );
  const occurrence = commit.slice(
    commit.indexOf('INSERT INTO integrator.user_reminder_occurrences'),
    commit.indexOf('FOR v_delivery IN SELECT value FROM jsonb_array_elements'),
  );
  for (const invariant of [
    'ON CONFLICT (occurrence_key) DO NOTHING',
    'WHERE candidate.occurrence_key = p_occurrence_key',
    'FOR UPDATE',
    'v_existing.rule_id IS DISTINCT FROM p_rule_id',
    'v_existing.organization_id IS DISTINCT FROM v_org',
    'v_existing.platform_user_id IS DISTINCT FROM p_platform_user_id',
    "v_existing.status NOT IN ('planned', 'queued')",
    'v_existing.id IS DISTINCT FROM p_occurrence_id',
    'v_existing.delivery_generation IS DISTINCT FROM p_delivery_generation',
  ]) assert.ok(occurrence.includes(invariant), `missing occurrence convergence invariant: ${invariant}`);
}

function requireUnavailablePatientGate(source) {
  const commit = source.slice(
    source.indexOf('CREATE OR REPLACE FUNCTION app.commit_patient_reminder_materialization'),
  );
  const availability = commit.slice(
    commit.indexOf('SELECT rule.notification_topic_code'),
    commit.indexOf('INSERT INTO integrator.user_reminder_occurrences'),
  );
  for (const invariant of [
    'rule.organization_id = v_org',
    'rule.platform_user_id = p_platform_user_id',
    'rule.is_enabled = true',
    "enrollment.status = 'active'",
    'patient.is_blocked = false',
    'patient.is_archived = false',
    'patient.merged_into_id IS NULL',
    "RETURN jsonb_build_object('ok', true, 'outcome', 'not_actionable')",
  ]) assert.ok(availability.includes(invariant), `missing patient availability invariant: ${invariant}`);
}

test('reminder occurrence and queue state have one atomic mutation root', () => {
  const commit = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION app.commit_patient_reminder_materialization'),
  );
  assert.match(commit, /INSERT INTO integrator\.user_reminder_occurrences/);
  assert.match(commit, /INSERT INTO public\.outgoing_delivery_queue/);
  assert.match(commit, /UPDATE integrator\.user_reminder_occurrences/);
  assert.match(commit, /RAISE EXCEPTION 'patient reminder queue conflict'/);
  assert.doesNotMatch(
    repository,
    /runDrizzleMutationTransaction|enqueueReady|upsert_patient_reminder_occurrence_plan|mark_patient_reminder_occurrence_queued/,
  );
});

test('materialization roots reject wrong organization and wrong patient identity', () => {
  assert.match(migration, /p_organization_id IS DISTINCT FROM v_org/);
  assert.match(migration, /notification_target_outside_organization/);
  assert.match(migration, /notification_target_identity_mismatch/);
  assert.match(migration, /rule\.platform_user_id = p_platform_user_id/);
  assert.match(migration, /rule\.platform_user_id IS NOT NULL/);
  assert.match(migration, /rule\.integrator_user_id IS NOT NULL/);
});

test('retired split mutation roots cannot be executed by runtime roles', () => {
  assert.match(
    ledger,
    /REVOKE ALL ON FUNCTION app\.upsert_patient_reminder_occurrence_plan[\s\S]*FROM PUBLIC, app_staff, app_tenant_service/,
  );
  assert.match(
    ledger,
    /REVOKE ALL ON FUNCTION app\.mark_patient_reminder_occurrence_queued[\s\S]*FROM PUBLIC, app_staff, app_tenant_service/,
  );
});

test('queue conflict and envelope static gate kills cross-org, terminal and nested-payload regressions', () => {
  requireCommitBoundary(migration);
  for (const mutation of [
    ['cross-org pending', 'queued.organization_id = v_org', 'TRUE'],
    [
      'terminal sent/dead',
      "queued.status IN ('pending', 'failed_retryable')",
      "queued.status IN ('pending', 'failed_retryable', 'sent', 'dead')",
    ],
    [
      'different envelope',
      "(queued.payload_json - 'materializationFingerprint') = v_queue_payload",
      'TRUE',
    ],
    [
      'invalid nested recipient',
      "v_intent_payload #>> '{recipient,email}' IS DISTINCT FROM v_external_id",
      'FALSE',
    ],
    [
      'invalid message text',
      "v_intent_payload #>> '{message,text}'",
      "v_intent_payload #>> '{message,ignored}'",
    ],
    [
      'invalid intent source',
      "v_intent #>> '{meta,source}' IS DISTINCT FROM v_channel",
      'FALSE',
    ],
  ]) {
    const [name, from, to] = mutation;
    const mutated = migration.replaceAll(from, to);
    assert.notEqual(mutated, migration, `mutation fixture did not apply: ${name}`);
    assert.throws(() => requireCommitBoundary(mutated), undefined, name);
  }
});

test('occurrence convergence and unavailable-patient gates kill their historical regressions', () => {
  requireOccurrenceConvergence(migration);
  requireUnavailablePatientGate(migration);
  for (const [name, from, to, oracle] of [
    [
      'occurrence-key conflict inserts a second row',
      'ON CONFLICT (occurrence_key) DO NOTHING',
      'ON CONFLICT (occurrence_key) DO UPDATE SET updated_at = statement_timestamp()',
      requireOccurrenceConvergence,
    ],
    [
      'concurrent winner is not locked',
      'WHERE candidate.occurrence_key = p_occurrence_key\n  FOR UPDATE',
      'WHERE candidate.occurrence_key = p_occurrence_key',
      requireOccurrenceConvergence,
    ],
    [
      'blocked patient is materializable',
      'patient.is_blocked = false',
      'TRUE',
      requireUnavailablePatientGate,
    ],
    [
      'inactive enrollment is materializable',
      "enrollment.status = 'active'",
      'TRUE',
      requireUnavailablePatientGate,
    ],
  ]) {
    const mutated = migration.replaceAll(from, to);
    assert.notEqual(mutated, migration, `mutation fixture did not apply: ${name}`);
    assert.throws(() => oracle(mutated), undefined, name);
  }
});
