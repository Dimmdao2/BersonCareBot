# P0.7 Writer Census Checklist

Status: executable checklist for P0.7.1-P0.7.6.

Purpose: make every SCOPED writer visible, then apply the dormant tenant context to writer families through
the chokepoint without changing current behavior while the context is unset.

## Shared Inputs

- `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/FUNNEL_COVERAGE_REPORT.md`
- `docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv`
- `docs/_TODO/SAAS_FOUNDATION/scope-derivation/p0-4-batches.tsv`
- `docs/_TODO/SAAS_FOUNDATION/RAW_SQL_AUDIT.md`
- `docs/_TODO/SAAS_FOUNDATION/UPSTREAM_SYNC_REGRESSION_CHECKLIST.md`

## P0.7.1 Inventory-Only Scope

Allowed:

- Produce a writer census artifact, grouped by process family.
- Reconcile against DB_ACCESS funnel coverage and SCOPED table artifacts.
- Add read-only scripts/checks if they only scan code.

Forbidden:

- No writer code changes in P0.7.1.
- No RLS policies.
- No DB writes.
- No route behavior changes.

Checklist:

- [ ] Run `pnpm run check:saas-db-regression`.
- [ ] Enumerate webapp route/action/page/app-layer writers touching SCOPED tables.
- [ ] Enumerate integrator API/bot writers touching SCOPED tables.
- [ ] Enumerate integrator worker/scheduler writers touching SCOPED tables.
- [ ] Enumerate media-worker writers touching SCOPED tables.
- [ ] Enumerate payment/webhook writers and boot/migration writers.
- [ ] Mark each writer as direct-org, FK-path, denorm-path, bootstrap, infra, legacy, or unknown.
- [ ] Any unknown writer becomes a blocker before P0.7.2+.
- [ ] Update `LOG.md`.

Local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && git diff --check"
```

## P0.7.2-P0.7.6 Writer Application Scope

Allowed:

- Apply dormant tenant context to one process family at a time.
- Add focused tests around the touched writer family.
- Keep unset context permissive/dormant until RLS enforcement stages.

Forbidden:

- No mixed-family mega-PR.
- No manual `SET app.org` in business services/routes.
- No policy migrations.
- No production role/env changes.

Family checkpoints:

- [ ] P0.7.2 webapp route/action writers.
- [ ] P0.7.3 integrator API/bot writers.
- [ ] P0.7.4 integrator worker/scheduler writers.
- [ ] P0.7.5 media-worker writers.
- [ ] P0.7.6 payment/webhook writers; boot migrations remain migrator-only.

Per-family local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <family targeted tests> && <family lint/typecheck> && git diff --check"
```

## Definition Of Done

- P0.7.1 census covers every known SCOPED writer family.
- Each implementation substage changes exactly one process family.
- Unset context preserves current runtime behavior.
- No writer bypasses the DB chokepoint after the family stage.
