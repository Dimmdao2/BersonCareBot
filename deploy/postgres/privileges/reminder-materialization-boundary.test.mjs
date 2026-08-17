import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'apps/webapp/db/drizzle-migrations/0019_patient_reminder_materialization_runtime_capabilities.sql',
  'utf8',
);
const repository = readFileSync(
  'apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts',
  'utf8',
);

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
    migration,
    /REVOKE ALL ON FUNCTION app\.upsert_patient_reminder_occurrence_plan[\s\S]*FROM PUBLIC, app_staff, app_tenant_service/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION app\.mark_patient_reminder_occurrence_queued[\s\S]*FROM PUBLIC, app_staff, app_tenant_service/,
  );
});
