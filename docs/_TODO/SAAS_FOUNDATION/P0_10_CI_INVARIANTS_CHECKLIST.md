# P0.10 CI Invariants Checklist

Status: executable checklist for P0.10.1-P0.10.3.

Purpose: turn the hardest SAAS table-scope assumptions into CI invariants.

## P0.10.1 Tier Completeness

Status: checker grounded in the real schema (2026-07-10, W1); currently RED — 4 live base tables have no tier yet (`public.be_organization_members`, `public.org_enrollments`, `public.system_settings_audit`, `public.broadcast_drafts`). Assigning them a tier (and updating `needs-orgid-FINAL.txt`/`p0-4-batches.tsv`/tier counts accordingly) is separate follow-up work (W2), not done in this slice.

Checklist:

- [x] Every base table appears in exactly one tier in `tiers-218.tsv`; E1 diagnostics tables, including the bounded
      hourly trend store, are TELEMETRY and the grounded checker now covers 232 schema tables exactly.
- [x] `tiers-218.tsv` is diffed against the actual schema (code + migrations), not a hand-maintained snapshot — see Implementation.
- [x] `needs-orgid-FINAL.txt` equals SCOPED tables requiring direct `organization_id` (for tables that currently have a tier; the 4 untiered tables above aren't classified as SCOPED/BOOTSTRAP/etc. yet).
- [x] P0.4 batch artifact exactly covers `needs-orgid-FINAL.txt`.
- [x] P0.4.BE FK-path tables remain outside `needs-orgid-FINAL.txt`.

Implementation:

- `scripts/check-saas-db-regression.mjs` runs `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-tier-completeness.mjs`.
- The checker no longer compares `tiers-218.tsv` to the hand-maintained `all-218-signals.tsv` snapshot (that TSV silently drifted — it never caught `be_organization_members`/`org_enrollments`/`system_settings_audit`/`broadcast_drafts` landing outside the tier universe). It now diffs `tiers-218.tsv` against `actual-schema-tables.mjs`'s `readActualBaseTables()`, which derives the real base-table set from `pgTable(...)` in `apps/webapp/db/schema/*.ts` plus every `CREATE TABLE`/`DROP TABLE`/`ALTER TABLE ... RENAME TO` across `apps/webapp/db/drizzle-migrations/`, the legacy `apps/webapp/migrations/`, and the integrator migration runner's actual discovery globs (`apps/integrator/src/infra/db/migrations/core/` + `apps/integrator/src/integrations/*/db/migrations/`). Still no live dev/prod/test database access — everything is derived statically from repo source. A failure reports the exact `IN CODE, NO TIER` / `IN TSV, NO CODE` table lists.
- The checker treats `needs-orgid-FINAL.txt` as exactly the SCOPED non-`public.be_*` materialization set (`111` tables). The `44` `public.be_*` SCOPED tables already have direct/self org semantics or the P0.4.BE FK-path declaration.
- `--self-test` mutates in-memory facts to prove duplicate tier rows, actual-schema mismatches, `needs-orgid` mismatches, and accidental P0.4.BE inclusion fail closed. The duplicate/needs-org/FK-path cases run against a synthetic baseline where the actual-schema set is forced to equal the tier map, so they stay isolated from the real (currently known) drift; a separate self-test case proves the grounding check itself fails closed on the real, unmutated repo state.

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

Status: implemented.

Checklist:

- [x] Every SCOPED descriptor has direct org, declared FK path, or declared denorm path.
- [x] Every P0.4 backfill batch exposes a no-NULL check.
- [x] Integrator bridge/denorm tables have no NULL `organization_id` after backfill.
- [x] Path-scoped `be_*` item tables have declared parent/cross-check paths.
- [x] Fail CI on missing tenant semantics or unresolved NULL org rows in scoped tables.

Implementation:

- `scripts/check-saas-db-regression.mjs` runs `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-scoped-tenant-semantics.mjs`.
- The checker verifies all `155` SCOPED descriptors have one of the approved tenant semantics: `organization_id`, `id` self-scope for `public.be_organizations`, declared FK path, or the P0.12.1-deferred polymorphic resolver.
- The checker maps every P0.4 batch to its migration file and verifies `111` materialized-org tables are covered by `count(*) FILTER (WHERE organization_id IS NULL)` assertions plus batch-level no-NULL exceptions.
- The checker verifies the two P0.4.BE package item tables stay SCOPED/FK-path and use parent/cross-check `organization_id`.
- `--self-test` mutates in-memory descriptor/migration facts to prove missing org semantics, missing FK path metadata, and missing no-NULL assertions fail.

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
