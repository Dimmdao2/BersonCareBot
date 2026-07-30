# Rubitime retirement R6/R7 static inventory

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.
Commit when created: pending commit after this document.

## Scope

This is a static, aggregate-only pre-cutoff inventory for R6/R7. It does not prove R6 complete and does not approve
R7 archive/drop. It records what must become zero only after the owner-approved cutoff/drain proof allows Rubitime
runtime route/code removal.

No production DB, env, service, webhook, Rubitime endpoint, or patient data was accessed.

## Tool

Command:

```bash
pnpm run check:rubitime-retirement-inventory
```

Underlying script:

```bash
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs
```

Post-R6 gate command:

```bash
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6
```

The script emits paths/counts, not row data. Post-R6 blocker categories use a JavaScript/TypeScript lexical comment
mask, so line/block comments cannot count as executable evidence while strings, regex literals and template literals
remain intact. It excludes tests/spec files, named test-only helper contracts and historical migration paths, and
does not scan docs/archive as runtime evidence. Ops/audit scripts are always excluded from post-R6 runtime categories
before category-specific filters run and are reported separately as `rubitimeOpsToolingRefs`.

Test/spec classification covers the scanned TypeScript, JavaScript and MJS extensions. A fixture/stub/helper-named
module is treated as test-only only when the source import census finds at least one test consumer and no runtime
consumer. The same helper remains visible when any runtime module imports it.

## Current pre-cutoff output summary

Latest run time against current branch baseline: 2026-07-23 (D0 truthful-retirement-gate correction).

| Category                                 | Phase        |      Current result | Meaning                                                                                                                                                               |
| ---------------------------------------- | ------------ | ------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mountedRubitimeRouteLiterals`           | R6           |    0 hits / 0 files | No Rubitime-named runtime route surfaces remain in scanned runtime source.                                                                                            |
| `integratorRubitimeRuntimeImports`       | R6           |    0 hits / 0 files | Integrator app wiring no longer imports/mounts Rubitime runtime registrars.                                                                                           |
| `rubitimeApiClientRuntimeTokens`         | R6           |    0 hits / 0 files | No Rubitime API client/throttle/post-create runtime tokens remain.                                                                                                    |
| `rubitimeBookingUpsertRuntime`           | R6/D9        |  35 hits / 10 files | The Rubitime-specific `booking.upsert` branch and executable `booking-rubitime-sync` package modules remain active.                                                   |
| `appointmentRecordUpsertedFanoutBuilder` | R6/D9        |    5 hits / 2 files | `buildAppointmentRecordUpsertedFanout` remains in the integrator write path.                                                                                          |
| `appointmentRecordUpsertedProducer`      | R6/D9        |    2 hits / 2 files | Integrator still produces `appointment.record.upserted`.                                                                                                              |
| `appointmentRecordUpsertedHandler`       | R6/D9        |     2 hits / 1 file | Webapp still handles `appointment.record.upserted`.                                                                                                                   |
| `integratorEventsRoute`                  | D10          |      1 hit / 1 file | The filesystem-mounted `/api/integrator/events` receiver remains.                                                                                                     |
| `projectionEmitOrEnqueueRuntime`         | D10          |    3 hits / 2 files | `tryEmitWebappProjectionThenEnqueue` remains in runtime.                                                                                                              |
| `projectionOutboxRuntime`                | D10          |  52 hits / 10 files | Projection transport storage, repositories and health/runtime references remain; comments, migrations, ops scripts and test-only stubs do not inflate the count.      |
| `projectionWorkerRuntime`                | D10          |    6 hits / 2 files | The executable projection worker implementation and runtime loop remain.                                                                                              |
| `legacyAppointmentRecordRuntimeRefs`     | R6/R7        | 150 hits / 28 files | Legacy appointment table references remain for archive/backfill/compat paths.                                                                                         |
| `rubitimeRawTableRuntimeRefs`            | R7           |   21 hits / 6 files | Raw Rubitime table/queue references remain in runtime/schema/readiness/active purge storage until R7 archive/drop/defer decision. Ops tooling is reported separately. |
| `providerNeutralKeepTableRefs`           | R7 keep-list | 160 hits / 43 files | Explicit keep-list references, not a drop signal.                                                                                                                     |
| `rubitimeOpsToolingRefs`                 | R6/R7 ops    | 543 hits / 25 files | Ops/audit/backfill scripts with Rubitime references; reported, not a post-R6 runtime blocker.                                                                         |

The three narrow legacy route/API categories remain zero, but they were an incomplete gate. The corrected post-R6
and direct-public retirement verdict is **FAIL** while the eight D0 categories below remain:

```text
rubitimeBookingUpsertRuntime=35
appointmentRecordUpsertedFanoutBuilder=5
appointmentRecordUpsertedProducer=2
appointmentRecordUpsertedHandler=2
integratorEventsRoute=1
projectionEmitOrEnqueueRuntime=3
projectionOutboxRuntime=52
projectionWorkerRuntime=6
```

Default inventory mode remains non-destructive and exits zero while reporting these categories. The final
`--expect-post-r6` mode exits non-zero until later Track D packages retire every category. This gate correction does
not complete R6: `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` still separately requires owner-approved
cutoff/drain, fresh post-cutoff CSV reconciliation and proof capture.

## Current R6 blocker files

Mounted Rubitime route literals:

- none after `R6-INTEGRATOR-LEGACY-SOURCE-DELETE-codex-2026-07-14`.

Integrator Rubitime runtime imports:

- none after `R6-INTEGRATOR-RUNTIME-WIRING-codex-2026-07-14`.

Rubitime API/client/runtime tokens:

- none after `R6-INTEGRATOR-LEGACY-SOURCE-DELETE-codex-2026-07-14`.

Corrected D9/D10 blockers:

- `apps/integrator/src/infra/db/writePort.ts` and `packages/booking-rubitime-sync/src/**` — Rubitime-specific
  `booking.upsert` branch/package;
- `apps/integrator/src/infra/db/buildAppointmentRecordUpsertedFanout.ts` plus its write-port calls — producer
  builder;
- `apps/integrator/src/kernel/contracts/projectionEventTypes.ts` and
  `apps/integrator/src/infra/db/buildAppointmentRecordUpsertedFanout.ts` — `appointment.record.upserted` producer;
- `apps/webapp/src/modules/integrator/events.ts` — `appointment.record.upserted` handler;
- `apps/webapp/src/app/api/integrator/events/route.ts` — mounted receiver;
- `apps/integrator/src/infra/db/repos/projectionFanout.ts` and `writePort.ts` — immediate HTTP emit/outbox fallback;
- integrator projection-outbox schema/repositories/health/runtime references — transport storage;
- `apps/integrator/src/infra/runtime/worker/projectionWorker.ts` and `main.ts` — projection worker and loop.

Ops/audit/backfill tooling with Rubitime references is reported under `rubitimeOpsToolingRefs`. It includes
historical backfills, schema cleanup scans, phone-admin purge tooling and seed/audit scripts. These files are not
allowed to call live Rubitime endpoints after R6, but their archival/table references do not make the R6 runtime gate
fail by themselves.

## How to use this in R6/R7

1. Before owner-approved cutoff/drain: use this document as inventory only.
2. After cutoff/drain proof passes: remove/unmount Rubitime runtime routes and connector code.
3. Run `node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6`.
4. R6/D10 code removal is not complete until every category marked `postR6MustBeZero` is zero: the three historical
   Rubitime route/API categories plus all eight D0 appointment-projection and HTTP/outbox transport categories.
   Remaining `rubitimeOpsToolingRefs` must stay ops-only and must not be wired into runtime routes/workers.
5. R7 archive/drop is not complete until this static inventory, the R7 runbook reference scans, fresh restore/migrate
   proof, and owner archive/drop decision all pass.

## 2026-07-14 R6 Integrator Wiring Cleanup

`R6-INTEGRATOR-RUNTIME-WIRING-codex-2026-07-14` removed active integrator wiring for Rubitime record M2M routes,
Rubitime admin M2M routes, Rubitime webhook registrar default injection, Rubitime registry capability, and the
operator-health outbound Rubitime schedule probe. The provider-neutral
`/api/bersoncare/booking/lifecycle-event` route remains mounted.

This does not close R6. Remaining post-R6 blockers are legacy source modules with Rubitime route literals and API
client/throttle/post-create tokens, plus the webapp Rubitime M2M/admin client cleanup.

## 2026-07-14 R6 Webapp M2M Client Cleanup

`R6-WEBAPP-M2M-CLIENT-RETIRE-codex-2026-07-14` retired webapp Rubitime M2M/admin clients without removing the
provider-neutral lifecycle emitter. `createBookingSyncPort().emitBookingEvent` remains the signed webapp to integrator
lifecycle-event path. Legacy slots/create/update/cancel/delete methods fail closed without HTTP, and the Rubitime admin
M2M facade fails closed without calling integrator.

After this cleanup, the post-R6 inventory no longer reports webapp files under `mountedRubitimeRouteLiterals`.
Remaining route literal blockers are the legacy integrator Rubitime source modules listed above.

## 2026-07-14 R6 Legacy Integrator Source Cleanup

`R6-INTEGRATOR-LEGACY-SOURCE-DELETE-codex-2026-07-14` removed legacy Rubitime route source, external API client,
throttle, post-create projection and related tests from `apps/integrator/src/integrations/rubitime`. The old
compare/resync ops scripts no longer import the live Rubitime client and fail closed with
`rubitime_external_api_retired` for external fetch attempts.

After this cleanup, `node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6`
passes for the R6 runtime route/API blocker categories. R6 still needs the owner-approved cutoff/drain proof before
the final checklist may be checked.

## 2026-07-14 R6 Source Layer And Raw Event Writer Cleanup

`R6-INTEGRATOR-RUBITIME-SOURCE-LAYER-DELETE-codex-2026-07-14` removed the remaining unused
`apps/integrator/src/integrations/rubitime` runtime/test/config/schema source layer, the Rubitime-specific e2e webhook
scenario, the autoloaded `apps/integrator/src/content/rubitime` orchestrator bundle, and the stale `writePort`
special-case writer from `event.log(eventStore='booking')` into `integrator.rubitime_events`. Historical SQL migrations
under `apps/integrator/src/integrations/rubitime/db/migrations` remain because the integrator migrator still discovers
integration migrations from that path.

After this cleanup, the post-R6 inventory still passes with the three hard R6 categories at zero and
`rubitimeRawTableRuntimeRefs` reduced to 70 hits / 19 files. Remaining raw-table references are R7
archive/drop/defer scope, not a live Rubitime endpoint and not a reason to treat `integrator.rubitime_records` as the
preservation canon over the fresh Rubitime CSV.

## 2026-07-14 R7 Webapp Raw Projection Cleanup

`R7-WEBAPP-RAW-PROJECTION-RETIRE-codex-2026-07-14` removed the `projectRubitimeRecords` service/port/repository path
from the admin booking bridge. The bridge projection remains available for legacy `appointment_records` rehearsal
work, but no longer reads `integrator.rubitime_records` or uses integrator-only raw rows as a projection source.

After this cleanup, the post-R6 inventory still passes with the three hard R6 categories at zero and
`rubitimeRawTableRuntimeRefs` reduced to 64 hits / 17 files. Remaining raw-table references are R7 archive/drop/defer
scope, not a live Rubitime endpoint and not a reason to treat `integrator.rubitime_records` as the preservation canon
over the fresh Rubitime CSV.

## 2026-07-14 R7 Generic Retry Queue Runtime Naming Cleanup

`R7-INTEGRATOR-GENERIC-RETRY-QUEUE-NAMING-codex-2026-07-14` renamed the integrator runtime Drizzle symbol for the
legacy physical table `integrator.rubitime_create_retry_jobs` from `rubitimeCreateRetryJobs` to `messageRetryJobs`.
The table remains physically unchanged until a migration-backed R7 archive/drop/defer decision. The queue runtime is
provider-neutral message delivery retry infrastructure and still maps to the legacy table only as storage.

After this cleanup, `node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6`
still passes with the three hard R6 categories at zero and `rubitimeRawTableRuntimeRefs` reduced to
63 hits / 17 files. Remaining references to `rubitime_create_retry_jobs` are the physical SQL table name, historical
migration/schema evidence and R6/R7 drain/archive/drop tooling.

## 2026-07-14 R7 Ops Tooling Classification Cleanup

`R7-STATIC-INVENTORY-OPS-CLASSIFY-codex-2026-07-14` stopped double-counting ops/audit scripts inside
`rubitimeRawTableRuntimeRefs`. The same script files remain visible in `rubitimeOpsToolingRefs`; this is a
classification cleanup only, not a runtime proof and not a table-drop approval.

One stale comment in `branchTimezone.ts` was also made provider-neutral. The function already reads
`public.booking_branches` / `public.branches`; it does not read the retired provider branch table.

After this cleanup, `node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6`
still passes with the three hard R6 categories at zero and `rubitimeRawTableRuntimeRefs` reduced to
20 hits / 5 files. Remaining runtime/schema refs are:

- `apps/integrator/src/infra/db/integratorDrizzleSchema.ts` — exported Drizzle schema while legacy tables still exist.
- `apps/integrator/src/infra/db/schema/integratorDomainRepos.ts` — physical raw table declarations until R7 archive/drop.
- `apps/integrator/src/infra/db/schema/integratorQueues.ts` — provider-neutral message retry queue mapped to legacy physical storage.
- `apps/integrator/src/infra/db/repos/jobQueue.ts` — active provider-neutral retry queue SQL against that legacy physical storage.
- `apps/webapp/src/infra/platformUserFullPurge.ts` — active strict-purge cleanup for raw-table remnants keyed by phone.

These references are not safe repo-only deletes before owner R6 cutoff/drain proof, archive/export decision and a
migration-backed R7 drop/defer.

## 2026-07-22 Current-Branch Refresh

Task `#981` reran the inventory without DB/host access. The three hard post-R6 categories remain zero, but the raw
table aggregate is now `21 hits / 6 files`. The additional file is
`apps/integrator/src/infra/db/operationalPoolReadiness.ts`, which checks physical queue-table readiness; it is R7
schema/defer evidence, not a live Rubitime provider route.

Current six raw-table reference files:

- `apps/integrator/src/infra/db/integratorDrizzleSchema.ts`;
- `apps/integrator/src/infra/db/operationalPoolReadiness.ts`;
- `apps/integrator/src/infra/db/repos/jobQueue.ts`;
- `apps/integrator/src/infra/db/schema/integratorDomainRepos.ts`;
- `apps/integrator/src/infra/db/schema/integratorQueues.ts`;
- `apps/webapp/src/infra/platformUserFullPurge.ts`.

This refresh does not close R6/R7. The R6 removal state is repository provenance only until `RR-PROOF-09`, and all
six references remain R7 migration/defer scope.

## 2026-07-23 D0 Truthful Retirement Gate Correction

Track D D0 corrected the false-green `--expect-post-r6` verdict. The earlier three-category check did not cover the
still-active Rubitime appointment projection and generic HTTP/outbox transport that Track D retires in D9/D10.

Deterministic self-test:

```bash
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --self-test
```

The self-test starts from a clean temporary source tree and injects one executable runtime fixture for each of the
eight D0 categories. Every positive case proves `cleanVerdict=pass` and `fixtureVerdict=fail`.

Its negative/adversarial matrix also proves:

- line-comment-only and block-comment-only source stays zero for every one of the eight D0 categories;
- source-looking snippets under `docs/`, historical TypeScript migrations and test-only helpers imported by tests do
  not become runtime blockers;
- `.test.js` and `.spec.mjs` sources are test-only, while fixture/stub helpers imported by both test and runtime code
  remain visible as runtime blockers;
- `apps/integrator/src/infra/scripts/resync-rubitime-records.ts`-style ops tooling remains non-blocking but is still
  visible in `rubitimeOpsToolingRefs`;
- comment markers inside strings, regex literals and template literals do not hide a following executable blocker.

The self-test reads no env/DB/runtime data and removes its temporary fixture tree after every case.

Current/final behavior:

- default/current inventory: exits `0` and reports every blocker with source paths;
- `--expect-post-r6`: exits `1` on the current branch with all eight D0 categories listed;
- final completion gate inherits that non-zero verdict until later D packages remove the relevant runtime.

This package changes only the guard and its evidence. It does not delete producers, handlers, routes, outbox
storage/workers, runtime code, migrations or data.
