# D30 Ш7 — independent audit: stale legacy appointment reclaim/drain

Candidate: `a521ca4d2` (`wt/trackd-d30-sh7-drain`).

Verdict: **FAIL — one product fix is required before land.**

## Finding

`reclaimStaleMessageRetryJobProcessing` adds a new hand-written SQL CTE through
`runIntegratorSql` (`apps/integrator/src/infra/db/repos/jobQueue.ts:97`). In the resident worker
the queue is built with a plain `createDbPort()` (`apps/integrator/src/infra/runtime/worker/main.ts:53`),
which has no `integratorDrizzle` transaction session. `runIntegratorSql` therefore compiles the
fragment and falls through to `db.query(text, params)` (`apps/integrator/src/infra/db/runIntegratorSql.ts:26-47`).

That is new raw production SQL, prohibited by `AGENTS.md` §5 and by this stage brief's explicit
«без raw SQL из нового production-кода». It is a reachable worker path, not a test-only harness.
The structural gate reports green because it does not identify the helper-mediated bypass:

```
node scripts/check-no-new-raw-sql.mjs
# check-no-new-raw-sql: OK (... production debt: 0)
```

Worker handoff: keep the atomic CTE semantics, but execute the Drizzle `sql` fragment through the
existing Drizzle repository session rather than `runIntegratorSql` / `DbPort.query`; do not change
the table, consumer, migration state, or delivery payload.

## Blind kill-set and evidence

The kill-set was fixed from the owner plan/brief before candidate tests were read. All disposable
checks use `d30DisposablePostgres`: a fresh PostgreSQL 16 under `/tmp`, unix-socket-only; no DEV,
TEST or PROD database, environment file, deploy state or migration was touched.

| Class | Evidence |
| --- | --- |
| Concurrent reclaim must have one winner and not wait on the locked stale row | Added acceptance assertion to `check-d30-legacy-message-retry-drain-concurrency.ts`. Candidate PASS; fault `FOR UPDATE SKIP LOCKED` → `FOR UPDATE` is RED: `a skipped concurrent reclaim must return without waiting on the stale-row lease`. |
| Exact stale boundary and younger processing lease remain live | Added one transaction-scoped oracle with a timestamp exactly 10 minutes old and one 9 minutes old. Candidate PASS; fault `<` → `<=` is RED: `a lease at the stale boundary or younger must remain processing`. |
| Reclaim preserves future due time, attempts and historical payload; no early delivery; repeat is idempotent | Disposable candidate proof PASS. Fault adding `next_try_at = now()` is RED: `reclaim must preserve the original due time, attempts and appointment payload unchanged`. |
| Crash before finalize reclaims the same row once without an insert | Disposable candidate proof PASS: one reclaimed row, one later claim, source-row count remains 1. |
| Historical TG→MAX one-channel ladder, first-success and Web Push sibling | `pnpm --dir apps/integrator exec vitest --run src/infra/runtime/worker/jobExecutor.legacy.test.ts` → `1 file / 3 tests passed`. |
| Resident cadence and error containment | Diff inspection: each `jobQueueLoop` pass calls reclaim before `claimDueJobs` (`main.ts:77-80`); the surrounding `try/catch` logs the error and continues after `sleep`, so a reclaim/config failure does not terminate the worker process. |
| No new legacy producer, no conversion/enqueue window, reverse-only scope | `pnpm --dir apps/integrator run check:d30-no-legacy-message-retry-producers` → PASS. Diff contains no migration, env/deploy file, table/consumer deletion, or Ш7 checkbox change. |

Fault injections were applied only to the product worktree and reverted immediately. Final
`git -C /home/dev/dev-projects/bcb-wt-trackd-d30-sh7-drain status --porcelain` was empty and
`git -C /home/dev/dev-projects/bcb-wt-trackd-d30-sh7-drain diff --check` exited 0.

## Commands run

On the clean candidate checkout (it provides dependencies; the audit worktree does not):

```
pnpm --dir apps/integrator run check:d30-legacy-message-retry-drain-concurrency
pnpm --dir apps/integrator exec vitest --run src/infra/runtime/worker/jobExecutor.legacy.test.ts
pnpm --dir apps/integrator run check:d30-no-legacy-message-retry-producers
pnpm --dir apps/integrator run typecheck
pnpm --dir apps/integrator run lint
node scripts/check-no-new-raw-sql.mjs
git diff --check a521ca4d2^ a521ca4d2
```

All commands above passed. The disposable acceptance extension also passed `typecheck` and its
single-file ESLint invocation before the fault injections. Kill-set result: **6 behavioural/scope
classes pass; 1 reachable raw-SQL boundary violation remains.** No drop or zero-write observation is
claimed; Ш7 remains `[ ]`.
