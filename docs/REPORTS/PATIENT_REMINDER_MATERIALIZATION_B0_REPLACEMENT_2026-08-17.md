# Patient reminder materialization: B0 replacement evidence (2026-08-17)

> **Integration notice.** The standalone live package entrypoint recorded below was true for audited commit
> `ff2c19445`; after integration it is invoked only inside the canonical
> `pnpm --dir apps/webapp run test:db-behavior:named-dev` runner. Historical commands and results below are preserved.

## Decision

The retired eight-case PostgreSQL oracle is not repaired or replayed. It targeted four split functions and a
disposable historical-migration harness that are not part of the B0 runtime. Its eight assertions are replaced by
the current atomic capability, maintained executable gates, and one rollback-only named-DEV behavior step.

The live auditor supplies one non-secret organization UUID obtained from an authenticated real-account context; the
step does not use a dev-bypass or perform login. All database calls go through
`createPgPatientReminderMaterializationPort` under that organization principal. It does not create a database, run a
migration, use raw SQL, disable RLS, or leave a fixture:

```bash
pnpm --dir apps/webapp run test:db-behavior:patient-reminder-materialization:named-dev:self-test
pnpm --dir apps/webapp run test:db-behavior:patient-reminder-materialization:named-dev -- \
  --organization-id <authenticated-organization-uuid>
```

The second command is a named-DEV runtime step and was intentionally not run while preparing this correction. It
refuses any target except the four canonical loopback URLs for `bcb_webapp_dev` in `port-context` mode.

## Assertion-by-assertion replacement

| # | Retired consequence | Current executable replacement |
| ---: | --- | --- |
| 1 | A tenant cannot materialize another tenant's reminder. | The named-DEV step calls the current atomic port with a foreign organization and requires PostgreSQL `42501`. `reminder-materialization-boundary.test.mjs` also kills removal of the organization predicate. |
| 2 | A queue-side failure rolls back the occurrence. | The named-DEV step sends one valid delivery followed by a deliberately invalid second envelope. PostgreSQL has already inserted the first queue leg when it raises `22023`; two attempts must both leave the exact occurrence id/key absent from `readSnapshot`. |
| 3 | An unavailable patient is not materialized. | The named-DEV step passes an unknown patient identity and requires `not_actionable`. The boundary gate requires active enrollment and non-blocked, non-archived, non-merged patient predicates and kills their removal. |
| 4 | Queue event/generation/recipient evidence is exact and stale delivery is stopped. | The boundary gate checks event, generation, payload, status and nested recipient invariants with fault injection. `outgoingDeliveryWorker.reminderGeneration.d21.test.ts` executes the worker decision for stale generation, terminal action, mute, topic and channel disable without a provider call. |
| 5 | Concurrent calls converge on one occurrence key. | The boundary gate requires `ON CONFLICT (occurrence_key) DO NOTHING`, exact-key `FOR UPDATE`, winner identity/generation checks and kills removal of the conflict/lock invariants. The live rollback step repeats the same stable id/key and proves no partial row survives either attempt. |
| 6 | An old wake cannot reset a snoozed generation. | `runPatientReminderMaterializationWake.audit.unit.test.ts` executes a generation-1 planned snooze after the original slot and requires it to be passed unchanged to the atomic port. |
| 7 | Materialization functions are owned by the isolated definer owner. | `reminder-materialization-declaration.test.mjs` reads the current declaration and requires all three current roots to be `SECURITY DEFINER` under `app_seam_reminder_materialization_owner`. |
| 8 | Runtime roles have only exact EXECUTE capabilities and no direct table bypass. | The same declaration test requires only `app_tenant_service` execution, forbids `PUBLIC`, requires the exact current occurrence read/cancel grants (with no occurrence `INSERT`/`UPDATE`), and forbids direct queue grants for staff, tenant service, patient and public roles. |

## Gates

```bash
node --test deploy/postgres/privileges/reminder-materialization-boundary.test.mjs
node --experimental-strip-types --test deploy/postgres/privileges/reminder-materialization-declaration.test.mjs
pnpm --dir apps/webapp exec vitest --run \
  src/app-layer/reminders/runPatientReminderMaterializationWake.audit.unit.test.ts \
  src/infra/repos/pgPatientReminderMaterialization.unit.test.ts \
  src/modules/reminders/materializePatientReminderDeliveries.unit.test.ts \
  src/modules/patient-notifications/resolveNotificationChannels.unit.test.ts
pnpm --dir apps/integrator exec vitest --run \
  src/infra/runtime/worker/outgoingDeliveryWorker.reminderGeneration.d21.test.ts \
  src/infra/scripts/reconcile-dev-patient-reminder-orphans-core.test.ts \
  src/infra/adapters/webappEventsClient.materializeWake.test.ts
```

The mapping does not claim that a static gate is a live database run. The named-DEV step supplies the real atomic
rollback evidence; the declaration and worker tests cover the non-fixture ownership and delivery-decision contracts.

## Preparation result

The replacement was prepared from production correction parent
`be04488333a5cbd0123279af877c4670b63a7cf8`. The R2 audit at
`1dce211a6aabdb8f767346e9fb1e93197573d9c7` is the fail-before evidence: it collected all eight retired tests, then
proved that their two required migration inputs and package entrypoint no longer existed, so none of their database
assertions could execute.

All non-live preparation gates above passed. The named-DEV step self-test passed `4/4`; the expanded declaration and
boundary gates passed `7/7`; the full capability suite passed `84/84`; targeted webapp tests passed `10/10`; targeted
integrator tests passed `16/16`; both application typechecks, four workspace package builds, ESLint, generator
byte-identity, B0 baseline, raw-SQL and diff checks passed. The boundary and self-tests include adversarial mutations
that prove target refusal, leak detection, occurrence convergence and unavailable-patient assertions turn red when
their protected invariant is removed.

No database, DEV, TEST, PROD, deploy, migration or reconcile command was run in this preparation branch. The live
command remains an explicit audit step against named DEV after an authenticated organization UUID is supplied.
