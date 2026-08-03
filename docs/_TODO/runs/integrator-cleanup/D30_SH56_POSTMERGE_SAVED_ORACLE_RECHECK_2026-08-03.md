# D30 Ш5↔Ш6 post-merge saved-oracle recheck (2026-08-03)

Candidate: merge `9cc7238cdc33fda438d8d56d43594eb5f653b436` in
`wt/trackd-d30-sh5`. Audit branch: `wt/trackd-d30-sh56-postmerge-audit`.
Scope is limited to the three scheduler conflict files and the already-saved Ш5/Ш6 oracles.

## Verdict: PASS

The merge keeps both sides of the real Ш5↔Ш6 conflict:

- each leader cadence first awaits `assertLockStillHeld()`;
- one organization sweep starts in the background and remains single-flight;
- digest and system-health guard use their independent fixed-cadence states and are awaited on
  every leader cadence even while an organization sweep is pending or has failed;
- operator health probe retains its independent due/disabled/quiet-window behavior;
- organization failure is routed to the dedicated reporter; reporter rejection is awaited,
  contained and cannot become an unhandled rejection or clear single-flight early.

Ш5 egress policy and audience fixes are byte-identical to accepted fixer `0a34719d6e`: command
`git diff --exit-code 0a34719d6e..9cc7238cd -- <worker/policy/audience/9997 paths>` returned exit 0.
Their targeted worker/dispatch and webapp audience/materialization oracles remain green. Temporary
`9997_d30_operator_health_digest_queue_local.sql` is unchanged and still absent from the journal.

## Conflict-glue fault injection

Both temporary mutations were applied only in the audit worktree and restored byte-identically:

1. Removed `await deps.runOperatorHealthDigestWake()` from the merged coordinator. Command
   `pnpm --dir apps/integrator exec vitest run src/infra/runtime/scheduler/schedulerLockedTick.unit.test.ts`
   failed `3/5`: digest was absent after org failure, during a slow org sweep and before later lock
   loss. This directly kills a conflict resolution that silently drops Ш5.
2. Moved `startOrganizationTickIfIdle()` before `await deps.assertLockStillHeld()`. The same command
   failed `2/5`: initial lock loss started one org body and later lock loss increased its call count
   from one to two. This directly kills a conflict resolution that weakens Ш6 lock-first.

After restore, `git diff --exit-code 9cc7238cdc -- schedulerLockedTick.ts` returned exit 0 and the
same test returned `1 file / 5 tests` PASS.

## Verification

- Scheduler combined oracle:
  `pnpm --dir apps/integrator exec vitest run fixedCadenceWake.unit.test.ts schedulerLockedTick.unit.test.ts operatorHealthProbeTick.unit.test.ts schedulerDecisionGuard.test.ts`
  (full paths used in the actual command) → `4 files / 23 tests` PASS.
- Ш5 egress regression:
  `outgoingDeliveryWorker.scope.test.ts dispatchPort.test.ts devDeliveryRedirect.test.ts` →
  `3 files / 36 tests` PASS.
- Ш5 race/stable-event/B5c/audience materialization:
  `runOperatorHealthDigestTick.unit.test.ts runIntegratorPushOutboxHealthGuardTick.unit.test.ts prepareOperatorHealthDigestDeliveries.unit.test.ts`
  → `3 files / 6 tests` PASS.
- `pnpm --dir apps/integrator typecheck` and `pnpm --dir apps/webapp typecheck` → PASS.
- App-scoped ESLint on the merged scheduler files, `node scripts/check-queue-port-boundary.mjs`,
  and `git diff --check` → PASS.

No product branch, migration, journal, runtime environment, persistent DB, deploy target, DEV,
TEST or PROD was changed.
