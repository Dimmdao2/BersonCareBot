#!/usr/bin/env node
import { sourceTextIncludes } from './source-text-guard.mjs';

import { readFileSync } from 'node:fs';

const opsSqlPath = 'deploy/postgres/p2-c1-patient-value-guards.sql';
const opsSql = readFileSync(opsSqlPath, 'utf8');

function fail(message) {
  throw new Error(message);
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!sourceTextIncludes(text, fragment, label)) {
      fail(`Missing required ${label} fragment: ${fragment}`);
    }
  }
}

function forbidFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (sourceTextIncludes(text, fragment, label)) {
      fail(`${label} must not include forbidden fragment: ${fragment}`);
    }
  }
}

const executableSql = opsSql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

requireFragments('P2-C1 ops SQL', opsSql, [
  'app.p2_c1_is_patient_context()',
  'app.current_patient_user_id() IS NOT NULL AND NOT app.is_staff()',
  'SECURITY INVOKER',
  '\\set p2_c1_staff_role app_staff',
  '\\set p2_c1_patient_role app_patient',
  ":'p2_c1_staff_role'",
  ":'p2_c1_patient_role'",
  'p2_c1_roles_exist',
  'app.p2_c1_guard_program_item_discussion_messages()',
  'app.p2_c1_guard_support_conversation_messages()',
  'app.p2_c1_guard_treatment_program_events()',
  "NEW.sender_role IS DISTINCT FROM 'patient'",
  "NEW.origin IS DISTINCT FROM 'patient_observation'",
  'NEW.support_message_id IS NOT NULL',
  "NEW.sender_role IS DISTINCT FROM 'user'",
  "NEW.source IS DISTINCT FROM 'webapp'",
  'NEW.actor_id := v_patient_user_id',
  'NEW.actor_id IS DISTINCT FROM v_patient_user_id',
  'item.organization_id = v_org_id',
  'stage.organization_id = v_org_id',
  'instance.organization_id = v_org_id',
  'patient_treatment_event_shape_forbidden',
  'CREATE TRIGGER p2_c1_program_item_discussion_patient_insert_guard',
  'CREATE TRIGGER p2_c1_support_conversation_messages_patient_insert_guard',
  'CREATE TRIGGER p2_c1_treatment_program_events_patient_insert_guard',
  '\\if :{?p2_c1_down}',
]);

for (const signature of [
  'app.p2_c1_is_patient_context()',
  'app.p2_c1_guard_program_item_discussion_messages()',
  'app.p2_c1_guard_support_conversation_messages()',
  'app.p2_c1_guard_treatment_program_events()',
]) {
  requireFragments(`P2-C1 explicit grants for ${signature}`, opsSql, [
    `REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC;`,
    `GRANT EXECUTE ON FUNCTION ${signature}`,
    `TO :"p2_c1_staff_role", :"p2_c1_patient_role";`,
  ]);
}

forbidFragments('P2-C1 ops SQL', opsSql, [
  '/opt/env/bersoncarebot',
  'api.prod',
  'webapp.prod',
  'bcb_webapp_prod',
  'bcb_webapp_dev',
  'REASSIGN OWNED',
  'DROP OWNED',
]);

forbidFragments('P2-C1 executable SQL', executableSql, [
  'SECURITY DEFINER',
  "current_setting('app.org'",
  "current_setting('app.patient_user_id'",
  "current_setting('app.integrator_user_id'",
  "current_setting('app.actor'",
  'SET search_path = public',
]);

console.log('check-p2-c1-patient-value-guards-sql: OK');
