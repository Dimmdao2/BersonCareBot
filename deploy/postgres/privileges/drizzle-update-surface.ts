/**
 * GENERATED — do not edit by hand.
 *
 * Produced by `apps/webapp/scripts/generate-drizzle-update-surface.ts`
 * from live Drizzle metadata plus an AST scan of `apps/webapp/src`. Regenerate with:
 *
 *   pnpm --dir apps/webapp exec tsx scripts/generate-drizzle-update-surface.ts
 *
 * `pnpm test:db-privileges` runs the byte-equal `--check` first, so a schema/callsite change that
 * does not regenerate this file fails before any privilege test runs.
 *
 * WHAT EACH FIELD MEANS
 *   updateColumns          SQL columns a `.update(<relation>).set({...})` call literal in
 *                          `apps/webapp/src` proves it writes. This is a LEXICAL LOWER BOUND, not
 *                          an exhaustive one: a `.set(patch)` call whose argument is not a plain
 *                          object literal with static keys cannot be read this way and is instead
 *                          reflected as an entry in `unresolvedUpdateCallsites`, never silently
 *                          dropped.
 *   directUpdateCallsites  every resolved `.update(...).set({...})` in `apps/webapp/src` bound to
 *                          this relation.
 *
 * `DRIZZLE_UPDATE_UNRESOLVED_CALLSITES` (module-level, not per relation) lists every
 * `.update(...).set(...)` this scan could not fully resolve to a set of declared columns
 * (unresolved table, non-literal `.set()` argument, or a literal with a spread/computed/unknown
 * key) — never silently dropped.
 *
 * This artifact is data, not authority. `declaration.ts` compares its `updateColumns` against each
 * declared column-level UPDATE grant and throws on the first relation whose declared columns do not
 * already cover it — it never adds a column to a grant from this data. See `declaration.ts`
 * SECTION -1 for why merging two authorities during generation is exactly the class of bug closed.
 */

export interface DrizzleUpdateRelation {
  readonly updateColumns: readonly string[];
  readonly directUpdateCallsites: readonly string[];
}

/**
 * Callsites this scan could not resolve to a table+column set at all (unresolved `.update()`
 * target, or a `.set()` argument that is not a plain object literal). Not narrowed to a relation —
 * declared here so the artifact never silently drops what it could not prove.
 */
export const DRIZZLE_UPDATE_UNRESOLVED_CALLSITES: readonly string[] = [
  'apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts:409 .update(beAppointments).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgBookingEngine.ts:1142 .update(beClinicServices).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgBookingEngine.ts:832 .update(beBranches).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgBookingScheduling.ts:838 .update(beWh).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgClientMediaFolders.ts:63 .update(mediaFolders).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgClientMediaFolders.ts:87 .update(mediaFolders).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgClinicDirectory.ts:211 .update(organizationSlugClaims).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgClinicalTests.ts:514 .update(clinicalTestsTable).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgComments.ts:100 .update(commentsTable).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgContentPages.ts:311 .update(contentPages).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgContentSections.ts:275 .update(contentSections).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgCourses.ts:389 .update(coursesTable).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgDoctorPatientSupport.ts:175 .update(doctorPatientSupport).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgMemberships.ts:750 .update(bePatientPackages).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts:264 .update(operatorIncidents).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgPatientClinical.ts:624 .update(clinicalComplaint).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgPatientClinical.ts:656 .update(clinicalDiagnosis).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgPatientClinical.ts:700 .update(clinicalVisit).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgPatientComorbidities.ts:117 .update(patientComorbidity).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts:147 .update(patientHomeBlockItems).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgPlatformEntitlements.ts:717 .update(saasTariffs).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgRecommendations.ts:476 .update(recommendationsTable).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgSaasBilling.ts:1339 .update(saasBillingInvoices).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgSaasBilling.ts:1478 .update(saasBillingInvoices).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgSaasBilling.ts:426 .update(saasBillingSubscriptions).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgSpecialistTasks.ts:151 .update(specialistTasks).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgTestSets.ts:415 .update(testSetsTable).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:1109 .update(itemTable).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:1298 .update(tplGroupTable).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:618 .update(tplTable).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:907 .update(stageTable).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1526 .update(itemTable).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1576 .update(itemTable).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1794 .update(instGroupTable).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:698 .update(instTable).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:733 .update(stageTable).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:794 .update(stageTable).set(...) — set() argument is not an object literal',
  'apps/webapp/src/infra/repos/pgUserProjection.ts:104 .update(platformUsers).set({...}) — some keys did not resolve to a declared column',
  'apps/webapp/src/infra/repos/pgUserProjection.ts:319 .update(platformUsers).set({...}) — some keys did not resolve to a declared column',
];

export const DRIZZLE_UPDATE_SURFACE: Readonly<Record<string, DrizzleUpdateRelation>> = {
  'public.be_appointment_cancellations': {
    updateColumns: [
      'notifications_sent',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts:662',
    ],
  },
  'public.be_appointment_no_shows': {
    updateColumns: [
      'notifications_sent',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts:798',
    ],
  },
  'public.be_appointment_reschedules': {
    updateColumns: [
      'notifications_sent',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts:635',
    ],
  },
  'public.be_appointments': {
    updateColumns: [
      'appointment_reminder_preset_id',
      'appointment_reminder_selection_source',
      'branch_id',
      'duration_minutes',
      'end_at',
      'original_start_at',
      'package_usage_ref',
      'payment_ref',
      'reschedule_count',
      'room_id',
      'service_id',
      'specialist_id',
      'start_at',
      'status',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts:365',
      'apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts:409',
      'apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts:549',
      'apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts:699',
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:1546',
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:2068',
      'apps/webapp/src/infra/repos/pgMemberships.ts:1022',
      'apps/webapp/src/infra/repos/pgMemberships.ts:847',
      'apps/webapp/src/infra/repos/pgMemberships.ts:900',
      'apps/webapp/src/infra/repos/pgMemberships.ts:947',
      'apps/webapp/src/infra/repos/pgMemberships.ts:975',
      'apps/webapp/src/infra/repos/pgPayments.ts:693',
    ],
  },
  'public.be_availability_rules': {
    updateColumns: [
      'config',
      'is_active',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingScheduling.ts:631',
    ],
  },
  'public.be_booking_form_fields': {
    updateColumns: [
      'field_key',
      'field_type',
      'is_active',
      'is_required',
      'label',
      'placeholder',
      'sort_order',
      'updated_at',
      'visible_to_patient',
      'visible_to_staff',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingForm.ts:143',
    ],
  },
  'public.be_branches': {
    updateColumns: [
      'is_active',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:921',
    ],
  },
  'public.be_cancellation_policies': {
    updateColumns: [
      'cancellation_allowed',
      'charge_package_session_on_late',
      'free_cancel_hours_before',
      'is_active',
      'late_cancellation_behavior',
      'notify_patient',
      'notify_staff',
      'refund_prepayment_on_late',
      'requires_staff_confirmation',
      'scope_entity_id',
      'scope_level',
      'sort_order',
      'title',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingPolicies.ts:226',
    ],
  },
  'public.be_clinic_services': {
    updateColumns: [
      'is_active',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:1164',
    ],
  },
  'public.be_organization_members': {
    updateColumns: [
      'doctor_screens_disabled',
      'specialist_id',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgOrganizationMembership.ts:281',
      'apps/webapp/src/infra/repos/pgOrganizationProvisioning.ts:245',
    ],
  },
  'public.be_organizations': {
    updateColumns: [
      'is_active',
      'sort_order',
      'tariff_id',
      'title',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:736',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:1049',
    ],
  },
  'public.be_patient_booking_profiles': {
    updateColumns: [
      'booking_blocked',
      'is_problematic',
      'problematic_note',
      'updated_at',
      'updated_by',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgClientHistory.ts:1011',
    ],
  },
  'public.be_patient_packages': {
    updateColumns: [
      'notes',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgMemberships.ts:574',
    ],
  },
  'public.be_payment_intents': {
    updateColumns: [
      'status',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPayments.ts:373',
    ],
  },
  'public.be_payment_provider_events': {
    updateColumns: [
      'processed_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPayments.ts:609',
    ],
  },
  'public.be_payments': {
    updateColumns: [
      'status',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPayments.ts:509',
    ],
  },
  'public.be_prepayment_policies': {
    updateColumns: [
      'amount_minor',
      'currency',
      'is_active',
      'mode',
      'percent_bps',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPayments.ts:228',
    ],
  },
  'public.be_reschedule_policies': {
    updateColumns: [
      'allow_different_branch',
      'allow_different_city',
      'allow_different_service',
      'allow_different_specialist',
      'is_active',
      'limit_exceeded_behavior',
      'max_self_reschedules',
      'notify_patient',
      'notify_staff',
      'requires_staff_confirmation',
      'scope_entity_id',
      'scope_level',
      'self_reschedule_hours_before',
      'sort_order',
      'title',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingPolicies.ts:296',
    ],
  },
  'public.be_rooms': {
    updateColumns: [
      'is_active',
      'sort_order',
      'title',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:953',
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:987',
    ],
  },
  'public.be_schedule_templates': {
    updateColumns: [
      'is_active',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingScheduling.ts:1037',
    ],
  },
  'public.be_specialist_service_availability': {
    updateColumns: [
      'city_code',
      'is_active',
      'price_minor_override',
      'room_id',
      'sort_order',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:1201',
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:1296',
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:1415',
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:1424',
    ],
  },
  'public.be_specialists': {
    updateColumns: [
      'appointment_reminder_allowed_preset_ids',
      'appointment_reminder_default_preset_id',
      'description',
      'full_name',
      'is_active',
      'sort_order',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:1016',
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:1055',
      'apps/webapp/src/infra/repos/pgBookingEngine.ts:1515',
    ],
  },
  'public.be_subscription_packages': {
    updateColumns: [
      'currency',
      'deduction_mode',
      'description',
      'is_active',
      'price_minor',
      'title',
      'updated_at',
      'validity_days',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgMemberships.ts:355',
    ],
  },
  'public.be_working_hours': {
    updateColumns: [
      'is_active',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgBookingScheduling.ts:797',
      'apps/webapp/src/infra/repos/pgBookingScheduling.ts:862',
    ],
  },
  'public.clinic_public_directory_entries': {
    updateColumns: [
      'slug',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgClinicDirectory.ts:366',
    ],
  },
  'public.clinical_complaint': {
    updateColumns: [
      'organization_id',
      'resolved_at',
      'status',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPatientClinical.ts:545',
      'apps/webapp/src/infra/repos/pgPatientClinical.ts:624',
    ],
  },
  'public.clinical_diagnosis': {
    updateColumns: [
      'clinical_status',
      'organization_id',
      'resolved_at',
      'status',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPatientClinical.ts:585',
      'apps/webapp/src/infra/repos/pgPatientClinical.ts:656',
      'apps/webapp/src/infra/repos/pgPatientClinical.ts:738',
    ],
  },
  'public.clinical_visit': {
    updateColumns: [
      'organization_id',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPatientClinical.ts:700',
    ],
  },
  'public.content_pages': {
    updateColumns: [
      'body_html',
      'body_md',
      'image_url',
      'is_published',
      'linked_course_id',
      'organization_id',
      'requires_auth',
      'section',
      'slug',
      'sort_order',
      'summary',
      'title',
      'updated_at',
      'video_type',
      'video_url',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgContentPages.ts:270',
      'apps/webapp/src/infra/repos/pgContentPages.ts:337',
      'apps/webapp/src/infra/repos/pgContentSections.ts:357',
      'apps/webapp/src/infra/repos/pgContentSections.ts:473',
    ],
  },
  'public.content_sections': {
    updateColumns: [
      'organization_id',
      'slug',
      'sort_order',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgContentSections.ts:291',
      'apps/webapp/src/infra/repos/pgContentSections.ts:372',
    ],
  },
  'public.doctor_patient_support': {
    updateColumns: [
      'organization_id',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgDoctorPatientSupport.ts:175',
    ],
  },
  'public.lfk_exercises': {
    updateColumns: [
      'title',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1250',
    ],
  },
  'public.media_files': {
    updateColumns: [
      'status',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPatientFiles.ts:201',
      'apps/webapp/src/infra/repos/pgPatientFiles.ts:296',
      'apps/webapp/src/infra/repos/s3MediaStorage.ts:156',
      'apps/webapp/src/infra/repos/s3MediaStorage.ts:745',
      'apps/webapp/src/infra/repos/s3MediaStorage.ts:933',
    ],
  },
  'public.media_folders': {
    updateColumns: [
      'kind',
      'name',
      'organization_id',
      'parent_id',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/mediaFoldersRepo.ts:121',
      'apps/webapp/src/infra/repos/mediaFoldersRepo.ts:148',
      'apps/webapp/src/infra/repos/pgClientMediaFolders.ts:63',
      'apps/webapp/src/infra/repos/pgClientMediaFolders.ts:87',
    ],
  },
  'public.media_upload_sessions': {
    updateColumns: [
      'last_error',
      'status',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/mediaUploadSessionsRepo.ts:389',
      'apps/webapp/src/infra/repos/mediaUploadSessionsRepo.ts:470',
      'apps/webapp/src/infra/repos/mediaUploadSessionsRepo.ts:525',
    ],
  },
  'public.operator_incidents': {
    updateColumns: [
      'alert_claim_phase',
      'alert_claim_token',
      'alert_claimed_at',
      'alert_sent_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts:264',
      'apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts:288',
      'apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts:305',
    ],
  },
  'public.org_enrollments': {
    updateColumns: [
      'status',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgDoctorClients.ts:1536',
      'apps/webapp/src/infra/repos/pgPatientOrganizationEnrollment.ts:57',
    ],
  },
  'public.organization_member_invites': {
    updateColumns: [
      'status',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgOrganizationInvites.ts:171',
    ],
  },
  'public.organization_slug_claims': {
    updateColumns: [
      'created_by_platform_user_id',
      'kind',
      'organization_id',
      'slug',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgClinicDirectory.ts:264',
      'apps/webapp/src/infra/repos/pgClinicDirectory.ts:349',
      'apps/webapp/src/infra/repos/pgClinicDirectory.ts:353',
      'apps/webapp/src/infra/repos/pgClinicDirectory.ts:361',
    ],
  },
  'public.patient_comorbidity': {
    updateColumns: [
      'organization_id',
      'removed_at',
      'status',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPatientComorbidities.ts:117',
      'apps/webapp/src/infra/repos/pgPatientComorbidities.ts:147',
      'apps/webapp/src/infra/repos/pgPatientComorbidities.ts:182',
    ],
  },
  'public.patient_files': {
    updateColumns: [
      'file_name',
      'organization_id',
      'size_bytes',
      'visit_id',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPatientFiles.ts:213',
      'apps/webapp/src/infra/repos/pgPatientFiles.ts:253',
      'apps/webapp/src/infra/repos/pgPatientFiles.ts:273',
    ],
  },
  'public.patient_home_block_items': {
    updateColumns: [
      'organization_id',
      'sort_order',
      'target_ref',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgContentSections.ts:362',
      'apps/webapp/src/infra/repos/pgContentSections.ts:484',
      'apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts:184',
      'apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts:203',
    ],
  },
  'public.patient_home_blocks': {
    updateColumns: [
      'icon_image_url',
      'is_visible',
      'sort_order',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts:62',
      'apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts:70',
      'apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts:84',
    ],
  },
  'public.patient_invites': {
    updateColumns: [
      'proof_code_hash',
      'proof_expires_at',
      'revoked_at',
      'revoked_by_platform_user_id',
      'status',
      'superseded_by_invite_id',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPatientInvites.ts:194',
      'apps/webapp/src/infra/repos/pgPatientInvites.ts:227',
      'apps/webapp/src/infra/repos/pgPatientInvites.ts:240',
    ],
  },
  'public.patient_merge_candidates': {
    updateColumns: [
      'resolved_at',
      'resolved_by',
      'status',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPatientMergeCandidate.ts:78',
      'apps/webapp/src/infra/repos/pgPatientMergeCandidate.ts:89',
    ],
  },
  'public.platform_users': {
    updateColumns: [
      'calendar_timezone',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPatientCalendarTimezone.ts:48',
      'apps/webapp/src/infra/repos/pgPlatformUserCalendarTimezone.ts:34',
      'apps/webapp/src/infra/repos/pgUserProjection.ts:104',
      'apps/webapp/src/infra/repos/pgUserProjection.ts:319',
    ],
  },
  'public.program_action_log': {
    updateColumns: [
      'payload',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgProgramActionLog.ts:261',
    ],
  },
  'public.recommendations': {
    updateColumns: [
      'is_archived',
      'organization_id',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgRecommendations.ts:476',
      'apps/webapp/src/infra/repos/pgRecommendations.ts:538',
      'apps/webapp/src/infra/repos/pgRecommendations.ts:569',
    ],
  },
  'public.saas_billing_invoices': {
    updateColumns: [
      'paid_at',
      'provider_checkout_url',
      'provider_id',
      'provider_idempotency_key',
      'provider_invoice_ref',
      'status',
      'superseded_by_invoice_id',
      'tariff_snapshot',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:1290',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:1311',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:1324',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:1339',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:1478',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:1762',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:2309',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:2324',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:237',
    ],
  },
  'public.saas_billing_periods': {
    updateColumns: [
      'is_selectable',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPlatformEntitlements.ts:633',
    ],
  },
  'public.saas_billing_provider_events': {
    updateColumns: [
      'processed_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:1461',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:1513',
    ],
  },
  'public.saas_billing_refunds': {
    updateColumns: [
      'confirmed_at',
      'status',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:2209',
    ],
  },
  'public.saas_billing_subscriptions': {
    updateColumns: [
      'autopay_consent_text',
      'autopay_consented_at',
      'autopay_revoked_at',
      'billing_period_code',
      'cancelled_at',
      'current_period_ends_at',
      'current_period_starts_at',
      'lifecycle_state',
      'paid_additional_seats',
      'pending_billing_period_code',
      'pending_tariff_id',
      'saved_payment_method_id',
      'status',
      'tariff_id',
      'tariff_snapshot',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:1491',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:2225',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:2244',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:2274',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:2289',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:269',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:426',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:979',
    ],
  },
  'public.saas_organization_trials': {
    updateColumns: [
      'status',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgSaasBilling.ts:1058',
    ],
  },
  'public.saas_tariffs': {
    updateColumns: [
      'is_active',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgPlatformEntitlements.ts:748',
    ],
  },
  'public.specialist_tasks': {
    updateColumns: [
      'completed_at',
      'organization_id',
      'reminder_sent_at',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgSpecialistTasks.ts:151',
      'apps/webapp/src/infra/repos/pgSpecialistTasks.ts:182',
      'apps/webapp/src/infra/repos/pgSpecialistTasks.ts:248',
    ],
  },
  'public.support_questions': {
    updateColumns: [
      'answered_at',
      'status',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgIntegratorSupportQuestionOwnership.ts:109',
    ],
  },
  'public.test_attempts': {
    updateColumns: [
      'accepted_at',
      'accepted_by',
      'submitted_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts:222',
      'apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts:292',
    ],
  },
  'public.test_results': {
    updateColumns: [
      'decided_by',
      'normalized_decision',
      'raw_value',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts:429',
      'apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts:633',
    ],
  },
  'public.test_sets': {
    updateColumns: [
      'is_archived',
      'organization_id',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgTestSets.ts:415',
      'apps/webapp/src/infra/repos/pgTestSets.ts:442',
      'apps/webapp/src/infra/repos/pgTestSets.ts:473',
      'apps/webapp/src/infra/repos/pgTestSets.ts:538',
    ],
  },
  'public.tests': {
    updateColumns: [
      'is_archived',
      'organization_id',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgClinicalTests.ts:514',
      'apps/webapp/src/infra/repos/pgClinicalTests.ts:576',
      'apps/webapp/src/infra/repos/pgClinicalTests.ts:607',
    ],
  },
  'public.treatment_program_instance_stage_groups': {
    updateColumns: [
      'sort_order',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1849',
    ],
  },
  'public.treatment_program_instance_stage_items': {
    updateColumns: [
      'comment',
      'completed_at',
      'created_at',
      'group_id',
      'is_actionable',
      'item_ref_id',
      'item_type',
      'last_viewed_at',
      'local_comment',
      'settings',
      'snapshot',
      'sort_order',
      'status',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1260',
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1654',
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1715',
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1819',
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1915',
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:667',
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:821',
      'apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts:296',
      'apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts:367',
    ],
  },
  'public.treatment_program_instance_stages': {
    updateColumns: [
      'skip_reason',
      'sort_order',
      'status',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1689',
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:733',
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:759',
    ],
  },
  'public.treatment_program_instances': {
    updateColumns: [
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1583',
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1694',
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1720',
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1854',
      'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:252',
    ],
  },
  'public.treatment_program_template_stage_groups': {
    updateColumns: [
      'description',
      'organization_id',
      'sort_order',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:1290',
      'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:1298',
      'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:1528',
      'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:1742',
    ],
  },
  'public.treatment_program_template_stage_items': {
    updateColumns: [
      'group_id',
      'organization_id',
      'sort_order',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:1109',
      'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:1353',
      'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:1463',
    ],
  },
  'public.treatment_program_template_stages': {
    updateColumns: [
      'organization_id',
      'sort_order',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:1404',
      'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:1415',
      'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:907',
    ],
  },
  'public.treatment_program_templates': {
    updateColumns: [
      'organization_id',
      'status',
      'updated_at',
    ],
    directUpdateCallsites: [
      'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:618',
      'apps/webapp/src/infra/repos/pgTreatmentProgram.ts:767',
    ],
  },
};
