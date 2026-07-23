> STATUS (verified 2026-07-23, code-reconciled): see docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md

# P0.6 Dormant Context Checklist

Status: executable checklist for P0.6.1. Code implementation should happen in a separate branch/worktree.

Purpose: use the DB_ACCESS chokepoint's dormant client-prepare seam to carry the current organization
principal to PostgreSQL in one place. This stage must preserve current behavior when no tenant context is set.

## Baseline To Read First

- `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/FUNNEL_COVERAGE_REPORT.md`
- `apps/webapp/src/infra/db/withClient.ts`
- `apps/webapp/src/infra/db/webappPoolProvider.ts`
- `apps/integrator/src/infra/db/withClient.ts`
- `apps/integrator/src/infra/db/integratorPoolProvider.ts`
- `apps/media-worker/src/withClient.ts`
- `apps/media-worker/src/poolProvider.ts`
- `apps/webapp/src/app-layer/di/buildAppDeps.ts`

## P0.6.1 Scope

Allowed:

- Add or complete a single dormant context carrier API for `organizationId`.
- Wire the existing pool/client prepare hooks to set the principal only when context is present.
- Add unit tests around prepare hooks and context isolation.
- Document the `buildAppDeps=cache()` interaction if it still matters.

Forbidden:

- No RLS policy migrations on real tables.
- No app runtime DB role switch.
- No route/action writer migration.
- No broad read filtering.
- No dev/prod DB writes.
- No new DB access bypasses or ESLint allowlist entries.

## Implementation Checklist

- [x] Run the pre-P0.6 guard: `pnpm run check:saas-db-regression`. (✓ scripts/check-saas-db-regression.mjs | sub-checks green 2026-07-23)
- [x] Identify the existing dormant hook names for webapp, integrator, and media-worker. (✓ webapp infra/db/withClient.ts:32,79 | apps/integrator/src/infra/db/withClient.ts | apps/media-worker/src/withClient.ts)
- [x] Define one module/API for current DB principal state, preferably AsyncLocalStorage-backed if the chokepoint already expects request-local state. (✓ packages/db-principal/src/index.ts:253 AsyncLocalStorage)
- [x] Ensure unset context is the default and performs no tenant SQL. (✓ db-principal/index.ts:29 DEFAULT_DB_PRINCIPAL_CONTEXT_MODE="legacy-guc"; :611 legacy-guc no set_config)
- [x] Ensure set context validates UUID shape before it reaches SQL. (✓ db-principal/index.ts:4 UUID_RE; :763 UUID_RE.test guard)
- [x] Ensure principal application is centralized in the client prepare hook, not in routes/services. (✓ withClient.ts:32,79 prepareClientForRequest/prepareTransactionClientForRequest → applyDbPrincipalToConnection/Transaction)
- [x] Use transaction/pinned-client semantics for any `SET LOCAL app.org` path; do not rely on a pooled session retaining a request principal. (✓ db-principal/index.ts:685 set_config('app.org',$1,true) local=true inside transaction path)
- [x] Add tests proving unset context keeps current behavior. (✓ apps/webapp/src/infra/db/dbPrincipalContext.test.ts | withClient.test.ts)
- [x] Add tests proving set context applies `app.org` once through the central hook. (✓ withClient.test.ts)
- [x] Add tests proving nested or concurrent contexts do not leak organization IDs. (✓ dbPrincipalContext.test.ts:29,57,77 nested/concurrent/interleaved isolation)
- [x] Confirm `buildAppDeps()` caching does not capture a stale organization ID. (✓ AsyncLocalStorage request-local carrier — org never captured in DI singleton; dbPrincipalContext.test.ts:57)
- [x] Update `LOG.md`. (✓ LOG.md P0.6.1 entry)

## Local Gate

Use the wrapper:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <targeted context tests> && <targeted lint/typecheck> && git diff --check"
```

Full CI is not required for P0.6.1 unless the implementation touches shared root config or multiple process
contracts more broadly than the context seam.

## Definition Of Done

- One central dormant principal carrier exists.
- Unset context preserves current single-clinic behavior.
- No request/org state is captured in singleton DI caches.
- No RLS/enforcement/runtime role flip happened.
- `LOG.md` records exact checks and skipped scope.
