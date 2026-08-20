# D10a — canonical delivery-attempt journal is the only writer (2026-08-20)

## Result

Every `delivery.attempt.log` now reaches
`app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)`.
The per-principal fallback to `app.record_operational_delivery_attempt_audit(...)` was removed.
`writeOperatorDeliveryAttempt()` is the shared capability wrapper for both
`createOperatorAwareDeliveryAttemptWritePort()` and the base `createDbWritePort()`.

This changes journaling only. It does not alter the send order, transport, or retry behaviour.

## Ten-field comparison

The retired `insertDeliveryAttemptLog()` and the canonical
`recordOperatorDeliveryAttempt()` pass the same ten logical fields to their named roots, in the
same order. For the valid `delivery.attempt.log` payloads accepted by the writer, no field is
lost.

| # | Legacy `record_operational_delivery_attempt_audit` argument | Canonical `record_operator_delivery_attempt` argument | Source mutation field |
| --- | --- | --- | --- |
| 1 | `intentType` | `intentType` | `params.intentType` |
| 2 | `intentEventId` | `eventId` | `params.intentEventId` |
| 3 | `correlationId` | `correlationId` | `params.correlationId` |
| 4 | `organizationId` | `organizationId` | `params.organizationId` |
| 5 | `channel` | `channel` | `params.channel` |
| 6 | `status` | `status` | `params.status` |
| 7 | `attempt` | `attempt` | `params.attempt` |
| 8 | `reason` | `reason` | `params.reason` |
| 9 | `payloadText` | `payloadText` | `JSON.stringify(params.payload)` (object, otherwise `{}`) |
| 10 | `occurredAt` | `occurredAt` | `params.occurredAt` (otherwise current ISO timestamp) |

The new unit test asserts the exact ten canonical root arguments. The already-landed root keeps
the caller organization for an attempt without a queue row and lets queue-derived context win
when a row exists; this worker did not modify that database function or its migration.

## Principal paths formerly sent to legacy

| Former path | Principal after this change | Why |
| --- | --- | --- |
| `createOperatorAwareDeliveryAttemptWritePort()` under organization, staff, patient, integrator, or another infra principal | `worker:outgoing-delivery-tick` | All delivery mutations now call the existing shared helper; it invokes the existing `runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' })` wrapper when that exact principal is not active. |
| The same port while `worker:outgoing-delivery-tick` is already active | unchanged `worker:outgoing-delivery-tick` | The helper detects that exact active principal and calls the canonical root without nesting another scope. |
| Direct/base `createDbWritePort()` delivery mutation (the former `messageLogs.ts` legacy writer) | `worker:outgoing-delivery-tick` unless already active | It now calls that same helper before the existing optional support projection. No new principal was introduced. |

The outgoing-delivery worker audit context is no longer a routing condition. Its delivery attempt
uses the same shared helper and existing principal mechanism as every other attempt.

## Legacy-writer zero-caller proof

Before removal, the exact search found the legacy implementation plus its imports/callers:

```text
$ rg -n -g '!docs/**' -g '!deploy/**' -g '!apps/webapp/scripts/backfill-communication-history.mjs' -g '!apps/webapp/scripts/reconcile-communication-domain.mjs' "insertDeliveryAttemptLog|appendMessageLog|record_operational_delivery_attempt_audit|shouldRouteDeliveryAttemptToOperatorJournal|createOperatorAwareDeliveryAttemptWritePort" .
./apps/integrator/src/infra/db/writePort.ts:19:import { appendMessageLog, insertDeliveryAttemptLog } from './repos/messageLogs.js';
./apps/integrator/src/infra/db/writePort.ts:882:          await insertDeliveryAttemptLog(db, dalParams);
./apps/integrator/src/infra/db/repos/messageLogs.ts:43:export async function insertDeliveryAttemptLog(
./apps/integrator/src/infra/db/repos/messageLogs.ts:81:        'app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)',
./apps/integrator/src/infra/db/repos/messageLogs.deliveryAttemptAudit.test.ts:48:      const { appendMessageLog } = await import('./messageLogs.js');
./apps/integrator/src/infra/runtime/worker/operatorDeliveryAttemptWritePort.ts:9:function shouldRouteDeliveryAttemptToOperatorJournal(): boolean {
```

After redirecting those callers and removing the legacy function, the exact current-worktree
search has no runtime/test caller:

```text
$ rg -n -g '!docs/**' -g '!deploy/**' -g '!apps/webapp/scripts/**' "record_operational_delivery_attempt_audit|insertDeliveryAttemptLog" .
$ echo $?
1
```

The semantic-index query was also run, as required:

```text
$ node /home/dev/brain/tools/code-search.mjs "record_operational_delivery_attempt_audit" --repo bcb -k 5
# code-search: «record_operational_delivery_attempt_audit» · репо bcb · лексический BM25 · индекс 2026-08-20T19:45:02.340Z (24878 чанков)
• bcb/apps/integrator/src/infra/db/repos/messageLogs.ts:81-120
• bcb/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:761-810
• bcb/apps/integrator/src/infra/db/repos/messageLogs.deliveryAttemptAudit.test.ts:81-100
• bcb/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/15-integrator-tables-disposition.md:361-410
• bcb/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/30-definer-seams-full-census.md:921-934
```

That index snapshot predates this worktree edit and still reports the removed `messageLogs.ts`
implementation/test. The documentation hits are historical references, not callers. The current
worktree `rg` result above is the zero-caller proof; the stale semantic result is recorded rather
than misreported as a current caller.

## Deliberately left in place

- `integrator.delivery_attempt_logs` was not dropped and no DROP migration was written or applied.
- `apps/webapp/scripts/backfill-communication-history.mjs`,
  `apps/webapp/scripts/reconcile-communication-domain.mjs`, and every `scripts/stage*-release-gate.mjs`
  were untouched; the two CLI readers continue to read the legacy table.
- No grant, revoke, RLS policy, or privilege file was changed. The obsolete named root is no longer
  called by application code, but its privilege removal remains coupled to the later table-drop package.
- No database was changed or inspected mutatively.

## Tests and checks

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm --dir apps/integrator exec vitest run src/infra/db/repos/operatorDeliveryAttempts.test.ts src/infra/runtime/worker/operatorDeliveryAttemptWritePort.test.ts src/infra/db/repos/messageLogs.deliveryAttemptAudit.test.ts src/infra/db/writePort.reminderRuleFallback.test.ts` | 0 | 4 files, 18 tests passed. |
| `pnpm --dir apps/integrator exec tsc --noEmit -p tsconfig.json` | 0 | Passed. |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run"` | 1 | Full run: 98 files/500 tests passed; 1 failed; 4 files/16 tests skipped. Failure is outside D10a: `src/kernel/contracts/legacyAppointmentProjectionTransport.contract.test.ts` calls `scandir` on missing `apps/webapp/src/app/api/integrator/events`. |
| `pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json` | 2 | Existing unrelated error: `scripts/check-s4-entitlement-coverage.ts(252,6): TS2352` (`null` cast to `string`). |
| `pnpm --dir apps/webapp run lint` | 0 | Passed. Two existing warnings in `AppointmentPaymentSection.tsx` (React Hook dependency and `<img>`); no errors. |

## NOT DONE

- Physical removal/archive of the existing `integrator.delivery_attempt_logs` rows and table is not done; it is a separate package.
- The two legacy CLI readers and release-gate redesign are not done and were deliberately out of scope.
- Legacy-root privilege cleanup is not done and remains coupled to the later table-drop package.
- The two full-area failures above are not fixed here because neither touches the allowed D10a file scope.
