# Patient reminder materialization: B0 replacement evidence (2026-08-17)

> **Integration correction.** The standalone live entrypoint from `ff2c19445` is now an internal step of the one
> canonical `pnpm --dir apps/webapp run test:db-behavior:named-dev` command. Combined audit one also invalidated and
> removed the SQL-source boundary test; consequences 4 and 5 below remain open current-port behavior work.

## Decision

The retired eight-case PostgreSQL oracle is not repaired or replayed. It targeted four split functions and a
disposable historical-migration harness that are not part of the B0 runtime. Three consequences have a current
rollback-only named-DEV behavior step, one has a current application behavior test, two are declaration/security
facts, and two remain explicitly unproved instead of being represented by SQL-source matching.

The live auditor supplies one non-secret organization UUID obtained from an authenticated real-account context; the
step does not use a dev-bypass or perform login. All database calls go through
`createPgPatientReminderMaterializationPort` under that organization principal. It does not create a database, run a
migration, use raw SQL, disable RLS, or leave a fixture:

```bash
pnpm --dir apps/webapp run test:db-behavior:named-dev:self-test
pnpm --dir apps/webapp run test:db-behavior:named-dev
```

The second command is a named-DEV runtime step and was intentionally not run while preparing this correction. It
refuses any target except the four canonical loopback URLs for `bcb_webapp_dev` in `port-context` mode.

## Assertion-by-assertion replacement

| # | Retired consequence | Current executable replacement |
| ---: | --- | --- |
| 1 | A tenant cannot materialize another tenant's reminder. | The named-DEV step calls the current atomic port with a foreign organization and requires PostgreSQL `42501`. |
| 2 | A queue-side failure rolls back the occurrence. | The named-DEV step sends one valid delivery followed by a deliberately invalid second envelope. PostgreSQL has already inserted the first queue leg when it raises `22023`; two attempts must both leave the exact occurrence id/key absent from `readSnapshot`. |
| 3 | An unavailable patient is not materialized. | The named-DEV step passes an unknown patient identity and requires `not_actionable`. |
| 4 | Queue event/generation/recipient evidence is exact and stale delivery is stopped. | **Required current oracle.** The worker test covers the later stale-delivery decision, but no surviving behavior oracle proves the atomic database binding itself. |
| 5 | Concurrent calls converge on one occurrence key. | **Required current oracle.** Repeated rollback proves absence after a forced failure, not successful concurrent convergence; this consequence remains open. |
| 6 | An old wake cannot reset a snoozed generation. | `runPatientReminderMaterializationWake.audit.unit.test.ts` executes a generation-1 planned snooze after the original slot and requires it to be passed unchanged to the atomic port. |
| 7 | Materialization functions are owned by the isolated definer owner. | `reminder-materialization-declaration.test.mjs` reads the current declaration and requires all three current roots to be `SECURITY DEFINER` under `app_seam_reminder_materialization_owner`. |
| 8 | Runtime roles have only exact EXECUTE capabilities and no direct table bypass. | The same declaration test requires only `app_tenant_service` execution, forbids `PUBLIC`, requires the exact current occurrence read/cancel grants (with no occurrence `INSERT`/`UPDATE`), and forbids direct queue grants for staff, tenant service, patient and public roles. |

## Gates

```bash
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

The mapping does not claim that a static declaration gate is a live database run. The named-DEV step supplies the
real rollback evidence; the declaration and worker tests cover only their exact non-fixture contracts.

## Preparation result

The replacement was prepared from production correction parent
`be04488333a5cbd0123279af877c4670b63a7cf8`. The R2 audit at
`1dce211a6aabdb8f767346e9fb1e93197573d9c7` is the fail-before evidence: it collected all eight retired tests, then
proved that their two required migration inputs and package entrypoint no longer existed, so none of their database
assertions could execute.

The original preparation gates passed at their recorded SHA, but combined audit one established that the boundary
gate inspected SQL source and therefore did not prove product behavior. That test is removed. The retained self-test
has adversarial target-refusal and leak-detection cases; occurrence convergence stays in the required queue.

No database, DEV, TEST, PROD, deploy, migration or reconcile command was run in this preparation branch. The live
command remains an explicit audit step against named DEV after an authenticated organization UUID is supplied.
