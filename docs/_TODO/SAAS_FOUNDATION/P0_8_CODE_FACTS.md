> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).

# P0.8 Code Facts — RLS Descriptor/Policy Execution

> OWNER-SUPERSEDED 16.08.2026: this is a historical code-facts record. Scratch/disposable commands are not an
> active route; current execution is B0 plus forwards and named-DEV application-port verification.

Status: implementation support for P0.8.3+ execution briefs plus the P0.8.3/P0.8.4/P0.8.5/P0.8.6 real policy migrations.
Facts gathered from code on `codex/saas-roadmap-foundation` on 2026-07-08.

## Repository Rules That Affect P0.8

- Tests/builds must run through `bash /home/dev/orch/run-tests.sh "<command>"`.
- Normal P0 micro-stages use targeted gates, not full `pnpm run ci`.
- Full CI is reserved for deploy, merge/integration checkpoint, repo-level/global changes, or explicit owner request.
- Task state must be updated through `node /home/dev/brain/tools/taskdb.mjs`, never by direct SQL.
- No dev/prod DB writes, no `/opt/env/*`, no runtime role flip, no real deliveries.
- Scratch DB commands are retired and must not be reconstructed.

## Existing P0.8 Code Artifacts

| File                                                                             | Current responsibility                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs`                    | Builds 219 descriptors from `tiers-218.tsv`, `p0-4-batches.tsv`, and `p0-4-be-fk-paths.tsv`.                                                                                                                                                                                                                       |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-rls-descriptors.mjs`              | Verifies exact descriptor coverage, tier counts, bootstrap hybrid set, FK-path set, P0.8.3 parent-copy holds, and strict 103 public direct-org target count.                                                                                                                                                       |
| `docs/_TODO/SAAS_FOUNDATION/scripts/rls-sql-renderer.mjs`                        | Renders identifier-safe predicates for direct org, patient, bootstrap hybrid, policy targets, and P0.8.3-P0.8.6 policy DDL helpers.                                                                                                                                                                                |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-sql-renderer.mjs`                 | Pure predicate tests for dormant permissive and enforce modes. No DB access.                                                                                                                                                                                                                                       |
| `docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-3-policy-targets.mjs`                   | Lists/exports the strict 103-table P0.8.3 public direct-org target set and renders deterministic policy DDL from descriptors.                                                                                                                                                                                      |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-3-policy-generator.mjs`           | DB-free checker for exact 103-target coverage, parent-copy exclusions, and deterministic ENABLE/FORCE/DROP/CREATE policy statements.                                                                                                                                                                               |
| Retired pre-B0 scratch smoke (Git history only)                                  | OWNER-SUPERSEDED 16.08.2026. Not an active command or readiness proof. Runtime policy consequences belong to the serialized named-DEV application-port matrix.                                                                                  |
| `apps/webapp/db/drizzle-migrations/0160_p0_8_3_public_direct_org_rls.sql`        | Real Drizzle SQL migration generated from the P0.8.3 renderer after scratch smoke passed. Applies ENABLE/FORCE RLS and dormant permissive direct-org policy `saas_org_dormant_p0_8_3` to the strict 103 public direct-org target tables.                                                                           |
| `docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-4-policy-targets.mjs`                   | Lists/exports the strict 37-table P0.8.4 public FK/denorm path target set, keeps `public.comments` blocked behind P0.12.1, and renders deterministic policy DDL from descriptors.                                                                                                                                  |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-4-policy-generator.mjs`           | DB-free checker for exact 37-target coverage, FK/denorm split, `public.comments` exclusion, and deterministic ENABLE/FORCE/DROP/CREATE policy statements.                                                                                                                                                          |
| `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-4-public-path-policies.mjs`       | Scratch-only psql smoke runner. Uses `SCRATCH_DATABASE_URL`, refuses non-scratch DB names, creates synthetic denorm and FK-path public tables/roles, applies generated P0.8.4 policies, proves dormant unset/empty permit, org A/B isolation, and FK parent/service cross-org mismatch denial, then rolls back.    |
| `apps/webapp/db/drizzle-migrations/0161_p0_8_4_public_path_rls.sql`              | Real Drizzle SQL migration generated from the P0.8.4 renderer after scratch smoke passed. Applies ENABLE/FORCE RLS and dormant permissive policy `saas_org_dormant_p0_8_4` to the 2 public FK-path and 35 public denorm materialized-org target tables.                                                            |
| `docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-5-policy-targets.mjs`                   | Lists/exports the strict 13-table P0.8.5 integrator SCOPED target set split by P0.4.I1/I2/I3/I4 and renders deterministic policy DDL from descriptors.                                                                                                                                                             |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-5-policy-generator.mjs`           | DB-free checker for exact 13-target coverage, 5/3/4/1 P0.4 split, P0.4 source migration assertion tokens, and deterministic ENABLE/FORCE/DROP/CREATE policy statements.                                                                                                                                            |
| `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-5-integrator-scoped-policies.mjs` | Scratch-only psql smoke runner. Uses `SCRATCH_DATABASE_URL`, refuses non-scratch DB names, creates synthetic integrator schema tables/roles/bridge rows, applies generated P0.8.5 policies, proves dormant unset/empty permit, org A/B isolation, denorm source split behavior, and NOBYPASSRLS, then rolls back.  |
| `apps/webapp/db/drizzle-migrations/0162_p0_8_5_integrator_scoped_rls.sql`        | Real Drizzle SQL migration generated from the P0.8.5 renderer after scratch smoke passed. Applies ENABLE/FORCE RLS and dormant permissive policy `saas_org_dormant_p0_8_5` to the 13 integrator SCOPED target tables.                                                                                              |
| `docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-6-policy-targets.mjs`                   | Lists/exports the strict 4-table P0.8.6 BOOTSTRAP hybrid target set and renders deterministic policy DDL from descriptors.                                                                                                                                                                                         |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-6-policy-generator.mjs`           | DB-free checker for exact 4-target coverage and strict bootstrap hybrid global-or-matching-org policy statements.                                                                                                                                                                                                  |
| `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-6-bootstrap-hybrid-policies.mjs`  | Scratch-only psql smoke runner. Uses `SCRATCH_DATABASE_URL`, refuses non-scratch DB names, creates synthetic public + integrator schema tables/roles/rows, applies generated P0.8.6 policies, proves NOBYPASSRLS, unset/empty global-only visibility, and org A/B global+matching-org visibility, then rolls back. |
| `apps/webapp/db/drizzle-migrations/0163_p0_8_6_bootstrap_hybrid_rls.sql`         | Real Drizzle SQL migration generated from the P0.8.6 renderer after scratch smoke passed. Applies ENABLE/FORCE RLS and bootstrap hybrid policy `saas_bootstrap_hybrid_p0_8_6` to the strict 4 BOOTSTRAP hybrid target tables.                                                                                      |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-7-explicit-exemptions.mjs`        | DB-free checker for explicit INFRA/LEGACY/TELEMETRY exemptions and unsupported user-ref denial on INFRA/TELEMETRY. Uses static scope artifacts only and pins the prior audit-root leak class.                                                                                                                      |
| `scripts/check-saas-db-regression.mjs`                                           | Runs DB chokepoint, system settings, P0.4, P0.5, P0.8.1, P0.8.2, DB-free P0.8.3/P0.8.4/P0.8.5/P0.8.6 generator checks, and the P0.8.7 explicit exemption/user-ref denial check.                                                                                                                                    |
| `docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT_PROOF.sql`                        | Existing scratch-only psql proof pattern: DB-name guard, synthetic roles, `NOBYPASSRLS`, `ENABLE/FORCE RLS`, `SET LOCAL ROLE`, rollback.                                                                                                                                                                           |

## P0.8.3 Execution Status

P0.8.3 no longer lacks generator/scratch-smoke tooling or a committed real-table policy migration.
The real migration was created only after a scratch smoke pass in the same execution scope.

Current status:

- policy DDL renderer/generator: exists;
- exact P0.8.3 target export: exists and is checked by `check:saas-db-regression`;
- scratch-smoke runner: exists and passed on disposable `bcb_saas_*` databases before and after migration creation;
- committed migration for real table policies: `0160_p0_8_3_public_direct_org_rls.sql`;
- no runtime role/env/grant flip and no dev/prod/test application DB mutation were performed in the migration pass.

## P0.8.4 Execution Status

P0.8.4 has generator/scratch-smoke tooling and a committed real-table policy migration.
The real migration was created only after a scratch smoke pass in the same execution scope.

Current status:

- policy DDL renderer/generator: exists for public FK-path and denorm materialized-org descriptors;
- exact P0.8.4 target export: exists and is checked by `check:saas-db-regression`;
- scratch-smoke runner: exists and passed on disposable `bcb_saas_*` databases before and after migration creation;
- committed migration for real table policies: `0161_p0_8_4_public_path_rls.sql`;
- `public.comments` remains blocked because it is `polymorphic_resolver` and requires P0.12.1 before policy application;
- no runtime role/env/grant flip and no dev/prod/test application DB mutation were performed in the migration pass.

## P0.8.5 Execution Status

P0.8.5 has generator/scratch-smoke tooling and a real-table policy migration.
The real migration was created only after a scratch smoke pass in the same execution scope.

Current status:

- policy DDL renderer/generator: exists for integrator direct-org and denorm materialized-org descriptors;
- exact P0.8.5 target export: exists and is checked by `check:saas-db-regression`;
- scratch-smoke runner: exists and passed on disposable `bcb_saas_*` databases before and after migration creation;
- committed migration for real table policies: `0162_p0_8_5_integrator_scoped_rls.sql`;
- no bridge joins are recreated in policy; P0.4 materialized `organization_id` is the policy source;
- no runtime role/env/grant flip and no dev/prod/test application DB mutation were performed in the migration pass.

## P0.8.6 Execution Status

P0.8.6 has generator/scratch-smoke tooling and a real-table policy migration.
The real migration was created only after a scratch smoke pass in the same execution scope.

Current status:

- policy DDL renderer/generator: exists for BOOTSTRAP hybrid descriptors;
- exact P0.8.6 target export: exists and is checked by `check:saas-db-regression`;
- scratch-smoke runner: exists and passed on disposable `bcb_saas_*` databases before and after migration creation;
- committed migration for real table policies: `0163_p0_8_6_bootstrap_hybrid_rls.sql`;
- global `organization_id IS NULL` rows remain visible before org context; org rows require matching non-empty `app.org`;
- no admin Settings UI, mirror write path, `ALLOWED_KEYS`, runtime read/write path, role/env/grant, or app route/service/UI changes were made.

## P0.8.7 Execution Status

P0.8.7 has a deterministic DB-free guard and no policy migration.

Current status:

- all `INFRA`, `LEGACY`, and `TELEMETRY` descriptor rows must have `scopingKind=explicit_exemption`
  and a non-empty `source`;
- `INFRA` and `TELEMETRY` descriptors are denied if static artifacts show a FK/soft-ref/P0.4 scoped
  source tied to `platform_users`;
- the guard reproduces the prior leak class by asserting `public.admin_audit_log`,
  `public.broadcast_audit`, and `public.content_section_slug_history` remain `SCOPED` and covered by
  static user-ref/source artifacts;
- `LEGACY` remains frozen and is not retrofitted in this stage;
- no scratch DB, dev/prod/test application DB, runtime role/env/grant, app route/service/UI, or real
  policy migration was used.

## Current P0.8.3 Target Facts

The descriptor checker currently asserts:

- total descriptors: `219`;
- tier counts: `SCOPED=155`, `BOOTSTRAP=24`, `INFRA=22`, `LEGACY=16`, `TELEMETRY=2`;
- P0.8.3 strict public direct-org target count: `103`;
- P0.8.3 target composition:
  - `62` P0.4 public direct-org rows;
  - `41` existing `public.be_*` direct-org rows;
- parent-copy holds excluded from P0.8.3 and held for P0.8.4:
  - `public.content_section_slug_history`;
  - `public.media_transcode_jobs`;
  - `public.patient_daily_warmup_video_views`;
  - `public.reference_items`.

## Current P0.8.4 Target Facts

The P0.8.4 generator currently asserts:

- strict public FK/denorm path target count: `37`;
- target composition:
  - `2` FK-path `be_*` item rows: `public.be_package_items`, `public.be_patient_package_items`;
  - `35` public denorm materialized-org rows from P0.4 parent-copy/source batches;
- blocked polymorphic resolver set: `public.comments` only, with `requiresFollowupStage=P0.12.1`;
- included P0.8.3 parent-copy holds:
  - `public.content_section_slug_history`;
  - `public.media_transcode_jobs`;
  - `public.patient_daily_warmup_video_views`;
  - `public.reference_items`.

## Current P0.8.5 Target Facts

The P0.8.5 generator currently asserts:

- strict integrator SCOPED target count: `13`;
- P0.4 source split:
  - `5` direct user bridge rows: `integrator.contacts`, `integrator.content_access_grants`,
    `integrator.mailing_logs`, `integrator.user_reminder_rules`, `integrator.user_subscriptions`;
  - `3` identity bridge rows: `integrator.conversations`, `integrator.message_drafts`,
    `integrator.user_questions`;
  - `4` parent-denorm child rows: `integrator.conversation_messages`,
    `integrator.question_messages`, `integrator.user_reminder_delivery_logs`,
    `integrator.user_reminder_occurrences`;
  - `1` mailings root row: `integrator.mailings`;
- descriptor kind split: `9` `direct_org_column` + `4` `denorm_org_column`;
- every target uses materialized `organization_id`.

## Current P0.8.6 Target Facts

The P0.8.6 generator currently asserts:

- strict BOOTSTRAP hybrid target count: `4`;
- target set:
  - `integrator.system_settings`;
  - `public.platform_user_contacts`;
  - `public.system_settings`;
  - `public.user_phone_history`;
- descriptor kind split: `4` `bootstrap_hybrid`;
- every target uses nullable `organization_id`;
- predicate treats unset/empty `app.org` as pre-context: global rows only.

## Current P0.8.7 Target Facts

The P0.8.7 guard currently asserts:

- explicit exemption descriptors: `INFRA=22`, `LEGACY=16`, `TELEMETRY=2`;
- denied user-ref tiers: `INFRA` and `TELEMETRY` only;
- static user-ref/source artifacts used: `fk-edges.tsv`, `method-columns.tsv`,
  `all-218-signals.tsv`, and `p0-4-batches.tsv`;
- prior leak class pinned as SCOPED: `public.admin_audit_log`, `public.broadcast_audit`,
  `public.content_section_slug_history`.

## Migration/Journal Facts

- Webapp Drizzle migrations live in `apps/webapp/db/drizzle-migrations`.
- Journal guard: `apps/webapp/scripts/check-drizzle-journal-sync.sh`.
- Migration entrypoint: `apps/webapp/scripts/run-webapp-drizzle-migrate.mjs` via `pnpm --dir apps/webapp run migrate`.
- Drizzle config loads `apps/webapp/.env.dev` then `.env`; do not rely on this for scratch smoke because those env files can point at real dev data.
- Latest journal entries observed at this HEAD:
  - `0146_p0_4_p1_clinical_ehr_org`
  - `0147_p0_4_p2_treatment_program_org`
  - `0148_p0_4_p3_lfk_test_org`
  - `0149_p0_4_p4_diary_activity_org`
  - `0150_p0_4_p5_online_intake_org`
  - `0151_p0_4_p6_support_comms_org`
  - `0152_p0_4_p7_reminders_media_org`
  - `0153_p0_4_p8_catalog_content_audit_org`
  - `0154_p0_4_d_polymorphic_denorm_org`
  - `0155_p0_4_rc_reference_categories_org`
  - `0156_be_branches_color`
  - `0157_booking_services_break_after`
  - `0158_sync_booking_service_break_after_to_canonical`
  - `0159_be_package_usages_appointment_debit_unique`
  - `0160_p0_8_3_public_direct_org_rls`
  - `0161_p0_8_4_public_path_rls`
  - `0162_p0_8_5_integrator_scoped_rls`
  - `0163_p0_8_6_bootstrap_hybrid_rls`

- `0160` is the P0.8.3 policy migration after upstream `0159_be_package_usages_appointment_debit_unique.sql`.
- `0161` is the P0.8.4 public FK/denorm path policy migration.
- `0162` is the P0.8.5 integrator SCOPED policy migration.
- `0163` is the P0.8.6 BOOTSTRAP hybrid policy migration.
- The P0.8.3 migration has a matching `_journal.json` entry and passed
  `bash apps/webapp/scripts/check-drizzle-journal-sync.sh`.
- The P0.8.4 migration has a matching `_journal.json` entry and passed
  `bash apps/webapp/scripts/check-drizzle-journal-sync.sh`.
- The P0.8.5 migration has a matching `_journal.json` entry and passed
  `bash apps/webapp/scripts/check-drizzle-journal-sync.sh`.
- The P0.8.6 migration has a matching `_journal.json` entry and passed
  `bash apps/webapp/scripts/check-drizzle-journal-sync.sh`.

## Branch Drift Check Before Execution

Before implementing any P0.8.3+ stage, run:

```bash
git status --short --branch
git rev-list --left-right --count feat/doctor-ui-rebuild...codex/saas-roadmap-foundation
git log --oneline feat/doctor-ui-rebuild..codex/saas-roadmap-foundation
git log --oneline codex/saas-roadmap-foundation..feat/doctor-ui-rebuild
```

If `feat/doctor-ui-rebuild` has new migrations/schema changes, sync or explicitly record why the P0.8
stage is still safe on the current branch.

## Discovery Commands Already Used

```bash
bash /home/dev/brain/tools/codeq.sh "SaaS P0.8 RLS descriptor renderer scratch smoke migration policy scripts Drizzle migrations" --repo bcb --k 12
bash /home/dev/brain/tools/code-search.sh "ENABLE ROW LEVEL SECURITY" --repo bcb -k 20
bash /home/dev/brain/tools/code-search.sh "FORCE ROW LEVEL SECURITY" --repo bcb -k 20
bash /home/dev/brain/tools/code-search.sh "NOBYPASSRLS" --repo bcb -k 20
bash /home/dev/brain/tools/code-search.sh "drizzle-migrations" --repo bcb -k 20
```

The `ENABLE/FORCE ROW LEVEL SECURITY` searches found plan/proof references, not committed real-table
policy migrations for the SaaS target families.

## P0.8.3 Tooling Commands

DB-free target/generator check:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-3-policy-generator.mjs
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-3-policy-targets.mjs --targets
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-3-policy-targets.mjs --sql
```

OWNER-SUPERSEDED 16.08.2026: the scratch command and peer-auth workaround were removed. They must not be
reconstructed. DB-free renderer checks remain above; live consequences are covered by
`docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_MATRIX_2026-08-17.md` through the named DEV application
port, without a new database, schema, role, or SQL replay.

## P0.8.4 Tooling Commands

DB-free target/generator check:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-4-policy-generator.mjs
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-4-policy-targets.mjs --targets
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-4-policy-targets.mjs --fk-targets
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-4-policy-targets.mjs --denorm-targets
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-4-policy-targets.mjs --blocked-polymorphic
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-4-policy-targets.mjs --sql
```

Scratch smoke with a scratch URL accessible to the current shell user:

```bash
SCRATCH_DATABASE_URL="postgresql:///bcb_saas_p0_8_4_scratch" \
  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-4-public-path-policies.mjs
```

Local peer-auth workaround used on the dev host when only the OS `postgres` role can create/connect to
scratch DBs:

```bash
scratch_db="bcb_saas_p0_8_4_scratch_$(date +%s)_$$"
sudo -n -u postgres createdb "$scratch_db"
SCRATCH_DATABASE_URL="postgresql:///$scratch_db" \
  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-4-public-path-policies.mjs --print-sql \
  > /tmp/p0-8-4-smoke.sql
chmod 0644 /tmp/p0-8-4-smoke.sql
sudo -n -u postgres psql -q "postgresql:///$scratch_db" -f /tmp/p0-8-4-smoke.sql
sudo -n -u postgres dropdb --if-exists "$scratch_db"
rm -f /tmp/p0-8-4-smoke.sql
```

## P0.8.5 Tooling Commands

DB-free target/generator check:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-5-policy-generator.mjs
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-5-policy-targets.mjs --targets
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-5-policy-targets.mjs --i1-targets
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-5-policy-targets.mjs --i2-targets
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-5-policy-targets.mjs --i3-targets
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-5-policy-targets.mjs --i4-targets
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-5-policy-targets.mjs --sql
```

Scratch smoke with a scratch URL accessible to the current shell user:

```bash
SCRATCH_DATABASE_URL="postgresql:///bcb_saas_p0_8_5_scratch" \
  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-5-integrator-scoped-policies.mjs
```

Local peer-auth workaround used on the dev host when only the OS `postgres` role can create/connect to
scratch DBs:

```bash
scratch_db="bcb_saas_p0_8_5_scratch_$(date +%s)_$$"
sudo -n -u postgres createdb "$scratch_db"
SCRATCH_DATABASE_URL="postgresql:///$scratch_db" \
  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-5-integrator-scoped-policies.mjs --print-sql \
  > /tmp/p0-8-5-smoke.sql
chmod 0644 /tmp/p0-8-5-smoke.sql
sudo -n -u postgres psql -q "postgresql:///$scratch_db" -f /tmp/p0-8-5-smoke.sql
sudo -n -u postgres dropdb --if-exists "$scratch_db"
rm -f /tmp/p0-8-5-smoke.sql
```

## P0.8.6 Tooling Commands

DB-free target/generator check:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-6-policy-generator.mjs
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-6-policy-targets.mjs --targets
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-6-policy-targets.mjs --sql
```

Scratch smoke with a scratch URL accessible to the current shell user:

```bash
SCRATCH_DATABASE_URL="postgresql:///bcb_saas_p0_8_6_scratch" \
  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-6-bootstrap-hybrid-policies.mjs
```

Local peer-auth workaround used on the dev host when only the OS `postgres` role can create/connect to
scratch DBs:

```bash
scratch_db="bcb_saas_p0_8_6_scratch_$(date +%s)_$$"
sudo -n -u postgres createdb "$scratch_db"
SCRATCH_DATABASE_URL="postgresql:///$scratch_db" \
  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-6-bootstrap-hybrid-policies.mjs --print-sql \
  > /tmp/p0-8-6-smoke.sql
chmod 0644 /tmp/p0-8-6-smoke.sql
sudo -n -u postgres psql -q "postgresql:///$scratch_db" -f /tmp/p0-8-6-smoke.sql
sudo -n -u postgres dropdb --if-exists "$scratch_db"
rm -f /tmp/p0-8-6-smoke.sql
```

## P0.8.7 Tooling Commands

DB-free exemption/user-ref check:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-7-explicit-exemptions.mjs
```
