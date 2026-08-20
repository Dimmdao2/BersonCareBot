# D10 — удаление projection transport, stage 1 (integrator)

## Authority and scope

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, item D10 and its 2026-08-20 PASS block.
Only `apps/integrator/src/**` and this report changed. No `apps/webapp/**`, migration, database, delivery queue,
idempotency port, or direct-write retry queue was changed.

## Re-proof before deletion

### Zero producer: `tryEmitWebappProjectionThenEnqueue`

Exact search run before deletion:

```text
$ rg -n --glob '*.ts' --glob '*.tsx' 'tryEmitWebappProjectionThenEnqueue' apps/integrator/src
apps/integrator/src/infra/db/repos/projectionFanout.ts:16:export async function tryEmitWebappProjectionThenEnqueue(
apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.ts:6: * `tryEmitWebappProjectionThenEnqueue` → webapp `handleIntegratorEvent` →
```

The second hit was a doc comment, not an import/call. Meaning search also returned the implementation and the
same comment only among current source candidates:

```text
$ node /home/dev/brain/tools/code-search.mjs "tryEmitWebappProjectionThenEnqueue projection fanout callers" --repo bcb -k 20
• bcb/apps/integrator/src/infra/db/repos/projectionFanout.ts:1-46
• bcb/apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.ts:1-50
```

Indirect reachability ended at the function itself: no source importer or call appeared. The stale comment was
rewritten to describe the retired path without naming the removed function.

### Zero producer: `enqueueProjectionEvent`

Exact search before deletion showed one executable caller, inside the dead fanout:

```text
$ rg -n --glob '*.ts' --glob '*.tsx' 'enqueueProjectionEvent' apps/integrator/src
apps/integrator/src/infra/db/repos/projectionOutbox.ts:16:export async function enqueueProjectionEvent(
apps/integrator/src/infra/db/repos/projectionFanout.ts:3:import { enqueueProjectionEvent } from './projectionOutbox.js';
apps/integrator/src/infra/db/repos/projectionFanout.ts:44:  await enqueueProjectionEvent(db, input);
```

Meaning search agreed:

```text
$ node /home/dev/brain/tools/code-search.mjs "enqueueProjectionEvent projection outbox callers" --repo bcb -k 20
• bcb/apps/integrator/src/infra/db/repos/projectionFanout.ts:1-46
• bcb/apps/integrator/src/infra/db/repos/projectionOutbox.ts:1-50
```

Thus deleting the unreachable fanout removed the sole executable enqueue path. The two direct-public header
comments that falsely named this outbox fallback were rewritten to name durable direct-write retry instead.

### Durable fallback is not projection outbox

Meaning search located the real fallback at `writePort.ts:543`:

```text
$ node /home/dev/brain/tools/code-search.mjs "enqueueDirectPublicWriteRetry reminder rule direct public fallback" --repo bcb -k 20
• bcb/apps/integrator/src/infra/db/writePort.ts:521-570
• bcb/apps/integrator/src/infra/db/repos/directPublicWriteRetry.ts:1-50
• bcb/apps/integrator/src/infra/runtime/worker/directPublicWriteRetryWorker.ts:1-50
```

The exact live branch calls `enqueueDirectPublicWriteRetry` with operation `reminder_rule_upsert` after a failed
direct write; it never calls projection outbox. Post-change search confirms the five removed symbol families are
absent:

```text
$ rg -n --glob '*.ts' --glob '*.tsx' 'tryEmitWebappProjectionThenEnqueue|enqueueProjectionEvent|runProjectionWorkerTick|isRecoverableWebappEmitFailure|WebappEventBody|REMINDER_RULE_UPSERTED|REMINDER_OCCURRENCE_FINALIZED|REMINDER_DELIVERY_LOGGED|CONTENT_ACCESS_GRANTED|/health/projection|assertIntegratorDiagnosticPoolReady' apps/integrator/src
POST_REMOVAL_SYMBOL_SEARCH_EXIT=1
```

## Removed

Deleted files:

- `infra/db/repos/projectionFanout.ts`
- `infra/db/repos/projectionOutbox.ts`
- `infra/db/repos/projectionOutboxMergePolicy.ts`
- `infra/runtime/worker/projectionWorker.ts`
- `infra/runtime/worker/projectionEmitFailure.ts`
- `infra/db/repos/projectionHealth.ts`
- `infra/db/repos/projectionHealthCore.ts`
- `infra/db/repos/projectionHealthCore.test.ts`
- `infra/scripts/projection-health.ts`
- `infra/scripts/projection-health.test.ts`
- `kernel/contracts/projectionEventTypes.ts`

Also removed only the projection parts of shared surfaces:

- `projectionOutboxLoop`, its DB/client wiring, and the `emit` client method for `POST /api/integrator/events`;
- `WebappEventBody`, `WebappEventsPort.emit`, and event-type exports;
- `GET /health/projection`, its DI health dependency, and API diagnostic-pool startup probe;
- projection-table access from delivery readiness. The remaining readiness probe is explicitly sourced as
  `worker:outgoing-delivery-tick` and checks only live delivery capabilities.

## Deliberately kept

- `direct_public_write_retries`, `directPublicWriteRetryLoop`, and `outgoingDeliveryLoop`: both are live durable
  paths and were left intact.
- `WebappEventsPort` and `createWebappEventsPort`: live booking/reminder materialization, support, and health-wake
  HTTP methods still use them; only `emit` was projection-specific.
- `jsonStableStringify` and `projectionKeys.ts`: `writePort.ts` uses `projectionIdempotencyKey`/`hashPayload` for
  durable direct-write retry keys (including the `reminders.rule.upsert` fallback). `projectionKeys.ts` imports
  `jsonStableStringify`; neither was deleted under R-D10.
- `reportWorkerProjectionIsolationFailure`: despite its old name, the direct-public retry loop still calls it, so
  it is shared live telemetry and remains.
- The Drizzle declaration and test stub for `integrator.projection_outbox`: the physical table is intentionally
  retained in this stage. No migration was written or applied.

## Validation

```text
$ pnpm --dir apps/integrator typecheck
TYPECHECK_EXIT=0

$ pnpm --dir apps/integrator lint
check-queue-port-boundary: OK
legacy retry producer gate: PASS
LINT_EXIT=0

$ /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator test"
Test Files  97 passed | 4 skipped (101)
Tests  489 passed | 2 expected fail | 15 skipped (506)
INTEGRATOR_TEST_EXIT=0
```

`git diff --check` produced no output.

## Stage 2 — webapp (not touched)

- `apps/webapp/src/app/api/integrator/events`
- `apps/webapp/src/middleware/csrfOrigin.ts` exception
- `apps/webapp/src/modules/integrator/events.ts`
- `apps/webapp/src/modules/integrator/ingestErrorClassification.ts`
- `apps/webapp/src/**/protectedActionRegistry.ts` entry for this route

## NOT DONE

1. The webapp stage-2 route, CSRF exception, consumer modules, and protected-action entry remain by explicit
   scope exclusion.
2. `integrator.projection_outbox` remains in the database. Its drop migration is intentionally not written or
   applied until the webapp side is removed and separately reviewed.
3. Outside this stage's `apps/integrator/src/**` file guard, `apps/integrator/package.json`,
   `apps/integrator/scripts/projection-health.mjs`, deploy proxy/check scripts, and deploy docs still expose the
   retired projection-health command/endpoint. They must be removed or updated in their own allowed-scope pass;
   this stage does not silently modify them.
