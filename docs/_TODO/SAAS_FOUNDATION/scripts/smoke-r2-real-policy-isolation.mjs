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
 *  - NO real SCOPED table's RLS predicate today references a per-patient column (there is a
 *    `renderPatientPredicate` building block in rls-sql-renderer.mjs, but it is only invoked by a unit
 *    test and by the OLD hand-written p0-13 smoke — never by rls-descriptor-model.mjs or
 *    p0-9-enforce-descriptors.mjs). Real enforcement today is ORG-LEVEL ONLY. This smoke explicitly
 *    proves that gap on `notification_delivery_attempts` (has both organization_id AND user_id
 *    columns; the real+enforced policy predicate uses organization_id only) instead of silently
 *    assuming patient isolation holds. This matches the plan's own still-open B4-core item
 *    ("resolve the patient-wall GUC semantics — PRODUCT decision").
 *
 * Scratch only. Guards refuse non-scratch/dev/prod/test databases, same as smoke-p0-13-db-isolation.mjs.
 * No push/deploy.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
];

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
`;

// ---------------------------------------------------------------------------
// Phase 4: dormant RLS — extracted verbatim blocks from the REAL 0161/0162/0163/0167 migrations.
// ---------------------------------------------------------------------------
const rls0161 = readRepoFile("apps/webapp/db/drizzle-migrations/0161_p0_8_4_public_path_rls.sql");
const rls0162 = readRepoFile("apps/webapp/db/drizzle-migrations/0162_p0_8_5_integrator_scoped_rls.sql");
const rls0163 = readRepoFile("apps/webapp/db/drizzle-migrations/0163_p0_8_6_bootstrap_hybrid_rls.sql");
const rls0167 = readRepoFile("apps/webapp/db/drizzle-migrations/0167_p0_8_3_org_enrollments_broadcast_drafts_rls.sql");

const dormantRlsSql = [
  selectRlsBlocks(rls0161, ["public.be_package_items", "public.notification_delivery_attempts"]),
  selectRlsBlocks(rls0162, ["integrator.content_access_grants", "integrator.user_reminder_delivery_logs"]),
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
`;

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
\quit 1
\endif

SELECT (current_database() ~ 'bcb_webapp_(dev|prod|test)')::int AS r2_b6_runtime_db \gset
\if :r2_b6_runtime_db
\echo 'FATAL: B6 real-policy smoke refuses dev/prod/test application databases.'
\quit 1
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
  integrator.user_reminder_rules
TO ${appRoleIdent};

SET ROLE ${appRoleIdent};
SET row_security = on;

SELECT (rolbypassrls = false)::int AS app_role_nobypass_ok FROM pg_roles WHERE rolname = '${appRole}' \gset
\if :app_role_nobypass_ok
\else
\echo 'FATAL: B6 app role must be NOBYPASSRLS.'
\quit 1
\endif

-- FINDING (documented, not fudged): be_organization_members has no RLS at all under the real
-- migrations (BOOTSTRAP/bootstrap_global tier, no policy file ever targets it).
RESET ROLE;
SELECT (relrowsecurity)::int AS be_org_members_rowsecurity FROM pg_class
  WHERE oid = 'public.be_organization_members'::regclass \gset
\if :be_org_members_rowsecurity
\echo 'UNEXPECTED: be_organization_members now has row security enabled — re-check the substitution finding.'
\quit 1
\else
\echo 'FINDING CONFIRMED: public.be_organization_members has RLS DISABLED under real migrations (BOOTSTRAP/bootstrap_global, no policy). Not usable as the direct-org example; org_enrollments substituted.'
\endif
SET ROLE ${appRoleIdent};

-- fail-closed: no app.org set at all
RESET app.org;
SELECT (count(*) > 0)::int AS missing_org_enrollments_count FROM public.org_enrollments \gset
\if :missing_org_enrollments_count
\echo 'FATAL: missing app.org must fail closed for org_enrollments (direct-org, enforce mode).'
\quit 1
\endif

SELECT (count(*) > 0)::int AS missing_org_package_items_count FROM public.be_package_items \gset
\if :missing_org_package_items_count
\echo 'FATAL: missing app.org must fail closed for be_package_items (fk-path, enforce mode).'
\quit 1
\endif

SELECT (count(*) > 0)::int AS missing_org_notif_count FROM public.notification_delivery_attempts \gset
\if :missing_org_notif_count
\echo 'FATAL: missing app.org must fail closed for notification_delivery_attempts (denorm, enforce mode).'
\quit 1
\endif

SELECT (count(*) > 0)::int AS missing_org_cag_count FROM integrator.content_access_grants \gset
\if :missing_org_cag_count
\echo 'FATAL: missing app.org must fail closed for integrator.content_access_grants (enforce mode).'
\quit 1
\endif

SELECT (count(*) > 0)::int AS missing_org_rdl_count FROM integrator.user_reminder_delivery_logs \gset
\if :missing_org_rdl_count
\echo 'FATAL: missing app.org must fail closed for integrator.user_reminder_delivery_logs (enforce mode).'
\quit 1
\endif

-- bootstrap-hybrid: global row readable without app.org, org rows are not
SELECT (count(*) > 0)::int AS bootstrap_global_unset_count FROM public.system_settings
  WHERE key = 'b6_global_setting' AND organization_id IS NULL \gset
\if :bootstrap_global_unset_count
\else
\echo 'FATAL: bootstrap global system_settings row must remain readable without app.org.'
\quit 1
\endif

SELECT (count(*) > 0)::int AS bootstrap_org_unset_count FROM public.system_settings
  WHERE key = 'b6_org_setting' \gset
\if :bootstrap_org_unset_count
\echo 'FATAL: bootstrap org-scoped system_settings rows must NOT be readable without app.org.'
\quit 1
\endif

-- empty app.org ('') must also fail closed
SET app.org = '';
SELECT (count(*) > 0)::int AS empty_org_enrollments_count FROM public.org_enrollments \gset
\if :empty_org_enrollments_count
\echo 'FATAL: empty app.org must fail closed for org_enrollments.'
\quit 1
\endif

-- org A: sees own rows, not org B's, across all SCOPED families
SET app.org = '${orgA}';
SELECT (count(*) > 0)::int AS org_a_enrollments_count FROM public.org_enrollments \gset
\if :org_a_enrollments_count
\else
\echo 'FATAL: org A must see its own org_enrollments rows (direct-org).'
\quit 1
\endif
SELECT (count(*) > 0)::int AS org_a_sees_b_enrollments FROM public.org_enrollments
  WHERE organization_id = '${orgB}'::uuid \gset
\if :org_a_sees_b_enrollments
\echo 'FATAL: org A must NOT see org B org_enrollments rows.'
\quit 1
\endif

SELECT (count(*) > 0)::int AS org_a_package_items_count FROM public.be_package_items \gset
\if :org_a_package_items_count
\else
\echo 'FATAL: org A must see its own be_package_items rows (fk-path).'
\quit 1
\endif

SET app.org = '${orgB}';
SELECT (count(*) > 0)::int AS org_b_sees_a_package_items FROM public.be_package_items item
  JOIN public.be_subscription_packages pkg ON pkg.id = item.package_id
  WHERE pkg.organization_id = '${orgA}'::uuid \gset
\if :org_b_sees_a_package_items
\echo 'FATAL: org B must NOT see org A be_package_items rows (fk-path).'
\quit 1
\endif

SET app.org = '${orgA}';
SELECT (count(*) > 0)::int AS org_a_notif_count FROM public.notification_delivery_attempts \gset
\if :org_a_notif_count
\else
\echo 'FATAL: org A must see its own notification_delivery_attempts rows (denorm).'
\quit 1
\endif
SET app.org = '${orgB}';
SELECT (count(*) > 0)::int AS org_b_sees_a_notif FROM public.notification_delivery_attempts
  WHERE organization_id = '${orgA}'::uuid \gset
\if :org_b_sees_a_notif
\echo 'FATAL: org B must NOT see org A notification_delivery_attempts rows.'
\quit 1
\endif

SET app.org = '${orgA}';
SELECT (count(*) > 0)::int AS org_a_cag_count FROM integrator.content_access_grants \gset
\if :org_a_cag_count
\else
\echo 'FATAL: org A must see its own integrator.content_access_grants rows (integrator-bridge direct).'
\quit 1
\endif
SET app.org = '${orgB}';
SELECT (count(*) > 0)::int AS org_b_sees_a_cag FROM integrator.content_access_grants
  WHERE organization_id = '${orgA}'::uuid \gset
\if :org_b_sees_a_cag
\echo 'FATAL: org B must NOT see org A integrator.content_access_grants rows.'
\quit 1
\endif

SET app.org = '${orgA}';
SELECT (count(*) > 0)::int AS org_a_rdl_count FROM integrator.user_reminder_delivery_logs \gset
\if :org_a_rdl_count
\else
\echo 'FATAL: org A must see its own integrator.user_reminder_delivery_logs rows (integrator-bridge denorm).'
\quit 1
\endif
SET app.org = '${orgB}';
SELECT (count(*) > 0)::int AS org_b_sees_a_rdl FROM integrator.user_reminder_delivery_logs
  WHERE organization_id = '${orgA}'::uuid \gset
\if :org_b_sees_a_rdl
\echo 'FATAL: org B must NOT see org A integrator.user_reminder_delivery_logs rows.'
\quit 1
\endif

SET app.org = '${orgA}';
SELECT (count(*) > 0)::int AS org_a_sysset_count FROM public.system_settings
  WHERE key = 'b6_org_setting' AND organization_id = '${orgA}'::uuid \gset
\if :org_a_sysset_count
\else
\echo 'FATAL: org A must see its own system_settings org-scoped row.'
\quit 1
\endif
SELECT (count(*) > 0)::int AS org_a_sees_b_sysset FROM public.system_settings
  WHERE key = 'b6_org_setting' AND organization_id = '${orgB}'::uuid \gset
\if :org_a_sees_b_sysset
\echo 'FATAL: org A must NOT see org B system_settings org-scoped row.'
\quit 1
\endif
SELECT (count(*) > 0)::int AS org_a_sysset_global_count FROM public.system_settings
  WHERE key = 'b6_global_setting' AND organization_id IS NULL \gset
\if :org_a_sysset_global_count
\else
\echo 'FATAL: org A (with app.org set) must still see the global system_settings row.'
\quit 1
\endif

-- FINDING (documented, not fudged): no real policy enforces per-patient isolation. With app.org=A
-- and NO patient GUC (none exists in the real renderer/descriptor model), BOTH patient A1's and
-- patient A2's notification_delivery_attempts rows are visible. This is the CORRECT, EXPECTED result
-- given today's real code (org-level only) — it is the B4-core "patient-wall GUC semantics" gap.
SELECT (count(*) > 0)::int AS org_a_patient_rows_visible FROM public.notification_delivery_attempts
  WHERE organization_id = '${orgA}'::uuid \gset
\if :org_a_patient_rows_visible
\else
\echo 'FATAL: expected at least the seeded org A notification_delivery_attempts rows to be visible.'
\quit 1
\endif
SELECT (count(*) > 0)::int AS org_a_both_patients_visible FROM public.notification_delivery_attempts
  WHERE organization_id = '${orgA}'::uuid AND user_id IN ('${patientA1}'::uuid, '${patientA2}'::uuid) \gset
\if :org_a_both_patients_visible
\echo 'FINDING CONFIRMED: no patient-wall in the real enforce-mode policy — both patient A1 and A2 rows visible under app.org=A alone (see B4-core, PRODUCT decision pending).'
\else
\echo 'UNEXPECTED: patient rows not visible at all under matching app.org — re-check fixture seed.'
\quit 1
\endif

\echo 'B6 real-policy isolation OK'
`;

try {
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);

  console.log("--- phase 1: minimal real webapp DDL ---");
  for (const relPath of WEBAPP_DDL_FILES) {
    console.log(`applying ${relPath}`);
    psql(readRepoFile(relPath));
  }

  console.log("--- phase 2: minimal real integrator core DDL (search_path=integrator,public) ---");
  psql("CREATE SCHEMA IF NOT EXISTS integrator;");
  for (const relPath of INTEGRATOR_DDL_FILES) {
    console.log(`applying ${relPath}`);
    psql(`SET search_path = integrator, public;\n${readRepoFile(relPath)}`);
  }

  console.log("--- phase 3: I1/I3/C1 + 0152 excerpts (org-column retrofit) ---");
  psql(orgRetrofitSql);

  console.log("--- phase 4: dormant RLS (extracted real blocks from 0161/0162/0163/0167) ---");
  psql(dormantRlsSql);

  console.log("--- phase 5: simulate the flip (real p0-9-enforce-descriptors.mjs, mode enforce) ---");
  psql(enforceSql);

  console.log("--- phase 6: fixture seed ---");
  psql(seedSql);

  console.log("--- phase 7: NOBYPASSRLS role + assertions ---");
  psql(assertionSql);

  console.log(`smoke-r2-real-policy-isolation: OK (${dbName})`);
} finally {
  run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
    input: `DROP ROLE IF EXISTS ${appRoleIdent};\n`,
  });
}
