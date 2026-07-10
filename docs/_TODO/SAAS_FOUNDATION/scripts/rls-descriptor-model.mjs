import { readFileSync } from "node:fs";

const root = "docs/_TODO/SAAS_FOUNDATION";

export const paths = {
  tiers: `${root}/scope-derivation/tiers-218.tsv`,
  batches: `${root}/scope-derivation/p0-4-batches.tsv`,
  beFkPaths: `${root}/scope-derivation/p0-4-be-fk-paths.tsv`,
};

export const tiers = new Set(["SCOPED", "BOOTSTRAP", "INFRA", "LEGACY", "TELEMETRY"]);

export const scopedKinds = new Set([
  "direct_org_column",
  "denorm_org_column",
  "fk_path",
  "self_org_id",
  "polymorphic_resolver",
]);

const denormResolutions = new Set([
  "attempt_parent_denorm",
  "audit_parent_denorm",
  "content_parent_denorm",
  "media_parent_denorm",
  "parent_denorm_copy",
  "parent_or_patient_org",
  "program_parent_denorm",
  "reference_parent_denorm",
]);

const polymorphicResolutions = new Set(["polymorphic_resolver"]);

const bootstrapHybridTables = new Set([
  "integrator.system_settings",
  "public.platform_user_contacts",
  "public.system_settings",
  "public.system_settings_audit",
  "public.user_phone_history",
]);

function readLines(path) {
  return readFileSync(path, "utf8").trimEnd().split("\n").filter(Boolean);
}

function readTsv(path, expectedHeader) {
  const lines = readLines(path);
  const header = lines.shift();

  if (header !== expectedHeader.join("\t")) {
    throw new Error(`Unexpected header in ${path}: ${header}`);
  }

  return lines.map((line, index) => {
    const fields = line.split("\t");

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
    const [tier, table] = line.split("|");

    if (!tiers.has(tier) || !table) {
      throw new Error(`Invalid tier row in ${paths.tiers}:${index + 1}`);
    }

    return { tier, table };
  });
}

export function readBatchRows() {
  return readTsv(paths.batches, ["batch", "table", "org_resolution", "implementation_note"]);
}

export function readBeFkPathRows() {
  return readTsv(paths.beFkPaths, [
    "table",
    "parent_table",
    "local_fk",
    "parent_pk",
    "parent_org_column",
    "cross_check_table",
    "cross_check_local_fk",
    "cross_check_pk",
    "cross_check_org_column",
  ]);
}

function scopedDescriptorFromBatch(row) {
  if (denormResolutions.has(row.org_resolution)) {
    return {
      tier: "SCOPED",
      scopingKind: "denorm_org_column",
      predicateTemplate: "org_column_matches_app_org",
      orgColumn: "organization_id",
      source: row.org_resolution,
      sourceStage: row.batch,
    };
  }

  if (polymorphicResolutions.has(row.org_resolution)) {
    return {
      tier: "SCOPED",
      scopingKind: "polymorphic_resolver",
      predicateTemplate: "org_column_matches_app_org",
      orgColumn: "organization_id",
      source: row.org_resolution,
      sourceStage: row.batch,
      requiresFollowupStage: "P0.12.1",
    };
  }

  return {
    tier: "SCOPED",
    scopingKind: "direct_org_column",
    predicateTemplate: "org_column_matches_app_org",
    orgColumn: "organization_id",
    source: row.org_resolution,
    sourceStage: row.batch,
  };
}

function scopedDescriptorForBeTable(table) {
  if (table === "public.be_organizations") {
    return {
      tier: "SCOPED",
      scopingKind: "self_org_id",
      predicateTemplate: "self_id_matches_app_org",
      orgColumn: "id",
      source: "be_organization_self_scope",
    };
  }

  return {
    tier: "SCOPED",
    scopingKind: "direct_org_column",
    predicateTemplate: "org_column_matches_app_org",
    orgColumn: "organization_id",
    source: "be_direct_org",
  };
}

function bootstrapDescriptor(table) {
  if (bootstrapHybridTables.has(table)) {
    return {
      tier: "BOOTSTRAP",
      scopingKind: "bootstrap_hybrid",
      predicateTemplate: "organization_id_is_null_or_matches_app_org",
      orgColumn: "organization_id",
      source: "bootstrap_global_or_tenant_row",
    };
  }

  return {
    tier: "BOOTSTRAP",
    scopingKind: "bootstrap_global",
    predicateTemplate: "bootstrap_readable",
    source: "identity_or_pre_context_runtime",
  };
}

function exemptionDescriptor(tier) {
  const sourceByTier = {
    INFRA: "infra_queue_ledger_or_operator_state",
    LEGACY: "legacy_frozen_until_sunset",
    TELEMETRY: "userless_aggregate_rollup",
  };

  return {
    tier,
    scopingKind: "explicit_exemption",
    predicateTemplate: "explicit_tier_exemption",
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
//     content: public.media_files.uploaded_by (NOT media_files.owner_user_id — that column does
//     not exist on media_files; owner_user_id lives on the SEPARATE public.media_upload_sessions
//     table, itself excluded here for the same dual-role reason) — org library uploads vs a
//     patient's own submission, keyed by usage_purpose ('program_item_submission' vs NULL/other);
//   - public.patient_merge_candidates (staff/system dedup queue, not a patient's own record);
//   - P0.8.6 BOOTSTRAP-hybrid tables (system_settings, platform_user_contacts, user_phone_history,
//     integrator.system_settings) — explicitly out of scope per owner instruction, pre-org-context
//     identity/bootstrap semantics must not change.
const patientOwnedColumns = new Map([
  // public.* direct_org_column (P0.8.3), patient identity = platform_users.id (uuid)
  ["public.be_appointments", { column: "platform_user_id" }],
  ["public.be_appointment_staff_comments", { column: "platform_user_id" }],
  ["public.be_patient_booking_profiles", { column: "platform_user_id" }],
  ["public.be_patient_packages", { column: "platform_user_id" }],
  ["public.be_patient_timeline_events", { column: "platform_user_id" }],
  ["public.be_payment_history_events", { column: "platform_user_id" }],
  ["public.be_payment_intents", { column: "platform_user_id" }],
  ["public.be_payments", { column: "platform_user_id" }],
  ["public.be_product_purchases", { column: "platform_user_id" }],
  ["public.clinical_anamnesis_illness", { column: "patient_user_id" }],
  ["public.clinical_anamnesis_lifestyle", { column: "patient_user_id" }],
  ["public.clinical_anamnesis_trauma", { column: "patient_user_id" }],
  ["public.clinical_complaint", { column: "patient_user_id" }],
  ["public.clinical_diagnosis", { column: "patient_user_id" }],
  ["public.clinical_visit", { column: "patient_user_id" }],
  ["public.content_access_grants_webapp", { column: "platform_user_id" }],
  ["public.doctor_notes", { column: "user_id" }],
  ["public.doctor_patient_support", { column: "patient_user_id" }],
  ["public.lfk_complexes", { column: "platform_user_id" }],
  ["public.lfk_sessions", { column: "user_id" }],
  ["public.material_ratings", { column: "user_id" }],
  // media_folders.patient_user_id is NULL for shared/standard folders (org-wide, visible to
  // everyone including patients) and only set for the 'client_patient' per-patient folder kind —
  // NULL here means "shared", not "unlinked", so it needs the nullable-shared shape.
  ["public.media_folders", { column: "patient_user_id", nullableShared: true }],
  ["public.message_log", { column: "platform_user_id" }],
  ["public.online_intake_requests", { column: "user_id" }],
  ["public.org_enrollments", { column: "platform_user_id" }],
  ["public.patient_comorbidity", { column: "patient_user_id" }],
  ["public.patient_content_rating_feedback", { column: "user_id" }],
  ["public.patient_daily_warmup_presentations", { column: "user_id" }],
  ["public.patient_diary_day_snapshots", { column: "platform_user_id" }],
  ["public.patient_files", { column: "patient_user_id" }],
  ["public.patient_lfk_assignments", { column: "patient_user_id" }],
  ["public.patient_payment", { column: "patient_user_id" }],
  ["public.patient_practice_completions", { column: "user_id" }],
  ["public.product_analytics_events_recent", { column: "user_id" }],
  ["public.product_analytics_user_hourly", { column: "user_id" }],
  ["public.product_push_notifications", { column: "user_id" }],
  ["public.reminder_rules", { column: "platform_user_id" }],
  ["public.specialist_tasks", { column: "patient_user_id" }],
  ["public.support_conversations", { column: "platform_user_id" }],
  ["public.symptom_trackings", { column: "platform_user_id" }],
  ["public.test_attempts", { column: "patient_user_id" }],
  ["public.treatment_program_instances", { column: "patient_user_id" }],
  // public.* bridge tables that store the INTEGRATOR bigint id directly (no platform_users uuid
  // column at all) — verified against apps/webapp/migrations/012_subscription_mailing.sql.
  // castType: "bigint" reads the DEDICATED integrator identity GUC `app.integrator_user_id`
  // (P0.13/T0.4 convention — see smoke-p0-13-db-isolation.mjs), never `app.patient_user_id`.
  ["public.mailing_logs_webapp", { column: "integrator_user_id", castType: "bigint" }],
  ["public.user_subscriptions_webapp", { column: "integrator_user_id", castType: "bigint" }],

  // public.* denorm_org_column (P0.8.4) with a direct patient column already on the child row
  ["public.broadcast_audit_recipients", { column: "platform_user_id" }],
  ["public.notification_delivery_attempts", { column: "user_id" }],
  ["public.patient_daily_warmup_video_views", { column: "user_id" }],
  ["public.program_action_log", { column: "patient_user_id" }],
  ["public.program_item_discussion_messages", { column: "patient_user_id" }],
  ["public.program_item_discussion_reads", { column: "patient_user_id" }],
  ["public.symptom_entries", { column: "platform_user_id" }],
  ["public.webapp_reminder_occurrences", { column: "platform_user_id" }],
  ["public.reminder_delivery_events", { column: "integrator_user_id", castType: "bigint" }],
  ["public.reminder_occurrence_history", { column: "integrator_user_id", castType: "bigint" }],

  // public.* fk_path (P0.8.4): patient column lives on the SAME immediate FK parent already used
  // for the org fk_path predicate (public.be_patient_packages.platform_user_id). The sibling
  // fk_path table public.be_package_items has NO patient-owning parent (be_subscription_packages
  // is an org catalog definition) and stays org-only.
  ["public.be_patient_package_items", { column: "platform_user_id" }],

  // integrator.* direct_org_column (P0.8.5), patient identity = integrator.users.id (bigint),
  // read from the dedicated `app.integrator_user_id` GUC (castType: "bigint" — see the note above
  // public.mailing_logs_webapp). contacts/content_access_grants/user_reminder_rules verified via
  // apps/integrator/src/infra/db/migrations/core/20260306_0014_create_contacts.sql and
  // 20260311_0002_create_user_reminders.sql (user_id bigint REFERENCES users(id)). mailing_logs
  // and user_subscriptions originally referenced the legacy telegram_users(id) space, but
  // apps/integrator/src/integrations/telegram/db/migrations/20260306_0010_detach_telegram_users_refs.sql
  // rewrites their user_id values through integrator.identities and re-points the FK to
  // users(id) — same bigint identity space as the other three, confirmed by reading that
  // migration's UPDATE/ADD CONSTRAINT statements (not just the original CREATE TABLE).
  ["integrator.contacts", { column: "user_id", castType: "bigint" }],
  ["integrator.content_access_grants", { column: "user_id", castType: "bigint" }],
  ["integrator.mailing_logs", { column: "user_id", castType: "bigint" }],
  ["integrator.user_reminder_rules", { column: "user_id", castType: "bigint" }],
  ["integrator.user_subscriptions", { column: "user_id", castType: "bigint" }],
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
  ["integrator.conversations", {
    hops: [{ table: "integrator.identities", alias: "b4f_conversations_identity", parentPk: "id", localFk: "user_identity_id" }],
    terminalColumn: "user_id",
    castType: "bigint",
  }],
  ["integrator.message_drafts", {
    hops: [{ table: "integrator.identities", alias: "b4f_message_drafts_identity", parentPk: "id", localFk: "identity_id" }],
    terminalColumn: "user_id",
    castType: "bigint",
  }],
  ["integrator.user_questions", {
    hops: [{ table: "integrator.identities", alias: "b4f_user_questions_identity", parentPk: "id", localFk: "user_identity_id" }],
    terminalColumn: "user_id",
    castType: "bigint",
  }],

  // I3 parent-denorm (P0.4.I3, denorm_org_column): owner reached by walking to the immediate
  // parent, then (where the parent itself is identity-bridged, not directly user-owned) on through
  // integrator.identities. user_reminder_occurrences/_delivery_logs walk to user_reminder_rules,
  // which already carries a direct bigint user_id (no identities hop needed there).
  ["integrator.conversation_messages", {
    hops: [
      { table: "integrator.conversations", alias: "b4f_conv", parentPk: "id", localFk: "conversation_id" },
      { table: "integrator.identities", alias: "b4f_ident", parentPk: "id", localFk: "user_identity_id" },
    ],
    terminalColumn: "user_id",
    castType: "bigint",
  }],
  ["integrator.question_messages", {
    hops: [
      { table: "integrator.user_questions", alias: "b4f_question", parentPk: "id", localFk: "question_id" },
      { table: "integrator.identities", alias: "b4f_ident", parentPk: "id", localFk: "user_identity_id" },
    ],
    terminalColumn: "user_id",
    castType: "bigint",
  }],
  ["integrator.user_reminder_occurrences", {
    hops: [{ table: "integrator.user_reminder_rules", alias: "b4f_rule", parentPk: "id", localFk: "rule_id" }],
    terminalColumn: "user_id",
    castType: "bigint",
  }],
  ["integrator.user_reminder_delivery_logs", {
    hops: [
      { table: "integrator.user_reminder_occurrences", alias: "b4f_occ", parentPk: "id", localFk: "occurrence_id" },
      { table: "integrator.user_reminder_rules", alias: "b4f_rule", parentPk: "id", localFk: "rule_id" },
    ],
    terminalColumn: "user_id",
    castType: "bigint",
  }],

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
  ["public.support_questions", {
    hops: [{ table: "public.support_conversations", alias: "b4f_conv", parentPk: "id", localFk: "conversation_id" }],
    terminalColumn: "platform_user_id",
    castType: "uuid",
  }],
  ["public.support_conversation_messages", {
    hops: [{ table: "public.support_conversations", alias: "b4f_conv", parentPk: "id", localFk: "conversation_id" }],
    terminalColumn: "platform_user_id",
    castType: "uuid",
  }],
  ["public.support_question_messages", {
    hops: [
      { table: "public.support_questions", alias: "b4f_question", parentPk: "id", localFk: "question_id" },
      { table: "public.support_conversations", alias: "b4f_conv", parentPk: "id", localFk: "conversation_id" },
    ],
    terminalColumn: "platform_user_id",
    castType: "uuid",
  }],
  ["public.support_delivery_events", {
    hops: [
      { table: "public.support_conversation_messages", alias: "b4f_msg", parentPk: "id", localFk: "conversation_message_id" },
      { table: "public.support_conversations", alias: "b4f_conv", parentPk: "id", localFk: "conversation_id" },
    ],
    terminalColumn: "platform_user_id",
    castType: "uuid",
  }],

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
  ["public.online_intake_answers", {
    hops: [{ table: "public.online_intake_requests", alias: "b4f_intake_request", parentPk: "id", localFk: "request_id" }],
    terminalColumn: "user_id",
    castType: "uuid",
  }],
  ["public.online_intake_attachments", {
    hops: [{ table: "public.online_intake_requests", alias: "b4f_intake_request", parentPk: "id", localFk: "request_id" }],
    terminalColumn: "user_id",
    castType: "uuid",
  }],
  ["public.online_intake_status_history", {
    hops: [{ table: "public.online_intake_requests", alias: "b4f_intake_request", parentPk: "id", localFk: "request_id" }],
    terminalColumn: "user_id",
    castType: "uuid",
  }],
  ["public.clinical_complaint_update", {
    hops: [{ table: "public.clinical_complaint", alias: "b4f_complaint", parentPk: "id", localFk: "complaint_id" }],
    terminalColumn: "patient_user_id",
    castType: "uuid",
  }],
  ["public.clinical_diagnosis_update", {
    hops: [{ table: "public.clinical_diagnosis", alias: "b4f_diagnosis", parentPk: "id", localFk: "diagnosis_id" }],
    terminalColumn: "patient_user_id",
    castType: "uuid",
  }],
  ["public.clinical_diagnosis_status_history", {
    hops: [{ table: "public.clinical_diagnosis", alias: "b4f_diagnosis", parentPk: "id", localFk: "diagnosis_id" }],
    terminalColumn: "patient_user_id",
    castType: "uuid",
  }],
  ["public.test_results", {
    hops: [{ table: "public.test_attempts", alias: "b4f_attempt", parentPk: "id", localFk: "attempt_id" }],
    terminalColumn: "patient_user_id",
    castType: "uuid",
  }],
  ["public.treatment_program_instance_stages", {
    hops: [{ table: "public.treatment_program_instances", alias: "b4f_instance", parentPk: "id", localFk: "instance_id" }],
    terminalColumn: "patient_user_id",
    castType: "uuid",
  }],
  ["public.lfk_complex_exercises", {
    hops: [{ table: "public.lfk_complexes", alias: "b4f_complex", parentPk: "id", localFk: "complex_id" }],
    terminalColumn: "platform_user_id",
    castType: "uuid",
  }],
]);

export function buildRlsDescriptors() {
  const tierRows = readTierRows();
  const batchRowsByTable = new Map(readBatchRows().map((row) => [row.table, row]));
  const beFkRowsByTable = new Map(readBeFkPathRows().map((row) => [row.table, row]));
  const descriptors = new Map();

  for (const { tier, table } of tierRows) {
    if (tier === "SCOPED") {
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
          scopingKind: "fk_path",
          predicateTemplate: "fk_path_parent_org_matches_app_org",
          source: "be_fk_path",
          sourceStage: "P0.4.BE",
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

      if (table.startsWith("public.be_")) {
        descriptors.set(table, { table, ...scopedDescriptorForBeTable(table) });
        continue;
      }

      throw new Error(`No SCOPED descriptor source for ${table}`);
    }

    if (tier === "BOOTSTRAP") {
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

    if (descriptor.tier !== "SCOPED") {
      throw new Error(`Patient-owned column registered for non-SCOPED table ${table} (tier=${descriptor.tier})`);
    }

    if (descriptor.scopingKind === "fk_path" && !descriptor.fkPath?.parentTable) {
      throw new Error(`Patient-owned fk_path table ${table} is missing fkPath metadata`);
    }

    descriptors.set(table, {
      ...descriptor,
      patientColumn: ownership.column,
      patientColumnCastType: ownership.castType ?? "uuid",
      ...(ownership.nullableShared ? { patientColumnNullableShared: true } : {}),
    });
  }

  for (const [table, chain] of patientChainOwnedTables) {
    const descriptor = descriptors.get(table);

    if (!descriptor) {
      throw new Error(`Patient chain registered for unknown table ${table}`);
    }

    if (descriptor.tier !== "SCOPED") {
      throw new Error(`Patient chain registered for non-SCOPED table ${table} (tier=${descriptor.tier})`);
    }

    if (descriptor.patientColumn) {
      throw new Error(`Table ${table} cannot declare both a direct patientColumn and a patientChain`);
    }

    if (!Array.isArray(chain.hops) || chain.hops.length === 0) {
      throw new Error(`Patient chain for ${table} must declare at least one hop`);
    }

    descriptors.set(table, {
      ...descriptor,
      patientChain: {
        hops: chain.hops,
        terminalColumn: chain.terminalColumn,
        castType: chain.castType ?? "uuid",
      },
    });
  }

  return descriptors;
}
