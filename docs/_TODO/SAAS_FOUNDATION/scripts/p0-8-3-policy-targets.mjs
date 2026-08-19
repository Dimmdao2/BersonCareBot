#!/usr/bin/env node

import { buildRlsDescriptors } from './rls-descriptor-model.mjs';
import { renderOrgDormantPolicyStatements } from './rls-sql-renderer.mjs';

export const p083PolicyName = 'saas_org_dormant_p0_8_3';

export const expectedP083PublicDirectOrgTargets = Object.freeze([
  'public.admin_audit_log',
  'public.be_appointment_cancellations',
  'public.be_appointment_history_events',
  'public.be_appointment_no_shows',
  'public.be_appointment_reschedules',
  'public.be_appointment_staff_comments',
  'public.be_appointments',
  'public.be_availability_rules',
  'public.be_booking_form_fields',
  'public.be_booking_form_submissions',
  'public.be_branches',
  'public.be_cancellation_policies',
  'public.be_clinic_services',
  'public.be_package_history_events',
  'public.be_package_usages',
  'public.be_patient_booking_profiles',
  'public.be_patient_packages',
  'public.be_patient_timeline_events',
  'public.be_payment_history_events',
  'public.be_payment_intents',
  'public.be_payment_provider_events',
  'public.be_payments',
  'public.be_prepayment_policies',
  'public.be_refunds',
  'public.be_reschedule_policies',
  'public.be_rooms',
  'public.be_schedule_blocks',
  'public.be_schedule_templates',
  'public.be_service_location_availability',
  'public.be_specialist_locations',
  'public.be_specialist_rooms',
  'public.be_specialist_service_availability',
  'public.be_specialists',
  'public.be_subscription_packages',
  'public.be_working_days',
  'public.be_working_hours',
  'public.broadcast_audit',
  'public.broadcast_drafts',
  'public.clinical_anamnesis_illness',
  'public.clinical_anamnesis_lifestyle',
  'public.clinical_anamnesis_trauma',
  'public.clinical_complaint',
  'public.clinical_diagnosis',
  'public.clinical_diagnosis_catalog',
  'public.clinical_test_regions',
  'public.clinical_visit',
  'public.clinic_public_directory_entries',
  'public.content_access_grants_webapp',
  'public.content_pages',
  'public.content_sections',
  'public.courses',
  'public.doctor_notes',
  'public.doctor_patient_support',
  'public.lfk_complex_templates',
  'public.lfk_complexes',
  'public.lfk_exercise_regions',
  'public.lfk_exercises',
  'public.lfk_sessions',
  'public.material_ratings',
  'public.media_files',
  'public.media_folders',
  'public.media_hls_proxy_error_events',
  'public.media_playback_client_events',
  'public.media_playback_resolution_events',
  'public.media_playback_user_video_first_resolve',
  'public.media_upload_sessions',
  'public.message_log',
  'public.motivational_quotes',
  'public.online_intake_requests',
  'public.operator_health_failure_archive',
  'public.org_enrollments',
  'public.organization_member_invites',
  'public.patient_comorbidity',
  'public.patient_content_rating_feedback',
  'public.patient_daily_warmup_presentations',
  'public.patient_diary_day_snapshots',
  'public.patient_files',
  'public.patient_home_blocks',
  'public.patient_invites',
  'public.patient_lfk_assignments',
  'public.patient_merge_candidates',
  'public.patient_payment',
  'public.patient_practice_completions',
  'public.patient_specialist_links',
  'public.product_analytics_events_recent',
  'public.product_analytics_user_hourly',
  'public.product_push_notifications',
  'public.recommendation_regions',
  'public.recommendations',
  'public.reference_categories',
  'public.reminder_journal',
  'public.reminder_rules',
  'public.saas_org_entitlement_overrides',
  'public.saas_organization_trials',
  'public.specialist_tasks',
  'public.support_conversations',
  'public.support_questions',
  'public.symptom_trackings',
  'public.test_attempts',
  'public.test_sets',
  'public.tests',
  'public.treatment_program_instances',
  'public.treatment_program_templates',
]);

const expectedTargetSet = new Set(expectedP083PublicDirectOrgTargets);

function setDiff(left, right) {
  return Array.from(left)
    .filter((value) => !right.has(value))
    .sort();
}

export function getP083PublicDirectOrgDescriptors({ descriptors = buildRlsDescriptors() } = {}) {
  const targets = Array.from(descriptors.values())
    .filter(
      (descriptor) =>
        descriptor.tier === 'SCOPED' &&
        descriptor.table.startsWith('public.') &&
        descriptor.scopingKind === 'direct_org_column',
    )
    .sort((left, right) => left.table.localeCompare(right.table));

  assertP083PublicDirectOrgTargets(targets);

  return targets;
}

export function assertP083PublicDirectOrgTargets(targets) {
  const actualTables = targets.map((descriptor) => descriptor.table);
  const actualSet = new Set(actualTables);

  if (actualSet.size !== actualTables.length) {
    throw new Error('P0.8.3 public direct-org targets contain duplicates');
  }

  const expectedSet = expectedTargetSet;
  const missing = setDiff(expectedSet, actualSet);
  const extra = setDiff(actualSet, expectedSet);

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `P0.8.3 target set mismatch. Missing: ${missing.join(', ') || '<none>'}. Extra: ${
        extra.join(', ') || '<none>'
      }`,
    );
  }
}

export function renderP083PolicyStatements({
  descriptors = getP083PublicDirectOrgDescriptors(),
} = {}) {
  return descriptors.flatMap((descriptor) =>
    renderOrgDormantPolicyStatements(descriptor, { policyName: p083PolicyName }),
  );
}

function printCli(format) {
  const descriptors = getP083PublicDirectOrgDescriptors();

  if (format === '--json') {
    console.log(JSON.stringify(descriptors, null, 2));
    return;
  }

  if (format === '--sql') {
    console.log(renderP083PolicyStatements({ descriptors }).join('\n'));
    return;
  }

  if (format === '--targets' || format == null) {
    console.log(descriptors.map((descriptor) => descriptor.table).join('\n'));
    return;
  }

  throw new Error(`Unsupported format ${format}. Use --targets, --json, or --sql.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printCli(process.argv[2]);
}
