# SYSTEMIC_MEDIA_RECONCILE_AUDIT_2026-08-27

Candidate: `451d212fa9953b4cf3cb44e4199f0152daf2b1ca` (`wt/audit-media-reconcile-20260827`).

Authority: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, stage 4: «Успех batch-job возможен только когда все обязательные операции завершены; `errors > 0` не превращается в `success: true`.» Additional oracle: `docs/_TODO/runs/systemic-scheduler/SYSTEMIC_SCHEDULER_INDEPENDENT_AUDIT_2026-08-27.md` §Q4 / remaining finding 1.

## Classification

| Scope item | Test or inspection | Evidence |
| --- | --- | --- |
| 1–6: HTTP result, tick result/meta, config distinction, and thrown backfill | Test | Repeating externally observable handler behavior; exercised through public `POST`. |
| Candidate diff, module/infra boundary, access scope | Inspection | One-time structural review; no source-text test added. |

## Blind kill-set and result

| ID | Injected reachable fault | Assertion that became red | Result |
| --- | --- | --- | --- |
| K1 | Ignore `report.enqueue.errors > 0` while other report fields remain successful. | `turns partial enqueue errors into a failed HTTP result and a red operator tick`: expected HTTP 500, received 200. | PASS |
| K2 | Ignore non-null `report.abortedReason`. | `treats an aborted reconcile as a failure even when no enqueue call errored`: expected HTTP 500, received 200. | PASS |
| K3 | Send `{}` instead of the computed report metadata to the failure tick. | Partial-error and aborted-result tests rejected the `recordFailure` metadata assertion. | PASS |
| K4 | Return 503 for missing `INTERNAL_JOB_SECRET`. | `does not disguise a missing runtime secret as an accepted feature-disabled response`: expected 500, received 503. | PASS |
| K5 | Rethrow a secondary success-tick write failure. | `keeps a completed reconcile successful when only the secondary success tick write fails`: expected 200, received 500. | PASS |
| K6 | Record success instead of failure after a thrown backfill. | `turns a backfill exception into a failed HTTP result and failure tick`: unexpected success-tick call. | PASS |

Caught: **6/6** independent named faults. Not caught: **0**. Every temporary edit of `route.ts` was reverted; its final diff is empty.

## Added acceptance coverage

`apps/webapp/src/app/api/internal/media-transcode/reconcile/route.route.test.ts` invokes the exported public `POST` handler. It retains the original partial-error and missing-secret cases, moves them into the route test project, and adds the missing stable contracts: aborted result, secondary success-tick failure, and thrown backfill. The tests assert HTTP output plus the observable health-write boundary; no implementation-text assertion is used.

## Inspection

- The route parses/authenticates/configures, invokes the existing backfill application operation, and writes health through `buildAppDeps().operatorHealthWrite`; it adds no direct DB/repository import or new access path.
- `OperatorHealthWritePort` owns the added failure `metaJson` input. `pgOperatorHealthWrite` is the infra implementation and preserves that metadata on the red tick (`clearMetaOnFailure: false`).
- The candidate changes no roles, migrations, authentication rule, or caller access; `INTERNAL_JOB_SECRET` remains required and missing runtime configuration now fails loudly with HTTP 500.

## Commands and final validation

The worktree initially had no installed dependencies. For each command, identical-lockfile package links from `/home/dev/dev-projects/bcb-wt-systemic-lifecycle-20260827` were linked only for the foreground command and then removed. All commands ran through the host lock:

```bash
bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --config /tmp/media-reconcile-audit.vitest.config.ts"
bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp exec eslint src/app/api/internal/media-transcode/reconcile/route.ts src/app/api/internal/media-transcode/reconcile/route.route.test.ts src/infra/repos/inMemoryOperatorHealthWrite.ts src/infra/repos/pgOperatorHealthWrite.ts src/modules/operator-health/ports.ts"
```

The temporary Vitest config included only:

```text
src/app/api/internal/media-transcode/reconcile/route.route.test.ts
src/app/api/internal/media-multipart/cleanup/route.unit.test.ts
src/app/api/internal/media-pending-delete/purge/route.unit.test.ts
```

Results: Vitest **3 files / 11 tests passed**; `pnpm --dir apps/webapp typecheck` passed; targeted ESLint passed. Full CI was not run.

## Verdict

**PASS.** The stage-4 fail-loud oracle is satisfied for the six named reachable faults, with no product fix by this auditor and no access-boundary expansion.
