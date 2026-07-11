#!/usr/bin/env node
/**
 * B6 (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md) — real-policy 2-org isolation proof.
 *
 * Unlike `smoke-p0-13-db-isolation.mjs` (hand-written policies on a synthetic compat schema, proves
 * only the ISOLATION PATTERN), this smoke applies the ACTUAL migration-generated schema + RLS
 * predicates from the real repo migrations, on a fresh scratch DB:
 *   - webapp Drizzle: db/drizzle-migrations (a minimal real subset — see NOT-DONE/adaptations below)
 *   - integrator core: src/infra/db/migrations/core (I1/I3/C1 org-column retrofits)
 *   - the REAL RLS renderer/descriptor modules in this directory (rls-descriptor-model.mjs,
 *     rls-sql-renderer.mjs, p0-9-enforce-descriptors.mjs) to simulate the enforcement flip.
 *
 * ADAPTATIONS (documented, not hidden — see plan B6 + LOG.md):
 *  1. A full byte-for-byte replay of ALL webapp legacy SQL (apps/webapp/migrations, 91 files) +
 *     ALL Drizzle migrations (0000-0168) on an empty DB does NOT work: the two migration systems are
 *     chronologically INTERLEAVED in real history (e.g. legacy 082 needs a table created by Drizzle
 *     0001; Drizzle 0001 needs a legacy `platform_users` table). Discovered by direct replay attempts.
 *     This smoke instead applies the minimal real-file set that actually constructs our target SCOPED
 *     tables + their FK ancestors (see WEBAPP_DDL_FILES below) — every statement is the REAL file
 *     content, just a subset of files, not hand-authored schema.
 *  2. Full replay of the integrator migrator (core + telegram + rubitime integrations, all files,
 *     sorted by filename) also fails from empty: `telegram:20260306_0009_add_telegram_state_split.sql`
 *     references `identities`, a table created by a LATER-numbered core file
 *     (`20260306_0013_create_identities.sql`) — a pre-existing replay-order fragility in the real
 *     migration set, unrelated to RLS/tenancy and not touching any of our target tables. This smoke
 *     runs `core`-only files that our target tables actually need (users, user_reminders,
 *     system_settings), skipping telegram/rubitime entirely.
 *  3. I1 (20260708_0001) and I3 (20260708_0003) each retrofit `organization_id` onto a BUNDLE of
 *     integrator tables in one transaction (I1: contacts, content_access_grants, mailing_logs,
 *     user_reminder_rules, user_subscriptions; I3: conversation_messages, question_messages,
 *     user_reminder_occurrences, user_reminder_delivery_logs). We only need 3 of those 9 tables
 *     (content_access_grants, user_reminder_occurrences, user_reminder_delivery_logs), and the other
 *     6 (contacts, mailing_logs, user_subscriptions, conversation_messages, question_messages) are
 *     NOT in our minimal schema. This smoke applies hand-filtered EXCERPTS of I1/I3/C1 — same column
 *     name, same index name, same constraint name/target (`be_organizations(id)`, `ON DELETE CASCADE`),
 *     same NOT NULL tail from C1 — restricted to the 3 tables we actually created. Same for
 *     notification_delivery_attempts' organization_id retrofit, which in the real migration
 *     (0152_p0_4_p7_reminders_media_org.sql) is one of ~20 tables processed by a dynamic `FOREACH`
 *     loop in a single 841-line batch file; we apply the loop's per-table statement shape (documented,
 *     identical naming convention verified against every sibling batch migration) restricted to this
 *     one table instead of running the whole file (which needs a dozen unrelated tables:
 *     operator_health_failure_archive, product_analytics_*, reminder_journal, ...).
 *  4. The broad RLS sweep files (0160 P0.8.3, 0161 P0.8.4, 0162 P0.8.5, 0163 P0.8.6) each emit a
 *     4-line generated block (ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY; DROP POLICY;
 *     CREATE POLICY) PER TABLE, covering anywhere from 2 to ~100 tables per file. This smoke extracts
 *     only the blocks for our target tables (see extractRlsBlocks below) rather than running full
 *     files that would need the entire ~218-table schema. The extracted SQL is a byte-for-byte
 *     substring of the real file, not re-derived.
 *
 * FINDINGS surfaced by this smoke (see final report, NOT fudged into passing assertions):
 *  - `public.be_organization_members` (the table B6's originating card literally named as the
 *    "direct-org" example) is tier BOOTSTRAP/bootstrap_global in tiers-218.tsv, not SCOPED — it has
 *    NO RLS policy anywhere in the real migrations. Substituted `public.org_enrollments` (confirmed
 *    real SCOPED direct_org_column, 0167) as the direct-org representative instead.
 *  - The REAL migrations install policies in `dormant_permissive` mode (missing/empty app.org means
 *    the predicate evaluates true — permit, not deny). The plan text assumed "if migration only does
 *    ENABLE without FORCE, add FORCE to simulate the flip" — in fact every real 0160-0168 policy
 *    already does ENABLE+FORCE; what's missing is the *predicate* flip (dormant_permissive -> enforce),
 *    which this smoke performs using the REAL `p0-9-enforce-descriptors.mjs` renderer (mode: "enforce"),
 *    already built in this repo for exactly this purpose but not yet wired into a migration file
 *    (that wiring is plan item B8, owner-gated).
 *  - UPDATE (B4-core, taskdb #653, owner decision 2026-07-11): the patient-wall gap above is FIXED.
 *    `rls-descriptor-model.mjs` now attaches `patientColumn`/`patientColumnCastType` to 60 patient-owned
 *    SCOPED descriptors (see its `patientOwnedColumns` registry), and `p0-9-enforce-descriptors.mjs` /
 *    `p0-8-{3,4,5}-policy-targets.mjs` AND that with a fail-closed staff-or-patient branch
 *    (`renderStaffOrPatientPredicate` in rls-sql-renderer.mjs): staff (`app.actor='staff'`) keeps
 *    org-wide visibility (owner decision: variant A, no assignment predicate); a patient session
 *    (`app.actor='patient'` + `app.patient_user_id`) sees ONLY its own rows; unset/empty context denies.
 *    Of this smoke's 6 original targets, `org_enrollments` (platform_user_id), `notification_delivery_attempts`
 *    (user_id), and `integrator.content_access_grants` (user_id, bigint) are patient-owned and are
 *    exercised below under the real enforce-mode patient wall. `be_package_items` (org catalog line
 *    item, no patient owner) and `system_settings` (BOOTSTRAP hybrid, untouched per instruction) stay
 *    unaffected.
 *  - UPDATE (B4-fanout gap closure, taskdb #656): the two remaining gaps from the B4-core pass are
 *    now CLOSED and proven below, not just documented-open:
 *      (1) GUC alignment — the bigint integrator-identity predicates (e.g.
 *          integrator.content_access_grants.user_id) now compare against the DEDICATED
 *          app.integrator_user_id GUC, not app.patient_user_id cast to bigint (P0.13/T0.4
 *          convention, see smoke-p0-13-db-isolation.mjs). Proven below via a MIXED session that sets
 *          BOTH app.patient_user_id (uuid, webapp identity) and app.integrator_user_id (bigint,
 *          integrator identity) simultaneously.
 *      (2) chain-only patient ownership — integrator.user_reminder_delivery_logs (2-hop:
 *          occurrence_id -> user_reminder_occurrences.rule_id -> user_reminder_rules.user_id) and 10
 *          sibling chain-only tables (integrator I2 identity-bridge: conversations/message_drafts/
 *          user_questions; I3 parent-denorm: conversation_messages/question_messages/
 *          user_reminder_occurrences; webapp support family: support_questions/
 *          support_conversation_messages/support_question_messages/support_delivery_events) now get a
 *          patient wall via rls-descriptor-model.mjs's new patientChainOwnedTables registry and
 *          renderPatientChainPredicate (rls-sql-renderer.mjs) — a single EXISTS with a chain of
 *          INNER JOINs down to the identity-bearing table/column. Migration 0170_p0_8_b4_fanout_
 *          chain_patient_wall_rls.sql carries these 11 tables' dormant-mode policies; this smoke
 *          simulates their enforce-mode flip the same way as the original 6 B4-core targets.
 *  - UPDATE (B4-core-4, taskdb #660): an INDEPENDENT AUDIT of the B4-core-3 census found 3 more REAL
 *    patient-owned SCOPED tables still org-only — the "hard" cases deliberately excluded from the
 *    plain column/chain registries: public.media_files (dual-role uploaded_by, disambiguated by
 *    usage_purpose), public.media_transcode_jobs (inherits media_files' conditional ownership via
 *    its media_id FK, no ownership column of its own), and public.comments (polymorphic
 *    target_type/target_id — previously had NO RLS policy at all, blocked behind P0.12.1, which is
 *    now complete). Closed by 2 NEW predicate shapes (rls-sql-renderer.mjs
 *    renderConditionalPatientPredicate / renderConditionalChainPatientPredicate /
 *    renderPolymorphicPatientPredicate) and proven below via their REAL dormant policy (migration
 *    0174) directly — unlike the B4-core/B4-fanout/B4-core-3 targets above, these 3 are NOT added to
 *    p0-9-enforce-descriptors.mjs's ENFORCE_TARGETS simulated flip (comments' polymorphic_resolver
 *    scopingKind deliberately stays `scoped_pending_default_deny` under P0.9 — a separate, more
 *    conservative gate, out of scope for this patient-wall closure). This is sufficient: with
 *    app.org SET (as every assertion here does), the dormant org predicate already behaves like
 *    enforce mode (the only difference is the unset-app.org permissive fallback, and org isolation
 *    for these scopingKinds is already proven generically elsewhere in this smoke), and the patient
 *    branch of every predicate shape in this file is ALWAYS fail-closed regardless of dormant/
 *    enforce mode.
 *
 * Scratch only. Guards refuse non-scratch/dev/prod/test databases, same as smoke-p0-13-db-isolation.mjs.
 * No push/deploy.
 *
 * STALE NOTE (B4-roles-1, docs/_TODO/SAAS_FOUNDATION/LOG.md, taskdb #662): the staff-bypass
 * predicate changed from the GUC `app.actor='staff'` to the role-membership check `app.is_staff()`
 * (rls-sql-renderer.mjs `renderStaffActorCheck()`, migration 0175). Phases 1-4 below (dormant-mode
 * 0161-0174 policies, applied verbatim from those UNCHANGED historical migration files) are
 * unaffected and still correctly exercise the GUC-based mechanism those files actually contain.
 * Phase 5 ("simulate the flip" via p0-9-enforce-descriptors.mjs) now fails with `ERROR: schema "app"
 * does not exist` -- p0-9-enforce-descriptors.mjs calls through the SAME renderStaffActorCheck(),
 * so its simulated enforce-mode predicates now also reference app.is_staff(), and this smoke's
 * fixture bootstrap never creates the app schema/function or an app_staff role. Properly fixing this
 * would require restructuring this smoke's single-role GUC-toggle design (one NOBYPASSRLS role,
 * `app.actor` flipped between 'staff'/'patient') into a two-role design (real app_staff vs
 * app_patient roles, no shared role to toggle) -- a materially bigger change than this smoke's
 * existing scope, and NOT done here. The role-based mechanism (app.is_staff(), the app_staff/
 * app_patient role boundary, and the app_patient-cannot-SET-ROLE-app_staff proof) is instead proven
 * live, correctly, by the purpose-built docs/_TODO/SAAS_FOUNDATION/scripts/
 * smoke-b4-roles-1-staff-role-boundary.mjs. This file is left unmodified as historical evidence for
 * the 0161-0174 GUC-based stages; running it past phase 4 will fail until it is rewritten for the
 * two-role design (tracked as a residual, not silently fixed).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

const { buildRlsDescriptors } = await import(path.join(__dirname, "rls-descriptor-model.mjs"));
const { getP09EnforceDescriptorByTable, renderP09EnforcePolicyStatements, p09PolicyName } = await import(
  path.join(__dirname, "p0-9-enforce-descriptors.mjs")
);
const { renderDropPolicy } = await import(path.join(__dirname, "rls-sql-renderer.mjs"));
const { p083PolicyName } = await import(path.join(__dirname, "p0-8-3-policy-targets.mjs"));
const { p084PolicyName } = await import(path.join(__dirname, "p0-8-4-policy-targets.mjs"));
const { p085PolicyName } = await import(path.join(__dirname, "p0-8-5-policy-targets.mjs"));
const { p086PolicyName } = await import(path.join(__dirname, "p0-8-6-policy-targets.mjs"));

const dbName = `bcb_saas_r2_b6_scratch_${process.pid}_${Date.now()}`;
const appRole = `r2_b6_app_${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "_");

if (!dbName.startsWith("bcb_saas_") || !dbName.includes("scratch")) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}
if (/bcb_webapp_(dev|prod|test)/.test(dbName)) {
  throw new Error("refusing dev/prod/test-shaped scratch DB name");
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : "inherit",
    input: options.input,
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status ?? "unknown status"}`);
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function psql(sql, database = dbName, { singleTransaction = true } = {}) {
  const args = ["-v", "ON_ERROR_STOP=1"];
  if (singleTransaction) args.push("--single-transaction");
  args.push("-d", database);
  run("sudo", ["-n", "-u", "postgres", "psql", ...args], { input: sql });
}

function readRepoFile(relPath) {
  return readFileSync(path.join(repoRoot, relPath), "utf8");
}

// B4-core-3 (taskdb #658): a DDL "step" is either a repo-relative file path (applied verbatim) or
// literal SQL (a hand-filtered excerpt) — see B4_CORE_3_DDL_STEPS above for which is which and why.
function resolveDdlStep(step) {
  const looksLikeRepoPath = /^[a-zA-Z0-9._/-]+\.sql$/.test(step.trim());
  if (looksLikeRepoPath && existsSync(path.join(repoRoot, step.trim()))) {
    return readRepoFile(step.trim());
  }
  return step;
}

/**
 * The RLS sweep migrations (0160-0163) are machine-generated by this same rls-sql-renderer.mjs:
 * comment/blank lines, then a repeating 4-line block per table:
 *   ALTER TABLE "schema"."table" ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE "schema"."table" FORCE ROW LEVEL SECURITY;
 *   DROP POLICY IF EXISTS "name" ON "schema"."table";
 *   CREATE POLICY "name" ON "schema"."table" FOR ALL USING (...) WITH CHECK (...);
 * This parses those blocks and returns { preamble, blocksByTable } so callers can keep non-block
 * SQL (column/index/constraint DDL) verbatim while filtering which per-table policy blocks apply.
 */
function parseGeneratedRlsFile(text) {
  const lines = text.split("\n");
  const preambleLines = [];
  const blocksByTable = new Map();
  const blockStart = /^ALTER TABLE "([^"]+)"\."([^"]+)" ENABLE ROW LEVEL SECURITY;$/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(blockStart);
    if (!match) {
      preambleLines.push(line);
      continue;
    }
    const table = `${match[1]}.${match[2]}`;
    const block = lines.slice(i, i + 4);
    if (block.length !== 4) {
      throw new Error(`Malformed RLS block for ${table} (expected 4 lines) in generated file`);
    }
    blocksByTable.set(table, block.join("\n"));
    i += 3;
  }

  return { preamble: preambleLines.join("\n"), blocksByTable };
}

function selectRlsBlocks(fileText, tables) {
  const { blocksByTable } = parseGeneratedRlsFile(fileText);
  const missing = tables.filter((t) => !blocksByTable.has(t));
  if (missing.length > 0) {
    throw new Error(`Expected RLS blocks for [${missing.join(", ")}] not found in real migration file`);
  }
  return tables.map((t) => blocksByTable.get(t)).join("\n");
}

// ---------------------------------------------------------------------------
// Fixture ids (namespace "b6" for this smoke, distinct from p0-13's synthetic fixtures)
// ---------------------------------------------------------------------------
const orgA = "b6000000-0000-4000-8000-0000000000a1";
const orgB = "b6000000-0000-4000-8000-0000000000b1";
const doctorA = "b6000000-0000-4000-8000-00000000d0a1";
const patientA1 = "b6000000-0000-4000-8000-00000000a101";
const patientA2 = "b6000000-0000-4000-8000-00000000a102";
const patientB1 = "b6000000-0000-4000-8000-00000000b101";
const serviceA = "b6000000-0000-4000-8000-00000000e0a1";
const serviceB = "b6000000-0000-4000-8000-00000000e0b1";
const packageA = "b6000000-0000-4000-8000-00000000f0a1";
const packageB = "b6000000-0000-4000-8000-00000000f0b1";
const packageItemA = "b6000000-0000-4000-8000-00000000c0a1";
const packageItemB = "b6000000-0000-4000-8000-00000000c0b1";
const integratorUserA1 = 90000101;
const integratorUserA2 = 90000102;
const integratorUserB1 = 90000201;

// B4-fanout gap closure (taskdb #656): fixture ids for the 11 chain-only patient-wall targets.
const identityA1 = 1;
const identityA2 = 2;
const identityB1 = 3;
const conversationA1 = "b6-conv-a1";
const conversationA2 = "b6-conv-a2";
const conversationB1 = "b6-conv-b1";
const messageDraftA1 = "b6-draft-a1";
const messageDraftA2 = "b6-draft-a2";
const messageDraftB1 = "b6-draft-b1";
const conversationMessageA1 = "b6-convmsg-a1";
const conversationMessageA2 = "b6-convmsg-a2";
const conversationMessageB1 = "b6-convmsg-b1";
const userQuestionA1 = "b6-q-a1";
const userQuestionA2 = "b6-q-a2";
const userQuestionB1 = "b6-q-b1";
const questionMessageA1 = "b6-qmsg-a1";
const questionMessageA2 = "b6-qmsg-a2";
const questionMessageB1 = "b6-qmsg-b1";
const reminderRuleA2 = "b6-rule-a2";
const reminderOccurrenceA2 = "b6-occ-a2";
const reminderDeliveryLogA2 = "b6-log-a2";
const supportConversationA1 = "b6100000-0000-4000-8000-00000000c0a1";
const supportConversationA2 = "b6100000-0000-4000-8000-00000000c0a2";
const supportConversationB1 = "b6100000-0000-4000-8000-00000000c0b1";
const supportQuestionA1 = "b6100000-0000-4000-8000-00000000d0a1";
const supportQuestionA2 = "b6100000-0000-4000-8000-00000000d0a2";
const supportConversationMessageA1 = "b6100000-0000-4000-8000-00000000e0a1";
const supportConversationMessageA2 = "b6100000-0000-4000-8000-00000000e0a2";
const supportQuestionMessageA1 = "b6100000-0000-4000-8000-00000000f0a1";
const supportQuestionMessageA2 = "b6100000-0000-4000-8000-00000000f0a2";
const supportDeliveryEventA1 = "b6100000-0000-4000-8000-000000000a01";
const supportDeliveryEventA2 = "b6100000-0000-4000-8000-000000000a02";

// B4-core-3 fixture ids (docs/_TODO/SAAS_FOUNDATION/LOG.md, taskdb #658): the 9 patient-owned
// parent_denorm SCOPED tables named in the R2_MVP_MASTER_CHECKLIST.md brief. Each needs its own
// FK-ancestor chain (parent tables not themselves RLS-flipped in this smoke, same treatment as
// support_conversations above -- only their PK/patient-column data matters for the EXISTS join).
const intakeRequestA1 = "b6200000-0000-4000-8000-000000000001";
const intakeRequestA2 = "b6200000-0000-4000-8000-000000000002";
const intakeAnswerA1 = "b6200000-0000-4000-8000-000000000011";
const intakeAnswerA2 = "b6200000-0000-4000-8000-000000000012";
const intakeAttachmentA1 = "b6200000-0000-4000-8000-000000000021";
const intakeAttachmentA2 = "b6200000-0000-4000-8000-000000000022";
const intakeStatusHistoryA1 = "b6200000-0000-4000-8000-000000000031";
const intakeStatusHistoryA2 = "b6200000-0000-4000-8000-000000000032";
const clinicalVisitA1 = "b6200000-0000-4000-8000-000000000041";
const clinicalVisitA2 = "b6200000-0000-4000-8000-000000000042";
const clinicalComplaintA1 = "b6200000-0000-4000-8000-000000000051";
const clinicalComplaintA2 = "b6200000-0000-4000-8000-000000000052";
const clinicalComplaintUpdateA1 = "b6200000-0000-4000-8000-000000000061";
const clinicalComplaintUpdateA2 = "b6200000-0000-4000-8000-000000000062";
const clinicalDiagnosisA1 = "b6200000-0000-4000-8000-000000000071";
const clinicalDiagnosisA2 = "b6200000-0000-4000-8000-000000000072";
const clinicalDiagnosisUpdateA1 = "b6200000-0000-4000-8000-000000000081";
const clinicalDiagnosisUpdateA2 = "b6200000-0000-4000-8000-000000000082";
const clinicalDiagnosisStatusHistoryA1 = "b6200000-0000-4000-8000-000000000091";
const clinicalDiagnosisStatusHistoryA2 = "b6200000-0000-4000-8000-000000000092";
const treatmentInstanceA1 = "b6200000-0000-4000-8000-0000000000a1";
const treatmentInstanceA2 = "b6200000-0000-4000-8000-0000000000a2";
const treatmentInstanceStageA1 = "b6200000-0000-4000-8000-0000000000b1";
const treatmentInstanceStageA2 = "b6200000-0000-4000-8000-0000000000b2";
const treatmentInstanceStageItemA1 = "b6200000-0000-4000-8000-0000000000c1";
const treatmentInstanceStageItemA2 = "b6200000-0000-4000-8000-0000000000c2";
const treatmentEventA1 = "b6200000-0000-4000-8000-0000000000c5";
const treatmentEventA2 = "b6200000-0000-4000-8000-0000000000c6";
const testCatalogRow = "b6200000-0000-4000-8000-0000000000d0";
const testAttemptA1 = "b6200000-0000-4000-8000-0000000000e1";
const testAttemptA2 = "b6200000-0000-4000-8000-0000000000e2";
const testResultA1 = "b6200000-0000-4000-8000-0000000000f1";
const testResultA2 = "b6200000-0000-4000-8000-0000000000f2";
const lfkExerciseCatalogRow = "b6200000-0000-4000-8000-000000000100";
const lfkComplexA1 = "b6200000-0000-4000-8000-000000000111";
const lfkComplexA2 = "b6200000-0000-4000-8000-000000000112";
const lfkComplexExerciseA1 = "b6200000-0000-4000-8000-000000000121";
const lfkComplexExerciseA2 = "b6200000-0000-4000-8000-000000000122";
const mediaFileDummy = "b6200000-0000-4000-8000-000000000130";
const mediaPlaybackEventA1 = "b6200000-0000-4000-8000-000000000141";
const mediaPlaybackEventA2 = "b6200000-0000-4000-8000-000000000142";
const uploadSessionA1 = "b6200000-0000-4000-8000-000000000151";
const uploadSessionA2 = "b6200000-0000-4000-8000-000000000152";

// B4-core-4 (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #660): fixture ids for
// the 3 conditional/polymorphic patient-wall targets found by the independent audit. Unlike the
// dummy-uuid media_id used above for media_playback_client_events/media_upload_sessions (whose FK
// to media_files was deliberately dropped, see B4_CORE_3_DDL_STEPS), this smoke builds a REAL
// public.media_files table (see B4_CORE_4_DDL_STEPS) so its own conditional predicate, and
// media_transcode_jobs' inherited-via-FK conditional predicate, can be exercised directly.
const mediaFileSharedA = "b6400000-0000-4000-8000-000000000001"; // library upload, usage_purpose NULL
const mediaFileSubmissionA1 = "b6400000-0000-4000-8000-000000000002"; // patient A1's own submission
const mediaFileSubmissionA2 = "b6400000-0000-4000-8000-000000000003"; // patient A2's own submission
const transcodeJobSharedA = "b6400000-0000-4000-8000-000000000011";
const transcodeJobSubmissionA1 = "b6400000-0000-4000-8000-000000000012";
const transcodeJobSubmissionA2 = "b6400000-0000-4000-8000-000000000013";
// comments: 1 catalog/shared target_type (visible to any org member) + 2 patient-instance variants
// at opposite ends of the hop-depth spectrum -- program_instance (1 hop) and stage_item_instance
// (3 hops, the deepest chain registered) -- each with an A1 row and an A2 row on the SAME org-A
// parent instances already built by B4_CORE_3_DDL_STEPS (treatmentInstanceA1/A2,
// treatmentInstanceStageItemA1/A2).
const commentCatalogShared = "b6400000-0000-4000-8000-000000000021";
const commentProgramA1 = "b6400000-0000-4000-8000-000000000022";
const commentProgramA2 = "b6400000-0000-4000-8000-000000000023";
const commentStageItemA1 = "b6400000-0000-4000-8000-000000000024";
const commentStageItemA2 = "b6400000-0000-4000-8000-000000000025";

// ---------------------------------------------------------------------------
// Phase 1: minimal real webapp DDL (see adaptation #1 above)
// ---------------------------------------------------------------------------
const WEBAPP_DDL_FILES = [
  "apps/webapp/migrations/006_platform_users.sql",
  "apps/webapp/db/drizzle-migrations/0086_booking_engine_canonical.sql",
  "apps/webapp/db/drizzle-migrations/0073_notification_delivery_attempts.sql",
  "apps/webapp/db/drizzle-migrations/0094_booking_stage6_memberships.sql",
  "apps/webapp/migrations/031_system_settings.sql",
  "apps/webapp/db/drizzle-migrations/0132_system_settings_audit.sql",
  "apps/webapp/db/drizzle-migrations/0141_be_organization_members.sql",
  "apps/webapp/db/drizzle-migrations/0144_org_enrollments.sql",
  "apps/webapp/db/drizzle-migrations/0164_p0_11_3_system_settings_audit_org.sql",
  "apps/webapp/db/drizzle-migrations/0166_p0_4_en_org_enrollments_org_semantics.sql",
  "apps/webapp/migrations/009_support_communication_history.sql",
];

// B4-core-3 (taskdb #658): DDL steps for the 9 named tables + their FK ancestors, run in phase 1b
// (after WEBAPP_DDL_FILES, before phase 2). Each entry is either a repo-relative file path (applied
// verbatim via readRepoFile, same as WEBAPP_DDL_FILES) or literal SQL (a hand-filtered excerpt,
// same "adaptation" style as orgRetrofitSql below — verified against the real file, documented
// where trimmed). Order matters: ancestors before dependents.
//   - 048_online_intake.sql: self-contained (only depends on platform_users, already loaded).
//   - clinical excerpt: verbatim CREATE TABLE statements from
//     apps/webapp/db/drizzle-migrations/0121_patient_clinical_core.sql for
//     clinical_diagnosis_catalog/clinical_visit/clinical_complaint/clinical_complaint_update/
//     clinical_diagnosis/clinical_diagnosis_update, EXCEPT clinical_visit's
//     "appointment_record_id" FK constraint (-> appointment_records, a legacy table this minimal
//     scratch schema does not build) is dropped — the column stays a plain nullable uuid, never
//     populated by this smoke's fixtures. The file's trailing `ALTER TABLE patient_files ADD
//     CONSTRAINT ... REFERENCES clinical_visit` statement (patient_files is not part of this
//     smoke's minimal schema) is likewise not applied.
//   - 0128_patient_diagnosis_status.sql: self-contained once clinical_diagnosis exists above.
//   - 0002_sweet_ikaris.sql + 0003_treatment_program_instances.sql +
//     0006_treatment_program_events.sql: self-contained (only depend on platform_users + each other
//     in that order).
//   - "tests" catalog excerpt: verbatim bare CREATE TABLE "tests" from
//     apps/webapp/db/drizzle-migrations/0001_charming_champions.sql, WITHOUT that file's later
//     `ALTER TABLE tests ADD CONSTRAINT tests_created_by_fkey` (not needed — this smoke never
//     populates test.created_by, and the huge 0001 file also creates ~10 unrelated catalog
//     tables/FKs this scratch schema does not need).
//   - 0005_treatment_program_phase6.sql (test_attempts/test_results): self-contained once
//     treatment_program_instance_stage_items (from 0003) and tests (excerpt above) exist.
//   - 005_lfk_complexes_and_sessions.sql: self-contained (lfk_complexes.user_id is plain TEXT, no
//     FK at creation — platform_user_id is a LATER retrofit column, added below in orgRetrofitSql).
//   - lfk_exercises excerpt: verbatim CREATE TABLE lfk_exercises from
//     apps/webapp/migrations/033_lfk_exercises.sql, EXCEPT "region_ref_id" drops its
//     "REFERENCES reference_items(id)" (reference_items is not part of this smoke's minimal
//     schema) — the column stays a plain nullable uuid, never populated by this smoke's fixtures.
//   - 035_lfk_complex_exercises.sql: self-contained once lfk_complexes (005) and lfk_exercises
//     (excerpt above) exist.
const B4_CORE_3_DDL_STEPS = [
  "apps/webapp/migrations/048_online_intake.sql",
  `
CREATE TABLE "clinical_diagnosis_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "label" text NOT NULL,
  "note" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_diagnosis_catalog_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "platform_users"("id") ON DELETE RESTRICT
);
CREATE TABLE "clinical_visit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "visit_type" text NOT NULL,
  "visited_at" timestamptz NOT NULL,
  "location" text,
  "service" text,
  "duration" text,
  "appointment_record_id" uuid,
  "exam" text,
  "manipulations" text,
  "trial_results" text,
  "recommendations" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_visit_visit_type_check" CHECK (
    visit_type = ANY (ARRAY['first'::text, 'repeat'::text])
  ),
  CONSTRAINT "clinical_visit_patient_user_id_fkey" FOREIGN KEY ("patient_user_id")
    REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_visit_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "platform_users"("id") ON DELETE RESTRICT
);
CREATE TABLE "clinical_complaint" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "text" text NOT NULL,
  "priority" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "source_visit_id" uuid NOT NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_complaint_status_check" CHECK (
    status = ANY (ARRAY['active'::text, 'resolved'::text])
  ),
  CONSTRAINT "clinical_complaint_patient_user_id_fkey" FOREIGN KEY ("patient_user_id")
    REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_complaint_source_visit_id_fkey" FOREIGN KEY ("source_visit_id")
    REFERENCES "clinical_visit"("id") ON DELETE CASCADE
);
CREATE TABLE "clinical_complaint_update" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "complaint_id" uuid NOT NULL,
  "visit_id" uuid NOT NULL,
  "note" text,
  "severity" integer NOT NULL,
  "resolved" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_complaint_update_severity_check" CHECK (severity >= 0 AND severity <= 10),
  CONSTRAINT "clinical_complaint_update_complaint_id_fkey" FOREIGN KEY ("complaint_id")
    REFERENCES "clinical_complaint"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_complaint_update_visit_id_fkey" FOREIGN KEY ("visit_id")
    REFERENCES "clinical_visit"("id") ON DELETE CASCADE
);
CREATE TABLE "clinical_diagnosis" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "catalog_id" uuid,
  "text" text NOT NULL,
  "priority" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "source_visit_id" uuid NOT NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_diagnosis_status_check" CHECK (
    status = ANY (ARRAY['active'::text, 'refined'::text, 'resolved'::text])
  ),
  CONSTRAINT "clinical_diagnosis_patient_user_id_fkey" FOREIGN KEY ("patient_user_id")
    REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_diagnosis_catalog_id_fkey" FOREIGN KEY ("catalog_id")
    REFERENCES "clinical_diagnosis_catalog"("id") ON DELETE SET NULL,
  CONSTRAINT "clinical_diagnosis_source_visit_id_fkey" FOREIGN KEY ("source_visit_id")
    REFERENCES "clinical_visit"("id") ON DELETE CASCADE
);
CREATE TABLE "clinical_diagnosis_update" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "diagnosis_id" uuid NOT NULL,
  "visit_id" uuid NOT NULL,
  "refinement" text,
  "status" text NOT NULL,
  "removed" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "clinical_diagnosis_update_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id")
    REFERENCES "clinical_diagnosis"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_diagnosis_update_visit_id_fkey" FOREIGN KEY ("visit_id")
    REFERENCES "clinical_visit"("id") ON DELETE CASCADE
);
`,
  "apps/webapp/db/drizzle-migrations/0128_patient_diagnosis_status.sql",
  "apps/webapp/db/drizzle-migrations/0002_sweet_ikaris.sql",
  "apps/webapp/db/drizzle-migrations/0003_treatment_program_instances.sql",
  "apps/webapp/db/drizzle-migrations/0006_treatment_program_events.sql",
  `
CREATE TABLE "tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"test_type" text,
	"scoring_config" jsonb,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" text[],
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
`,
  "apps/webapp/db/drizzle-migrations/0005_treatment_program_phase6.sql",
  "apps/webapp/migrations/005_lfk_complexes_and_sessions.sql",
  // media_playback_client_events excerpt: verbatim CREATE TABLE from
  // apps/webapp/db/drizzle-migrations/0059_media_playback_client_events.sql, EXCEPT the FK to
  // media_files(id) is dropped (media_files is not part of this smoke's minimal schema) — media_id
  // stays a plain uuid seeded with a dummy value. The user_id FK to platform_users(id) is kept (it
  // is the direct patient-owner column this table is walled by). Represents the 0172 "direct
  // user_id column that had simply been missed" category (same predicate shape as the already-proven
  // notification_delivery_attempts, on a NEW table).
  `
CREATE TABLE "media_playback_client_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "media_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "event_class" text NOT NULL,
  "delivery" text,
  "error_detail" text,
  "user_agent" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "media_playback_client_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade
);
`,
  // media_upload_sessions excerpt (B4-core-3 audit correction, taskdb #658): verbatim CREATE TABLE
  // from apps/webapp/migrations/067_media_folders_and_multipart.sql, EXCEPT the FK on media_id ->
  // media_files(id) is dropped (media_files not built in this minimal scratch schema) — media_id
  // stays a plain uuid seeded with a dummy value. The owner_user_id FK to platform_users(id) is
  // KEPT: it is the direct patient-owner column this table is walled by. This table has NO
  // usage_purpose column (that lives on media_files) — proving it is genuinely a direct per-patient
  // owner, not the dual-role case its earlier false exclusion claimed.
  `
CREATE TABLE media_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL,
  s3_key TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'initiated',
  expected_size_bytes BIGINT NOT NULL CHECK (expected_size_bytes > 0),
  mime_type TEXT NOT NULL,
  part_size_bytes INT NOT NULL CHECK (part_size_bytes >= 1 AND part_size_bytes <= 536870912),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  aborted_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT media_upload_sessions_status_check CHECK (
    status IN ('initiated', 'uploading', 'completing', 'completed', 'aborted', 'expired', 'failed')
  )
);
`,
  `
CREATE TABLE lfk_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  region_ref_id UUID,
  load_type TEXT CHECK (load_type IN ('strength', 'stretch', 'balance', 'cardio', 'other')),
  difficulty_1_10 INT CHECK (difficulty_1_10 IS NULL OR (difficulty_1_10 >= 1 AND difficulty_1_10 <= 10)),
  contraindications TEXT,
  tags TEXT[],
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`,
  "apps/webapp/migrations/035_lfk_complex_exercises.sql",
];

// B4-core-4 (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #660): DDL for the 3
// conditional/polymorphic targets found by the independent audit. Each entry is verbatim CREATE
// TABLE SQL from the real file (organization_id/usage_purpose columns are later ADD COLUMN
// retrofits in the real migrations too -- applied separately below in b4c4RetrofitSql, same
// "adaptation" convention as b4c3RetrofitSql).
//   - media_files: verbatim CREATE TABLE from apps/webapp/migrations/028_media_files.sql
//     (uploaded_by already REFERENCES platform_users(id), no adaptation needed).
//   - media_transcode_jobs: verbatim CREATE TABLE + media_id FK + indexes from
//     apps/webapp/db/drizzle-migrations/0019_media_transcode_jobs_queue.sql, EXCEPT the file's
//     trailing `INSERT INTO system_settings (...) VALUES ('video_hls_pipeline_enabled', ...)`
//     seed row is dropped (unrelated to the RLS predicate this smoke proves). Unlike
//     media_playback_client_events/media_upload_sessions above, media_id's FK to media_files(id) is
//     KEPT here -- media_files is a real table in this smoke's schema now, so the FK is meaningful.
//   - comments: verbatim CREATE TABLE + author_id FK from
//     apps/webapp/db/drizzle-migrations/0004_entity_comments.sql (author_id already REFERENCES
//     platform_users(id), no adaptation needed; target_type/target_id stay polymorphic, no FK, per
//     P0.12.1 / check-p0-12-polymorphic-references.mjs's assertNoItemRefFk).
const B4_CORE_4_DDL_STEPS = [
  `
CREATE TABLE IF NOT EXISTS media_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 52428800),
  uploaded_by UUID REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_files_created_at ON media_files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_files_uploaded_by ON media_files(uploaded_by);
`,
  `
CREATE TABLE "media_transcode_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_transcode_jobs_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text]))
);
ALTER TABLE "media_transcode_jobs" ADD CONSTRAINT "media_transcode_jobs_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_media_transcode_jobs_pending_pick" ON "media_transcode_jobs" USING btree ("next_attempt_at" timestamptz_ops,"created_at" timestamptz_ops) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX "media_transcode_jobs_one_active_per_media" ON "media_transcode_jobs" USING btree ("media_id" uuid_ops) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));
`,
  `
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"comment_type" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_target_type_check" CHECK (target_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'test'::text, 'test_set'::text, 'recommendation'::text, 'lesson'::text, 'stage_item_instance'::text, 'stage_instance'::text, 'program_instance'::text])),
	CONSTRAINT "comments_comment_type_check" CHECK (comment_type = ANY (ARRAY['template'::text, 'individual_override'::text, 'clinical_note'::text]))
);
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."platform_users"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "idx_comments_target_type_target_id" ON "comments" USING btree ("target_type" text_ops,"target_id" uuid_ops);
`,
];

// B4-core-4 org-column + usage_purpose retrofits (real migrations: 0098 for usage_purpose, 0152
// P0.4.P7 for media_files/media_transcode_jobs organization_id, 0154 P0.4.D for comments
// organization_id) -- restricted to these 3 tables, same "adaptation" convention as b4c3RetrofitSql.
const b4c4RetrofitSql = `
ALTER TABLE "media_files" ADD COLUMN IF NOT EXISTS "usage_purpose" text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_files_usage_purpose_check'
  ) THEN
    ALTER TABLE "media_files"
      ADD CONSTRAINT "media_files_usage_purpose_check"
      CHECK (("usage_purpose" IS NULL) OR ("usage_purpose" = ANY (ARRAY['program_item_submission'::text])));
  END IF;
END $$;

ALTER TABLE media_files ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE media_transcode_jobs ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE INDEX IF NOT EXISTS idx_media_files_organization_id ON media_files USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_media_transcode_jobs_organization_id ON media_transcode_jobs USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_comments_organization_id ON comments USING btree (organization_id);
`;

// Real system_settings org-column retrofit + RLS lives inside 0163 (bootstrap-hybrid sweep) —
// applied in phase 4 alongside the other extracted RLS blocks, since it is itself a real,
// self-contained "add column, add indexes, add FK, enable/force/create policy" unit for exactly
// the two system_settings tables (public + integrator) we need — see adaptation #4.

// ---------------------------------------------------------------------------
// Phase 2: minimal real integrator core DDL (see adaptation #2 above)
// ---------------------------------------------------------------------------
const INTEGRATOR_DDL_FILES = [
  "apps/integrator/src/infra/db/migrations/core/20260306_0012_create_users.sql",
  "apps/integrator/src/infra/db/migrations/core/20260311_0002_create_user_reminders.sql",
  "apps/integrator/src/infra/db/migrations/core/20260406_0002_create_system_settings.sql",
  "apps/integrator/src/infra/db/migrations/core/20260306_0013_create_identities.sql",
  "apps/integrator/src/infra/db/migrations/core/20260310_0001_create_message_threads.sql",
  "apps/integrator/src/infra/db/migrations/core/20260311_0001_create_user_questions.sql",
];

// ---------------------------------------------------------------------------
// Phase 3: hand-filtered excerpts of I1/I3/C1 + the notification_delivery_attempts org retrofit
// (see adaptation #3 above). Verified verbatim against the real files at
//   apps/integrator/src/infra/db/migrations/core/20260708_0001_p0_4_i1_integrator_direct_user_org.sql
//   apps/integrator/src/infra/db/migrations/core/20260708_0003_p0_4_i3_integrator_parent_denorm_org.sql
//   apps/integrator/src/infra/db/migrations/core/20260710_0001_r2_integrator_scoped_org_not_null.sql
//   apps/webapp/db/drizzle-migrations/0152_p0_4_p7_reminders_media_org.sql (lines 23-24, 70-71, and
//   the per-table shape of the FOREACH loop at lines 95-137: `<table>_organization_id_fkey` FK to
//   be_organizations(id) ON DELETE CASCADE)
// ---------------------------------------------------------------------------
const orgRetrofitSql = `
-- I1 excerpt (content_access_grants only; sibling tables contacts/mailing_logs/user_subscriptions
-- not present in this minimal scratch schema):
ALTER TABLE integrator.content_access_grants ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE INDEX IF NOT EXISTS idx_content_access_grants_organization_id
  ON integrator.content_access_grants USING btree (organization_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'content_access_grants_organization_id_fkey'
      AND conrelid = 'integrator.content_access_grants'::regclass
  ) THEN
    ALTER TABLE integrator.content_access_grants
      ADD CONSTRAINT content_access_grants_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- I3 excerpt (user_reminder_occurrences + user_reminder_delivery_logs only; sibling tables
-- conversation_messages/question_messages not present in this minimal scratch schema):
ALTER TABLE integrator.user_reminder_occurrences ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.user_reminder_delivery_logs ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE INDEX IF NOT EXISTS idx_user_reminder_occurrences_organization_id
  ON integrator.user_reminder_occurrences USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_user_reminder_delivery_logs_organization_id
  ON integrator.user_reminder_delivery_logs USING btree (organization_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_reminder_occurrences_organization_id_fkey'
      AND conrelid = 'integrator.user_reminder_occurrences'::regclass
  ) THEN
    ALTER TABLE integrator.user_reminder_occurrences
      ADD CONSTRAINT user_reminder_occurrences_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_reminder_delivery_logs_organization_id_fkey'
      AND conrelid = 'integrator.user_reminder_delivery_logs'::regclass
  ) THEN
    ALTER TABLE integrator.user_reminder_delivery_logs
      ADD CONSTRAINT user_reminder_delivery_logs_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 0152 excerpt (notification_delivery_attempts only; the real file processes ~20 unrelated tables
-- via a FOREACH loop in one 841-line batch migration):
ALTER TABLE notification_delivery_attempts ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE INDEX IF NOT EXISTS idx_notification_delivery_attempts_organization_id
  ON notification_delivery_attempts USING btree (organization_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_delivery_attempts_organization_id_fkey'
      AND conrelid = 'notification_delivery_attempts'::regclass
  ) THEN
    ALTER TABLE notification_delivery_attempts
      ADD CONSTRAINT notification_delivery_attempts_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- C1 excerpt (SET NOT NULL only for the 3 integrator tables above; real file covers 13):
ALTER TABLE integrator.content_access_grants ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.user_reminder_occurrences ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE integrator.user_reminder_delivery_logs ALTER COLUMN organization_id SET NOT NULL;

-- B4-fanout gap closure (taskdb #656): I2 excerpt (conversations/message_drafts/user_questions;
-- ADD COLUMN + index + FK only, verified against
-- apps/integrator/src/infra/db/migrations/core/20260708_0002_p0_4_i2_integrator_identity_path_org.sql
-- lines 1-46 -- the file's backfill DO $$ blocks (lines 48+) need org_enrollments/
-- be_organization_members/platform_users.integrator_user_id machinery this minimal scratch schema
-- does not build; this smoke seeds organization_id directly at INSERT time instead, same approach
-- already used for the I1/I3/0152 excerpts above. NOT NULL is intentionally not added here (not
-- required to prove the predicate; fixtures never insert a NULL organization_id row).
ALTER TABLE integrator.conversations ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.message_drafts ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.user_questions ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE INDEX IF NOT EXISTS idx_conversations_organization_id
  ON integrator.conversations USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_message_drafts_organization_id
  ON integrator.message_drafts USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_user_questions_organization_id
  ON integrator.user_questions USING btree (organization_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_organization_id_fkey'
      AND conrelid = 'integrator.conversations'::regclass
  ) THEN
    ALTER TABLE integrator.conversations
      ADD CONSTRAINT conversations_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'message_drafts_organization_id_fkey'
      AND conrelid = 'integrator.message_drafts'::regclass
  ) THEN
    ALTER TABLE integrator.message_drafts
      ADD CONSTRAINT message_drafts_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_questions_organization_id_fkey'
      AND conrelid = 'integrator.user_questions'::regclass
  ) THEN
    ALTER TABLE integrator.user_questions
      ADD CONSTRAINT user_questions_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- I3 excerpt continued (conversation_messages/question_messages; sibling tables
-- user_reminder_occurrences/user_reminder_delivery_logs already retrofitted above). Verified
-- against 20260708_0003_p0_4_i3_integrator_parent_denorm_org.sql lines 1-16 (ADD COLUMN/index only).
ALTER TABLE integrator.conversation_messages ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.question_messages ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE INDEX IF NOT EXISTS idx_conversation_messages_organization_id
  ON integrator.conversation_messages USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_question_messages_organization_id
  ON integrator.question_messages USING btree (organization_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversation_messages_organization_id_fkey'
      AND conrelid = 'integrator.conversation_messages'::regclass
  ) THEN
    ALTER TABLE integrator.conversation_messages
      ADD CONSTRAINT conversation_messages_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'question_messages_organization_id_fkey'
      AND conrelid = 'integrator.question_messages'::regclass
  ) THEN
    ALTER TABLE integrator.question_messages
      ADD CONSTRAINT question_messages_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- B4-fanout: P0.4.P6 excerpt (support_conversations/support_questions/support_conversation_messages/
-- support_question_messages/support_delivery_events; ADD COLUMN + index + FK only). Verified against
-- apps/webapp/db/drizzle-migrations/0151_p0_4_p6_support_comms_org.sql lines 1-29 (this file also
-- covers doctor_notes/doctor_patient_support/specialist_tasks, not needed by this smoke).
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE support_conversation_messages ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE support_delivery_events ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE support_question_messages ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE support_questions ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE INDEX IF NOT EXISTS idx_support_conversations_organization_id
  ON support_conversations USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_support_conversation_messages_organization_id
  ON support_conversation_messages USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_support_delivery_events_organization_id
  ON support_delivery_events USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_support_question_messages_organization_id
  ON support_question_messages USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_support_questions_organization_id
  ON support_questions USING btree (organization_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_conversations_organization_id_fkey'
      AND conrelid = 'support_conversations'::regclass
  ) THEN
    ALTER TABLE support_conversations
      ADD CONSTRAINT support_conversations_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_conversation_messages_organization_id_fkey'
      AND conrelid = 'support_conversation_messages'::regclass
  ) THEN
    ALTER TABLE support_conversation_messages
      ADD CONSTRAINT support_conversation_messages_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_delivery_events_organization_id_fkey'
      AND conrelid = 'support_delivery_events'::regclass
  ) THEN
    ALTER TABLE support_delivery_events
      ADD CONSTRAINT support_delivery_events_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_question_messages_organization_id_fkey'
      AND conrelid = 'support_question_messages'::regclass
  ) THEN
    ALTER TABLE support_question_messages
      ADD CONSTRAINT support_question_messages_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_questions_organization_id_fkey'
      AND conrelid = 'support_questions'::regclass
  ) THEN
    ALTER TABLE support_questions
      ADD CONSTRAINT support_questions_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;
`;

// ---------------------------------------------------------------------------
// Phase 3b: B4-core-3 (taskdb #658) org-column + patient-column retrofits for the newly-walled
// tables this smoke exercises. Same "adaptation" style as orgRetrofitSql above: in the real
// migrations each column is added by a P0.4 batch file (0146 P1, 0147 P2, 0148 P3, 0150 P5) that
// also processes a dozen sibling tables + a full backfill+NOT-NULL gate; here we add just the
// organization_id column (nullable, seeded directly at INSERT time) restricted to the tables this
// smoke actually creates. lfk_complexes.platform_user_id is the real patient-owner column added by
// apps/webapp/migrations/062_platform_user_owned_refs_prepare.sql (the base 005 CREATE TABLE only
// has a legacy TEXT user_id) — added here so lfk_complex_exercises' chain terminal resolves.
// ---------------------------------------------------------------------------
const b4c3RetrofitSql = `
ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS platform_user_id uuid;

-- Chain-parent tables that are themselves org-scoped in production (0146 P1 / 0147 P2 / 0150 P5)
-- but are NOT RLS-flipped in this smoke -- they only need the column so the seed can stamp org.
ALTER TABLE online_intake_requests ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_visit ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_complaint ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_diagnosis ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE treatment_program_instances ADD COLUMN IF NOT EXISTS organization_id uuid;

ALTER TABLE online_intake_answers ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE online_intake_attachments ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE online_intake_status_history ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_complaint_update ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_diagnosis_update ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_diagnosis_status_history ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE treatment_program_instance_stages ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE lfk_complex_exercises ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE treatment_program_events ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE treatment_program_instance_stage_items ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE media_playback_client_events ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE media_upload_sessions ADD COLUMN IF NOT EXISTS organization_id uuid;
`;

// ---------------------------------------------------------------------------
// Phase 4: dormant RLS — extracted verbatim blocks from the REAL 0161/0162/0163/0167 migrations.
// ---------------------------------------------------------------------------
const rls0161 = readRepoFile("apps/webapp/db/drizzle-migrations/0161_p0_8_4_public_path_rls.sql");
const rls0162 = readRepoFile("apps/webapp/db/drizzle-migrations/0162_p0_8_5_integrator_scoped_rls.sql");
const rls0163 = readRepoFile("apps/webapp/db/drizzle-migrations/0163_p0_8_6_bootstrap_hybrid_rls.sql");
const rls0167 = readRepoFile("apps/webapp/db/drizzle-migrations/0167_p0_8_3_org_enrollments_broadcast_drafts_rls.sql");
const rls0170 = readRepoFile("apps/webapp/db/drizzle-migrations/0170_p0_8_b4_fanout_chain_patient_wall_rls.sql");
const rls0174 = readRepoFile(
  "apps/webapp/db/drizzle-migrations/0174_p0_8_b4_core_4_conditional_polymorphic_patient_wall_rls.sql",
);

const dormantRlsSql = [
  selectRlsBlocks(rls0161, ["public.be_package_items", "public.notification_delivery_attempts"]),
  // user_reminder_delivery_logs' dormant block now comes from 0170 (chain-aware predicate)
  // below, not this original org-only 0162 version -- phase 5 (enforce simulation) would
  // overwrite either one, but sourcing the chain-aware version keeps phase 4's installed state
  // consistent with what a real deploy would have after 0170 lands.
  selectRlsBlocks(rls0162, ["integrator.content_access_grants"]),
  (() => {
    // 0163 has real preamble DDL (add column/indexes/FK) for BOTH system_settings tables that we need
    // in full, plus policy blocks for 4 tables — keep the preamble, filter blocks to our 2 targets.
    const { preamble, blocksByTable } = parseGeneratedRlsFile(rls0163);
    const wanted = ["integrator.system_settings", "public.system_settings"];
    const missing = wanted.filter((t) => !blocksByTable.has(t));
    if (missing.length > 0) throw new Error(`0163 missing expected blocks: ${missing.join(", ")}`);
    return `${preamble}\n${wanted.map((t) => blocksByTable.get(t)).join("\n")}`;
  })(),
  selectRlsBlocks(rls0167, ["public.org_enrollments"]),
  // B4-fanout gap closure (taskdb #656): the 11 chain-only patient-wall targets, all carried by
  // migration 0170 (byte-identical generated output, same extraction shape as 0161/0162/0167).
  selectRlsBlocks(rls0170, [
    "public.support_questions",
    "public.support_conversation_messages",
    "public.support_delivery_events",
    "public.support_question_messages",
    "integrator.conversation_messages",
    "integrator.conversations",
    "integrator.message_drafts",
    "integrator.question_messages",
    "integrator.user_questions",
    "integrator.user_reminder_delivery_logs",
    "integrator.user_reminder_occurrences",
  ]),
  // B4-core-4 (taskdb #660): the 3 conditional/polymorphic patient-wall targets, carried by
  // migration 0174 (byte-identical generated output, same extraction shape as the migrations
  // above). Proven DIRECTLY against this dormant block (not flipped to enforce mode like the
  // targets above) — with app.org SET (as every assertion below does), the dormant org predicate
  // `(app.org IS NULL OR organization_id = app.org)` already behaves identically to enforce mode
  // (the only difference is the unset-app.org fallback, which this smoke does not need to
  // re-prove for these 3 — org isolation is already proven generically for direct_org_column/
  // denorm_org_column elsewhere in this smoke), and the patient branch is ALWAYS fail-closed
  // regardless of dormant/enforce mode (see rls-sql-renderer.mjs renderPatientPredicate's doc
  // comment). public.comments' polymorphic_resolver scopingKind is deliberately NOT added to
  // p0-9-enforce-descriptors.mjs's ENFORCE_TARGETS mechanism (it stays `scoped_pending_default_deny`
  // there, unrelated/more conservative P0.9 gate, out of scope for this patient-wall closure) — so
  // testing it via its real DORMANT policy directly is the only (and correct) way to prove it here.
  selectRlsBlocks(rls0174, ["public.media_files", "public.media_transcode_jobs", "public.comments"]),
].join("\n");

// ---------------------------------------------------------------------------
// Phase 5: simulate the flip — REAL renderer, mode "enforce", for our target tables.
// This is p0-9-enforce-descriptors.mjs, already shipped in this repo for exactly this purpose
// (see plan B7/B8) but not yet wired into an actual migration file.
// ---------------------------------------------------------------------------
const descriptors = buildRlsDescriptors();
const ENFORCE_TARGETS = [
  "public.org_enrollments",
  "public.be_package_items",
  "public.notification_delivery_attempts",
  "integrator.content_access_grants",
  "integrator.user_reminder_delivery_logs",
  "public.system_settings",
  // B4-fanout gap closure (taskdb #656): the 10 ADDITIONAL chain-only patient-wall targets
  // (integrator.user_reminder_delivery_logs above is one of the original 6, now proven closed).
  "public.support_questions",
  "public.support_conversation_messages",
  "public.support_delivery_events",
  "public.support_question_messages",
  "integrator.conversations",
  "integrator.message_drafts",
  "integrator.user_questions",
  "integrator.conversation_messages",
  "integrator.question_messages",
  "integrator.user_reminder_occurrences",
  // B4-core-3 (taskdb #658): representative sample (13 tables) of the 28 newly-walled patient-owned
  // SCOPED tables (9 from migration 0171 + 18 from 0172 + 1 from 0173 media_upload_sessions audit
  // correction), covering every mechanism: single-hop parent_denorm chains (all PHI), a 2-hop deep
  // chain, a 1-hop chain to an already-walled parent, and two direct-owner columns
  // (media_playback_client_events.user_id + media_upload_sessions.owner_user_id). The remaining 15
  // (be_appointment_* / be_package_* / be_refunds / be_product_history_events / reminder_journal
  // single-hop chains, and the other 3 media_playback_* direct columns) use byte-for-byte the SAME
  // renderPatientChainPredicate / direct-column predicate shapes proven here + already proven for
  // the be_* / notification_* families elsewhere in this smoke, so this sample is representative,
  // not a coverage gap.
  "public.online_intake_answers",
  "public.online_intake_attachments",
  "public.online_intake_status_history",
  "public.clinical_complaint_update",
  "public.clinical_diagnosis_update",
  "public.clinical_diagnosis_status_history",
  "public.test_results",
  "public.treatment_program_instance_stages",
  "public.treatment_program_instance_stage_items",
  "public.treatment_program_events",
  "public.lfk_complex_exercises",
  "public.media_playback_client_events",
  "public.media_upload_sessions",
];

// IMPORTANT mechanical finding: Postgres OR-combines multiple PERMISSIVE policies on the same table
// for the same command. Merely CREATE-ing an enforce-mode policy alongside the still-present
// dormant_permissive one changes nothing (the dormant policy alone already permits everything when
// app.org is unset). Simulating the flip must DROP the old dormant policy, not just add a new one —
// this is the same mechanical requirement plan item B8 (the real flip migration) will have to honor.
const DORMANT_POLICY_NAME_BY_TABLE = {
  "public.org_enrollments": p083PolicyName,
  "public.be_package_items": p084PolicyName,
  "public.notification_delivery_attempts": p084PolicyName,
  "integrator.content_access_grants": p085PolicyName,
  "integrator.user_reminder_delivery_logs": p085PolicyName,
  "public.system_settings": p086PolicyName,
  "public.support_questions": p083PolicyName,
  "public.support_conversation_messages": p084PolicyName,
  "public.support_delivery_events": p084PolicyName,
  "public.support_question_messages": p084PolicyName,
  "integrator.conversations": p085PolicyName,
  "integrator.message_drafts": p085PolicyName,
  "integrator.user_questions": p085PolicyName,
  "integrator.conversation_messages": p085PolicyName,
  "integrator.question_messages": p085PolicyName,
  "integrator.user_reminder_occurrences": p085PolicyName,
  // B4-core-3 (taskdb #658): 11 denorm targets carry the p0_8_4 dormant name, the 1 direct-column
  // media_playback_client_events carries p0_8_3. (These dormant policies are not installed in this
  // smoke — DROP POLICY IF EXISTS no-ops — but the name must be present so renderDropPolicy has a
  // concrete policy name to emit, same as every other enforce target above.)
  "public.online_intake_answers": p084PolicyName,
  "public.online_intake_attachments": p084PolicyName,
  "public.online_intake_status_history": p084PolicyName,
  "public.clinical_complaint_update": p084PolicyName,
  "public.clinical_diagnosis_update": p084PolicyName,
  "public.clinical_diagnosis_status_history": p084PolicyName,
  "public.test_results": p084PolicyName,
  "public.treatment_program_instance_stages": p084PolicyName,
  "public.treatment_program_instance_stage_items": p084PolicyName,
  "public.treatment_program_events": p084PolicyName,
  "public.lfk_complex_exercises": p084PolicyName,
  "public.media_playback_client_events": p083PolicyName,
  "public.media_upload_sessions": p083PolicyName,
};

const enforceFindings = [];
const enforceSql = ENFORCE_TARGETS.map((table) => {
  const descriptor = getP09EnforceDescriptorByTable(table, { descriptors });
  enforceFindings.push(`${table}\t${descriptor.tier}\t${descriptor.scopingKind}\t${descriptor.enforceMode?.action}`);
  const dropDormant = renderDropPolicy({ policyName: DORMANT_POLICY_NAME_BY_TABLE[table], target: table });
  return [dropDormant, renderP09EnforcePolicyStatements(descriptor, { policyName: p09PolicyName }).join("\n")].join(
    "\n",
  );
}).join("\n");

console.log("--- B6 enforce-mode descriptors (real rls-descriptor-model.mjs classification) ---");
for (const line of enforceFindings) console.log(line);

// be_organization_members: real classification check (documented finding, not an assertion failure).
const beOrgMembersDescriptor = descriptors.get("public.be_organization_members");
console.log(
  `--- FINDING: public.be_organization_members real tier = ${beOrgMembersDescriptor?.tier ?? "<not in tiers-218.tsv>"} ` +
    `scopingKind = ${beOrgMembersDescriptor?.scopingKind ?? "<none>"} (NOT SCOPED direct-org; substituted org_enrollments) ---`,
);

// ---------------------------------------------------------------------------
// Fixture seed SQL (2 orgs, 2 patients in org A + 1 in org B, rows per target table).
// ---------------------------------------------------------------------------
const seedSql = `
INSERT INTO be_organizations (id, title) VALUES
  ('${orgA}'::uuid, 'B6 Org A'),
  ('${orgB}'::uuid, 'B6 Org B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform_users (id, display_name, role) VALUES
  ('${doctorA}'::uuid, 'B6 Doctor A', 'doctor'),
  ('${patientA1}'::uuid, 'B6 Patient A1', 'client'),
  ('${patientA2}'::uuid, 'B6 Patient A2', 'client'),
  ('${patientB1}'::uuid, 'B6 Patient B1', 'client')
ON CONFLICT (id) DO NOTHING;

INSERT INTO be_clinic_services (id, organization_id, title, duration_minutes, price_minor) VALUES
  ('${serviceA}'::uuid, '${orgA}'::uuid, 'B6 Service A', 30, 100000),
  ('${serviceB}'::uuid, '${orgB}'::uuid, 'B6 Service B', 30, 100000)
ON CONFLICT DO NOTHING;

INSERT INTO be_subscription_packages (id, organization_id, title, price_minor) VALUES
  ('${packageA}'::uuid, '${orgA}'::uuid, 'B6 Package A', 500000),
  ('${packageB}'::uuid, '${orgB}'::uuid, 'B6 Package B', 500000)
ON CONFLICT DO NOTHING;

INSERT INTO be_package_items (id, package_id, service_id, quantity) VALUES
  ('${packageItemA}'::uuid, '${packageA}'::uuid, '${serviceA}'::uuid, 5),
  ('${packageItemB}'::uuid, '${packageB}'::uuid, '${serviceB}'::uuid, 5)
ON CONFLICT DO NOTHING;

INSERT INTO org_enrollments (organization_id, platform_user_id, status) VALUES
  ('${orgA}'::uuid, '${patientA1}'::uuid, 'active'),
  ('${orgA}'::uuid, '${patientA2}'::uuid, 'active'),
  ('${orgB}'::uuid, '${patientB1}'::uuid, 'active')
ON CONFLICT DO NOTHING;

INSERT INTO notification_delivery_attempts (organization_id, user_id, channel, status) VALUES
  ('${orgA}'::uuid, '${patientA1}'::uuid, 'sms', 'sent'),
  ('${orgA}'::uuid, '${patientA2}'::uuid, 'sms', 'sent'),
  ('${orgB}'::uuid, '${patientB1}'::uuid, 'sms', 'sent');

INSERT INTO system_settings (key, scope, value_json, organization_id) VALUES
  ('b6_global_setting', 'admin', '{"value": "global"}'::jsonb, NULL),
  ('b6_org_setting', 'admin', '{"value": "org_a"}'::jsonb, '${orgA}'::uuid),
  ('b6_org_setting', 'admin', '{"value": "org_b"}'::jsonb, '${orgB}'::uuid)
ON CONFLICT DO NOTHING;

INSERT INTO integrator.users (id) VALUES (${integratorUserA1}), (${integratorUserA2}), (${integratorUserB1})
ON CONFLICT (id) DO NOTHING;

INSERT INTO integrator.content_access_grants (id, user_id, content_id, purpose, expires_at, organization_id) VALUES
  ('b6-cag-a1', ${integratorUserA1}, 'b6-content', 'preview', now() + interval '1 day', '${orgA}'::uuid),
  ('b6-cag-a2', ${integratorUserA2}, 'b6-content', 'preview', now() + interval '1 day', '${orgA}'::uuid),
  ('b6-cag-b1', ${integratorUserB1}, 'b6-content', 'preview', now() + interval '1 day', '${orgB}'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Note: user_reminder_rules itself is NOT one of this smoke's RLS targets (its organization_id
-- retrofit is part of I1 alongside contacts/mailing_logs/user_subscriptions, which this minimal
-- scratch does not create — see adaptation #3). We only need rule rows to exist as the FK parent
-- for user_reminder_occurrences.
INSERT INTO integrator.user_reminder_rules
  (id, user_id, category, interval_minutes, window_start_minute, window_end_minute) VALUES
  ('b6-rule-a1', ${integratorUserA1}, 'b6', 60, 0, 1440),
  ('b6-rule-b1', ${integratorUserB1}, 'b6', 60, 0, 1440)
ON CONFLICT (id) DO NOTHING;

INSERT INTO integrator.user_reminder_occurrences (id, rule_id, occurrence_key, planned_at, organization_id) VALUES
  ('b6-occ-a1', 'b6-rule-a1', 'b6-occ-key-a1', now(), '${orgA}'::uuid),
  ('b6-occ-b1', 'b6-rule-b1', 'b6-occ-key-b1', now(), '${orgB}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO integrator.user_reminder_delivery_logs (id, occurrence_id, channel, status, organization_id) VALUES
  ('b6-log-a1', 'b6-occ-a1', 'sms', 'sent', '${orgA}'::uuid),
  ('b6-log-b1', 'b6-occ-b1', 'sms', 'sent', '${orgB}'::uuid)
ON CONFLICT (id) DO NOTHING;

-- B4-fanout gap closure (taskdb #656): fixtures for the 11 chain-only patient-wall targets. A
-- second org-A reminder rule/occurrence/log (A2) proves A1<>A2 isolation on the reminder chain,
-- not just the A1-vs-org-B split already covered above.
INSERT INTO integrator.user_reminder_rules
  (id, user_id, category, interval_minutes, window_start_minute, window_end_minute) VALUES
  ('${reminderRuleA2}', ${integratorUserA2}, 'b6', 60, 0, 1440)
ON CONFLICT (id) DO NOTHING;

INSERT INTO integrator.user_reminder_occurrences (id, rule_id, occurrence_key, planned_at, organization_id) VALUES
  ('${reminderOccurrenceA2}', '${reminderRuleA2}', 'b6-occ-key-a2', now(), '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO integrator.user_reminder_delivery_logs (id, occurrence_id, channel, status, organization_id) VALUES
  ('${reminderDeliveryLogA2}', '${reminderOccurrenceA2}', 'sms', 'sent', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO integrator.identities (id, user_id, resource, external_id) VALUES
  (${identityA1}, ${integratorUserA1}, 'b6', 'identity-a1'),
  (${identityA2}, ${integratorUserA2}, 'b6', 'identity-a2'),
  (${identityB1}, ${integratorUserB1}, 'b6', 'identity-b1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO integrator.conversations
  (id, source, user_identity_id, admin_scope, status, opened_at, last_message_at, organization_id) VALUES
  ('${conversationA1}', 'telegram', ${identityA1}, 'support', 'open', now(), now(), '${orgA}'::uuid),
  ('${conversationA2}', 'telegram', ${identityA2}, 'support', 'open', now(), now(), '${orgA}'::uuid),
  ('${conversationB1}', 'telegram', ${identityB1}, 'support', 'open', now(), now(), '${orgB}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO integrator.message_drafts (id, identity_id, source, draft_text_current, organization_id) VALUES
  ('${messageDraftA1}', ${identityA1}, 'telegram', 'draft A1', '${orgA}'::uuid),
  ('${messageDraftA2}', ${identityA2}, 'telegram', 'draft A2', '${orgA}'::uuid),
  ('${messageDraftB1}', ${identityB1}, 'telegram', 'draft B1', '${orgB}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO integrator.conversation_messages
  (id, conversation_id, sender_role, text, source, created_at, organization_id) VALUES
  ('${conversationMessageA1}', '${conversationA1}', 'user', 'hello A1', 'telegram', now(), '${orgA}'::uuid),
  ('${conversationMessageA2}', '${conversationA2}', 'user', 'hello A2', 'telegram', now(), '${orgA}'::uuid),
  ('${conversationMessageB1}', '${conversationB1}', 'user', 'hello B1', 'telegram', now(), '${orgB}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO integrator.user_questions (id, user_identity_id, text, organization_id) VALUES
  ('${userQuestionA1}', ${identityA1}, 'question A1', '${orgA}'::uuid),
  ('${userQuestionA2}', ${identityA2}, 'question A2', '${orgA}'::uuid),
  ('${userQuestionB1}', ${identityB1}, 'question B1', '${orgB}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO integrator.question_messages (id, question_id, sender_type, message_text, organization_id) VALUES
  ('${questionMessageA1}', '${userQuestionA1}', 'user', 'answer A1', '${orgA}'::uuid),
  ('${questionMessageA2}', '${userQuestionA2}', 'user', 'answer A2', '${orgA}'::uuid),
  ('${questionMessageB1}', '${userQuestionB1}', 'user', 'answer B1', '${orgB}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO support_conversations
  (id, integrator_conversation_id, platform_user_id, source, admin_scope, status, opened_at, last_message_at, organization_id) VALUES
  ('${supportConversationA1}'::uuid, 'b6-sc-a1', '${patientA1}'::uuid, 'telegram', 'support', 'open', now(), now(), '${orgA}'::uuid),
  ('${supportConversationA2}'::uuid, 'b6-sc-a2', '${patientA2}'::uuid, 'telegram', 'support', 'open', now(), now(), '${orgA}'::uuid),
  ('${supportConversationB1}'::uuid, 'b6-sc-b1', '${patientB1}'::uuid, 'telegram', 'support', 'open', now(), now(), '${orgB}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO support_questions (id, integrator_question_id, conversation_id, status, organization_id) VALUES
  ('${supportQuestionA1}'::uuid, 'b6-sq-a1', '${supportConversationA1}'::uuid, 'open', '${orgA}'::uuid),
  ('${supportQuestionA2}'::uuid, 'b6-sq-a2', '${supportConversationA2}'::uuid, 'open', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO support_conversation_messages
  (id, integrator_message_id, conversation_id, sender_role, text, source, created_at, organization_id) VALUES
  ('${supportConversationMessageA1}'::uuid, 'b6-scm-a1', '${supportConversationA1}'::uuid, 'user', 'hi A1', 'telegram', now(), '${orgA}'::uuid),
  ('${supportConversationMessageA2}'::uuid, 'b6-scm-a2', '${supportConversationA2}'::uuid, 'user', 'hi A2', 'telegram', now(), '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO support_question_messages
  (id, integrator_question_message_id, question_id, sender_role, text, created_at, organization_id) VALUES
  ('${supportQuestionMessageA1}'::uuid, 'b6-sqm-a1', '${supportQuestionA1}'::uuid, 'user', 'q-msg A1', now(), '${orgA}'::uuid),
  ('${supportQuestionMessageA2}'::uuid, 'b6-sqm-a2', '${supportQuestionA2}'::uuid, 'user', 'q-msg A2', now(), '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO support_delivery_events
  (id, conversation_message_id, channel_code, status, attempt, occurred_at, organization_id) VALUES
  ('${supportDeliveryEventA1}'::uuid, '${supportConversationMessageA1}'::uuid, 'telegram', 'sent', 1, now(), '${orgA}'::uuid),
  ('${supportDeliveryEventA2}'::uuid, '${supportConversationMessageA2}'::uuid, 'telegram', 'sent', 1, now(), '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;
`;

// ---------------------------------------------------------------------------
// B4-core-3 (taskdb #658): fixtures for the representative sample of newly-walled tables. Two
// same-org (org A) patients A1/A2 own parallel row chains, so every proof is a real A1<>A2
// isolation test (not merely A-vs-B). Parents (online_intake_requests, clinical_visit/complaint/
// diagnosis, treatment_program_instances/instance_stages, test_attempts, lfk_complexes) are NOT
// RLS-flipped in this smoke -- they exist only so the flipped children's EXISTS-chain terminals
// resolve; they are GRANTed SELECT to the app role (see assertionSql) so the subqueries can read
// them, exactly like support_conversations for the support chain above.
// ---------------------------------------------------------------------------
const b4c3SeedSql = `
-- online intake chain: online_intake_requests.user_id is the patient owner
INSERT INTO online_intake_requests (id, user_id, type, status, organization_id) VALUES
  ('${intakeRequestA1}'::uuid, '${patientA1}'::uuid, 'lfk', 'new', '${orgA}'::uuid),
  ('${intakeRequestA2}'::uuid, '${patientA2}'::uuid, 'lfk', 'new', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO online_intake_answers (id, request_id, question_id, ordinal, value, organization_id) VALUES
  ('${intakeAnswerA1}'::uuid, '${intakeRequestA1}'::uuid, 'q1', 1, 'a1', '${orgA}'::uuid),
  ('${intakeAnswerA2}'::uuid, '${intakeRequestA2}'::uuid, 'q1', 1, 'a2', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO online_intake_attachments (id, request_id, attachment_type, url, organization_id) VALUES
  ('${intakeAttachmentA1}'::uuid, '${intakeRequestA1}'::uuid, 'url', 'http://a1', '${orgA}'::uuid),
  ('${intakeAttachmentA2}'::uuid, '${intakeRequestA2}'::uuid, 'url', 'http://a2', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO online_intake_status_history (id, request_id, to_status, organization_id) VALUES
  ('${intakeStatusHistoryA1}'::uuid, '${intakeRequestA1}'::uuid, 'new', '${orgA}'::uuid),
  ('${intakeStatusHistoryA2}'::uuid, '${intakeRequestA2}'::uuid, 'new', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

-- clinical EHR chain: complaint/diagnosis carry patient_user_id; their _update/_status_history
-- children chain to them.
INSERT INTO clinical_visit (id, patient_user_id, visit_type, visited_at, created_by, organization_id) VALUES
  ('${clinicalVisitA1}'::uuid, '${patientA1}'::uuid, 'first', now(), '${doctorA}'::uuid, '${orgA}'::uuid),
  ('${clinicalVisitA2}'::uuid, '${patientA2}'::uuid, 'first', now(), '${doctorA}'::uuid, '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO clinical_complaint (id, patient_user_id, text, source_visit_id, organization_id) VALUES
  ('${clinicalComplaintA1}'::uuid, '${patientA1}'::uuid, 'c1', '${clinicalVisitA1}'::uuid, '${orgA}'::uuid),
  ('${clinicalComplaintA2}'::uuid, '${patientA2}'::uuid, 'c2', '${clinicalVisitA2}'::uuid, '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO clinical_complaint_update (id, complaint_id, visit_id, severity, organization_id) VALUES
  ('${clinicalComplaintUpdateA1}'::uuid, '${clinicalComplaintA1}'::uuid, '${clinicalVisitA1}'::uuid, 5, '${orgA}'::uuid),
  ('${clinicalComplaintUpdateA2}'::uuid, '${clinicalComplaintA2}'::uuid, '${clinicalVisitA2}'::uuid, 5, '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO clinical_diagnosis (id, patient_user_id, text, source_visit_id, organization_id) VALUES
  ('${clinicalDiagnosisA1}'::uuid, '${patientA1}'::uuid, 'd1', '${clinicalVisitA1}'::uuid, '${orgA}'::uuid),
  ('${clinicalDiagnosisA2}'::uuid, '${patientA2}'::uuid, 'd2', '${clinicalVisitA2}'::uuid, '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO clinical_diagnosis_update (id, diagnosis_id, visit_id, status, organization_id) VALUES
  ('${clinicalDiagnosisUpdateA1}'::uuid, '${clinicalDiagnosisA1}'::uuid, '${clinicalVisitA1}'::uuid, 'active', '${orgA}'::uuid),
  ('${clinicalDiagnosisUpdateA2}'::uuid, '${clinicalDiagnosisA2}'::uuid, '${clinicalVisitA2}'::uuid, 'active', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO clinical_diagnosis_status_history (id, diagnosis_id, new_status, organization_id) VALUES
  ('${clinicalDiagnosisStatusHistoryA1}'::uuid, '${clinicalDiagnosisA1}'::uuid, 'предварительный', '${orgA}'::uuid),
  ('${clinicalDiagnosisStatusHistoryA2}'::uuid, '${clinicalDiagnosisA2}'::uuid, 'предварительный', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

-- treatment program chain: instances carry patient_user_id; events (1-hop) and stage_items (2-hop
-- through instance_stages, which has no direct patient column of its own) chain to them.
INSERT INTO treatment_program_instances (id, patient_user_id, title, status, organization_id) VALUES
  ('${treatmentInstanceA1}'::uuid, '${patientA1}'::uuid, 'ti-a1', 'active', '${orgA}'::uuid),
  ('${treatmentInstanceA2}'::uuid, '${patientA2}'::uuid, 'ti-a2', 'active', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO treatment_program_instance_stages (id, instance_id, title, status, organization_id) VALUES
  ('${treatmentInstanceStageA1}'::uuid, '${treatmentInstanceA1}'::uuid, 's-a1', 'locked', '${orgA}'::uuid),
  ('${treatmentInstanceStageA2}'::uuid, '${treatmentInstanceA2}'::uuid, 's-a2', 'locked', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO treatment_program_instance_stage_items (id, stage_id, item_type, item_ref_id, snapshot, organization_id) VALUES
  ('${treatmentInstanceStageItemA1}'::uuid, '${treatmentInstanceStageA1}'::uuid, 'exercise', gen_random_uuid(), '{}'::jsonb, '${orgA}'::uuid),
  ('${treatmentInstanceStageItemA2}'::uuid, '${treatmentInstanceStageA2}'::uuid, 'exercise', gen_random_uuid(), '{}'::jsonb, '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO treatment_program_events (id, instance_id, event_type, target_type, target_id, organization_id) VALUES
  ('${treatmentEventA1}'::uuid, '${treatmentInstanceA1}'::uuid, 'status_changed', 'program', '${treatmentInstanceA1}'::uuid, '${orgA}'::uuid),
  ('${treatmentEventA2}'::uuid, '${treatmentInstanceA2}'::uuid, 'status_changed', 'program', '${treatmentInstanceA2}'::uuid, '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

-- test chain: test_attempts carry patient_user_id; test_results chain to them.
INSERT INTO tests (id, title) VALUES ('${testCatalogRow}'::uuid, 'B6 Test') ON CONFLICT (id) DO NOTHING;

INSERT INTO test_attempts (id, instance_stage_item_id, patient_user_id) VALUES
  ('${testAttemptA1}'::uuid, '${treatmentInstanceStageItemA1}'::uuid, '${patientA1}'::uuid),
  ('${testAttemptA2}'::uuid, '${treatmentInstanceStageItemA2}'::uuid, '${patientA2}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO test_results (id, attempt_id, test_id, raw_value, normalized_decision, organization_id) VALUES
  ('${testResultA1}'::uuid, '${testAttemptA1}'::uuid, '${testCatalogRow}'::uuid, '{}'::jsonb, 'passed', '${orgA}'::uuid),
  ('${testResultA2}'::uuid, '${testAttemptA2}'::uuid, '${testCatalogRow}'::uuid, '{}'::jsonb, 'passed', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

-- lfk chain: lfk_complexes carry platform_user_id; lfk_complex_exercises chain to them.
INSERT INTO lfk_exercises (id, title) VALUES ('${lfkExerciseCatalogRow}'::uuid, 'B6 Exercise') ON CONFLICT (id) DO NOTHING;

INSERT INTO lfk_complexes (id, user_id, platform_user_id, title, origin) VALUES
  ('${lfkComplexA1}'::uuid, '${patientA1}', '${patientA1}'::uuid, 'lc-a1', 'manual'),
  ('${lfkComplexA2}'::uuid, '${patientA2}', '${patientA2}'::uuid, 'lc-a2', 'manual')
ON CONFLICT (id) DO NOTHING;

INSERT INTO lfk_complex_exercises (id, complex_id, exercise_id, organization_id) VALUES
  ('${lfkComplexExerciseA1}'::uuid, '${lfkComplexA1}'::uuid, '${lfkExerciseCatalogRow}'::uuid, '${orgA}'::uuid),
  ('${lfkComplexExerciseA2}'::uuid, '${lfkComplexA2}'::uuid, '${lfkExerciseCatalogRow}'::uuid, '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

-- direct-column (0172 "missed" category): media_playback_client_events.user_id is the patient owner.
INSERT INTO media_playback_client_events (id, media_id, user_id, event_class, organization_id) VALUES
  ('${mediaPlaybackEventA1}'::uuid, '${mediaFileDummy}'::uuid, '${patientA1}'::uuid, 'hls_fatal', '${orgA}'::uuid),
  ('${mediaPlaybackEventA2}'::uuid, '${mediaFileDummy}'::uuid, '${patientA2}'::uuid, 'hls_fatal', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

-- direct-column (0173 audit correction): media_upload_sessions.owner_user_id is the patient owner.
INSERT INTO media_upload_sessions
  (id, media_id, s3_key, upload_id, owner_user_id, expected_size_bytes, mime_type, part_size_bytes, expires_at, organization_id) VALUES
  ('${uploadSessionA1}'::uuid, '${mediaFileDummy}'::uuid, 's3/a1', 'up-a1', '${patientA1}'::uuid, 1024, 'video/mp4', 5242880, now() + interval '1 day', '${orgA}'::uuid),
  ('${uploadSessionA2}'::uuid, '${mediaFileDummy}'::uuid, 's3/a2', 'up-a2', '${patientA2}'::uuid, 1024, 'video/mp4', 5242880, now() + interval '1 day', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;
`;

// ---------------------------------------------------------------------------
// B4-core-4 (taskdb #660): fixtures for the 3 conditional/polymorphic patient-wall targets, all in
// org A (isolation proven patient-vs-patient, same shape as the B4-core-3 sample above; org-level
// isolation for direct_org_column/denorm_org_column/polymorphic_resolver is already proven
// generically elsewhere in this smoke).
// ---------------------------------------------------------------------------
const b4c4SeedSql = `
-- media_files: one shared/library row (uploaded_by = staff doctor A, usage_purpose NULL --
-- visible to every patient in the org) + one submission row per patient (usage_purpose =
-- 'program_item_submission', uploaded_by = that patient -- visible ONLY to that patient).
INSERT INTO media_files (id, original_name, stored_path, mime_type, size_bytes, uploaded_by, usage_purpose, organization_id) VALUES
  ('${mediaFileSharedA}'::uuid, 'shared.mp4', 's3/shared.mp4', 'video/mp4', 1024, '${doctorA}'::uuid, NULL, '${orgA}'::uuid),
  ('${mediaFileSubmissionA1}'::uuid, 'a1-submission.mp4', 's3/a1-sub.mp4', 'video/mp4', 1024, '${patientA1}'::uuid, 'program_item_submission', '${orgA}'::uuid),
  ('${mediaFileSubmissionA2}'::uuid, 'a2-submission.mp4', 's3/a2-sub.mp4', 'video/mp4', 1024, '${patientA2}'::uuid, 'program_item_submission', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

-- media_transcode_jobs: no ownership column of its own -- inherits media_files' conditional
-- ownership via media_id. One job per media_files row above.
INSERT INTO media_transcode_jobs (id, media_id, status, organization_id) VALUES
  ('${transcodeJobSharedA}'::uuid, '${mediaFileSharedA}'::uuid, 'pending', '${orgA}'::uuid),
  ('${transcodeJobSubmissionA1}'::uuid, '${mediaFileSubmissionA1}'::uuid, 'pending', '${orgA}'::uuid),
  ('${transcodeJobSubmissionA2}'::uuid, '${mediaFileSubmissionA2}'::uuid, 'pending', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;

-- comments: one catalog/shared target_type ('exercise', visible to any org member regardless of
-- patient identity) + patient-instance comments at the two ends of the registered hop-depth
-- spectrum -- program_instance (1-hop, target_id = treatmentInstanceA1/A2.id directly) and
-- stage_item_instance (3-hop, target_id = treatmentInstanceStageItemA1/A2.id, chains down through
-- treatment_program_instance_stages -> treatment_program_instances to reach patient_user_id).
-- author_id is the (staff) doctor for all of them -- proving ownership resolves through the
-- TARGET, never the author.
INSERT INTO comments (id, author_id, target_type, target_id, comment_type, body, organization_id) VALUES
  ('${commentCatalogShared}'::uuid, '${doctorA}'::uuid, 'exercise', '${lfkExerciseCatalogRow}'::uuid, 'template', 'catalog note', '${orgA}'::uuid),
  ('${commentProgramA1}'::uuid, '${doctorA}'::uuid, 'program_instance', '${treatmentInstanceA1}'::uuid, 'clinical_note', 'note on A1 program', '${orgA}'::uuid),
  ('${commentProgramA2}'::uuid, '${doctorA}'::uuid, 'program_instance', '${treatmentInstanceA2}'::uuid, 'clinical_note', 'note on A2 program', '${orgA}'::uuid),
  ('${commentStageItemA1}'::uuid, '${doctorA}'::uuid, 'stage_item_instance', '${treatmentInstanceStageItemA1}'::uuid, 'clinical_note', 'note on A1 stage item', '${orgA}'::uuid),
  ('${commentStageItemA2}'::uuid, '${doctorA}'::uuid, 'stage_item_instance', '${treatmentInstanceStageItemA2}'::uuid, 'clinical_note', 'note on A2 stage item', '${orgA}'::uuid)
ON CONFLICT (id) DO NOTHING;
`;

// ---------------------------------------------------------------------------
// B4-fanout gap closure (taskdb #656): generate the "own row visible, sibling patient's row NOT
// visible" proof shape across ALL chain-only targets programmatically instead of hand-duplicating
// near-identical psql blocks per table -- each entry names the table and a plain-SQL WHERE clause
// identifying patient A1's own row vs patient A2's row (same org, same table).
// ---------------------------------------------------------------------------
const INTEGRATOR_CHAIN_PROOFS = [
  { table: "integrator.conversations", ownWhere: `id = '${conversationA1}'`, otherWhere: `id = '${conversationA2}'` },
  { table: "integrator.message_drafts", ownWhere: `id = '${messageDraftA1}'`, otherWhere: `id = '${messageDraftA2}'` },
  { table: "integrator.user_questions", ownWhere: `id = '${userQuestionA1}'`, otherWhere: `id = '${userQuestionA2}'` },
  { table: "integrator.conversation_messages", ownWhere: `id = '${conversationMessageA1}'`, otherWhere: `id = '${conversationMessageA2}'` },
  { table: "integrator.question_messages", ownWhere: `id = '${questionMessageA1}'`, otherWhere: `id = '${questionMessageA2}'` },
  { table: "integrator.user_reminder_occurrences", ownWhere: `id = 'b6-occ-a1'`, otherWhere: `id = '${reminderOccurrenceA2}'` },
  { table: "integrator.user_reminder_delivery_logs", ownWhere: `id = 'b6-log-a1'`, otherWhere: `id = '${reminderDeliveryLogA2}'` },
];

const SUPPORT_CHAIN_PROOFS = [
  { table: "public.support_questions", ownWhere: `id = '${supportQuestionA1}'::uuid`, otherWhere: `id = '${supportQuestionA2}'::uuid` },
  { table: "public.support_conversation_messages", ownWhere: `id = '${supportConversationMessageA1}'::uuid`, otherWhere: `id = '${supportConversationMessageA2}'::uuid` },
  { table: "public.support_question_messages", ownWhere: `id = '${supportQuestionMessageA1}'::uuid`, otherWhere: `id = '${supportQuestionMessageA2}'::uuid` },
  { table: "public.support_delivery_events", ownWhere: `id = '${supportDeliveryEventA1}'::uuid`, otherWhere: `id = '${supportDeliveryEventA2}'::uuid` },
];

// B4-core-3 (taskdb #658): the representative sample of newly-walled tables (0171 + 0172 + the
// 0173 media_upload_sessions audit correction). All are webapp/uuid chains or direct uuid columns,
// so they read the app.patient_user_id GUC (same as the support family) and slot into the SAME
// staff/mixed/empty proof harness below. A1 and A2 are two patients in the SAME org (org A), so
// each "own visible / other NOT visible" pair is a real A1<>A2 wall test (not merely A-vs-B).
const B4_CORE_3_CHAIN_PROOFS = [
  { table: "public.online_intake_answers", ownWhere: `id = '${intakeAnswerA1}'::uuid`, otherWhere: `id = '${intakeAnswerA2}'::uuid` },
  { table: "public.online_intake_attachments", ownWhere: `id = '${intakeAttachmentA1}'::uuid`, otherWhere: `id = '${intakeAttachmentA2}'::uuid` },
  { table: "public.online_intake_status_history", ownWhere: `id = '${intakeStatusHistoryA1}'::uuid`, otherWhere: `id = '${intakeStatusHistoryA2}'::uuid` },
  { table: "public.clinical_complaint_update", ownWhere: `id = '${clinicalComplaintUpdateA1}'::uuid`, otherWhere: `id = '${clinicalComplaintUpdateA2}'::uuid` },
  { table: "public.clinical_diagnosis_update", ownWhere: `id = '${clinicalDiagnosisUpdateA1}'::uuid`, otherWhere: `id = '${clinicalDiagnosisUpdateA2}'::uuid` },
  { table: "public.clinical_diagnosis_status_history", ownWhere: `id = '${clinicalDiagnosisStatusHistoryA1}'::uuid`, otherWhere: `id = '${clinicalDiagnosisStatusHistoryA2}'::uuid` },
  { table: "public.test_results", ownWhere: `id = '${testResultA1}'::uuid`, otherWhere: `id = '${testResultA2}'::uuid` },
  { table: "public.treatment_program_instance_stages", ownWhere: `id = '${treatmentInstanceStageA1}'::uuid`, otherWhere: `id = '${treatmentInstanceStageA2}'::uuid` },
  { table: "public.treatment_program_instance_stage_items", ownWhere: `id = '${treatmentInstanceStageItemA1}'::uuid`, otherWhere: `id = '${treatmentInstanceStageItemA2}'::uuid` },
  { table: "public.treatment_program_events", ownWhere: `id = '${treatmentEventA1}'::uuid`, otherWhere: `id = '${treatmentEventA2}'::uuid` },
  { table: "public.lfk_complex_exercises", ownWhere: `id = '${lfkComplexExerciseA1}'::uuid`, otherWhere: `id = '${lfkComplexExerciseA2}'::uuid` },
  { table: "public.media_playback_client_events", ownWhere: `id = '${mediaPlaybackEventA1}'::uuid`, otherWhere: `id = '${mediaPlaybackEventA2}'::uuid` },
  { table: "public.media_upload_sessions", ownWhere: `id = '${uploadSessionA1}'::uuid`, otherWhere: `id = '${uploadSessionA2}'::uuid` },
];

// B4-core-4 (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #660): the 3
// conditional/polymorphic patient-wall targets found by the independent audit. Same
// own-visible/other-NOT-visible harness shape as B4_CORE_3_CHAIN_PROOFS above (the generic
// renderChain*ProofSql functions below don't care WHICH predicate shape is behind a table — direct
// column, EXISTS chain, conditional dual-role, or polymorphic — they only assert on row visibility).
// media_files/media_transcode_jobs proofs here use each table's SUBMISSION row (own vs the other
// patient's submission) -- the SHARED/library row is proven separately below (visible to BOTH
// patients, not an own-vs-other split). comments proofs cover both hop-depth extremes registered in
// patientPolymorphicOwnedTables (program_instance = 1 hop, stage_item_instance = 3 hops).
const B4_CORE_4_PROOFS = [
  { table: "public.media_files", ownWhere: `id = '${mediaFileSubmissionA1}'::uuid`, otherWhere: `id = '${mediaFileSubmissionA2}'::uuid` },
  { table: "public.media_transcode_jobs", ownWhere: `id = '${transcodeJobSubmissionA1}'::uuid`, otherWhere: `id = '${transcodeJobSubmissionA2}'::uuid` },
  { table: "public.comments", ownWhere: `id = '${commentProgramA1}'::uuid`, otherWhere: `id = '${commentProgramA2}'::uuid` },
  { table: "public.comments", ownWhere: `id = '${commentStageItemA1}'::uuid`, otherWhere: `id = '${commentStageItemA2}'::uuid` },
];

function renderChainOwnNotOtherProofSql(proofs, { label }) {
  return proofs
    .map(({ table, ownWhere, otherWhere }, index) => {
      // Short, collision-free var names -- Postgres truncates result-column aliases (hence
      // \gset variable names) at 63 bytes; embedding the full schema.table name here overflowed
      // that limit and caused \gset to silently create a DIFFERENT (truncated) variable than the
      // one \if referenced, always evaluating as unset. The table name is still shown in \echo.
      const ownVar = `co_${label}_${index}`;
      const otherVar = `cx_${label}_${index}`;
      return [
        `SELECT (count(*) > 0)::int AS ${ownVar} FROM ${table} WHERE ${ownWhere} \\gset`,
        `\\if :${ownVar}`,
        `\\else`,
        `\\echo 'FATAL (${label}): patient A1 must see its own row in ${table}.'`,
        `SELECT 1/0; -- forces a real error under ON_ERROR_STOP (psql 16's \\quit does not honor an exit-status arg)`,
        `\\endif`,
        `SELECT (count(*) > 0)::int AS ${otherVar} FROM ${table} WHERE ${otherWhere} \\gset`,
        `\\if :${otherVar}`,
        `\\echo 'FATAL (${label}): patient A1 must NOT see patient A2 row in ${table} (chain-only gap must stay closed).'`,
        `SELECT 1/0; -- forces a real error under ON_ERROR_STOP (psql 16's \\quit does not honor an exit-status arg)`,
        `\\endif`,
      ].join("\n");
    })
    .join("\n");
}

function renderChainBothVisibleProofSql(proofs, { label }) {
  return proofs
    .map(({ table, ownWhere, otherWhere }, index) => {
      const ownVar = `so_${label}_${index}`;
      const otherVar = `sx_${label}_${index}`;
      return [
        `SELECT (count(*) > 0)::int AS ${ownVar} FROM ${table} WHERE ${ownWhere} \\gset`,
        `\\if :${ownVar}`,
        `\\else`,
        `\\echo 'FATAL (${label}): staff must see patient A1 row in ${table} (org-wide, variant A).'`,
        `SELECT 1/0; -- forces a real error under ON_ERROR_STOP (psql 16's \\quit does not honor an exit-status arg)`,
        `\\endif`,
        `SELECT (count(*) > 0)::int AS ${otherVar} FROM ${table} WHERE ${otherWhere} \\gset`,
        `\\if :${otherVar}`,
        `\\else`,
        `\\echo 'FATAL (${label}): staff must ALSO see patient A2 row in ${table} (org-wide, variant A).'`,
        `SELECT 1/0; -- forces a real error under ON_ERROR_STOP (psql 16's \\quit does not honor an exit-status arg)`,
        `\\endif`,
      ].join("\n");
    })
    .join("\n");
}

function renderChainEmptyContextDeniesSql(proofs, { label }) {
  return proofs
    .map(({ table, ownWhere }, index) => {
      const denyVar = `em_${label}_${index}`;
      return [
        `SELECT (count(*) > 0)::int AS ${denyVar} FROM ${table} WHERE ${ownWhere} \\gset`,
        `\\if :${denyVar}`,
        `\\echo 'FATAL (${label}): empty actor/patient context must deny ${table} even with app.org set.'`,
        `SELECT 1/0; -- forces a real error under ON_ERROR_STOP (psql 16's \\quit does not honor an exit-status arg)`,
        `\\endif`,
      ].join("\n");
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Phase 6: NOBYPASSRLS role + grants, then assertions.
// ---------------------------------------------------------------------------
const appRoleIdent = quoteIdent(appRole);
const assertionSql = String.raw`
\set ON_ERROR_STOP on

SELECT (
  current_database() LIKE 'bcb_saas_%'
  OR current_database() ~ '(^|[_-])scratch([_-]|$)'
)::int AS r2_b6_scratch_db_ok \gset
\if :r2_b6_scratch_db_ok
\else
\echo 'FATAL: B6 real-policy smoke must run only on a scratch/SaaS proof database.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT (current_database() ~ 'bcb_webapp_(dev|prod|test)')::int AS r2_b6_runtime_db \gset
\if :r2_b6_runtime_db
\echo 'FATAL: B6 real-policy smoke refuses dev/prod/test application databases.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

CREATE ROLE ${appRoleIdent} NOLOGIN NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, integrator TO ${appRoleIdent};
GRANT SELECT ON
  public.org_enrollments,
  public.be_package_items,
  public.be_subscription_packages,
  public.be_clinic_services,
  public.notification_delivery_attempts,
  public.system_settings,
  public.be_organization_members,
  integrator.content_access_grants,
  integrator.user_reminder_delivery_logs,
  integrator.user_reminder_occurrences,
  integrator.user_reminder_rules,
  integrator.identities,
  integrator.conversations,
  integrator.message_drafts,
  integrator.conversation_messages,
  integrator.user_questions,
  integrator.question_messages,
  public.support_conversations,
  public.support_questions,
  public.support_conversation_messages,
  public.support_question_messages,
  public.support_delivery_events,
  -- B4-core-3 (taskdb #658): the 13 flipped targets + their (non-flipped) chain-parent tables the
  -- EXISTS subqueries must read.
  public.online_intake_requests,
  public.online_intake_answers,
  public.online_intake_attachments,
  public.online_intake_status_history,
  public.clinical_complaint,
  public.clinical_complaint_update,
  public.clinical_diagnosis,
  public.clinical_diagnosis_update,
  public.clinical_diagnosis_status_history,
  public.treatment_program_instances,
  public.treatment_program_instance_stages,
  public.treatment_program_instance_stage_items,
  public.treatment_program_events,
  public.test_attempts,
  public.test_results,
  public.lfk_complexes,
  public.lfk_complex_exercises,
  public.media_playback_client_events,
  public.media_upload_sessions,
  -- B4-core-4 (taskdb #660): the 3 conditional/polymorphic patient-wall targets.
  public.media_files,
  public.media_transcode_jobs,
  public.comments
TO ${appRoleIdent};

SET ROLE ${appRoleIdent};
SET row_security = on;

-- B4-core: everything below through the "org A / org B" section runs as a STAFF session
-- (org-wide visibility, owner decision variant A — no assignment predicate). The dedicated
-- patient-session assertions (app.actor='patient' + app.patient_user_id) come after.
SET app.actor = 'staff';

SELECT (rolbypassrls = false)::int AS app_role_nobypass_ok FROM pg_roles WHERE rolname = '${appRole}' \gset
\if :app_role_nobypass_ok
\else
\echo 'FATAL: B6 app role must be NOBYPASSRLS.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

-- FINDING (documented, not fudged): be_organization_members has no RLS at all under the real
-- migrations (BOOTSTRAP/bootstrap_global tier, no policy file ever targets it).
RESET ROLE;
SELECT (relrowsecurity)::int AS be_org_members_rowsecurity FROM pg_class
  WHERE oid = 'public.be_organization_members'::regclass \gset
\if :be_org_members_rowsecurity
\echo 'UNEXPECTED: be_organization_members now has row security enabled — re-check the substitution finding.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\else
\echo 'FINDING CONFIRMED: public.be_organization_members has RLS DISABLED under real migrations (BOOTSTRAP/bootstrap_global, no policy). Not usable as the direct-org example; org_enrollments substituted.'
\endif
SET ROLE ${appRoleIdent};

-- fail-closed: no app.org set at all
RESET app.org;
SELECT (count(*) > 0)::int AS missing_org_enrollments_count FROM public.org_enrollments \gset
\if :missing_org_enrollments_count
\echo 'FATAL: missing app.org must fail closed for org_enrollments (direct-org, enforce mode).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT (count(*) > 0)::int AS missing_org_package_items_count FROM public.be_package_items \gset
\if :missing_org_package_items_count
\echo 'FATAL: missing app.org must fail closed for be_package_items (fk-path, enforce mode).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT (count(*) > 0)::int AS missing_org_notif_count FROM public.notification_delivery_attempts \gset
\if :missing_org_notif_count
\echo 'FATAL: missing app.org must fail closed for notification_delivery_attempts (denorm, enforce mode).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT (count(*) > 0)::int AS missing_org_cag_count FROM integrator.content_access_grants \gset
\if :missing_org_cag_count
\echo 'FATAL: missing app.org must fail closed for integrator.content_access_grants (enforce mode).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT (count(*) > 0)::int AS missing_org_rdl_count FROM integrator.user_reminder_delivery_logs \gset
\if :missing_org_rdl_count
\echo 'FATAL: missing app.org must fail closed for integrator.user_reminder_delivery_logs (enforce mode).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

-- bootstrap-hybrid: global row readable without app.org, org rows are not
SELECT (count(*) > 0)::int AS bootstrap_global_unset_count FROM public.system_settings
  WHERE key = 'b6_global_setting' AND organization_id IS NULL \gset
\if :bootstrap_global_unset_count
\else
\echo 'FATAL: bootstrap global system_settings row must remain readable without app.org.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT (count(*) > 0)::int AS bootstrap_org_unset_count FROM public.system_settings
  WHERE key = 'b6_org_setting' \gset
\if :bootstrap_org_unset_count
\echo 'FATAL: bootstrap org-scoped system_settings rows must NOT be readable without app.org.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

-- empty app.org ('') must also fail closed
SET app.org = '';
SELECT (count(*) > 0)::int AS empty_org_enrollments_count FROM public.org_enrollments \gset
\if :empty_org_enrollments_count
\echo 'FATAL: empty app.org must fail closed for org_enrollments.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

-- org A: sees own rows, not org B's, across all SCOPED families
SET app.org = '${orgA}';
SELECT (count(*) > 0)::int AS org_a_enrollments_count FROM public.org_enrollments \gset
\if :org_a_enrollments_count
\else
\echo 'FATAL: org A must see its own org_enrollments rows (direct-org).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS org_a_sees_b_enrollments FROM public.org_enrollments
  WHERE organization_id = '${orgB}'::uuid \gset
\if :org_a_sees_b_enrollments
\echo 'FATAL: org A must NOT see org B org_enrollments rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT (count(*) > 0)::int AS org_a_package_items_count FROM public.be_package_items \gset
\if :org_a_package_items_count
\else
\echo 'FATAL: org A must see its own be_package_items rows (fk-path).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgB}';
SELECT (count(*) > 0)::int AS org_b_sees_a_package_items FROM public.be_package_items item
  JOIN public.be_subscription_packages pkg ON pkg.id = item.package_id
  WHERE pkg.organization_id = '${orgA}'::uuid \gset
\if :org_b_sees_a_package_items
\echo 'FATAL: org B must NOT see org A be_package_items rows (fk-path).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgA}';
SELECT (count(*) > 0)::int AS org_a_notif_count FROM public.notification_delivery_attempts \gset
\if :org_a_notif_count
\else
\echo 'FATAL: org A must see its own notification_delivery_attempts rows (denorm).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SET app.org = '${orgB}';
SELECT (count(*) > 0)::int AS org_b_sees_a_notif FROM public.notification_delivery_attempts
  WHERE organization_id = '${orgA}'::uuid \gset
\if :org_b_sees_a_notif
\echo 'FATAL: org B must NOT see org A notification_delivery_attempts rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgA}';
SELECT (count(*) > 0)::int AS org_a_cag_count FROM integrator.content_access_grants \gset
\if :org_a_cag_count
\else
\echo 'FATAL: org A must see its own integrator.content_access_grants rows (integrator-bridge direct).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SET app.org = '${orgB}';
SELECT (count(*) > 0)::int AS org_b_sees_a_cag FROM integrator.content_access_grants
  WHERE organization_id = '${orgA}'::uuid \gset
\if :org_b_sees_a_cag
\echo 'FATAL: org B must NOT see org A integrator.content_access_grants rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgA}';
SELECT (count(*) > 0)::int AS org_a_rdl_count FROM integrator.user_reminder_delivery_logs \gset
\if :org_a_rdl_count
\else
\echo 'FATAL: org A must see its own integrator.user_reminder_delivery_logs rows (integrator-bridge denorm).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SET app.org = '${orgB}';
SELECT (count(*) > 0)::int AS org_b_sees_a_rdl FROM integrator.user_reminder_delivery_logs
  WHERE organization_id = '${orgA}'::uuid \gset
\if :org_b_sees_a_rdl
\echo 'FATAL: org B must NOT see org A integrator.user_reminder_delivery_logs rows.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgA}';
SELECT (count(*) > 0)::int AS org_a_sysset_count FROM public.system_settings
  WHERE key = 'b6_org_setting' AND organization_id = '${orgA}'::uuid \gset
\if :org_a_sysset_count
\else
\echo 'FATAL: org A must see its own system_settings org-scoped row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS org_a_sees_b_sysset FROM public.system_settings
  WHERE key = 'b6_org_setting' AND organization_id = '${orgB}'::uuid \gset
\if :org_a_sees_b_sysset
\echo 'FATAL: org A must NOT see org B system_settings org-scoped row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS org_a_sysset_global_count FROM public.system_settings
  WHERE key = 'b6_global_setting' AND organization_id IS NULL \gset
\if :org_a_sysset_global_count
\else
\echo 'FATAL: org A (with app.org set) must still see the global system_settings row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

-- B4-core proof (a): STAFF (app.actor='staff', set earlier) sees ALL patients in its own org —
-- org-wide visibility, owner decision variant A, no assignment predicate. Both patient A1's and
-- A2's notification_delivery_attempts rows are visible to staff under app.org=A.
SELECT (count(*) > 0)::int AS org_a_patient_rows_visible FROM public.notification_delivery_attempts
  WHERE organization_id = '${orgA}'::uuid \gset
\if :org_a_patient_rows_visible
\else
\echo 'FATAL: expected at least the seeded org A notification_delivery_attempts rows to be visible to staff.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS org_a_both_patients_visible FROM public.notification_delivery_attempts
  WHERE organization_id = '${orgA}'::uuid AND user_id IN ('${patientA1}'::uuid, '${patientA2}'::uuid) \gset
\if :org_a_both_patients_visible
\echo 'B4-core (a) CONFIRMED: staff (app.actor=staff) sees ALL org A patients (A1 and A2) in notification_delivery_attempts — org-wide, variant A.'
\else
\echo 'UNEXPECTED: patient rows not visible at all under matching app.org — re-check fixture seed.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

-- B4-core proof (b) + (c) + (d): patient-session isolation on the 3 now-patient-owned targets
-- (org_enrollments, notification_delivery_attempts, integrator.content_access_grants — the
-- latter proving the bigint integrator identity cast). Staff stays unaffected (already proven
-- above); everything from here on is a PATIENT session (app.actor='patient').

SET app.org = '${orgA}';
SET app.actor = 'patient';
SET app.patient_user_id = '${patientA1}';

SELECT (count(*) > 0)::int AS patient_a1_sees_own_enrollment FROM public.org_enrollments
  WHERE platform_user_id = '${patientA1}'::uuid \gset
\if :patient_a1_sees_own_enrollment
\else
\echo 'FATAL: patient A1 must see its own org_enrollments row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS patient_a1_sees_a2_enrollment FROM public.org_enrollments
  WHERE platform_user_id = '${patientA2}'::uuid \gset
\if :patient_a1_sees_a2_enrollment
\echo 'FATAL: patient A1 must NOT see patient A2 org_enrollments row (same org).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SELECT (count(*) > 0)::int AS patient_a1_sees_own_notif FROM public.notification_delivery_attempts
  WHERE user_id = '${patientA1}'::uuid \gset
\if :patient_a1_sees_own_notif
\else
\echo 'FATAL: patient A1 must see its own notification_delivery_attempts row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS patient_a1_sees_a2_notif FROM public.notification_delivery_attempts
  WHERE user_id = '${patientA2}'::uuid \gset
\if :patient_a1_sees_a2_notif
\echo 'FATAL: patient A1 must NOT see patient A2 notification_delivery_attempts row (same org).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.patient_user_id = '${patientA2}';
SELECT (count(*) > 0)::int AS patient_a2_sees_own_enrollment FROM public.org_enrollments
  WHERE platform_user_id = '${patientA2}'::uuid \gset
\if :patient_a2_sees_own_enrollment
\else
\echo 'FATAL: patient A2 must see its own org_enrollments row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS patient_a2_sees_a1_enrollment FROM public.org_enrollments
  WHERE platform_user_id = '${patientA1}'::uuid \gset
\if :patient_a2_sees_a1_enrollment
\echo 'FATAL: patient A2 must NOT see patient A1 org_enrollments row (same org).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

\echo 'B4-core (b) CONFIRMED: patient A1 <> A2 wall holds for org_enrollments and notification_delivery_attempts (same org, uuid platform_user_id/user_id).'

-- B4-core proof (c): empty context (app.org set correctly, but NEITHER staff NOR a valid patient
-- identity) must deny — 0 rows, on all three patient-owned targets.
RESET app.actor;
RESET app.patient_user_id;
SELECT (count(*) > 0)::int AS empty_context_enrollments FROM public.org_enrollments \gset
\if :empty_context_enrollments
\echo 'FATAL: empty app.actor/app.patient_user_id (app.org still set) must deny org_enrollments — neither staff nor patient identified.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS empty_context_notif FROM public.notification_delivery_attempts \gset
\if :empty_context_notif
\echo 'FATAL: empty app.actor/app.patient_user_id must deny notification_delivery_attempts.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS empty_context_cag FROM integrator.content_access_grants \gset
\if :empty_context_cag
\echo 'FATAL: empty app.actor/app.patient_user_id must deny integrator.content_access_grants.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
\echo 'B4-core (c) CONFIRMED: empty actor/patient context denies all 3 patient-owned targets even with app.org set.'

-- B4-core proof (d): the org wall still holds for a patient session — patient B1's own identity
-- is correct, but querying under the WRONG org (app.org=A, patient B1 actually belongs to org B)
-- must still deny (org predicate fails regardless of a valid-looking patient match).
SET app.actor = 'patient';
SET app.patient_user_id = '${patientB1}';
SELECT (count(*) > 0)::int AS wrong_org_patient_b1_enrollment FROM public.org_enrollments
  WHERE platform_user_id = '${patientB1}'::uuid \gset
\if :wrong_org_patient_b1_enrollment
\echo 'FATAL: patient B1 under app.org=A must NOT see its own (org B) org_enrollments row — org wall must hold.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.org = '${orgB}';
SELECT (count(*) > 0)::int AS right_org_patient_b1_enrollment FROM public.org_enrollments
  WHERE platform_user_id = '${patientB1}'::uuid \gset
\if :right_org_patient_b1_enrollment
\else
\echo 'FATAL: patient B1 under app.org=B (its real org) must see its own org_enrollments row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
\echo 'B4-core (d) CONFIRMED: org wall holds for patient sessions too — right patient + wrong org still denies.'

-- B4-fanout GUC alignment (taskdb #656): integrator bigint identity now reads the DEDICATED
-- app.integrator_user_id GUC (fixed from the previous, incorrect app.patient_user_id cast to
-- bigint), same A1/A2 isolation shape, on integrator.content_access_grants.
SET app.org = '${orgA}';
SET app.actor = 'patient';
RESET app.patient_user_id;
SET app.integrator_user_id = '${integratorUserA1}';
SELECT (count(*) > 0)::int AS patient_a1_sees_own_cag FROM integrator.content_access_grants
  WHERE user_id = ${integratorUserA1} \gset
\if :patient_a1_sees_own_cag
\else
\echo 'FATAL: integrator patient A1 must see its own content_access_grants row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS patient_a1_sees_a2_cag FROM integrator.content_access_grants
  WHERE user_id = ${integratorUserA2} \gset
\if :patient_a1_sees_a2_cag
\echo 'FATAL: integrator patient A1 must NOT see integrator patient A2 content_access_grants row (same org, bigint identity).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
\echo 'B4-fanout (bigint GUC) CONFIRMED: integrator.content_access_grants patient wall holds under app.integrator_user_id (not app.patient_user_id).'

-- B4-fanout gap closure (taskdb #656) proof (e): STAFF (org-wide, variant A) sees BOTH patient A1's
-- and patient A2's rows across all 11 chain-only targets (the 10 additional ones plus
-- integrator.user_reminder_delivery_logs, whose gap is now CLOSED, not merely documented-open).
SET app.actor = 'staff';
RESET app.patient_user_id;
RESET app.integrator_user_id;
${renderChainBothVisibleProofSql(INTEGRATOR_CHAIN_PROOFS, { label: "staff_integrator" })}
${renderChainBothVisibleProofSql(SUPPORT_CHAIN_PROOFS, { label: "staff_support" })}
${renderChainBothVisibleProofSql(B4_CORE_3_CHAIN_PROOFS, { label: "staff_b4c3" })}
${renderChainBothVisibleProofSql(B4_CORE_4_PROOFS, { label: "staff_b4c4" })}
\echo 'B4-fanout (e) CONFIRMED: staff sees both A1 and A2 rows across all chain-only targets (integrator I2/I3 + webapp support family).'
\echo 'B4-core-3 (e) CONFIRMED: staff sees both A1 and A2 rows across all 13 newly-walled representative targets (PHI clinical/intake/test/treatment/lfk chains + media_playback + media_upload_sessions direct columns).'
\echo 'B4-core-4 (e) CONFIRMED: staff sees both A1 and A2 submission rows across media_files/media_transcode_jobs (conditional) and comments (polymorphic, both hop-depth variants).'

-- B4-fanout gap closure proof (f): a SINGLE MIXED patient session -- app.patient_user_id (uuid,
-- webapp identity) AND app.integrator_user_id (bigint, integrator identity) set SIMULTANEOUSLY --
-- sees ONLY patient A1's own rows across BOTH identity spaces (webapp support family via the uuid
-- GUC, integrator I2/I3 chain-only family via the bigint GUC), never patient A2's, in either space.
SET app.org = '${orgA}';
SET app.actor = 'patient';
SET app.patient_user_id = '${patientA1}';
SET app.integrator_user_id = '${integratorUserA1}';
${renderChainOwnNotOtherProofSql(INTEGRATOR_CHAIN_PROOFS, { label: "mixed_integrator" })}
${renderChainOwnNotOtherProofSql(SUPPORT_CHAIN_PROOFS, { label: "mixed_support" })}
${renderChainOwnNotOtherProofSql(B4_CORE_3_CHAIN_PROOFS, { label: "mixed_b4c3" })}
${renderChainOwnNotOtherProofSql(B4_CORE_4_PROOFS, { label: "mixed_b4c4" })}
\echo 'B4-core-3 (f) CONFIRMED: the mixed patient A1 session sees ONLY its own row (never A2, same org) across all 13 newly-walled representative targets -- PHI clinical_*_update/diagnosis_status_history/test_results/treatment_program_instance_stages/stage_items/events/online_intake_*/lfk_complex_exercises + media_playback_client_events + media_upload_sessions direct columns.'
\echo 'B4-core-4 (f) CONFIRMED: the mixed patient A1 session sees ONLY its own submission row (never A2, same org) across media_files/media_transcode_jobs (conditional) and comments (polymorphic, both hop-depth variants).'

-- B4-core-4 proof (i): the SHARED/library branch is visible to EITHER patient (not gated by
-- ownership) -- this is the half of the conditional/polymorphic predicate the own-vs-other harness
-- above does not exercise (it only proves the submission/patient-instance half). Still under the
-- SAME patient A1 session set up for proof (f) above.
SELECT (count(*) > 0)::int AS patient_a1_sees_shared_media FROM public.media_files
  WHERE id = '${mediaFileSharedA}'::uuid \gset
\if :patient_a1_sees_shared_media
\else
\echo 'FATAL: patient A1 must see the shared/library media_files row (usage_purpose IS NULL, not a submission).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS patient_a1_sees_shared_transcode FROM public.media_transcode_jobs
  WHERE id = '${transcodeJobSharedA}'::uuid \gset
\if :patient_a1_sees_shared_transcode
\else
\echo 'FATAL: patient A1 must see the transcode job for the shared/library media_files row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS patient_a1_sees_catalog_comment FROM public.comments
  WHERE id = '${commentCatalogShared}'::uuid \gset
\if :patient_a1_sees_catalog_comment
\else
\echo 'FATAL: patient A1 must see the catalog/shared (target_type=exercise) comment.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif

SET app.patient_user_id = '${patientA2}';
RESET app.integrator_user_id;
SELECT (count(*) > 0)::int AS patient_a2_sees_shared_media FROM public.media_files
  WHERE id = '${mediaFileSharedA}'::uuid \gset
\if :patient_a2_sees_shared_media
\else
\echo 'FATAL: patient A2 must ALSO see the shared/library media_files row (org-wide, not gated by uploader identity).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS patient_a2_sees_own_submission FROM public.media_files
  WHERE id = '${mediaFileSubmissionA2}'::uuid \gset
\if :patient_a2_sees_own_submission
\else
\echo 'FATAL: patient A2 must see its own media_files submission row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS patient_a2_sees_a1_submission FROM public.media_files
  WHERE id = '${mediaFileSubmissionA1}'::uuid \gset
\if :patient_a2_sees_a1_submission
\echo 'FATAL: patient A2 must NOT see patient A1''s media_files submission row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
\echo 'B4-core-4 (i) CONFIRMED: the shared/library media_files row and the catalog/shared comment are visible to BOTH patients (not gated by uploader/author identity), while each patient still sees only its OWN submission -- proving the conditional/polymorphic OR-branch is neither too narrow (blocking shared content) nor too wide (leaking another patients submission).'
SET app.patient_user_id = '${patientA1}';
SET app.integrator_user_id = '${integratorUserA1}';
-- Already-covered families (direct/bridge, not chain-only) also hold under this SAME mixed session:
SELECT (count(*) > 0)::int AS mixed_own_enrollment FROM public.org_enrollments
  WHERE platform_user_id = '${patientA1}'::uuid \gset
\if :mixed_own_enrollment
\else
\echo 'FATAL (mixed session): patient A1 must see its own org_enrollments row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS mixed_other_enrollment FROM public.org_enrollments
  WHERE platform_user_id = '${patientA2}'::uuid \gset
\if :mixed_other_enrollment
\echo 'FATAL (mixed session): patient A1 must NOT see patient A2 org_enrollments row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS mixed_own_cag FROM integrator.content_access_grants
  WHERE user_id = ${integratorUserA1} \gset
\if :mixed_own_cag
\else
\echo 'FATAL (mixed session): patient A1 must see its own integrator.content_access_grants row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS mixed_other_cag FROM integrator.content_access_grants
  WHERE user_id = ${integratorUserA2} \gset
\if :mixed_other_cag
\echo 'FATAL (mixed session): patient A1 must NOT see patient A2 integrator.content_access_grants row.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
\echo 'B4-fanout (f) CONFIRMED: a single mixed patient session (uuid + bigint GUCs set together) sees ONLY its own rows across webapp AND integrator identity spaces, including all chain-only conversations/messages/reminders -- never A2, in either space.'

-- B4-fanout gap closure proof (g): empty actor/patient context (app.org still set, neither staff
-- nor a valid patient identity) denies across the chain-only targets too, not just the direct/bridge
-- ones already proven in proof (c).
RESET app.actor;
RESET app.patient_user_id;
RESET app.integrator_user_id;
${renderChainEmptyContextDeniesSql(INTEGRATOR_CHAIN_PROOFS, { label: "empty_integrator" })}
${renderChainEmptyContextDeniesSql(SUPPORT_CHAIN_PROOFS, { label: "empty_support" })}
${renderChainEmptyContextDeniesSql(B4_CORE_3_CHAIN_PROOFS, { label: "empty_b4c3" })}
${renderChainEmptyContextDeniesSql(B4_CORE_4_PROOFS, { label: "empty_b4c4" })}
\echo 'B4-fanout (g) CONFIRMED: empty actor/patient context denies all chain-only targets too, even with app.org set.'
\echo 'B4-core-3 (g) CONFIRMED: empty actor/patient context denies all 13 newly-walled representative targets too, even with app.org set.'
\echo 'B4-core-4 (g) CONFIRMED: empty actor/patient context denies media_files/media_transcode_jobs (conditional) and comments (polymorphic) submission rows too, even with app.org set.'

-- B4-core-4 proof (j): the two new predicate shapes deliberately differ on what an EMPTY
-- actor/patient context (app.org still set, neither staff nor a valid patient identity) does with
-- their shared/catalog branch -- this smoke asserts the ACTUAL, intended behavior of each (not a
-- single blanket rule), matching each descriptor's literal spec:
--   - media_files' conditional predicate wraps its ENTIRE patient-side OR (shared-or-own) behind
--     app.patient_user_id IS NOT NULL (see renderConditionalPatientPredicate) -- an empty context
--     denies the shared/library row too, same as it denies a submission row. A session must present
--     SOME patient identity (or be staff) to read media_files at all once app.org is set.
--   - comments' polymorphic predicate's catalog/shared branch (target_type = ANY(...)) has NO such
--     identity gate (see renderPolymorphicPatientPredicate) -- it is unconditionally visible once
--     org matches, same as any ordinary non-patient-owned SCOPED table (no extra staff-or-patient
--     check at all) and the SAME shape already established for public.media_folders' nullableShared
--     rows (column IS NULL OR staff-or-patient, unconditional once the row is shared). Only the 4
--     patient-INSTANCE target_type variants are identity-gated (each independently, inside its own
--     renderPatientChainPredicate) -- already proven denied under empty context above (proof g).
SELECT (count(*) > 0)::int AS empty_context_shared_media FROM public.media_files
  WHERE id = '${mediaFileSharedA}'::uuid \gset
\if :empty_context_shared_media
\echo 'FATAL: empty actor/patient context must deny the shared/library media_files row too (its whole patient-side OR requires app.patient_user_id).'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
SELECT (count(*) > 0)::int AS empty_context_catalog_comment FROM public.comments
  WHERE id = '${commentCatalogShared}'::uuid \gset
\if :empty_context_catalog_comment
\else
\echo 'FATAL: empty actor/patient context must still see the catalog/shared (target_type=exercise) comment -- it is org-wide, not patient-owned, no identity gate expected.'
SELECT 1/0; -- \quit's exit-status arg is unsupported on psql 16 here; force a real error under ON_ERROR_STOP instead
\endif
\echo 'B4-core-4 (j) CONFIRMED: media_files denies its shared row without a patient/staff identity (whole predicate identity-gated per spec); comments still permits its catalog/shared target_type without one (org-wide, same as ordinary non-patient-owned SCOPED content) -- both intended, neither leaks a PATIENT-INSTANCE row (already proven denied in proof g).'

\echo 'B6 real-policy isolation OK'
`;

try {
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);

  console.log("--- phase 1: minimal real webapp DDL ---");
  for (const relPath of WEBAPP_DDL_FILES) {
    console.log(`applying ${relPath}`);
    psql(readRepoFile(relPath));
  }

  console.log("--- phase 1b: B4-core-3 (taskdb #658) target tables + FK ancestors ---");
  for (const step of B4_CORE_3_DDL_STEPS) {
    const isFile = /^[a-zA-Z0-9._/-]+\.sql$/.test(step.trim());
    console.log(isFile ? `applying ${step.trim()}` : "applying inline B4-core-3 DDL excerpt");
    psql(resolveDdlStep(step));
  }

  console.log("--- phase 1c: B4-core-4 (taskdb #660) conditional/polymorphic target tables ---");
  for (const step of B4_CORE_4_DDL_STEPS) {
    psql(step);
  }

  console.log("--- phase 2: minimal real integrator core DDL (search_path=integrator,public) ---");
  psql("CREATE SCHEMA IF NOT EXISTS integrator;");
  for (const relPath of INTEGRATOR_DDL_FILES) {
    console.log(`applying ${relPath}`);
    psql(`SET search_path = integrator, public;\n${readRepoFile(relPath)}`);
  }

  console.log("--- phase 3: I1/I3/C1 + 0152 excerpts (org-column retrofit) ---");
  psql(orgRetrofitSql);

  console.log("--- phase 3b: B4-core-3 org-column + lfk_complexes.platform_user_id retrofit ---");
  psql(b4c3RetrofitSql);

  console.log("--- phase 3c: B4-core-4 org-column + usage_purpose retrofit ---");
  psql(b4c4RetrofitSql);

  console.log("--- phase 4: dormant RLS (extracted real blocks from 0161/0162/0163/0167/0174) ---");
  psql(dormantRlsSql);

  console.log("--- phase 5: simulate the flip (real p0-9-enforce-descriptors.mjs, mode enforce) ---");
  psql(enforceSql);

  console.log("--- phase 6: fixture seed ---");
  psql(seedSql);

  console.log("--- phase 6b: B4-core-3 fixture seed ---");
  psql(b4c3SeedSql);

  console.log("--- phase 6c: B4-core-4 fixture seed ---");
  psql(b4c4SeedSql);

  console.log("--- phase 7: NOBYPASSRLS role + assertions ---");
  psql(assertionSql);

  console.log(`smoke-r2-real-policy-isolation: OK (${dbName})`);
} finally {
  run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
    input: `DROP ROLE IF EXISTS ${appRoleIdent};\n`,
  });
}
