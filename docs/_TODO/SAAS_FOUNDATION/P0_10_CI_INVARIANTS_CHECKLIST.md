# P0.10 CI Invariants Checklist

Status: executable checklist for P0.10.1-P0.10.3.

Purpose: turn the hardest SAAS table-scope assumptions into CI invariants.

## P0.10.1 Tier Completeness

Checklist:

- [ ] Every base table appears in exactly one tier in `tiers-218.tsv`.
- [ ] `tiers-218.tsv` agrees with the active database/schema snapshot used by the checker.
- [ ] `needs-orgid-FINAL.txt` equals SCOPED tables requiring direct `organization_id`.
- [ ] P0.4 batch artifact exactly covers `needs-orgid-FINAL.txt`.
- [ ] P0.4.BE FK-path tables remain outside `needs-orgid-FINAL.txt`.

## P0.10.2 User-Reference Tier Guard

Checklist:

- [ ] Introspect FK references to `public.platform_users`.
- [ ] Detect soft user-ref column names from the v8 leak class.
- [ ] Fail if any FK/soft-ref to `platform_users` is INFRA or TELEMETRY.
- [ ] Allow only SCOPED, BOOTSTRAP, or LEGACY with documented reason.
- [ ] Add a synthetic/self-test case that reproduces the prior audit-root leak class.

## P0.10.3 Scoped Tenant Semantics And Null Checks

Checklist:

- [ ] Every SCOPED descriptor has direct org, declared FK path, or declared denorm path.
- [ ] Every P0.4 backfill batch exposes a no-NULL check.
- [ ] Integrator bridge/denorm tables have no NULL `organization_id` after backfill.
- [ ] Path-scoped `be_*` item tables have declared parent/cross-check paths.
- [ ] Fail CI on missing tenant semantics or unresolved NULL org rows in scoped tables.

## Wiring

Allowed:

- Add invariant scripts under repo scripts or SAAS initiative scripts.
- Wire stable invariants into `pnpm run audit` or an explicit root check script.

Forbidden:

- No live dev/prod PII row dumps.
- No raw SQL taskdb access.
- No production DB writes.

## Local Gate

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <new invariant script(s)> && git diff --check"
```

## Definition Of Done

- P0.10.1-P0.10.3 are runnable in CI.
- Each invariant has a self-test or synthetic failure proof where practical.
- CI fails on missing tables, bad tiering, unsupported user refs, or missing scoped tenant semantics.
