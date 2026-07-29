> ЗАКРЫТ 2026-07-23. Архивная запись, работой не является.

> STATUS (verified 2026-07-23, code-reconciled): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md

# P0.8 RLS Descriptor And Policy Checklist

Status: executable checklist for P0.8.1-P0.8.7.

Purpose: build the classified RLS descriptor model and policy renderer before applying policies by family.

## Shared Inputs

- `scope-derivation/tiers-218.tsv`
- `scope-derivation/p0-4-batches.tsv`
- `scope-derivation/p0-4-be-fk-paths.tsv`
- P0.7 writer census artifact.
- `P0_5_DB_ROLE_SPLIT.md`
- `P0_8_CODE_FACTS.md`

## P0.8.1 Descriptor Model

Allowed:

- Add descriptor data/model covering all base tables.
- Add pure tests for descriptor coverage.
- Add generator scaffolding without mutating DB.

Forbidden:

- No real table policy migration in P0.8.1.
- No RLS enablement on dev/prod tables.
- No runtime behavior changes.

Checklist:

- [x] Descriptor represents exactly one tier for every artifact in `tiers-218.tsv`. (✓ node docs/\_TODO/SAAS_FOUNDATION/scripts/check-p0-8-rls-descriptors.mjs — 239 descriptors cover tiers-218.tsv exactly once, 2026-07-23)
- [x] SCOPED descriptors declare direct org, FK path, or denorm path. (✓ check-p0-8-rls-descriptors PASS: SCOPED sources batch=115, be_fk_path=2, be_direct_or_self=45)
- [x] BOOTSTRAP descriptors declare global/tenant hybrid semantics where applicable. (✓ node check-p0-8-6-policy-generator.mjs — 3 global + 2 PII org-gated bootstrap hybrids)
- [x] INFRA/LEGACY/TELEMETRY descriptors include explicit exemptions. (✓ node check-p0-8-7-explicit-exemptions.mjs — INFRA=26 LEGACY=16 TELEMETRY=5)
- [x] P0.4.BE FK-path tables are represented as path-scoped, not direct-org. (✓ node check-p0-4-be-fk-paths.mjs — 2 scoped be\_\* item tables declared FK-path)

## P0.8.2 SQL Renderer Tests

Pure unit-test cases:

- [x] Direct `organization_id = app.org` predicate. (✓ node docs/\_TODO/SAAS_FOUNDATION/scripts/check-p0-8-sql-renderer.mjs — predicate tests OK, 2026-07-23)
- [x] Patient ownership predicate where applicable. (✓ check-p0-8-sql-renderer PASS | rls-sql-renderer.mjs patient/chain/conditional/polymorphic shapes)
- [x] Bootstrap hybrid predicate: global NULL row or matching `app.org`. (✓ check-p0-8-sql-renderer PASS; predicate in migration 0163_p0_8_6_bootstrap_hybrid_rls.sql)
- [x] Unset-GUC dormant permit where the phase requires permissive mode. (✓ check-p0-8-sql-renderer PASS)
- [x] Wrong-org deny in enforce-mode tests. (✓ check-p0-8-sql-renderer PASS | check-p0-9-enforce-descriptors.mjs)
- [x] Empty-GUC deny in enforce-mode tests. (✓ check-p0-9-enforce-descriptors PASS — empty app.org denies SCOPED)
- [x] SQL identifier quoting for schemas/tables/columns. (✓ check-p0-8-sql-renderer PASS — identifier quoting case)

## P0.8.3-P0.8.7 Policy Application

Each application substage must use scratch/non-prod policy smoke before merge:

- [x] P0.8.3 public direct-org SCOPED families.
- [x] P0.8.4 public FK/denorm-path SCOPED families.
- [x] P0.8.5 integrator bridge/denorm SCOPED families.
- [x] P0.8.6 BOOTSTRAP hybrid policies.
- [x] P0.8.7 INFRA/LEGACY/TELEMETRY descriptors and unsupported user-ref denial.

### P0.8.3 Public Direct-Org Policy Application

Do not execute P0.8.3 from this checklist alone. Use [`P0_8_3_PREFLIGHT.md`](../../../_TODO/SAAS_FOUNDATION/P0_8_3_PREFLIGHT.md)
as the execution brief.

Minimum implementation facts:

- target count must be exactly `103`; <!-- NOTE 2026-07-23: check-p0-8-rls-descriptors now reports 110 direct-org targets + 4 parent-copy holds; reconcile this figure with owner (target likely grew as tables were added) -->

- parent-copy holds remain excluded;
- generator/smoke tooling exists and must pass before a real policy migration;
- real migration is allowed only after scratch smoke passes;
- executed migration: `apps/webapp/db/drizzle-migrations/0160_p0_8_3_public_direct_org_rls.sql`.

### P0.8.4 Public FK/Denorm-Path Policy Application

Status: executed on 2026-07-08 as migration
`apps/webapp/db/drizzle-migrations/0161_p0_8_4_public_path_rls.sql`.

Preflight required before code:

- derive exact target set from descriptors where `table.startsWith("public.")` and `scopingKind` is
  `fk_path`, `denorm_org_column`, or `polymorphic_resolver`;
- split the target set into:
  - FK-path tables: `public.be_package_items`, `public.be_patient_package_items`;
  - parent-copy denorm tables from P0.4 child/denorm sources;
  - polymorphic resolver tables that remain gated by P0.12.1 if resolver coverage is incomplete;
- explicitly include or exclude the four P0.8.3 parent-copy holds from `P0_8_3_PREFLIGHT.md`;
- define one scratch smoke per subgroup, not one giant smoke.

Stop if any polymorphic resolver row lacks a completed P0.12.1 resolver decision. Do not turn a
polymorphic row into a direct `organization_id` policy without documenting why the materialized column
is authoritative.

Execution facts:

- generated target set is `37` tables: `2` FK-path targets and `35` denorm materialized-org targets;
- `public.comments` remains excluded because it is `polymorphic_resolver` and requires `P0.12.1`;
- FK-path targets: `public.be_package_items`, `public.be_patient_package_items`;
- denorm targets include the four P0.8.3 parent-copy holds:
  `public.content_section_slug_history`, `public.media_transcode_jobs`,
  `public.patient_daily_warmup_video_views`, `public.reference_items`;
- scratch smoke runs two subgroups in one script: denorm materialized org columns and FK-path package
  item paths with parent/service cross-org mismatch rows.

Local gate shape:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <P0.8.4 target-list check> && <P0.8.4 scratch smoke> && git diff --check"
```

### P0.8.5 Integrator Bridge/Denorm Policy Application

Status: executed on 2026-07-08 as migration
`apps/webapp/db/drizzle-migrations/0162_p0_8_5_integrator_scoped_rls.sql`.

Preflight required before code:

- derive exact target set from descriptors where `table.startsWith("integrator.")` and `tier === "SCOPED"`;
- split by P0.4 source:
  - `P0.4.I1` direct user bridge;
  - `P0.4.I2` identity bridge;
  - `P0.4.I3` parent denorm children;
  - `P0.4.I4` direct mailings root;
- confirm P0.4 integrator migrations/backfills are present and no target has unresolved orphan semantics;
- smoke with synthetic `integrator` schema tables and synthetic bridge rows only.

Stop if the smoke needs real `integrator.users`, real messenger identities, or dev/prod data.

Execution facts:

- generated target set is exactly `13` `integrator` SCOPED tables;
- source split matches P0.4: `P0.4.I1=5`, `P0.4.I2=3`, `P0.4.I3=4`, `P0.4.I4=1`;
- direct user bridge, identity bridge, and mailings root descriptors use their P0.4 materialized
  `organization_id` as `direct_org_column`;
- parent-denorm child descriptors use their P0.4 copied `organization_id` as `denorm_org_column`;
- policy generation does not recreate bridge joins; P0.4 source migrations/backfills remain the source
  of non-NULL org semantics;
- scratch smoke creates only synthetic `integrator` schema tables/roles/bridge rows, refuses
  non-scratch/dev/prod DB names, and proves 13 targets, dormant unset/empty permit, org A/B isolation,
  denorm source split behavior, and NOBYPASSRLS.

Local gate shape:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <P0.8.5 target-list check> && <P0.8.5 scratch smoke> && git diff --check"
```

### P0.8.6 BOOTSTRAP Hybrid Policies

Status: executed on 2026-07-08 as migration
`apps/webapp/db/drizzle-migrations/0163_p0_8_6_bootstrap_hybrid_rls.sql`.

Preflight required before code:

- target only descriptor rows with `scopingKind === "bootstrap_hybrid"`;
- current expected set:
  - `integrator.system_settings`;
  - `public.platform_user_contacts`;
  - `public.system_settings`;
  - `public.user_phone_history`;
- prove global `organization_id IS NULL` rows remain readable before org context;
- prove org rows require matching `app.org`;
- do not change admin Settings UI, mirror write path, or `ALLOWED_KEYS` in this stage.

Execution facts:

- generated target set is exactly `4` BOOTSTRAP hybrid tables:
  `integrator.system_settings`, `public.platform_user_contacts`, `public.system_settings`,
  `public.user_phone_history`;
- generated predicate is strict bootstrap hybrid:
  `organization_id IS NULL OR (NULLIF(current_setting('app.org', true), '') IS NOT NULL AND organization_id = NULLIF(current_setting('app.org', true), '')::uuid)`;
- unset `app.org` and empty `app.org` expose only global `organization_id IS NULL` rows;
- set `app.org` exposes global rows plus rows for the matching organization only;
- scratch smoke creates only synthetic `public` + `integrator` schema tables/roles/rows, refuses
  non-scratch/dev/prod DB names, and proves 4 targets, NOBYPASSRLS, unset/empty global-only behavior,
  and org A/B isolation.

Local gate shape:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <P0.8.6 bootstrap smoke> && git diff --check"
```

### P0.8.7 Explicit Exemptions And Unsupported User-Ref Denial

Status: executed on 2026-07-08 as a DB-free descriptor/static-artifact guard.

Preflight required before code:

- target descriptor rows with `tier` in `INFRA`, `LEGACY`, `TELEMETRY`;
- verify each row has `scopingKind === "explicit_exemption"` and a non-empty `source`;
- add a check that no `INFRA` or `TELEMETRY` table has an FK/soft-ref to `platform_users`;
- preserve `LEGACY` as frozen treatment; do not retrofit legacy booking/rubitime rows in this stage;
- document the explicit behavior for unsupported user-ref findings: fail the check and block, not auto-scope.

Execution facts:

- `check-p0-8-7-explicit-exemptions.mjs` verifies exactly the explicit-exemption treatment for
  `INFRA=26`, `LEGACY=16`, and `TELEMETRY=5` descriptors; <!-- reconciled 2026-07-23 to check-p0-8-7 output (was 22/16/2) -->

- unsupported user references are derived only from static scope artifacts, not live DB:
  `fk-edges.tsv`, `method-columns.tsv`, `all-218-signals.tsv`, and `p0-4-batches.tsv`;
- any `INFRA` or `TELEMETRY` descriptor with a static FK/soft-ref/P0.4 scoped-source signal fails the
  check and blocks the stage; the script does not rewrite tiers or auto-scope;
- the prior leak class is pinned by assertion: `public.admin_audit_log`, `public.broadcast_audit`, and
  `public.content_section_slug_history` must stay `SCOPED` and remain visible in static user-ref/source
  artifacts;
- `LEGACY` remains frozen: legacy booking/rubitime descriptors keep explicit exemptions and are not
  retrofitted or denied by this user-ref check.

Local gate shape:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-7-explicit-exemptions.mjs && git diff --check"
```

Forbidden during policy substages:

- No production role/env flip.
- No app-level filtering as a substitute for DB policy.
- No broad policy application without family-specific scratch smoke.

Local gate template:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <descriptor/renderer tests> && <scratch policy smoke when applicable> && git diff --check"
```

## Definition Of Done

- Descriptor coverage is exact over the 219 artifact universe.
- Renderer tests prove the predicate classes before policy application.
- Every policy migration is family-scoped and scratch-smoked.
- No real enforcement cutover occurs in P0.8.
