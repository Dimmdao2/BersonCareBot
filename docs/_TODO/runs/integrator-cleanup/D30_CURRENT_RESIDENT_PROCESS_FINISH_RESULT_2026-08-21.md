# D30 Ш9 result — resident scheduler+worker process (21.08.2026)

Result artifact for `D30_CURRENT_RESIDENT_PROCESS_FINISH_BRIEF_2026-08-21.md`. Authority: that brief,
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2.3 (Р-D30а), `docs/OWNER_DECISIONS.md` Track D,
`D30_SCHEDULER_REVERSAL_PLAN.md`.

## What changed

**Code (one resident process, one coordinator, no new abstraction):**

- `apps/integrator/src/infra/runtime/scheduler/main.ts` — merged entrypoint. Acquires `SCHEDULER_LOCK_KEY` once
  at startup exactly as the former scheduler did; on loss/no-acquire, exits `process.exit(1)` for
  `Restart=on-failure`/`RestartSec=5` to re-race, unchanged. Builds two independent `buildDeps()` graphs
  (`schedulerDeps` with no override, `workerDeps` with the prior `dispatchAttemptWritePort: deliveryWritePort`
  override) — same construction as when they were two processes, so dispatch/attempt-write behavior is
  unchanged by the merge.
- `apps/integrator/src/infra/runtime/worker/main.ts` — deleted (retired entrypoint). Its two tick functions
  (`outgoingDeliveryWorker.ts`, `directPublicWriteRetryWorker.ts`) are untouched and now called from the merged
  `main.ts`.
- `apps/integrator/src/infra/runtime/scheduler/schedulerLockedTick.ts` — `createSchedulerLockedTickCoordinator`
  parameterized with two more single-flight bodies (`runOutgoingDeliveryTick`, `runDirectPublicWriteRetryTick`),
  reusing the same single-flight/error-boundary pattern already used for `runOrganizationTicks` (extracted into
  a small `createSingleFlightBody` helper to avoid tripling the same ~20 lines three times). No second
  coordinator was added (AGENTS §5 "one common door").
- Net effect: outgoing-delivery and direct-public-write-retry execution now only run while this process holds
  the leader lock — before Ш9 they ran unconditionally in a separate, lock-unaware process. This is the accepted
  loss of horizontal delivery scaling (Р-D30а).
- `FOR UPDATE SKIP LOCKED` claim (`claimDueOutgoingDeliveries`, `claimDueDirectPublicWriteRetries`), stable
  `event_id` idempotency, retry/reclaim semantics (`retryDelaySecondsAfterFailure`, `resetStaleOutgoingDeliveryProcessing`),
  principal context (`runWithInfraPrincipal`) and graceful shutdown (`SIGINT`/`SIGTERM` → release lock → close
  error tracking) are all unmodified — only the process/loop hosting them changed.

**Systemd / deploy / scripts (same commit):**

- `deploy/systemd/bersoncarebot-worker-prod.service` deleted; `bersoncarebot-scheduler-prod.service` Description
  updated to name the merged role.
- `deploy/host/deploy-prod.sh`, `deploy/host/bootstrap-systemd-prod.sh`, `deploy/host/install-systemd-sandbox.sh`,
  `deploy/host/prod/bcb-bluegreen-lib.sh`, `deploy/docker/docker-compose.yml`, `deploy/sudoers-deploy.example`:
  all `WORKER_SERVICE`/`bersoncarebot-worker-prod`/`worker` compose-service references removed.
- `deploy/host/start-worker.sh` deleted (dead launcher for the retired entrypoint; not referenced by any unit).
- `apps/integrator/package.json`, root `package.json`: `worker:dev`/`worker:start`/`worker:start:host` removed;
  `scheduler:dev`/`scheduler:start` now start the merged process (kept the existing script names — renaming
  would have fanned out into every doc/script that still calls them for no behavioral gain).
- Docs updated coherently: `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (with an explicit note that PROD has not
  been redeployed yet — see "Honesty" below), `ARCHITECTURE.md`, `README.md`,
  `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `deploy/HOST_DEPLOY_README.md`, `deploy/env/README.md`,
  `docs/ARCHITECTURE/OUTGOING_DELIVERY_QUEUE.md`, `docs/ARCHITECTURE/SCALING_AND_LAUNCH_CAPACITY.md` (unit count
  6→5), `docs/BACKLOG_TAILS.md`, `apps/webapp/scripts/README.md`, `apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md`
  (script-name references only, not their pre-existing unrelated job-queue/projection-outbox staleness from D10
  — out of this pass's scope).
- Left untouched on purpose: archive/report/point-in-time-snapshot docs (`docs/archive/**`, `docs/REPORTS/**`,
  `docs/_TODO/runs/**/*REPORT*.md`, `PORTFOLIO_CHAT_SUMMARY.md`, `docs/_TODO/SAAS_FOUNDATION/DEPLOY_667_SEQUENCE.md`
  — explicitly marked "non-standalone, not the current entrypoint"), and
  `deploy/postgres/dev-c9-integrator-login-release-principal-context-grant.sql` (an already-landed one-time DEV
  grant script; its comments narrate a past `worker:dev` failure and are historical record, not live instruction).

**Honesty about PROD state:** PROD (`135.106.162.170`) has not been redeployed by this pass (hard boundary: no
deploy/restart). `docs/ARCHITECTURE/SERVER CONVENTIONS.md` now says so explicitly — its "systemd units" list is
marked as the last confirmed state *before* this commit, not a live observation after it. The actual cutover to
one unit happens the next time `deploy/host/bootstrap-systemd-prod.sh` + `deploy-prod.sh` run on PROD.

## D30_SCHEDULER_REVERSAL_PLAN.md

- Ш9 checkbox flipped to `[x]` with the evidence block above inlined at its location.
- Dictionary section (top of file) and the A3 residency-cycle table row updated to describe the merged process
  instead of "scheduler and worker split the role."
- Added a "Ре-измерение Ш1–Ш6" note: static re-check (schema column, `OutgoingDeliveryKind` union, cron
  registry, `deploy/host/cron.d/*`) found no evidence that any of Ш1/Ш3–Ш6's still-open live-observation/
  cron-removal gates closed since 03.08. No box text or status in Ш1–Ш6 was changed — only this confirmation
  paragraph was added. Full DB/host-based re-verification was out of this pass's hard boundary.

## WORK_ORDER.md follow-up (NOT applied — D18 owns that file concurrently on this branch)

Report to the lead: in `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, the D30 bullet (currently
`- [ ] **D30 — разворот архитектуры запуска по расписанию.** ...`) should get this sentence appended after
"Детализация — `runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md`":

> Топология процессов (Ш9) закрыта 21.08.2026 — `worker` и `scheduler` сведены в один резидентный процесс
> (`apps/integrator/src/infra/runtime/scheduler/main.ts`, один unit `bersoncarebot-scheduler-prod.service`, один
> leader-замок, один top-level цикл); PROD ещё не редеплоен. D30 в целом остаётся `[ ]`: Ш1/Ш3–Ш6 живые
> cron-removal/observation-гейты по-прежнему открыты.

The D30 checkbox itself should stay `[ ]` — Ш9 was only one part of D30's scope, and Ш1/Ш3–Ш6 remain genuinely
open pending live observation this pass could not perform.

## Tests

- `apps/integrator/src/infra/runtime/scheduler/schedulerLockedTick.unit.test.ts` — extended to the coordinator's
  new required deps (`deliveryBodyDeps()` helper) and gained two behavioral tests:
  - "keeps health cadence moving while a slow outgoing-delivery tick is behind a barrier, and reports its own
    failure" — mirrors the existing organization-sweep non-blocking test for the two new bodies.
  - "does not start another body after a later lock-loss observation" (extended, not new) — now also asserts
    `runOutgoingDeliveryTick`/`runDirectPublicWriteRetryTick` are called exactly once and not again after the
    lock is lost.
  - Named failure this proves: before Ш9, a second unlocked worker instance could dispatch messages in parallel
    with the leader (double send is impossible to construct that regression *today* only because there is no
    second unlocked process anymore — this test is what would catch a future regression that pulls delivery
    execution back out of the locked coordinator into an independent loop).
- No new structural/census gate added; `schedulerDecisionGuard.ts`/`.test.ts` and
  `deploySystemdSchedulerUnitGate.ts`/`.test.ts` were not modified — both already covered the merged surface
  (`SCANNED_DIRECTORIES` already listed both `scheduler` and `worker` dirs; the systemd gate already scanned by
  filename pattern and already asserted "exactly one scheduler unit").

## Commands run (this session, `apps/integrator` unless noted)

All commands run directly (no `run-tests.sh` host lock — this sandbox's `/home/dev/brain/host-orch/locks` is
read-only/unavailable inside this isolated worktree; there is no shared-host contention to protect against here).

```
pnpm install --store-dir=<worktree>/.pnpm-store                                  # OK (root store outside worktree is read-only)
pnpm --dir packages/{operator-db-schema,db-principal,platform-merge,error-tracking} run build   # OK, all four
pnpm --dir apps/integrator exec vitest --run src/infra/runtime/scheduler/schedulerLockedTick.unit.test.ts
  → 1 file, 6 passed
pnpm --dir apps/integrator exec vitest --run src/infra/runtime/scheduler/schedulerDecisionGuard.test.ts src/infra/runtime/scheduler/deploySystemdSchedulerUnitGate.test.ts
  → 2 files, 25 passed
pnpm --dir apps/integrator exec vitest --run          # phase-level, full integrator suite
  → 106 files: 105 passed / 1 failed (platformIntegrationAvailability.test.ts, 4 tests)
  → confirmed pre-existing via `git stash push` of only my scheduler/worker changes and re-running that one
    file: identical 4/6 failures with my changes absent. Unrelated to Ш9 (file untouched by this pass).
pnpm --dir apps/integrator exec tsc --noEmit          → clean
pnpm --dir apps/integrator run lint                   → clean (eslint + check-queue-port-boundary + legacy-retry-producer gate)
pnpm --dir apps/integrator run build                  → clean; dist/infra/runtime/scheduler/main.js present,
                                                          dist/infra/runtime/worker/main.js absent
bash deploy/host/bootstrap-systemd-prod.sh --self-test → "bootstrap-systemd-prod media cutover self-test: OK"
bash -n deploy/host/deploy-prod.sh                    → OK
bash -n deploy/host/bootstrap-systemd-prod.sh         → OK
bash -n deploy/host/install-systemd-sandbox.sh        → OK
node -e "JSON.parse(...)" on package.json + apps/integrator/package.json → OK (valid JSON)
js-yaml load on deploy/docker/docker-compose.yml      → services: [webapp, api, scheduler, media-worker] (no "worker")
git diff --check                                      → clean
```

Not run (outside hard boundary): `pnpm run ci` / full CI, any DB/host/DEV/TEST/PROD command, deploy, migration.

## Tree / commit

Working tree clean after this commit; explicit paths committed (code, tests, systemd, deploy scripts, package
scripts, docs, this result artifact, the plan-file update). No push performed.
