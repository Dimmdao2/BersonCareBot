# Independent audit — W1 / W3 / W4, branch `wt/systemic-db-runtime-contracts-20260902`

Authority: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, items **W1, W3, W4** only.
Candidate: HEAD `4f315bdcb` (product change is `90a4e2e55`; worker ancestry from `a32f53d1a`).
Role: `auditor-live`. No product code changed; every fault injection reverted (`git status` clean after each).
No full CI, no live DB mutation, no TEST/PROD action — per brief.

## Verdict

| Item | Verdict |
|---|---|
| W1 — one effective DB-mode contract, named deploy phases, dead locked-only probes removed | **PASS** |
| W3 — one isolation classification for all three applications | **FAIL** (integrator + media-worker done; webapp DB door still drops unknown denials) |
| W4 — one source of the DB seam body | **PASS** |

## Blind kill-set (written from authority before reading any test)

W1: K1.1 phase argument optional/defaulted · K1.2 `final-runtime` tolerates `locked`/`shadow` · K1.3
`pre-cutover-source` tolerates `port-context` (phases merged into one global list) · K1.4 retired signed-context
credentials still accepted in the final runtime · K1.5 final phase does not require the pools the runtime opens ·
K1.6 a caller names the wrong phase, or a caller was left without one · K1.7 an obsolete locked-only startup probe
survives somewhere · K1.8 probe removal also removed the fail-visible degraded-transport path.
W3: K3.1 a second copy of the classifier survives · K3.2 unknown failure silently dropped instead of
`unclassified` · K3.3 class vocabulary diverges between producer, wire schema, diagnostics and the DB CHECK ·
K3.4 media-worker gains a DB-principal/credential dependency · K3.5 the moved reporter carries SQL into a package ·
K3.6 ordinary S3/ffmpeg failures reported as isolation events.
W4: K4.1 overlay still recreates the function body · K4.2 the parity gate does not cover the new overlay ·
K4.3 the gate is not wired into a gate that actually runs · K4.4 overlay applied before migrations → missing
function at ALTER/GRANT time · K4.5 overlay lost ownership/EXECUTE grants · K4.6 privileges appeared inside the
migration.

## W1 — PASS

- Phase argument is mandatory: `deploy/host/saas-c2-secret-preflight.mjs:105-107`; run without it →
  `--runtime-phase is required and must be one of final-runtime, pre-cutover-source`, exit 1 (K1.1).
- Phases are disjoint, not one tolerated-mode list: `PHASE_MODE` (`:25-28`) and separate key sets (`:30-70`).
  Live run on temporary env files (`/tmp`, no repo or host state touched):
  port-context env + `final-runtime` → OK; the same env + `pre-cutover-source` → exit 1
  (`must be locked … got port-context`); a `locked` env + `final-runtime` → exit 1
  (`must be port-context … got locked`); a leftover `DB_PRINCIPAL_SIGNING_SECRET` in the final env → exit 1
  (`must not declare retired pre-port-context credential`) (K1.2, K1.3, K1.4).
- The final phase requires exactly what the runtime opens, verified against the runtimes themselves:
  webapp refuses to boot outside `port-context` and requires STAFF/PATIENT/GLOBAL_ADMIN
  (`apps/webapp/src/config/env.ts:416-427,466-467`); the integrator requires exactly `INTEGRATOR_DB_URL` in
  port-context (`apps/integrator/src/config/env.ts:77-82`). Preflight lists match one-for-one (K1.5).
- Every caller names its phase, and the name matches the state it is in: `deploy/host/deploy-prod.sh:143-144`
  → `final-runtime` (this is where the final webapp is built/restarted);
  `deploy/host/provision-c4-operational-runtime.sh:152-153` and
  `deploy/host/assert-c4-operational-runtime-ready.sh:80-81` → `pre-cutover-source` (both run before
  `cutover-postgres-port-context.sh`). Full caller sweep over the repo found no other invocation; the only other
  reference is `deploy/host/deploy-test-saas.sh:2133` (`--self-test`) and `package.json:48` (K1.6).
- Dead locked-only startup probes are gone: `assertApi/Worker/SchedulerIsolationTelemetryWriterReady` and
  `probeSaasIsolationTelemetryWriter` no longer exist anywhere in `apps`/`packages`; the only remaining
  `probeSaasIsolation` is the unrelated admin health probe
  (`apps/webapp/src/app-layer/health/collectAdminSystemHealthData.ts:702`). No other startup path gates on
  `'locked'` (K1.7).
- Fail-visible path preserved: the sink still rejects and the degraded transport status still reaches
  `logger.error` (`apps/integrator/src/infra/observability/saasIsolationTelemetry.ts:9-35`,
  `packages/error-tracking/src/saasIsolationReporter.ts:117-124`) (K1.8).
- **Fault injection (class: final runtime tolerates a legacy mode).** `PHASE_MODE[final-runtime] = 'locked'` →
  `node deploy/host/saas-c2-secret-preflight.mjs --self-test` exit 1. Reverted.

## W3 — FAIL (one confirmed residual)

Done and verified:

- Exactly one classifier exists in the tree: `packages/error-tracking/src/saasIsolationClassification.ts`.
  The media-worker copy is gone and `@bersoncare/db-principal` retains no classification code (K3.1).
- Unknown failure is no longer dropped by the media worker:
  `apps/media-worker/src/saasIsolationTelemetry.ts:17-22` (K3.2).
- One vocabulary end-to-end, checked mechanically: the package list, the wire schema
  (`apps/webapp/src/app/api/internal/media-worker/control/route.ts:16-17`), diagnostics
  (`apps/webapp/src/modules/operator-health/saasIsolationDiagnostics.ts:1-14`), the DB CHECK and the function's own
  guard are the same six classes. The 28 service/operation pairs in the overlay, in the migration constraint and
  inside the function body are byte-identical after normalization (`diff` → identical) (K3.3).
- media-worker got no DB dependency: its `package.json` declares only `@bersoncare/error-tracking`, and the
  preflight still fails the deploy on any media DB credential (K3.4).
- The moved reporter carries no SQL — the sink is injected (`SaasIsolationEventSink`);
  `node scripts/check-no-new-raw-sql.mjs` → OK, production debt 0, and `package:error-tracking` does not appear as
  a low-level DB port (K3.5).
- Ordinary transport failures stay outside the isolation surface (K3.6), covered by
  `packages/error-tracking/src/saasIsolationClassification.test.ts`.
- **Fault injection (class: unknown isolation failure disappears).** Removed `value.code === '42501' ||` from
  `isRecognizedSaasIsolationFailure` → `pnpm --dir packages/error-tracking test` 1 failed / 12 passed. Reverted.
  Note: `pnpm --dir apps/media-worker test` stayed green under the same injection, because the media worker resolves
  `@bersoncare/error-tracking` to its compiled `dist/`; its test protects the classifier only after a rebuild. The
  package's own test catches it directly — but that suite is in no CI (that is W7, already declared open).

### FINDING W3-1 — the webapp DB door still drops an unrecognized wall denial

`apps/webapp/src/infra/db/saasIsolationDbFailureReporting.ts:9-38` keeps a second, local classification:
`classifyPostgresIsolationDenial` returns `null` for any `42501` whose message matches neither
`row-level security|policy` nor `permission denied for (table|schema|sequence|function|relation)`, and both callers
then report nothing — `reportDbQueryFailure` (`:31-38`) and the live port-context door
`apps/webapp/src/infra/db/webappPoolProvider.ts:122-130` (the legacy `withClient.ts:170-173` has the same shape).
The shared contract treats any `42501` as an isolation failure and stores it as
`unclassified_background_operation`; `app.report_saas_isolation_event` accepts that class for
`('webapp','webapp_db_request')`.

Failure scenario: a patient/staff request is denied with SQLSTATE `42501` and a message PostgreSQL words by
relation kind — `permission denied for view v_patient_bookings`, `for materialized view`, `for foreign table`,
`for type` — or any future guard wording. The request fails for the user, and the isolation event is never written,
so operator diagnostics show the wall as healthy. This is the exact defect W3 names, in the highest-traffic
isolation surface, and the one path of the three that was left unchanged.

Secondary, same file: `reportPrincipalSetupFailure` (`:22-29`) labels every non-"principal context is required"
error as `invalid_signature_or_install`, where the shared classifier would return `cleanup_failure` / `rls_denial` /
`unclassified_background_operation`. Mislabelling, not loss.

Handoff oracle (fails on the current product, passes with the shared classifier):
`apps/webapp/src/infra/db/saasIsolationDbFailureReporting.unit.test.ts` — added once by this audit.
- On HEAD: `Tests 1 failed | 1 passed` (`Number of calls: 0` — the event is dropped).
- With `reportDbQueryFailure` switched to `isRecognizedSaasIsolationFailure` + `classifySaasIsolationFailure`
  (temporary, reverted): `Tests 2 passed`. The fix is ~3 lines in one file.
The test's second case (ordinary `connection terminated unexpectedly` stays out of the isolation surface) passes
today, so the oracle does not over-reach.

## W4 — PASS

- The overlay no longer recreates the body; it keeps only ownership, REVOKE/GRANT and the privilege assertions for
  the exact signature `(text,text,text,text)` (`deploy/postgres/saas-isolation-telemetry.sql:117-124,250-288`).
  The body lives only in the ledger migration
  `apps/webapp/db/drizzle-migrations/20260828T092521_deliver_cron_isolation_operations.sql:29-92` (K4.1, K4.5).
- The parity gate now covers this overlay by name
  (`scripts/check-c4-migration-owned-function-bodies.mjs:20-31`) and runs in `pnpm lint` (`package.json:34`)
  (K4.2, K4.3).
- Apply order holds: the only automatic caller of the overlay is `deploy/host/deploy-test-saas.sh`
  (`:97,827`), reached from `run_strict_post_migration_closure` (`:1904,1918-1921`), whose entry points are
  `--post-migration-closure` and the full-reset flow — both after the drizzle migrations (K4.4).
- The migration was not touched at all in `90a4e2e55`, so no privilege appeared inside it (K4.6).
- **Fault injection (class: overlay redefines a migration-owned body).** Re-added
  `CREATE OR REPLACE FUNCTION app.report_saas_isolation_event(...)` to the overlay →
  `node scripts/check-c4-migration-owned-function-bodies.mjs` exit 1, naming file and function; `--self-test`
  exit 1 as well. Reverted; `git status` clean.

## Owner questions / recommendations (not findings, no scope opened)

1. `saas_isolation_events_source_operation_check` is still declared in both the migration and the overlay — the
   same "last applied wins" class as the function body, outside W4's wording. Verified identical today (28 pairs,
   `diff` clean). The existing gate could cover constraints the same way it covers bodies. Already raised by the
   worker in the plan; repeated here with the identity check as evidence.
2. `deploy/postgres/dev-c6-saas-telemetry-owner-update-grant.sql:4-6` still explains itself through
   `assertWorkerIsolationTelemetryWriterReady`, which no longer exists. The grant itself remains needed (the
   function's own `ON CONFLICT DO UPDATE` requires it); only the comment is stale.

## Checks run by this audit

`node deploy/host/saas-c2-secret-preflight.mjs --self-test` · both phases run for real on temporary env files ·
`node scripts/check-c4-migration-owned-function-bodies.mjs` (+ `--self-test`) ·
`node scripts/check-no-new-raw-sql.mjs` · `node scripts/check-db-chokepoint.mjs` ·
`node scripts/check-test-runner-visibility.mjs` (webapp 498/498 with the new test) ·
`pnpm --dir packages/error-tracking test` (13) · `pnpm --dir apps/media-worker test` (21) ·
`pnpm --dir apps/integrator test` (110 files / 578 passed) ·
webapp vitest `src/app/api/internal/media-worker src/modules/operator-health src/infra/db` (13 files / 65) ·
typecheck: webapp, integrator, media-worker, error-tracking · three fault injections, one per independent class,
all reverted.

Not run, by brief: full CI, live TEST/PROD, any DB mutation.
