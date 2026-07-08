# P0.8 Code Facts — RLS Descriptor/Policy Execution

Status: implementation support for P0.8.3+ execution briefs plus the P0.8.3 real policy migration.
Facts gathered from code on `codex/saas-roadmap-foundation` on 2026-07-08.

## Repository Rules That Affect P0.8

- Tests/builds must run through `bash /home/dev/orch/run-tests.sh "<command>"`.
- Normal P0 micro-stages use targeted gates, not full `pnpm run ci`.
- Full CI is reserved for deploy, merge/integration checkpoint, repo-level/global changes, or explicit owner request.
- Task state must be updated through `node /home/dev/brain/tools/taskdb.mjs`, never by direct SQL.
- No dev/prod DB writes, no `/opt/env/*`, no runtime role flip, no real deliveries.
- Scratch DB commands must never target `bcb_webapp_dev`, `bcb_webapp_prod`, production services, or host env files.

## Existing P0.8 Code Artifacts

| File | Current responsibility |
|---|---|
| `docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs` | Builds 219 descriptors from `tiers-218.tsv`, `p0-4-batches.tsv`, and `p0-4-be-fk-paths.tsv`. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-rls-descriptors.mjs` | Verifies exact descriptor coverage, tier counts, bootstrap hybrid set, FK-path set, P0.8.3 parent-copy holds, and strict 103 public direct-org target count. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/rls-sql-renderer.mjs` | Renders identifier-safe predicates for direct org, patient, bootstrap hybrid, policy targets, and P0.8.3 policy DDL helpers. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-sql-renderer.mjs` | Pure predicate tests for dormant permissive and enforce modes. No DB access. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-3-policy-targets.mjs` | Lists/exports the strict 103-table P0.8.3 public direct-org target set and renders deterministic policy DDL from descriptors. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-3-policy-generator.mjs` | DB-free checker for exact 103-target coverage, parent-copy exclusions, and deterministic ENABLE/FORCE/DROP/CREATE policy statements. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-3-direct-org-policies.mjs` | Scratch-only psql smoke runner. Uses `SCRATCH_DATABASE_URL`, refuses non-scratch DB names, creates synthetic public tables/roles, applies generated P0.8.3 policies, proves dormant unset/empty permit and org A/B isolation, then rolls back. |
| `apps/webapp/db/drizzle-migrations/0160_p0_8_3_public_direct_org_rls.sql` | Real Drizzle SQL migration generated from the P0.8.3 renderer after scratch smoke passed. Applies ENABLE/FORCE RLS and dormant permissive direct-org policy `saas_org_dormant_p0_8_3` to the strict 103 public direct-org target tables. |
| `scripts/check-saas-db-regression.mjs` | Runs DB chokepoint, system settings, P0.4, P0.5, P0.8.1, P0.8.2, and DB-free P0.8.3 generator checks. |
| `docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT_PROOF.sql` | Existing scratch-only psql proof pattern: DB-name guard, synthetic roles, `NOBYPASSRLS`, `ENABLE/FORCE RLS`, `SET LOCAL ROLE`, rollback. |

## P0.8.3 Execution Status

P0.8.3 no longer lacks generator/scratch-smoke tooling or a committed real-table policy migration.
The real migration was created only after a scratch smoke pass in the same execution scope.

Current status:

- policy DDL renderer/generator: exists;
- exact P0.8.3 target export: exists and is checked by `check:saas-db-regression`;
- scratch-smoke runner: exists and passed on disposable `bcb_saas_*` databases before and after migration creation;
- committed migration for real table policies: `0160_p0_8_3_public_direct_org_rls.sql`;
- no runtime role/env/grant flip and no dev/prod/test application DB mutation were performed in the migration pass.

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
  - `0160_p0_8_3_public_direct_org_rls`

- `0160` is intentionally used on this branch because branch drift check found `feat/doctor-ui-rebuild`
  has `0159_be_package_usages_appointment_debit_unique.sql`. That upstream migration adds an idempotency
  index on `public.be_package_usages` and does not change the P0.8.3 `organization_id` policy predicate.
- The P0.8.3 migration has a matching `_journal.json` entry and passed
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

Scratch smoke with a scratch URL accessible to the current shell user:

```bash
SCRATCH_DATABASE_URL="postgresql:///bcb_saas_p0_8_3_scratch" \
  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-3-direct-org-policies.mjs
```

Local peer-auth workaround used on the dev host when only the OS `postgres` role can create/connect to
scratch DBs:

```bash
scratch_db="bcb_saas_p0_8_3_scratch_$(date +%s)_$$"
sudo -n -u postgres createdb "$scratch_db"
SCRATCH_DATABASE_URL="postgresql:///$scratch_db" \
  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-8-3-direct-org-policies.mjs --print-sql \
  > /tmp/p0-8-3-smoke.sql
chmod 0644 /tmp/p0-8-3-smoke.sql
sudo -n -u postgres psql -q "postgresql:///$scratch_db" -f /tmp/p0-8-3-smoke.sql
sudo -n -u postgres dropdb --if-exists "$scratch_db"
rm -f /tmp/p0-8-3-smoke.sql
```
