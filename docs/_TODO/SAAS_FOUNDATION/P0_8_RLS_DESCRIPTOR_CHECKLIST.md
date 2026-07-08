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

- [ ] Descriptor represents exactly one tier for every artifact in `tiers-218.tsv`.
- [ ] SCOPED descriptors declare direct org, FK path, or denorm path.
- [ ] BOOTSTRAP descriptors declare global/tenant hybrid semantics where applicable.
- [ ] INFRA/LEGACY/TELEMETRY descriptors include explicit exemptions.
- [ ] P0.4.BE FK-path tables are represented as path-scoped, not direct-org.

## P0.8.2 SQL Renderer Tests

Pure unit-test cases:

- [ ] Direct `organization_id = app.org` predicate.
- [ ] Patient ownership predicate where applicable.
- [ ] Bootstrap hybrid predicate: global NULL row or matching `app.org`.
- [ ] Unset-GUC dormant permit where the phase requires permissive mode.
- [ ] Wrong-org deny in enforce-mode tests.
- [ ] Empty-GUC deny in enforce-mode tests.
- [ ] SQL identifier quoting for schemas/tables/columns.

## P0.8.3-P0.8.7 Policy Application

Each application substage must use scratch/non-prod policy smoke before merge:

- [ ] P0.8.3 public direct-org SCOPED families.
- [ ] P0.8.4 public FK/denorm-path SCOPED families.
- [ ] P0.8.5 integrator bridge/denorm SCOPED families.
- [ ] P0.8.6 BOOTSTRAP hybrid policies.
- [ ] P0.8.7 INFRA/LEGACY/TELEMETRY descriptors and unsupported user-ref denial.

### P0.8.3 Public Direct-Org Policy Application

Do not execute P0.8.3 from this checklist alone. Use [`P0_8_3_PREFLIGHT.md`](P0_8_3_PREFLIGHT.md)
as the execution brief.

Minimum implementation facts:

- target count must be exactly `103`;
- parent-copy holds remain excluded;
- generator/smoke tooling exists and must pass before a real policy migration;
- real migration is allowed only after scratch smoke passes.

### P0.8.4 Public FK/Denorm-Path Policy Application

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

Local gate shape:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <P0.8.4 target-list check> && <P0.8.4 scratch smoke> && git diff --check"
```

### P0.8.5 Integrator Bridge/Denorm Policy Application

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

Local gate shape:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <P0.8.5 target-list check> && <P0.8.5 scratch smoke> && git diff --check"
```

### P0.8.6 BOOTSTRAP Hybrid Policies

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

Local gate shape:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <P0.8.6 bootstrap smoke> && git diff --check"
```

### P0.8.7 Explicit Exemptions And Unsupported User-Ref Denial

Preflight required before code:

- target descriptor rows with `tier` in `INFRA`, `LEGACY`, `TELEMETRY`;
- verify each row has `scopingKind === "explicit_exemption"` and a non-empty `source`;
- add a check that no `INFRA` or `TELEMETRY` table has an FK/soft-ref to `platform_users`;
- preserve `LEGACY` as frozen treatment; do not retrofit legacy booking/rubitime rows in this stage;
- document the explicit behavior for unsupported user-ref findings: fail the check and block, not auto-scope.

Local gate shape:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <P0.8.7 exemption/user-ref check> && git diff --check"
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
