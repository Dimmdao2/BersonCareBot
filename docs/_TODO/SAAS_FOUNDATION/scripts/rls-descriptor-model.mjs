import { readFileSync } from 'node:fs';

const root = 'docs/_TODO/SAAS_FOUNDATION';

export const paths = {
  tiers: `${root}/scope-derivation/tiers-218.tsv`,
  batches: `${root}/scope-derivation/p0-4-batches.tsv`,
  beFkPaths: `${root}/scope-derivation/p0-4-be-fk-paths.tsv`,
};

export const tiers = new Set(['SCOPED', 'BOOTSTRAP', 'INFRA', 'LEGACY', 'TELEMETRY']);

export const scopedKinds = new Set([
  'direct_org_column',
  'denorm_org_column',
  'fk_path',
  'self_org_id',
  'polymorphic_resolver',
]);

const denormResolutions = new Set([
  'attempt_parent_denorm',
  'audit_parent_denorm',
  'content_parent_denorm',
  'media_parent_denorm',
  'parent_denorm_copy',
  'parent_or_patient_org',
  'program_parent_denorm',
  'reference_parent_denorm',
]);

const polymorphicResolutions = new Set(['polymorphic_resolver']);

const bootstrapHybridTables = new Set([
  'public.system_settings',
  'public.system_settings_audit',
]);

const bootstrapHybridOrgGatedTables = new Set([
  'public.platform_user_contacts',
  'public.user_phone_history',
]);

const bootstrapRuntimeAudienceTables = new Set(['public.app_runtime_settings']);

const bootstrapRuntimeAuditTables = new Set(['public.app_runtime_settings_audit']);

// Tenant-owned tables that already carry a direct organization_id but do not use the historical
// public.be_* prefix and therefore do not belong in the P0.4 materialization batches.
export const preScopedDirectOrgTables = new Set([
  'public.clinic_public_directory_entries',
  'public.patient_invites',
  'public.saas_organization_trials',
]);

// Tables whose later foundation migration deliberately removes the historical
// missing-context-open compatibility branch. Phase4 overlays must preserve that fail-closed
// decision in both modes; otherwise the permissive policies would combine with OR semantics and
// silently reopen the table after the later migration.
const strictDormantOrgTables = new Set(['public.clinic_public_directory_entries']);

function readLines(path) {
  return readFileSync(path, 'utf8').trimEnd().split('\n').filter(Boolean);
}

function readTsv(path, expectedHeader) {
  const lines = readLines(path);
  const header = lines.shift();

  if (header !== expectedHeader.join('\t')) {
    throw new Error(`Unexpected header in ${path}: ${header}`);
  }

  return lines.map((line, index) => {
    const fields = line.split('\t');

    if (fields.length !== expectedHeader.length) {
      throw new Error(
        `Expected ${expectedHeader.length} fields in ${path}:${index + 2}, got ${fields.length}`,
      );
    }

    return Object.fromEntries(expectedHeader.map((key, fieldIndex) => [key, fields[fieldIndex]]));
  });
}

export function readTierRows() {
  return readLines(paths.tiers).map((line, index) => {
    const [tier, table] = line.split('|');

    if (!tiers.has(tier) || !table) {
      throw new Error(`Invalid tier row in ${paths.tiers}:${index + 1}`);
    }

    return { tier, table };
  });
}

export function readBatchRows() {
  return readTsv(paths.batches, ['batch', 'table', 'org_resolution', 'implementation_note']);
}

export function readBeFkPathRows() {
  return readTsv(paths.beFkPaths, [
    'table',
    'parent_table',
    'local_fk',
    'parent_pk',
    'parent_org_column',
    'cross_check_table',
    'cross_check_local_fk',
    'cross_check_pk',
    'cross_check_org_column',
  ]);
}

function scopedDescriptorFromBatch(row) {
  if (denormResolutions.has(row.org_resolution)) {
    return {
      tier: 'SCOPED',
      scopingKind: 'denorm_org_column',
      predicateTemplate: 'org_column_matches_app_org',
      orgColumn: 'organization_id',
      source: row.org_resolution,
      sourceStage: row.batch,
    };
  }

  if (polymorphicResolutions.has(row.org_resolution)) {
    return {
      tier: 'SCOPED',
      scopingKind: 'polymorphic_resolver',
      predicateTemplate: 'org_column_matches_app_org',
      orgColumn: 'organization_id',
      source: row.org_resolution,
      sourceStage: row.batch,
      requiresFollowupStage: 'P0.12.1',
    };
  }

  return {
    tier: 'SCOPED',
    scopingKind: 'direct_org_column',
    predicateTemplate: 'org_column_matches_app_org',
    orgColumn: 'organization_id',
    source: row.org_resolution,
    sourceStage: row.batch,
  };
}

function scopedDescriptorForBeTable(table) {
  if (table === 'public.be_organizations') {
    return {
      tier: 'SCOPED',
      scopingKind: 'self_org_id',
      predicateTemplate: 'self_id_matches_app_org',
      orgColumn: 'id',
      source: 'be_organization_self_scope',
    };
  }

  return {
    tier: 'SCOPED',
    scopingKind: 'direct_org_column',
    predicateTemplate: 'org_column_matches_app_org',
    orgColumn: 'organization_id',
    source: 'be_direct_org',
    ...(strictDormantOrgTables.has(table) ? { dormantMode: 'strict' } : {}),
  };
}

function bootstrapDescriptor(table) {
  if (bootstrapRuntimeAuditTables.has(table)) {
    return {
      tier: 'BOOTSTRAP',
      scopingKind: 'bootstrap_runtime_audit',
      predicateTemplate: 'staff_global_or_exact_org_audit',
      orgColumn: 'organization_id',
      source: 'runtime_config_staff_only_audit_history',
    };
  }

  if (bootstrapRuntimeAudienceTables.has(table)) {
    return {
      tier: 'BOOTSTRAP',
      scopingKind: 'bootstrap_runtime_audience',
      predicateTemplate: 'safe_audience_global_or_tenant_row',
      orgColumn: 'organization_id',
      audienceColumn: 'audience',
      safeAudiences: ['public', 'authenticated_client'],
      source: 'runtime_config_safe_audience_global_or_tenant_row',
    };
  }

  if (bootstrapHybridOrgGatedTables.has(table)) {
    return {
      tier: 'BOOTSTRAP',
      scopingKind: 'bootstrap_hybrid_org_gated',
      predicateTemplate: 'org_gated_null_bootstrap',
      orgColumn: 'organization_id',
      source: 'bootstrap_null_rows_gated_to_contextless_principal',
    };
  }

  if (bootstrapHybridTables.has(table)) {
    return {
      tier: 'BOOTSTRAP',
      scopingKind: 'bootstrap_hybrid',
      predicateTemplate: 'organization_id_is_null_or_matches_app_org',
      orgColumn: 'organization_id',
      source: 'bootstrap_global_or_tenant_row',
    };
  }

  return {
    tier: 'BOOTSTRAP',
    scopingKind: 'bootstrap_global',
    predicateTemplate: 'bootstrap_readable',
    source: 'identity_or_pre_context_runtime',
  };
}

function exemptionDescriptor(tier) {
  const sourceByTier = {
    INFRA: 'infra_queue_ledger_or_operator_state',
    LEGACY: 'legacy_frozen_until_sunset',
    TELEMETRY: 'userless_aggregate_rollup',
  };

  return {
    tier,
    scopingKind: 'explicit_exemption',
    predicateTemplate: 'explicit_tier_exemption',
    source: sourceByTier[tier],
  };
}

// B4-core (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, owner decision 2026-07-11):
// patient-owned SCOPED tables get an ADDITIONAL fail-closed staff-or-patient branch on top of
// their existing org predicate (org visibility stays org-wide/variant A — unaffected for staff
// sessions, which always bypass via app.actor='staff'). This registry is the single source of
// truth for "which column identifies the owning patient, and what SQL type it is" — verified
// against the real CREATE TABLE/ALTER TABLE SQL (webapp Drizzle migrations + integrator core
// migrations), NOT inferred from column-name conventions alone.
//
// Scope is deliberately narrower than "every table with any user-reference column" — see
// docs/_TODO/SAAS_FOUNDATION/LOG.md (taskdb #653) for the full classification and the excluded
// set. Tables reachable only via a multi-hop FK/JOIN chain to an identity-bearing parent (the
// support_questions family, integrator P0.4.I2 identity-bridge tables, integrator P0.4.I3
// parent-denorm tables) are NOT excluded — see the separate `patientChainOwnedTables` registry
// below (taskdb #656, B4-fanout gap closure), which walls them via an EXISTS-chain instead of a
// direct column match. What remains genuinely excluded here (documented, not silently dropped):
//   - most P0.8.4 catalog-child tables with no per-patient chain at all (org catalog/content
//     line items — e.g. clinical_diagnosis_catalog children, test/exercise catalog rows);
//   - tables where the "owner" column is actually a STAFF actor, not a patient
//     (be_package_usages.created_by_platform_user_id, content_section_slug_history.changed_by_user_id, ...);
//   - dual-role owner columns that mean "staff OR patient" depending on ANOTHER column's value,
//     where a plain column-equality predicate would incorrectly wall off legitimate org-wide
//     content: public.media_files.uploaded_by (org library uploads vs a patient's own submission,
//     disambiguated by usage_purpose) is NO LONGER excluded here — B4-core-4 (taskdb #660) closes
//     this with a conditional predicate instead of a plain column match; see
//     patientConditionalOwnedColumns below (and its FK-dependent sibling
//     public.media_transcode_jobs in patientConditionalChainOwnedTables). (NOTE:
//     public.media_upload_sessions is NOT excluded for this reason — B4-core-3 audit correction,
//     taskdb #658: it has NO usage_purpose column, its owner_user_id is a plain NOT NULL per-patient
//     FK, so it is walled directly below in patientOwnedColumns, same shape as media_playback_*);
//   - public.patient_merge_candidates (staff/system dedup queue, not a patient's own record);
//   - P0.8.6 BOOTSTRAP-hybrid tables (system_settings, platform_user_contacts, user_phone_history,
//     legacy bootstrap config surfaces) — explicitly out of scope per owner instruction, pre-org-context
//     identity/bootstrap semantics must not change.
const patientOwnedColumns = new Map([
  // public.* direct_org_column (P0.8.3), patient identity = platform_users.id (uuid)
  ['public.be_appointments', { column: 'platform_user_id' }],
  ['public.be_appointment_staff_comments', { column: 'platform_user_id' }],
  ['public.be_patient_booking_profiles', { column: 'platform_user_id' }],
  ['public.be_patient_packages', { column: 'platform_user_id' }],
  ['public.be_patient_timeline_events', { column: 'platform_user_id' }],
  ['public.be_payment_history_events', { column: 'platform_user_id' }],
  ['public.be_payment_intents', { column: 'platform_user_id' }],
  ['public.be_payments', { column: 'platform_user_id' }],
  ['public.clinical_anamnesis_illness', { column: 'patient_user_id' }],
  ['public.clinical_anamnesis_lifestyle', { column: 'patient_user_id' }],
  ['public.clinical_anamnesis_trauma', { column: 'patient_user_id' }],
  ['public.clinical_complaint', { column: 'patient_user_id' }],
  ['public.clinical_diagnosis', { column: 'patient_user_id' }],
  ['public.clinical_visit', { column: 'patient_user_id' }],
  ['public.content_access_grants_webapp', { column: 'platform_user_id' }],
  ['public.doctor_notes', { column: 'user_id' }],
  ['public.doctor_patient_support', { column: 'patient_user_id' }],
  ['public.lfk_complexes', { column: 'platform_user_id' }],
  ['public.lfk_sessions', { column: 'user_id' }],
  ['public.material_ratings', { column: 'user_id' }],
  // media_folders.patient_user_id is NULL for shared/standard folders (org-wide, visible to
  // everyone including patients) and only set for the 'client_patient' per-patient folder kind —
  // NULL here means "shared", not "unlinked", so it needs the nullable-shared shape.
  ['public.media_folders', { column: 'patient_user_id', nullableShared: true }],
  ['public.message_log', { column: 'platform_user_id' }],
  ['public.online_intake_requests', { column: 'user_id' }],
  ['public.org_enrollments', { column: 'platform_user_id' }],
  ['public.patient_comorbidity', { column: 'patient_user_id' }],
  ['public.patient_content_rating_feedback', { column: 'user_id' }],
  ['public.patient_daily_warmup_presentations', { column: 'user_id' }],
  ['public.patient_diary_day_snapshots', { column: 'platform_user_id' }],
  ['public.patient_files', { column: 'patient_user_id' }],
  ['public.patient_lfk_assignments', { column: 'patient_user_id' }],
  ['public.patient_payment', { column: 'patient_user_id' }],
  ['public.patient_practice_completions', { column: 'user_id' }],
  ['public.product_analytics_events_recent', { column: 'user_id' }],
  ['public.product_analytics_user_hourly', { column: 'user_id' }],
  ['public.product_push_notifications', { column: 'user_id' }],
  ['public.reminder_rules', { column: 'platform_user_id' }],
  ['public.specialist_tasks', { column: 'patient_user_id' }],
  ['public.support_conversations', { column: 'platform_user_id' }],
  ['public.symptom_trackings', { column: 'platform_user_id' }],
  ['public.test_attempts', { column: 'patient_user_id' }],
  ['public.treatment_program_instances', { column: 'patient_user_id' }],
  // public.* bridge tables that store the INTEGRATOR bigint id directly (no platform_users uuid
  // column at all) — verified against apps/webapp/migrations/012_subscription_mailing.sql.
  // castType: "bigint" reads the DEDICATED integrator identity GUC `app.integrator_user_id`
  // (P0.13/T0.4 convention — see smoke-p0-13-db-isolation.mjs), never `app.patient_user_id`.
  // public.* denorm_org_column (P0.8.4) with a direct patient column already on the child row
  ['public.broadcast_audit_recipients', { column: 'platform_user_id' }],
  ['public.notification_delivery_attempts', { column: 'user_id' }],
  ['public.patient_daily_warmup_video_views', { column: 'user_id' }],
  ['public.program_action_log', { column: 'patient_user_id' }],
  ['public.program_item_discussion_messages', { column: 'patient_user_id' }],
  ['public.program_item_discussion_reads', { column: 'patient_user_id' }],
  ['public.symptom_entries', { column: 'platform_user_id' }],
  ['public.webapp_reminder_occurrences', { column: 'platform_user_id' }],
  ['public.reminder_delivery_events', { column: 'integrator_user_id', castType: 'bigint' }],
  // public.reminder_occurrence_history is NOT registered here (as a direct integrator_user_id/bigint
  // column reading app.current_integrator_user_id()) even though its column shape matches
  // reminder_delivery_events above. Corrected 2026-07-26 (taskdb #1018, live 404 on all three patient
  // reminder actions): packages/db-principal/src/index.ts applyDbPrincipal's "patient" branch
  // (:845-849) ALWAYS clears APP_INTEGRATOR_USER_CONFIG_KEY to "" and only ever populates
  // APP_PATIENT_USER_CONFIG_KEY — a patient session's app.integrator_user_id GUC is never set, so a
  // direct-column predicate reading app.current_integrator_user_id() can never admit a patient's own
  // row here (verified: table-level SELECT grant to app_patient already exists, so the empty result
  // was RLS filtering to zero rows, not an aclcheck_error). See patientChainOwnedTables below for the
  // real predicate: this table's patient identity is reached by bridging through
  // platform_users.integrator_user_id (UNIQUE, apps/webapp/db/schema/schema.ts:107), the same join
  // apps/webapp/src/infra/repos/pgReminderJournal.ts recordDone/recordSnooze/recordSkip already use
  // for their own application-level ownership check.

  // public.* fk_path (P0.8.4): patient column lives on the SAME immediate FK parent already used
  // for the org fk_path predicate (public.be_patient_packages.platform_user_id). The sibling
  // fk_path table public.be_package_items has NO patient-owning parent (be_subscription_packages
  // is an org catalog definition) and stays org-only.
  ['public.be_patient_package_items', { column: 'platform_user_id' }],

  // integrator.* direct_org_column (P0.8.5), patient identity = integrator.users.id (bigint),
  // read from the dedicated `app.integrator_user_id` GUC (castType: "bigint" — see the note above
  // integrator identity tables). contacts/content_access_grants/user_reminder_rules verified via
  // apps/integrator/src/infra/db/migrations/core/20260306_0014_create_contacts.sql and
  // 20260311_0002_create_user_reminders.sql (user_id bigint REFERENCES users(id)). mailing_logs
  // and user_subscriptions originally referenced the legacy telegram_users(id) space, but
  // apps/integrator/src/integrations/telegram/db/migrations/20260306_0010_detach_telegram_users_refs.sql
  // rewrites their user_id values through integrator.identities and re-points the FK to
  // users(id).
  ['integrator.contacts', { column: 'user_id', castType: 'bigint' }],
  ['integrator.content_access_grants', { column: 'user_id', castType: 'bigint' }],
  ['integrator.user_reminder_rules', { column: 'user_id', castType: 'bigint' }],

  // B4-core-3 census follow-up (docs/_TODO/SAAS_FOUNDATION/LOG.md, taskdb #658): 4 more
  // public.* direct_org_column tables with a direct `user_id` column referencing
  // platform_users(id) (NOT NULL) that record per-viewer media playback telemetry — same shape
  // as the already-registered patient_daily_warmup_video_views/product_analytics_events_recent
  // (generic "user_id", not "patient_"-prefixed, still the viewing platform_user). Verified
  // against apps/webapp/db/drizzle-migrations/0059_media_playback_client_events.sql,
  // 0061_media_hls_proxy_error_events.sql, 0106_media_playback_resolution_events.sql,
  // 0027_media_playback_user_video_first_resolve.sql.
  ['public.media_playback_client_events', { column: 'user_id' }],
  ['public.media_hls_proxy_error_events', { column: 'user_id' }],
  ['public.media_playback_resolution_events', { column: 'user_id' }],
  ['public.media_playback_user_video_first_resolve', { column: 'user_id' }],

  // B4-core-3 audit correction (docs/_TODO/SAAS_FOUNDATION/LOG.md, taskdb #658): media_upload_sessions
  // was previously (wrongly) excluded as "dual-role keyed by usage_purpose" — but that column lives
  // on media_files, NOT on this table. media_upload_sessions.owner_user_id is a plain NOT NULL FK to
  // platform_users(id) (apps/webapp/migrations/067_media_folders_and_multipart.sql), the direct
  // per-patient owner of the upload session. Same direct-column wall as media_playback_*; the
  // staff-actor bypass covers the case where the uploader is a staff member (org library upload),
  // so legitimate staff access is unaffected while a patient sees only its own upload sessions.
  ['public.media_upload_sessions', { column: 'owner_user_id' }],
]);

// B4-fanout gap closure (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #656):
// tables with NO direct patient-owner column, whose owning patient is only reachable by walking
// one or more FK hops to a table that DOES carry one — verified against the real CREATE TABLE SQL
// for every hop (apps/integrator/src/infra/db/migrations/core/20260306_0013_create_identities.sql,
// 20260310_0001_create_message_threads.sql, 20260311_0001_create_user_questions.sql,
// 20260311_0002_create_user_reminders.sql; apps/webapp/migrations/009_support_communication_history.sql).
// Rendered via renderPatientChainPredicate (rls-sql-renderer.mjs): a single EXISTS with a chain of
// INNER JOINs from the policy row down to the identity-bearing terminal table/column — a broken or
// NULL hop anywhere denies (fail-closed), same as a direct column predicate.
const patientChainOwnedTables = new Map([
  // I2 identity-bridge (P0.4.I2, direct_org_column): owner is reached in ONE hop through
  // integrator.identities(id, user_id bigint REFERENCES integrator.users(id)).
  [
    'integrator.conversations',
    {
      hops: [
        {
          table: 'integrator.identities',
          alias: 'b4f_conversations_identity',
          parentPk: 'id',
          localFk: 'user_identity_id',
        },
      ],
      terminalColumn: 'user_id',
      castType: 'bigint',
    },
  ],
  [
    'integrator.message_drafts',
    {
      hops: [
        {
          table: 'integrator.identities',
          alias: 'b4f_message_drafts_identity',
          parentPk: 'id',
          localFk: 'identity_id',
        },
      ],
      terminalColumn: 'user_id',
      castType: 'bigint',
    },
  ],
  [
    'integrator.user_questions',
    {
      hops: [
        {
          table: 'integrator.identities',
          alias: 'b4f_user_questions_identity',
          parentPk: 'id',
          localFk: 'user_identity_id',
        },
      ],
      terminalColumn: 'user_id',
      castType: 'bigint',
    },
  ],

  // I3 parent-denorm (P0.4.I3, denorm_org_column): owner reached by walking to the immediate
  // parent, then (where the parent itself is identity-bridged, not directly user-owned) on through
  // integrator.identities. user_reminder_occurrences/_delivery_logs walk to user_reminder_rules,
  // which already carries a direct bigint user_id (no identities hop needed there).
  [
    'integrator.conversation_messages',
    {
      hops: [
        {
          table: 'integrator.conversations',
          alias: 'b4f_conv',
          parentPk: 'id',
          localFk: 'conversation_id',
        },
        {
          table: 'integrator.identities',
          alias: 'b4f_ident',
          parentPk: 'id',
          localFk: 'user_identity_id',
        },
      ],
      terminalColumn: 'user_id',
      castType: 'bigint',
    },
  ],
  [
    'integrator.question_messages',
    {
      hops: [
        {
          table: 'integrator.user_questions',
          alias: 'b4f_question',
          parentPk: 'id',
          localFk: 'question_id',
        },
        {
          table: 'integrator.identities',
          alias: 'b4f_ident',
          parentPk: 'id',
          localFk: 'user_identity_id',
        },
      ],
      terminalColumn: 'user_id',
      castType: 'bigint',
    },
  ],
  [
    'integrator.user_reminder_occurrences',
    {
      hops: [
        {
          table: 'integrator.user_reminder_rules',
          alias: 'b4f_rule',
          parentPk: 'id',
          localFk: 'rule_id',
        },
      ],
      terminalColumn: 'user_id',
      castType: 'bigint',
    },
  ],
  [
    'integrator.user_reminder_delivery_logs',
    {
      hops: [
        {
          table: 'integrator.user_reminder_occurrences',
          alias: 'b4f_occ',
          parentPk: 'id',
          localFk: 'occurrence_id',
        },
        {
          table: 'integrator.user_reminder_rules',
          alias: 'b4f_rule',
          parentPk: 'id',
          localFk: 'rule_id',
        },
      ],
      terminalColumn: 'user_id',
      castType: 'bigint',
    },
  ],

  // public.support_* family (webapp, uuid castType, apps/webapp/migrations/009_support_communication_history.sql):
  // chain to support_conversations.platform_user_id — the SAME column already registered DIRECTLY
  // on public.support_conversations above (patientOwnedColumns). Deliberately NOT also chaining to
  // support_conversations.integrator_user_id (its bigint bridge column): that column is not yet
  // part of any registered patient-owner predicate for support_conversations itself, so adding it
  // only here would be an inconsistent, narrower-than-parent wall. conversation_id/question_id/
  // conversation_message_id hops are nullable on some of these child tables (e.g. support_questions
  // .conversation_id, support_delivery_events.conversation_message_id) — a NULL hop simply fails
  // the INNER JOIN and denies for patient sessions (fail-closed), same as staff-unaffected/org-wide
  // visibility is preserved via the staff-actor bypass.
  [
    'public.support_questions',
    {
      hops: [
        {
          table: 'public.support_conversations',
          alias: 'b4f_conv',
          parentPk: 'id',
          localFk: 'conversation_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.support_conversation_messages',
    {
      hops: [
        {
          table: 'public.support_conversations',
          alias: 'b4f_conv',
          parentPk: 'id',
          localFk: 'conversation_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.support_question_messages',
    {
      hops: [
        {
          table: 'public.support_questions',
          alias: 'b4f_question',
          parentPk: 'id',
          localFk: 'question_id',
        },
        {
          table: 'public.support_conversations',
          alias: 'b4f_conv',
          parentPk: 'id',
          localFk: 'conversation_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.support_delivery_events',
    {
      hops: [
        {
          table: 'public.support_conversation_messages',
          alias: 'b4f_msg',
          parentPk: 'id',
          localFk: 'conversation_message_id',
        },
        {
          table: 'public.support_conversations',
          alias: 'b4f_conv',
          parentPk: 'id',
          localFk: 'conversation_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],

  // B4-core-3 (docs/_TODO/SAAS_FOUNDATION/LOG.md, taskdb #658): 9 more patient-owned denorm_org_column
  // (P0.8.4) tables the B4-core-2 audit found still org-only. Each is a SINGLE-hop parent_denorm
  // child whose immediate FK parent already carries a direct patient-owner column registered above
  // in `patientOwnedColumns` (online_intake_requests.user_id, clinical_complaint.patient_user_id,
  // clinical_diagnosis.patient_user_id, test_attempts.patient_user_id,
  // treatment_program_instances.patient_user_id, lfk_complexes.platform_user_id) — verified against
  // the real CREATE TABLE/ALTER TABLE SQL (apps/webapp/migrations/048_online_intake.sql,
  // apps/webapp/db/drizzle-migrations/0121_patient_clinical_core.sql,
  // apps/webapp/db/drizzle-migrations/0128_patient_diagnosis_status.sql,
  // apps/webapp/db/drizzle-migrations/0005_treatment_program_phase6.sql,
  // apps/webapp/db/drizzle-migrations/0003_treatment_program_instances.sql,
  // apps/webapp/migrations/035_lfk_complex_exercises.sql +
  // apps/webapp/migrations/064_platform_user_owned_refs_enforce.sql for the NOT NULL
  // lfk_complexes.platform_user_id column). All webapp/uuid -> app.patient_user_id (castType uuid,
  // the default).
  [
    'public.online_intake_answers',
    {
      hops: [
        {
          table: 'public.online_intake_requests',
          alias: 'b4f_intake_request',
          parentPk: 'id',
          localFk: 'request_id',
        },
      ],
      terminalColumn: 'user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.online_intake_attachments',
    {
      hops: [
        {
          table: 'public.online_intake_requests',
          alias: 'b4f_intake_request',
          parentPk: 'id',
          localFk: 'request_id',
        },
      ],
      terminalColumn: 'user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.online_intake_status_history',
    {
      hops: [
        {
          table: 'public.online_intake_requests',
          alias: 'b4f_intake_request',
          parentPk: 'id',
          localFk: 'request_id',
        },
      ],
      terminalColumn: 'user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.clinical_complaint_update',
    {
      hops: [
        {
          table: 'public.clinical_complaint',
          alias: 'b4f_complaint',
          parentPk: 'id',
          localFk: 'complaint_id',
        },
      ],
      terminalColumn: 'patient_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.clinical_diagnosis_update',
    {
      hops: [
        {
          table: 'public.clinical_diagnosis',
          alias: 'b4f_diagnosis',
          parentPk: 'id',
          localFk: 'diagnosis_id',
        },
      ],
      terminalColumn: 'patient_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.clinical_diagnosis_status_history',
    {
      hops: [
        {
          table: 'public.clinical_diagnosis',
          alias: 'b4f_diagnosis',
          parentPk: 'id',
          localFk: 'diagnosis_id',
        },
      ],
      terminalColumn: 'patient_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.test_results',
    {
      hops: [
        {
          table: 'public.test_attempts',
          alias: 'b4f_attempt',
          parentPk: 'id',
          localFk: 'attempt_id',
        },
      ],
      terminalColumn: 'patient_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.treatment_program_instance_stages',
    {
      hops: [
        {
          table: 'public.treatment_program_instances',
          alias: 'b4f_instance',
          parentPk: 'id',
          localFk: 'instance_id',
        },
      ],
      terminalColumn: 'patient_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.lfk_complex_exercises',
    {
      hops: [
        {
          table: 'public.lfk_complexes',
          alias: 'b4f_complex',
          parentPk: 'id',
          localFk: 'complex_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],

  // B4-core-3 census follow-up (docs/_TODO/SAAS_FOUNDATION/LOG.md, taskdb #658): the exhaustive
  // SCOPED-table census systematically checked every not-yet-walled SCOPED table's FK columns
  // against the walled-table set above and found 14 more single/double-hop parent_denorm chains to
  // an already-walled patient-owning parent — verified against the real CREATE TABLE/ALTER TABLE
  // SQL for every hop.
  //
  // Treatment-program event/hierarchy children (P0.8.4, denorm_org_column) — chain to
  // treatment_program_instances.patient_user_id (already walled directly):
  [
    'public.treatment_program_events',
    {
      hops: [
        {
          table: 'public.treatment_program_instances',
          alias: 'b4f_instance',
          parentPk: 'id',
          localFk: 'instance_id',
        },
      ],
      terminalColumn: 'patient_user_id',
      castType: 'uuid',
    },
  ],
  // treatment_program_instance_stages (already walled via a B4-core-3 direct chain above) has NO
  // direct patient column itself, so its own children need a 2-hop chain: down to the stage, then
  // on to the instance. apps/webapp/db/drizzle-migrations/0003_treatment_program_instances.sql
  // (stage_id/instance_id NOT NULL) + 0029_treatment_program_a3_stage_groups.sql.
  [
    'public.treatment_program_instance_stage_items',
    {
      hops: [
        {
          table: 'public.treatment_program_instance_stages',
          alias: 'b4f_stage',
          parentPk: 'id',
          localFk: 'stage_id',
        },
        {
          table: 'public.treatment_program_instances',
          alias: 'b4f_instance',
          parentPk: 'id',
          localFk: 'instance_id',
        },
      ],
      terminalColumn: 'patient_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.treatment_program_instance_stage_groups',
    {
      hops: [
        {
          table: 'public.treatment_program_instance_stages',
          alias: 'b4f_stage',
          parentPk: 'id',
          localFk: 'stage_id',
        },
        {
          table: 'public.treatment_program_instances',
          alias: 'b4f_instance',
          parentPk: 'id',
          localFk: 'instance_id',
        },
      ],
      terminalColumn: 'patient_user_id',
      castType: 'uuid',
    },
  ],

  // be_appointment_* history/event/lifecycle children (P0.8.3, direct_org_column — these carry
  // their own organization_id) — chain to be_appointments.platform_user_id (already walled
  // directly, nullable — ordinary nullable-denies-for-patient semantics, NOT nullableShared).
  // Verified against apps/webapp/db/drizzle-migrations/0086_booking_engine_canonical.sql,
  // 0091_booking_stage4_policies_lifecycle.sql, 0126_be_no_show_handling.sql,
  // 0089_booking_stage2_scheduling_and_forms.sql (all appointment_id NOT NULL).
  [
    'public.be_appointment_cancellations',
    {
      hops: [
        {
          table: 'public.be_appointments',
          alias: 'b4f_appt',
          parentPk: 'id',
          localFk: 'appointment_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.be_appointment_events',
    {
      hops: [
        {
          table: 'public.be_appointments',
          alias: 'b4f_appt',
          parentPk: 'id',
          localFk: 'appointment_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.be_appointment_history_events',
    {
      hops: [
        {
          table: 'public.be_appointments',
          alias: 'b4f_appt',
          parentPk: 'id',
          localFk: 'appointment_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.be_appointment_no_shows',
    {
      hops: [
        {
          table: 'public.be_appointments',
          alias: 'b4f_appt',
          parentPk: 'id',
          localFk: 'appointment_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.be_appointment_reschedules',
    {
      hops: [
        {
          table: 'public.be_appointments',
          alias: 'b4f_appt',
          parentPk: 'id',
          localFk: 'appointment_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.be_booking_form_submissions',
    {
      hops: [
        {
          table: 'public.be_appointments',
          alias: 'b4f_appt',
          parentPk: 'id',
          localFk: 'appointment_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],

  // be_refunds (P0.8.3): payment_id NOT NULL -> be_payments.platform_user_id (already walled
  // directly, nullable). apps/webapp/db/drizzle-migrations/0092_booking_stage5_payments.sql.
  [
    'public.be_refunds',
    {
      hops: [
        {
          table: 'public.be_payments',
          alias: 'b4f_payment',
          parentPk: 'id',
          localFk: 'payment_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],

  // be_package_usages / be_package_history_events (P0.8.3): patient_package_id NOT NULL ->
  // be_patient_packages.platform_user_id (already walled directly, NOT NULL). Note:
  // be_package_usages.created_by_platform_user_id is the STAFF actor who recorded the usage
  // (documented exclusion at the top of this file) — the chain below walls the row by which
  // PATIENT's package it belongs to, a different column entirely.
  // apps/webapp/db/drizzle-migrations/0094_booking_stage6_memberships.sql.
  [
    'public.be_package_usages',
    {
      hops: [
        {
          table: 'public.be_patient_packages',
          alias: 'b4f_pkg',
          parentPk: 'id',
          localFk: 'patient_package_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],
  [
    'public.be_package_history_events',
    {
      hops: [
        {
          table: 'public.be_patient_packages',
          alias: 'b4f_pkg',
          parentPk: 'id',
          localFk: 'patient_package_id',
        },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],

  // reminder_journal (P0.8.3): rule_id NOT NULL -> reminder_rules.platform_user_id (already walled
  // directly, nullable for integrator-only reminder rules — ordinary nullable-denies semantics).
  // apps/webapp/migrations/050_reminder_rules_object_links_and_journal.sql.
  [
    'public.reminder_journal',
    {
      hops: [
        { table: 'public.reminder_rules', alias: 'b4f_rule', parentPk: 'id', localFk: 'rule_id' },
      ],
      terminalColumn: 'platform_user_id',
      castType: 'uuid',
    },
  ],

  // reminder_occurrence_history (P0.8.4, denorm_org_column): corrected 2026-07-26 (taskdb #1018) from
  // a direct integrator_user_id/bigint column (removed above from patientOwnedColumns — see the note
  // left in its place) to a bridge through platform_users. This table has no platform_users uuid FK
  // column of its own; it carries only the bare integrator bigint id
  // (apps/webapp/db/schema/schema.ts:1836, NOT NULL). platform_users.integrator_user_id is UNIQUE
  // (apps/webapp/db/schema/schema.ts:107, constraint platform_users_integrator_user_id_key), so
  // matching on it identifies at most one platform_users row — the same bridge
  // apps/webapp/src/infra/repos/pgReminderJournal.ts already performs in application code
  // (`INNER JOIN platform_users pu ON pu.integrator_user_id = roh.integrator_user_id ... AND pu.id =
  // platformUserId`) for its own pre-write ownership check. A patient session only ever populates
  // app.patient_user_id (never app.integrator_user_id, see the note above), so the bridge must land on
  // platform_users.id via app.current_patient_user_id(), castType "uuid" (the default).
  //
  // outerQualifier is required here (see rls-sql-renderer.mjs renderPatientChainPredicate note):
  // the bridge column is named integrator_user_id on BOTH sides (this table and platform_users), so
  // a bare reference to the outer row's integrator_user_id inside the EXISTS subquery would resolve
  // to the platform_users alias instead (SQL inner-scope shadowing) and silently open every row to
  // any patient. Proven live on a throwaway DB before this qualifier was added.
  [
    'public.reminder_occurrence_history',
    {
      hops: [
        {
          table: 'public.platform_users',
          alias: 'b4f_reminder_occurrence_platform_user',
          parentPk: 'integrator_user_id',
          localFk: 'integrator_user_id',
          outerQualifier: 'public.reminder_occurrence_history',
        },
      ],
      terminalColumn: 'id',
      castType: 'uuid',
    },
  ],
]);

// B4-core-4 (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #660): independent audit
// of the B4-core-3 census found 3 REAL patient-owned SCOPED tables still org-only under the
// dormant policy family — the "hard" cases (conditional/dual-role, and polymorphic), deliberately
// out of scope for the plain patientOwnedColumns/patientChainOwnedTables registries above since a
// bare column-equality or chain predicate would either incorrectly wall off legitimate org-wide
// content or incorrectly leave a patient submission open to other patients:
//
//   1. public.media_files — dual-role uploaded_by (verified against
//      apps/webapp/db/drizzle-migrations/0018_media_files_hls_foundation.sql /
//      apps/webapp/migrations/028_media_files.sql for the base uploaded_by uuid REFERENCES
//      platform_users(id) column, and 0098_program_item_discussion_stage1.sql for the usage_purpose
//      text column + its CHECK constraint restricting values to NULL or 'program_item_submission').
//      Staff sees everything (org-wide bypass, unchanged). A patient sees: (a) every row that is
//      NOT a per-patient submission (usage_purpose IS DISTINCT FROM 'program_item_submission' —
//      covers both NULL and any other future non-submission tag, so the shared/library media stays
//      visible to every patient in the org) OR (b) a submission it uploaded itself
//      (uploaded_by = the requesting patient). A patient never sees ANOTHER patient's submission.
//   2. public.media_transcode_jobs — no ownership column of its own; inherits media_files'
//      conditional ownership via its media_id FK (verified NOT NULL REFERENCES media_files(id) in
//      apps/webapp/db/drizzle-migrations/0019_media_transcode_jobs_queue.sql). Same dual-role EXISTS
//      shape as media_files, just one hop away.
//   3. public.comments — polymorphic target_type/target_id (organization_id resolver already
//      verified/materialized in 0154_p0_4_d_polymorphic_denorm_org.sql, all 9 target_type values
//      documented+checked by check-p0-12-polymorphic-references.mjs, P0.12.1 checklist item
//      complete — docs/_TODO/SAAS_FOUNDATION/P0_12_RESIDUAL_REFS_CHECKLIST.md). Of the 9 target_type
//      values, 5 point at org catalog/content rows with no per-patient owner at all (exercise, test,
//      test_set, recommendation, lesson) — those stay visible to any org member (patients included),
//      same as before. The remaining 4 point at a PATIENT'S OWN treatment-program/lfk instance
//      (program_instance -> treatment_program_instances.patient_user_id; lfk_complex ->
//      lfk_complexes.platform_user_id; stage_instance -> treatment_program_instance_stages ->
//      treatment_program_instances.patient_user_id, 1 extra hop because the stage row itself carries
//      no direct patient column, same shape already proven for
//      public.treatment_program_instance_stages in patientChainOwnedTables above; stage_item_instance
//      -> treatment_program_instance_stage_items -> treatment_program_instance_stages ->
//      treatment_program_instances.patient_user_id, 2 extra hops, same shape as
//      public.treatment_program_instance_stage_items above) — a comment on one of THOSE target types
//      is only visible to the owning patient (or staff). comments.author_id is the comment's AUTHOR
//      (could be staff OR the patient), never used for ownership here — a doctor's comment on a
//      patient's own program instance must still only be visible to THAT patient (not to other
//      patients), which is exactly what resolving through the TARGET's owner (not the author)
//      achieves.
//
// Descriptors keep their EXISTING scopingKind (direct_org_column / denorm_org_column /
// polymorphic_resolver) and org predicate unchanged — this only ADDS the fail-closed staff-or-
// patient branch on top, same "org AND (staff OR patient)" shape as patientOwnedColumns/
// patientChainOwnedTables, just with a richer patient-branch predicate (see rls-sql-renderer.mjs
// renderConditionalPatientPredicate / renderConditionalChainPatientPredicate /
// renderPolymorphicPatientPredicate).
const patientConditionalOwnedColumns = new Map([
  [
    'public.media_files',
    {
      column: 'uploaded_by',
      discriminatorColumn: 'usage_purpose',
      discriminatorExcludedValue: 'program_item_submission',
    },
  ],
]);

const patientConditionalChainOwnedTables = new Map([
  [
    'public.media_transcode_jobs',
    {
      hop: {
        table: 'public.media_files',
        alias: 'b4c4_transcode_media',
        parentPk: 'id',
        localFk: 'media_id',
      },
      patientColumn: 'uploaded_by',
      discriminatorColumn: 'usage_purpose',
      discriminatorExcludedValue: 'program_item_submission',
    },
  ],
]);

const patientPolymorphicOwnedTables = new Map([
  [
    'public.comments',
    {
      typeColumn: 'target_type',
      // Catalog/content target types with no per-patient owner — stay visible org-wide (unchanged).
      sharedTypeValues: ['exercise', 'test', 'test_set', 'recommendation', 'lesson'],
      variants: [
        {
          typeValue: 'program_instance',
          hops: [
            {
              table: 'public.treatment_program_instances',
              alias: 'b4c4_comment_program',
              parentPk: 'id',
              localFk: 'target_id',
            },
          ],
          terminalColumn: 'patient_user_id',
        },
        {
          typeValue: 'lfk_complex',
          hops: [
            {
              table: 'public.lfk_complexes',
              alias: 'b4c4_comment_complex',
              parentPk: 'id',
              localFk: 'target_id',
            },
          ],
          terminalColumn: 'platform_user_id',
        },
        {
          typeValue: 'stage_instance',
          hops: [
            {
              table: 'public.treatment_program_instance_stages',
              alias: 'b4c4_comment_stage',
              parentPk: 'id',
              localFk: 'target_id',
            },
            {
              table: 'public.treatment_program_instances',
              alias: 'b4c4_comment_stage_program',
              parentPk: 'id',
              localFk: 'instance_id',
            },
          ],
          terminalColumn: 'patient_user_id',
        },
        {
          typeValue: 'stage_item_instance',
          hops: [
            {
              table: 'public.treatment_program_instance_stage_items',
              alias: 'b4c4_comment_stage_item',
              parentPk: 'id',
              localFk: 'target_id',
            },
            {
              table: 'public.treatment_program_instance_stages',
              alias: 'b4c4_comment_item_stage',
              parentPk: 'id',
              localFk: 'stage_id',
            },
            {
              table: 'public.treatment_program_instances',
              alias: 'b4c4_comment_item_program',
              parentPk: 'id',
              localFk: 'instance_id',
            },
          ],
          terminalColumn: 'patient_user_id',
        },
      ],
    },
  ],
]);

export function buildRlsDescriptors() {
  const tierRows = readTierRows();
  const batchRowsByTable = new Map(readBatchRows().map((row) => [row.table, row]));
  const beFkRowsByTable = new Map(readBeFkPathRows().map((row) => [row.table, row]));
  const descriptors = new Map();

  for (const { tier, table } of tierRows) {
    if (tier === 'SCOPED') {
      const batchRow = batchRowsByTable.get(table);
      const beFkRow = beFkRowsByTable.get(table);

      if (batchRow) {
        descriptors.set(table, { table, ...scopedDescriptorFromBatch(batchRow) });
        continue;
      }

      if (beFkRow) {
        descriptors.set(table, {
          table,
          tier,
          scopingKind: 'fk_path',
          predicateTemplate: 'fk_path_parent_org_matches_app_org',
          source: 'be_fk_path',
          sourceStage: 'P0.4.BE',
          fkPath: {
            parentTable: beFkRow.parent_table,
            localFk: beFkRow.local_fk,
            parentPk: beFkRow.parent_pk,
            parentOrgColumn: beFkRow.parent_org_column,
            crossCheckTable: beFkRow.cross_check_table,
            crossCheckLocalFk: beFkRow.cross_check_local_fk,
            crossCheckPk: beFkRow.cross_check_pk,
            crossCheckOrgColumn: beFkRow.cross_check_org_column,
          },
        });
        continue;
      }

      if (table.startsWith('public.be_') || preScopedDirectOrgTables.has(table)) {
        descriptors.set(table, { table, ...scopedDescriptorForBeTable(table) });
        continue;
      }

      throw new Error(`No SCOPED descriptor source for ${table}`);
    }

    if (tier === 'BOOTSTRAP') {
      descriptors.set(table, { table, ...bootstrapDescriptor(table) });
      continue;
    }

    descriptors.set(table, { table, ...exemptionDescriptor(tier) });
  }

  for (const [table, ownership] of patientOwnedColumns) {
    const descriptor = descriptors.get(table);

    if (!descriptor) {
      throw new Error(`Patient-owned column registered for unknown table ${table}`);
    }

    if (descriptor.tier !== 'SCOPED') {
      throw new Error(
        `Patient-owned column registered for non-SCOPED table ${table} (tier=${descriptor.tier})`,
      );
    }

    if (descriptor.scopingKind === 'fk_path' && !descriptor.fkPath?.parentTable) {
      throw new Error(`Patient-owned fk_path table ${table} is missing fkPath metadata`);
    }

    descriptors.set(table, {
      ...descriptor,
      patientColumn: ownership.column,
      patientColumnCastType: ownership.castType ?? 'uuid',
      ...(ownership.nullableShared ? { patientColumnNullableShared: true } : {}),
    });
  }

  for (const [table, chain] of patientChainOwnedTables) {
    const descriptor = descriptors.get(table);

    if (!descriptor) {
      throw new Error(`Patient chain registered for unknown table ${table}`);
    }

    if (descriptor.tier !== 'SCOPED') {
      throw new Error(
        `Patient chain registered for non-SCOPED table ${table} (tier=${descriptor.tier})`,
      );
    }

    if (descriptor.patientColumn) {
      throw new Error(
        `Table ${table} cannot declare both a direct patientColumn and a patientChain`,
      );
    }

    if (!Array.isArray(chain.hops) || chain.hops.length === 0) {
      throw new Error(`Patient chain for ${table} must declare at least one hop`);
    }

    descriptors.set(table, {
      ...descriptor,
      patientChain: {
        hops: chain.hops,
        terminalColumn: chain.terminalColumn,
        castType: chain.castType ?? 'uuid',
      },
    });
  }

  for (const [table, ownership] of patientConditionalOwnedColumns) {
    const descriptor = descriptors.get(table);

    if (!descriptor) {
      throw new Error(`Patient conditional column registered for unknown table ${table}`);
    }

    if (descriptor.tier !== 'SCOPED') {
      throw new Error(
        `Patient conditional column registered for non-SCOPED table ${table} (tier=${descriptor.tier})`,
      );
    }

    if (descriptor.patientColumn || descriptor.patientChain) {
      throw new Error(
        `Table ${table} cannot declare both a direct/chain patientColumn and a patientConditional`,
      );
    }

    descriptors.set(table, {
      ...descriptor,
      patientConditional: {
        patientColumn: ownership.column,
        castType: ownership.castType ?? 'uuid',
        discriminatorColumn: ownership.discriminatorColumn,
        discriminatorExcludedValue: ownership.discriminatorExcludedValue,
      },
    });
  }

  for (const [table, chain] of patientConditionalChainOwnedTables) {
    const descriptor = descriptors.get(table);

    if (!descriptor) {
      throw new Error(`Patient conditional chain registered for unknown table ${table}`);
    }

    if (descriptor.tier !== 'SCOPED') {
      throw new Error(
        `Patient conditional chain registered for non-SCOPED table ${table} (tier=${descriptor.tier})`,
      );
    }

    if (descriptor.patientColumn || descriptor.patientChain || descriptor.patientConditional) {
      throw new Error(
        `Table ${table} cannot declare both another patient-ownership shape and a patientConditionalChain`,
      );
    }

    if (!chain.hop?.table || !chain.hop?.alias || !chain.hop?.parentPk || !chain.hop?.localFk) {
      throw new Error(`Patient conditional chain for ${table} must declare a complete hop`);
    }

    descriptors.set(table, {
      ...descriptor,
      patientConditionalChain: {
        hop: chain.hop,
        patientColumn: chain.patientColumn,
        castType: chain.castType ?? 'uuid',
        discriminatorColumn: chain.discriminatorColumn,
        discriminatorExcludedValue: chain.discriminatorExcludedValue,
      },
    });
  }

  for (const [table, polymorphic] of patientPolymorphicOwnedTables) {
    const descriptor = descriptors.get(table);

    if (!descriptor) {
      throw new Error(`Patient polymorphic ownership registered for unknown table ${table}`);
    }

    if (descriptor.tier !== 'SCOPED') {
      throw new Error(
        `Patient polymorphic ownership registered for non-SCOPED table ${table} (tier=${descriptor.tier})`,
      );
    }

    if (descriptor.scopingKind !== 'polymorphic_resolver') {
      throw new Error(
        `Patient polymorphic ownership requires polymorphic_resolver descriptor for ${table}`,
      );
    }

    if (!Array.isArray(polymorphic.variants) || polymorphic.variants.length === 0) {
      throw new Error(
        `Patient polymorphic ownership for ${table} must declare at least one variant`,
      );
    }

    descriptors.set(table, {
      ...descriptor,
      patientPolymorphic: {
        typeColumn: polymorphic.typeColumn,
        sharedTypeValues: polymorphic.sharedTypeValues ?? [],
        variants: polymorphic.variants,
      },
    });
  }

  return descriptors;
}
