# P0.10 CI Invariants Checklist

Status: executable checklist for P0.10.1-P0.10.3.

Purpose: turn the hardest SAAS table-scope assumptions into CI invariants.

## P0.10.1 Tier Completeness

Status: implemented.

Checklist:

- [x] Every base table appears in exactly one tier in `tiers-218.tsv`.
- [x] `tiers-218.tsv` agrees with the active database/schema snapshot used by the checker.
- [x] `needs-orgid-FINAL.txt` equals SCOPED tables requiring direct `organization_id`.
- [x] P0.4 batch artifact exactly covers `needs-orgid-FINAL.txt`.
- [x] P0.4.BE FK-path tables remain outside `needs-orgid-FINAL.txt`.

Implementation:

- `scripts/check-saas-db-regression.mjs` runs `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-tier-completeness.mjs`.
- The checker compares `tiers-218.tsv` to the frozen schema snapshot `all-218-signals.tsv`; it does not query live dev/prod/test databases.
- The checker treats `needs-orgid-FINAL.txt` as exactly the SCOPED non-`public.be_*` materialization set (`111` tables). The `44` `public.be_*` SCOPED tables already have direct/self org semantics or the P0.4.BE FK-path declaration.
- `--self-test` mutates in-memory facts to prove duplicate tier rows, snapshot mismatches, `needs-orgid` mismatches, and accidental P0.4.BE inclusion fail closed.

## P0.10.2 User-Reference Tier Guard

Status: implemented.

Checklist:

- [x] Introspect FK references to `public.platform_users`.
- [x] Detect soft user-ref column names from the v8 leak class.
- [x] Fail if any FK/soft-ref to `platform_users` is INFRA or TELEMETRY.
- [x] Allow only SCOPED, BOOTSTRAP, or LEGACY with documented reason.
- [x] Add a synthetic/self-test case that reproduces the prior audit-root leak class.

Implementation:

- `scripts/check-saas-db-regression.mjs` runs `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-user-reference-tier-guard.mjs`.
- The checker uses frozen static artifacts only: `fk-edges.tsv`, `method-columns.tsv`, `all-218-signals.tsv`, and P0.4 scoped-source rows where the v8 leak class is represented by actor/user org resolution.
- Current guarded surface: `114` tables with FK/soft-ref/P0.4 actor-user signal to `platform_users`; `SCOPED=92`, `BOOTSTRAP=20`, `LEGACY=2`, `INFRA/TELEMETRY=0`.
- `--self-test` mutates prior leak-class descriptors (`public.admin_audit_log`, `public.broadcast_audit`, `public.content_section_slug_history`) to prove INFRA/TELEMETRY or no-longer-SCOPED classifications fail.

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
