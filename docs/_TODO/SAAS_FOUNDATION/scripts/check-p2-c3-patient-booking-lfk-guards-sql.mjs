#!/usr/bin/env node
import { sourceTextIncludes, sourceTextIndexOf } from './source-text-guard.mjs';

import { readFileSync } from 'node:fs';

const opsSqlPath = 'deploy/postgres/p2-c3-patient-booking-lfk-guards.sql';
const grantsGeneratorPath = 'docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs';
const opsSql = readFileSync(opsSqlPath, 'utf8');
const grantsGenerator = readFileSync(grantsGeneratorPath, 'utf8');

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
requireFragments('P2-C3 ops SQL', opsSql, [
  'app.p2_c3_is_patient_context()',
  'app.current_patient_user_id() IS NOT NULL AND NOT app.is_staff()',
  'SECURITY INVOKER',
  '\\set p2_c3_staff_role app_staff',
  '\\set p2_c3_patient_role app_patient',
  ":'p2_c3_staff_role'",
  ":'p2_c3_patient_role'",
  'p2_c3_roles_exist',
  'app.p2_c3_booking_row_is_owned(',
  'appointment.platform_user_id = p_patient_user_id',
  'app.p2_c3_lfk_complex_is_owned(',
  'complex.platform_user_id = p_patient_user_id',
  'complex.platform_user_id IS NULL',
  'complex.user_id = p_patient_user_id::text',
  'app.p2_c3_guard_be_appointments()',
  "NEW.source NOT IN ('native', 'public_widget')",
  "NEW.status NOT IN ('confirmed', 'awaiting_payment')",
  'NEW.original_start_at IS DISTINCT FROM NEW.start_at',
  'NEW.reschedule_count IS DISTINCT FROM 0',
  'NEW.payment_ref IS NOT NULL',
  'NEW.package_usage_ref IS NOT NULL',
  'NEW.deleted_at IS NOT NULL',
  "NEW.status IN ('cancelled_by_patient', 'late_cancellation')",
  "NEW.status = 'rescheduled'",
  "OLD.status = 'rescheduled'",
  "NEW.status = 'confirmed'",
  'NEW.reschedule_count = OLD.reschedule_count + 1',
  'app.p2_c3_guard_be_appointment_reschedules()',
  "NEW.actor_type IS DISTINCT FROM 'patient'",
  'NEW.actor_id IS DISTINCT FROM v_patient_user_id',
  'NEW.staff_comment IS NOT NULL',
  'NEW.manual_override IS DISTINCT FROM false',
  'FROM public.be_appointment_reschedules newer',
  'newer.created_at > OLD.created_at',
  'app.p2_c3_guard_be_appointment_cancellations()',
  'FROM public.be_appointment_cancellations newer',
  'app.p2_c3_guard_be_appointment_event_insert()',
  "NEW.event_type NOT IN ('created', 'cancelled', 'rescheduled')",
  'app.p2_c3_guard_lfk_sessions()',
  'NEW.organization_id := v_org_id',
  'OLD.user_id IS DISTINCT FROM v_patient_user_id',
  'NEW.user_id IS DISTINCT FROM v_patient_user_id',
  'CREATE TRIGGER p2_c3_be_appointments_patient_insert_guard',
  'CREATE TRIGGER p2_c3_be_appointments_patient_update_guard',
  'CREATE TRIGGER p2_c3_be_appointment_reschedules_patient_write_guard',
  'CREATE TRIGGER p2_c3_be_appointment_cancellations_patient_write_guard',
  'CREATE TRIGGER p2_c3_be_appointment_events_patient_insert_guard',
  'CREATE TRIGGER p2_c3_be_appointment_history_events_patient_insert_guard',
  'CREATE TRIGGER p2_c3_lfk_sessions_patient_write_guard',
  '\\if :{?p2_c3_down}',
]);

for (const signature of [
  'app.p2_c3_is_patient_context()',
  'app.p2_c3_booking_row_is_owned(uuid, uuid, uuid)',
  'app.p2_c3_lfk_complex_is_owned(uuid, uuid, uuid)',
  'app.p2_c3_guard_be_appointments()',
  'app.p2_c3_guard_be_appointment_reschedules()',
  'app.p2_c3_guard_be_appointment_cancellations()',
  'app.p2_c3_guard_be_appointment_event_insert()',
  'app.p2_c3_guard_lfk_sessions()',
]) {
  requireFragments(`P2-C3 explicit grants for ${signature}`, opsSql, [
    `REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC;`,
    `GRANT EXECUTE ON FUNCTION ${signature}`,
    `TO :"p2_c3_staff_role", :"p2_c3_patient_role";`,
  ]);
}

requireFragments(`${opsSqlPath} notification-only reschedule update shape`, executableSql, [
  'AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN RETURN NEW;',
]);

requireFragments(`${grantsGeneratorPath} grant reconciliation`, grantsGenerator, [
  'qualifiedName: "public.be_appointment_cancellations", privilege: "UPDATE", columns: ["notifications_sent"]',
  'qualifiedName: "public.be_appointment_reschedules", privilege: "UPDATE", columns: ["notifications_sent"]',
]);

forbidFragments('P2-C3 ops SQL', opsSql, [
  '/opt/env/bersoncarebot',
  'api.prod',
  'webapp.prod',
  'bcb_webapp_prod',
  'bcb_webapp_dev',
  'REASSIGN OWNED',
  'DROP OWNED',
]);

forbidFragments('P2-C3 executable SQL', executableSql, [
  'SECURITY DEFINER',
  "current_setting('app.org'",
  "current_setting('app.patient_user_id'",
  "current_setting('app.integrator_user_id'",
  "current_setting('app.actor'",
  'SET search_path = public',
]);

console.log('check-p2-c3-patient-booking-lfk-guards-sql: OK');
