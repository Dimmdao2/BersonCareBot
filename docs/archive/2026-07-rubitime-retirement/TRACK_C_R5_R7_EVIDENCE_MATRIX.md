# АРХИВ — Track C: R5–R7 evidence matrix

> Rubitime выведено из эксплуатации 2026-07-27. Матрица отражает промежуточное состояние старого retirement-прохода и не является текущим operational gate.

Date: 2026-07-22.<br>
Audited code baseline: `471fac8fd`.<br>
Audit run: `rubitime-981-c2-ops-audit`.<br>
Verdict: **WARN / operational completion NOT DONE**.

## Canon and evidence boundary

- Atomic denominator: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md`.
- Historical entrypoint at the time: `docs/archive/2026-07-rubitime-retirement/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md`; it is no longer executable canon.
- Current owner cadence: PROD untouched; routine verification is an incremental TEST deploy with forward migrations over the existing TEST DB; no routine fresh PROD dump, full reset, SaaS cutover, historical backfill or R7 drop rehearsal.
- Fresh Rubitime CSV remains the record-set canon. `integrator.rubitime_records` is diagnostic/audit material only and cannot create or resurrect import rows absent from the CSV.
- A static gate or historical unit test is code provenance, not runtime/cutoff completion.

## Summary

| Classification              |  Count |
| --------------------------- | -----: |
| Evidence already real       |      4 |
| Code-only                   |     18 |
| TEST-runtime-needed         |      8 |
| Owner-live-needed           |     11 |
| Stale/contradictory         |      4 |
| Deferred by current cadence |      3 |
| **Total**                   | **48** |

## R5 — 9 atomic rows

| ID    | Owner-plan acceptance row                                   | Classification      | Exact remaining evidence                                                                           |
| ----- | ----------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| R5-01 | No webapp path sends Rubitime v1 slots requests             | Code-only           | Confirm zero traffic in the integrated TEST window.                                                |
| R5-02 | No webapp path sends Rubitime v1 create requests            | Code-only           | Confirm zero traffic in the integrated TEST window.                                                |
| R5-03 | Online LFK/nutrition legacy path retired or unrelated       | Code-only           | Integrated TEST canonical online-booking smoke.                                                    |
| R5-04 | TEST `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false` tested | Stale/contradictory | Source flag has been removed; replace with current negative/unmounted TEST proof.                  |
| R5-05 | v1 requests return `legacy_resolve_disabled`                | Stale/contradictory | Current implementation removes/unmounts routes; expected live contract must be negative/unmounted. |
| R5-06 | Canonical/current booking paths unaffected                  | Code-only           | Integrated-SHA TEST slots/create/reschedule/cancel smoke.                                          |
| R5-07 | TEST evidence window shows no v1 requests                   | TEST-runtime-needed | Record aggregate-only route/error counts for a declared TEST window.                               |
| R5-08 | TEST flag change recorded                                   | Stale/contradictory | Supersede the removed-switch instruction with route-negative evidence.                             |
| R5-09 | TEST flag restore instruction exists                        | Stale/contradictory | Existing production-env rollback would revive retired traffic and is outside this work order.      |

## R6 — 23 atomic rows

| ID    | Owner-plan acceptance row                                                 | Classification      | Exact remaining evidence                                                   |
| ----- | ------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------- |
| R6-01 | Provider cutoff time announced                                            | Owner-live-needed   | Record exact TEST cutoff timestamp and operator.                           |
| R6-02 | Outbound Rubitime bridge disabled                                         | Owner-live-needed   | TEST/runtime and provider-side confirmation.                               |
| R6-03 | External Rubitime webhook ingress disabled                                | Owner-live-needed   | External/provider confirmation; route-literal zero alone is insufficient.  |
| R6-04 | `projection_outbox` drained                                               | TEST-runtime-needed | Read-only TEST aggregate snapshot.                                         |
| R6-05 | `rubitime_create_retry_jobs` drained or archived                          | TEST-runtime-needed | Read-only TEST snapshot; non-zero residue needs owner treatment.           |
| R6-06 | No pending/dead Rubitime projection jobs                                  | TEST-runtime-needed | TEST queue evidence; non-zero residue needs waiver.                        |
| R6-07 | Final dual-source reconciliation after cutoff run                         | TEST-runtime-needed | Fresh post-cutoff CSV reconciliation.                                      |
| R6-08 | CSV-present missing delta zero or waived; integrator-only rows audit-only | TEST-runtime-needed | Fresh CSV result; owner waiver only for a non-zero CSV-present delta.      |
| R6-09 | Old doctor Rubitime proxy routes removed                                  | Code-only           | Removal exists; cutoff/drain order and TEST negative proof remain.         |
| R6-10 | Staff/admin manual create skips legacy mapping resolution                 | Code-only           | Integrated TEST smoke.                                                     |
| R6-11 | Patient/public create has no Rubitime-first/mirror branch                 | Code-only           | Integrated TEST smoke.                                                     |
| R6-12 | Patient cancel/reschedule skips outbound Rubitime mirror                  | Code-only           | Integrated TEST smoke.                                                     |
| R6-13 | Rubitime webhook route unmounted from integrator                          | Code-only           | Static zero exists; TEST negative proof and external ingress state remain. |
| R6-14 | Rubitime `/slots` route unmounted                                         | Code-only           | TEST negative proof.                                                       |
| R6-15 | Rubitime `/create-record` route unmounted                                 | Code-only           | TEST negative proof.                                                       |
| R6-16 | Rubitime update/cancel/remove routes unmounted                            | Code-only           | TEST negative proof.                                                       |
| R6-17 | Provider-neutral booking lifecycle route works                            | Code-only           | Integrated TEST lifecycle smoke.                                           |
| R6-18 | Lifecycle handler/schema outside Rubitime registrar ownership             | Code-only           | Repo structure is proven; accumulated exact-SHA checks remain.             |
| R6-19 | Connector/api2/throttle code removed                                      | Code-only           | Static runtime token count is zero.                                        |
| R6-20 | Post-create projection code removed                                       | Code-only           | Static runtime token count is zero.                                        |
| R6-21 | Runtime Rubitime env/config keys removed or archived                      | Owner-live-needed   | Redacted TEST inventory plus explicit archive/remove decision.             |
| R6-22 | Integrator typecheck/lint/tests pass                                      | Code-only           | One accumulated gate on the final integrated SHA.                          |
| R6-23 | Webapp booking typecheck/lint/tests pass                                  | Code-only           | One accumulated gate on the final integrated SHA.                          |

Current static inventory at the audited baseline: mounted Rubitime route literals `0`; integrator Rubitime runtime imports `0`; Rubitime API-client runtime tokens `0`; legacy appointment-record references `150 hits / 28 files`; raw Rubitime table references `21 hits / 6 files`.

## R7 — 16 atomic rows

| ID    | Owner-plan acceptance row                                  | Classification              | Exact remaining evidence                                                |
| ----- | ---------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| R7-01 | R1–R6 complete                                             | TEST-runtime-needed         | R5/R6 runtime proofs remain open.                                       |
| R7-02 | Metadata inventory has no drop-candidate runtime refs      | TEST-runtime-needed         | Current raw refs are non-zero; TEST schema audit absent.                |
| R7-03 | Owner archive/drop decision recorded                       | Owner-live-needed           | Prepared disposition is not the owner decision.                         |
| R7-04 | Raw provider archive/export completed if required          | Owner-live-needed           | Archive target, retention and checksums.                                |
| R7-05 | `public.appointment_records` archive decision complete     | Owner-live-needed           | Current state is proposal only.                                         |
| R7-06 | `integrator.rubitime_records` archive decision complete    | Owner-live-needed           | Current state is proposal only; rows stay diagnostic-only.              |
| R7-07 | `integrator.rubitime_events` archive decision complete     | Owner-live-needed           | Current state is proposal only.                                         |
| R7-08 | `integrator.booking_calendar_map` kept/migrated explicitly | Evidence already real       | Explicit keep-until-replacement; Google Calendar still consumes it.     |
| R7-09 | `public.patient_bookings` explicitly kept                  | Evidence already real       | Explicit keep.                                                          |
| R7-10 | `be_external_entity_mappings` explicitly kept              | Evidence already real       | Explicit keep; provider rows require separate traceability policy.      |
| R7-11 | Public `booking_*` not dropped until R3-CATALOG complete   | Evidence already real       | Explicit defer-drop.                                                    |
| R7-12 | Drop migration generated                                   | Owner-live-needed           | Intentionally absent until R6 proof and owner disposition.              |
| R7-13 | Drop migration tested in TEST/disposable copy              | Deferred by current cadence | Destructive rehearsal is not routine incremental verification.          |
| R7-14 | Fresh restore + migrate proof passes                       | Deferred by current cadence | Full reset is not the current routine path; final R7 gate remains open. |
| R7-15 | No code references dropped tables                          | Deferred by current cadence | Tables are not dropped and references remain visible.                   |
| R7-16 | Rollback backup/archive available through approved horizon | Owner-live-needed           | Owner-approved horizon, archive and restore boundary absent.            |

## Minimal next executable sequence

1. Integrate the audited Track B and Track C code, freeze the exact feature-branch SHA and enumerate its pending forward migrations.
2. Run the Rubitime current guard, booking concurrency verifier and one accumulated full CI on that SHA.
3. Confirm all pending migrations are additive/backward-compatible with the current TEST deployment; stop and owner-gate any destructive/incompatible migration.
4. Run `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild`; preserve the existing TEST DB and apply only pending forward migrations.
5. Record a declared TEST window and prove old Rubitime routes negative/unmounted, provider-neutral lifecycle healthy, canonical slots/create/reschedule/cancel and occupied-slot recheck healthy, plus doctor Today/KPI/calendar/list smoke.
6. Record read-only aggregate queue snapshots and fresh post-cutoff CSV reconciliation. Never import integrator-only rows absent from the CSV.
7. Record pre-deploy SHA, migration-ledger delta and the safe code rollback boundary. A destructive/schema-incompatible rollback requires the R7 owner gate; the incremental deploy wrapper is not a DB rollback.

No R7 archive/drop/full-reset action is authorized or required by the current routine TEST milestone.

## Read-only TEST runtime pass — 2026-07-23 MSK

Run id: `rubitime_test_runtime_evidence`. Exact deployed SHA:
`45ffed7318c584cf501d6972e231d197bebce6f6`. Observation window:
`2026-07-22T22:10:42Z–22:22:14Z`. The pass changed no files, database rows, services or settings.

### Closed by live/runtime evidence

- R5-01, R5-02, R5-04, R5-05, R5-07, R5-08 and R5-09: retired slots/create/update/remove/event/webhook
  endpoints are unmounted or return 404; the bounded nginx window contained 30 requests and zero requests to the
  retired paths; the post-R6 static inventory has zero route literals, runtime imports and API-client tokens. The
  obsolete flag/`legacy_resolve_disabled` acceptance text is superseded by the negative/unmounted contract and must
  not be restored as rollback.
- R6-04: `projection_outbox` pending/due/dead aggregates are `0/0/0`.
- R6-09 through R6-16: exact deployed build/source plus negative TEST probes prove the old doctor proxy, webhook,
  slots, create, update, remove and legacy-event routes are absent and canonical write code has no active outbound
  Rubitime branch.
- R6-19 and R6-20: the post-R6 static guard reports zero connector/api2/throttle and post-create runtime tokens.
- R6-22 and R6-23: the accumulated exact-SHA CI evidence is green (integrator 1,352 tests, webapp focused booking
  set, lint, typecheck, builds and audit).

The pass finished with all five TEST services active, API health HTTP 200 and webapp HTTP 200. The first aggregate
query under the restricted API role was denied as expected; all recorded database aggregates were then read through
`postgres` inside `BEGIN READ ONLY`. No setting values, request payloads, IP addresses or personal data were printed.

### Still open after this pass

- R5-06 and R6-17: the deployed 22/22 product smoke proves canonical public slots and read surfaces, but is
  deliberately read-only. No existing canonical TEST script was found for create/reschedule/cancel lifecycle
  mutations, so an ad hoc mutation runner was not invented.
- R6-05 and R6-06: `integrator.rubitime_create_retry_jobs` has 22 pending rows, none due, with 20 dead-or-failed.
  Drain/archive/waiver disposition is an owner gate; this residue is not hidden as PASS.
- R6-21: key-only TEST inventory still contains the retired Rubitime bridge/API/mapping/webhook setting rows.
  Their values were not read. Archive/removal and rollback-horizon disposition is an owner gate.
- R6-01 through R6-03 and R6-07/R6-08: provider cutoff/ingress/outbound confirmation and a fresh post-cutoff CSV
  reconciliation remain absent.
- Every R7 archive/drop/reset/restore action remains blocked on the preceding evidence and explicit owner decisions.

No live regression was found, but Track C is not operationally complete.
