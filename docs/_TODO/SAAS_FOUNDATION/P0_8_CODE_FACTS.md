# P0.8 Code Facts — RLS Descriptor/Policy Execution

Status: planning support for P0.8.3+ execution briefs. Facts gathered from code on
`codex/saas-roadmap-foundation` at HEAD `2306576b4` on 2026-07-08.

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
| `docs/_TODO/SAAS_FOUNDATION/scripts/rls-sql-renderer.mjs` | Renders identifier-safe predicates for direct org, patient, bootstrap hybrid, and policy targets. It does not render `CREATE POLICY` / `ALTER TABLE` DDL yet. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-sql-renderer.mjs` | Pure predicate tests for dormant permissive and enforce modes. No DB access. |
| `scripts/check-saas-db-regression.mjs` | Runs DB chokepoint, system settings, P0.4, P0.5, P0.8.1, and P0.8.2 checks. |
| `docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT_PROOF.sql` | Existing scratch-only psql proof pattern: DB-name guard, synthetic roles, `NOBYPASSRLS`, `ENABLE/FORCE RLS`, `SET LOCAL ROLE`, rollback. |

## Missing Before Real P0.8.3 Execution

P0.8.3 is not executable yet because these code artifacts do not exist:

- policy DDL renderer/generator for `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` and `CREATE POLICY`;
- script that lists/exports exact P0.8.3 targets from descriptors;
- scratch-smoke runner or SQL script that applies generated P0.8.3 policies to synthetic scratch tables and proves visibility under a non-owner `NOBYPASSRLS` role;
- committed migration for real table policies.

Therefore the next real implementation stage must be split:

1. Add generator + target-list + scratch-smoke tooling.
2. Run scratch smoke for the strict 103-table target.
3. Only after smoke passes, add a committed policy migration if still within the same approved stage.

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

If P0.8.3 creates a real Drizzle migration, it must add a matching `_journal.json` entry and pass
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
