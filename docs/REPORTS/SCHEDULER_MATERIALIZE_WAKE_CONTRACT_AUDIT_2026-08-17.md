# Scheduler materialize-wake contract audit — 2026-08-17

Candidate: `3c3c13d4b23cebf4d44c6c3bbc62d2fe0749c33e`

Verdict: **PASS**

## Authority and blind kill-set

Derived before reading candidate tests:

1. Every scheduler organization event uses a non-empty wake ID accepted by the webapp route's `max(64)` contract.
2. Separate organizations and later sweeps receive fresh event IDs; one event ID is forwarded unchanged through the action handler.
3. Organization isolation remains explicit in the event payload, organization principal, signed request body and organization-bound idempotency key.
4. The signed route rejects an invalid signature, a key copied across organizations/wakes, a blank wake ID and a wake ID longer than 64 characters before materialization.

Uncovered required classes after this audit: **none**. Live process/DB delivery and unrelated scheduler behavior are not claimed by this bounded source/in-process audit.

## Diff and boundary inspection

The only product change is:

```text
sch:<organization UUID>:<event UUID>  ->  sch:<event UUID>
```

Measured with:

```bash
node -e "const org='d0000000-0000-4000-8000-00000000000d'; const uuid='ffffffff-ffff-4fff-8fff-ffffffffffff'; const old='sch:'+org+':'+uuid; const next='sch:'+uuid; const key='patient-reminder-materialize:'+org+':'+next; console.log(JSON.stringify({oldWakeLength:old.length,newWakeLength:next.length,idempotencyKeyLength:key.length},null,2))"
```

Result: old wake `77`, candidate wake `40`, final HTTP idempotency key `106`. The route limit is `64`; the idempotency header limit is `256`.

Removing the organization UUID from the opaque event ID does not remove tenant isolation. `organizationTicks.ts` still puts the organization UUID in the payload and runs the event pipeline through `runWithOrganizationPrincipal`; `scheduledMaterialization.ts` forwards both payload organization and the same event ID; `webappEventsClient.ts` signs that body and builds `patient-reminder-materialize:<organization>:<wake>`; the route requires exact key/body equality and installs the verified organization principal. Integrator dedup remains per random event UUID, and `randomUUID` is called for each organization on each sweep.

## Acceptance tests added

- Multiple organizations retain their own payload and receive distinct `sch:<uuid>` IDs.
- A later sweep of the same organization receives a fresh ID.
- The HTTP client signs the exact JSON body and emits the exact organization-bound idempotency key.
- Matching organization-bound keys cannot make blank or oversized wake IDs pass the route.

## Fault injection evidence

All temporary product mutations were restored.

| Injected fault | Killing evidence |
| --- | --- |
| Restored old `sch:<org>:<uuid>` producer | `pnpm exec vitest run src/infra/runtime/scheduler/organizationTicks.unit.test.ts` failed: expected `sch:<uuid>`, received the 77-character old ID. |
| Replaced generated IDs with one fixed ID | Same command failed both exact-ID generation and per-event generator-call assertions. |
| Removed organization from scheduler payload | Same command failed both single-organization and multi-organization payload assertions. |
| Replaced handler's forwarded wake ID | `pnpm exec vitest run src/kernel/domain/executor/handlers/scheduledMaterialization.test.ts` failed on exact `wakeId` propagation. |
| Removed the organization from the HTTP idempotency key | `pnpm exec vitest run src/infra/adapters/webappEventsClient.materializeWake.test.ts` failed on the exact organization-bound header. |
| Changed the HMAC input separator | The same client test failed on the independently recomputed signature. |
| Disabled signature/key binding and removed wake length bounds | `pnpm exec vitest --run --project=route src/app/api/integrator/patient-reminders/materialize-wake/route.route.test.ts` failed four named cases: invalid signature, copied key, oversized wake and blank wake. |

## Final validation on restored candidate

```bash
cd apps/integrator && pnpm exec vitest run src/infra/runtime/scheduler/organizationTicks.unit.test.ts src/kernel/domain/executor/handlers/scheduledMaterialization.test.ts src/infra/adapters/webappEventsClient.materializeWake.test.ts
# 3 files passed; 6 tests passed

cd apps/webapp && pnpm exec vitest --run --project=route src/app/api/integrator/patient-reminders/materialize-wake/route.route.test.ts
# 1 file passed; 6 tests passed

pnpm exec eslint apps/integrator/src/infra/runtime/scheduler/organizationTicks.ts apps/integrator/src/infra/runtime/scheduler/organizationTicks.unit.test.ts apps/integrator/src/kernel/domain/executor/handlers/scheduledMaterialization.ts apps/integrator/src/kernel/domain/executor/handlers/scheduledMaterialization.test.ts apps/integrator/src/infra/adapters/webappEventsClient.ts apps/integrator/src/infra/adapters/webappEventsClient.materializeWake.test.ts
# exit 0

cd apps/webapp && pnpm exec eslint src/app/api/integrator/patient-reminders/materialize-wake/route.ts src/app/api/integrator/patient-reminders/materialize-wake/route.route.test.ts
# exit 0
```

No product source remains changed by the auditor; only acceptance tests and this report are part of the audit commit.
