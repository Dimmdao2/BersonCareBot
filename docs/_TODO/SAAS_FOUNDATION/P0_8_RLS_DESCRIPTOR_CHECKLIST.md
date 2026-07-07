# P0.8 RLS Descriptor And Policy Checklist

Status: executable checklist for P0.8.1-P0.8.7.

Purpose: build the classified RLS descriptor model and policy renderer before applying policies by family.

## Shared Inputs

- `scope-derivation/tiers-218.tsv`
- `scope-derivation/p0-4-batches.tsv`
- `scope-derivation/p0-4-be-fk-paths.tsv`
- P0.7 writer census artifact.
- `P0_5_DB_ROLE_SPLIT.md`

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
