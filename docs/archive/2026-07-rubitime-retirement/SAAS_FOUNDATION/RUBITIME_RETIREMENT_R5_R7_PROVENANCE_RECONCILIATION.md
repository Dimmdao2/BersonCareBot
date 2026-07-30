# Rubitime retirement R3-CATALOG / R5-R7 provenance reconciliation

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-22.
Branch baseline: `feat/doctor-ui-rebuild` at `471fac8fd`.
Task: taskdb `#981`.

## Scope and verdict

This is a read-only code/runtime-evidence reconciliation. No route, application code, DB, data, host, TEST, PROD,
deploy, cutoff, archive or drop action was performed.

The current repository contains three different kinds of state which must not be collapsed into one checkbox:

1. **Repository implementation provenance** — code/tests or a disposition document exist.
2. **Runtime evidence** — a declared TEST/live window, queue snapshot, traffic snapshot, CSV reconciliation or
   restore/migrate run actually passed.
3. **Owner gate** — the owner approved timing, cutoff, archive/defer and rollback decisions.

The reconciliation found:

- R3-CATALOG's table-read cutover remains proven, but its `branchServiceId` compatibility removal deadline
  `2026-07-21` expired while patient/public runtime still accepts and propagates that input. R3-CATALOG is therefore
  not final even though `RR-PROOF-05` remains valid for the narrower claim "no patient/public read of legacy
  `booking_*` tables".
- R5 repository/unit proof exists, but its removed-flag/`legacy_resolve_disabled` acceptance is superseded. Current
  acceptance is TEST negative/unmounted route evidence plus healthy canonical smoke; the TEST window remains open.
- R6 route/code artifacts exist and the post-R6 static categories are zero, but they were applied before the
  mandatory cutoff/drain prerequisites and `RR-PROOF-09`. They are retained as implementation provenance only;
  they do not close R6 and must not be interpreted as permission to deploy, restore routes, or perform cutoff.
- R7 keep/defer dispositions exist. Archive/drop, migration and restore proof remain owner-gated and open.

## Current static evidence

Commands run from the branch baseline:

```bash
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6
pnpm run check:rubitime-retirement-current
```

Measured result:

- post-R6 hard categories: `0 / 0 / 0` for mounted Rubitime route literals, integrator Rubitime runtime imports and
  Rubitime API-client runtime tokens;
- raw Rubitime table refs: `21 hits / 6 files`, including the newly visible
  `apps/integrator/src/infra/db/operationalPoolReadiness.ts` reference;
- the current static R0 gate is green at this baseline; this static result remains repository provenance, not
  TEST cutoff/drain/archive/drop evidence;
- no DB-backed, TEST, live or owner evidence was collected by this pass.

This document does not turn the green static gate into TEST, owner, cutoff/drain, archive/drop, or rollback proof.

## Atomic closure matrix

Status vocabulary:

- `PASS-repo` — repository evidence proves exactly this row.
- `OPEN-runtime` — runtime evidence required by the linked runbook is absent.
- `OPEN-owner` — owner decision/authorization is required.
- `PROVENANCE-only` — implementation exists, but its phase-order acceptance is invalid until the preceding gate.

### R3-CATALOG

| ID       | Atomic owner row                             | Status       | Code/test/runtime evidence                                                                                                             | Remaining gate                                                                                                                          |
| -------- | -------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `R3C-01` | disposition for `booking_cities`             | `PASS-repo`  | `RUBITIME_RETIREMENT_R3_CATALOG_PROOF.md` table disposition                                                                            | none for this row                                                                                                                       |
| `R3C-02` | disposition for `booking_branches`           | `PASS-repo`  | same table disposition                                                                                                                 | none for this row                                                                                                                       |
| `R3C-03` | disposition for `booking_branch_services`    | `PASS-repo`  | canonical SSA + compatibility mapping recorded                                                                                         | compatibility drain is `R3C-11`                                                                                                         |
| `R3C-04` | disposition for `booking_services`           | `PASS-repo`  | same table disposition                                                                                                                 | none for this row                                                                                                                       |
| `R3C-05` | disposition for `booking_specialists`        | `PASS-repo`  | same table disposition                                                                                                                 | none for this row                                                                                                                       |
| `R3C-06` | public catalog reads `be_*`/approved views   | `PASS-repo`  | saved catalog proof; `RR-PROOF-05`                                                                                                     | generic public catalog still intentionally fails closed without org source                                                              |
| `R3C-07` | public slots use canonical catalog ids       | `PASS-repo`  | primary `branchId+serviceId`; compatibility input remains                                                                              | `R3C-11`                                                                                                                                |
| `R3C-08` | public create uses canonical catalog ids     | `PASS-repo`  | primary `branchId+serviceId`; compatibility input remains                                                                              | `R3C-11`                                                                                                                                |
| `R3C-09` | legacy ids removed from primary contract     | `PASS-repo`  | legacy id is no longer primary                                                                                                         | `R3C-11` still accepts it as fallback input                                                                                             |
| `R3C-10` | no patient/public read of public `booking_*` | `PASS-repo`  | saved proof and canonical mapping path; this is the exact `RR-PROOF-05` claim                                                          | none for table-read claim                                                                                                               |
| `R3C-11` | compatibility removed by bounded deadline    | `OPEN-owner` | deadline `2026-07-21` expired; source census still finds `branchServiceId` in public/patient schemas, URLs, slots/create and RSC paths | owner must approve a new exact cutoff after old-link/row drain evidence, or explicitly defer/rebaseline with date and rollback boundary |

### R5

| ID      | Atomic owner row                                                         | Status         | Code/test/runtime evidence                                           | Remaining gate                                                                                 |
| ------- | ------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `R5-01` | no webapp v1 slots requests                                              | `PASS-repo`    | R5 non-prod proof/runtime inventory                                  | live traffic window remains `R5-07`                                                            |
| `R5-02` | no webapp v1 create requests                                             | `PASS-repo`    | R5 non-prod proof/runtime inventory                                  | live traffic window remains `R5-07`                                                            |
| `R5-03` | online LFK/nutrition path retired/unrelated                              | `PASS-repo`    | categories use canonical online booking                              | none for this row                                                                              |
| `R5-04` | TEST retired v1 routes are negative/unmounted                            | `OPEN-runtime` | supersedes removed-flag unit proof; no TEST window/route observation | integrated-SHA incremental TEST deploy and declared negative-route evidence                    |
| `R5-05` | retired v1 slots/create requests have declared negative/unmounted result | `OPEN-runtime` | supersedes historical `legacy_resolve_disabled` route test           | record actual TEST result without inferring a response code                                    |
| `R5-06` | canonical/current paths unaffected                                       | `PASS-repo`    | v2 explicit-id route proof                                           | live acceptance remains open                                                                   |
| `R5-07` | evidence window has no v1 requests                                       | `OPEN-owner`   | no approved TEST/live monitoring window output                       | approve timing/window, then capture aggregate counts                                           |
| `R5-08` | TEST negative/unmounted observation and aggregate counts recorded        | `OPEN-runtime` | no declared TEST window/counts                                       | record window, integrated SHA and aggregate-only counts                                        |
| `R5-09` | TEST rollback boundary avoids re-enabling removed resolver               | `OPEN-runtime` | historical flag restore is superseded                                | record compatible incremental fallback boundary; otherwise stop for owner/R7 rollback decision |

### R6

| ID      | Atomic owner row                           | Status            | Code/test/runtime evidence                                                                                           | Remaining gate                                                                 |
| ------- | ------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `R6-01` | provider cutoff announced                  | `OPEN-owner`      | absent                                                                                                               | approve and record exact cutoff timestamp                                      |
| `R6-02` | outbound bridge disabled                   | `OPEN-owner`      | repository staff/patient paths are retired, but no owner-approved provider/live confirmation exists                  | owner/operator confirmation in `RR-PROOF-09`                                   |
| `R6-03` | external webhook ingress disabled          | `OPEN-owner`      | route literals are statically zero; external provider registration state is unknown                                  | owner/operator confirmation in `RR-PROOF-09`                                   |
| `R6-04` | `projection_outbox` drained                | `OPEN-runtime`    | no approved drain snapshot                                                                                           | runbook Section 1 after approval                                               |
| `R6-05` | retry jobs drained/archived                | `OPEN-runtime`    | provider-neutral queue still uses legacy physical storage; no approved snapshot/decision                             | runbook Section 1 plus owner treatment for residue                             |
| `R6-06` | no pending/dead projection jobs            | `OPEN-runtime`    | no approved queue evidence                                                                                           | runbook Section 1 plus owner waivers if non-zero                               |
| `R6-07` | final post-cutoff reconciliation           | `OPEN-runtime`    | absent                                                                                                               | fresh post-cutoff CSV, existing read-only tooling                              |
| `R6-08` | CSV-present missing delta zero/waived      | `OPEN-owner`      | absent; fresh CSV remains canon                                                                                      | owner approves result/waivers; integrator-only rows stay audit-only            |
| `R6-09` | doctor Rubitime proxy routes removed       | `PROVENANCE-only` | source removal recorded in plan                                                                                      | do not close phase row until `R6-01..08` and `RR-PROOF-09` pass                |
| `R6-10` | staff create skips legacy mapping          | `PROVENANCE-only` | C0/R6 repository implementation                                                                                      | same prerequisite; no restoration inferred                                     |
| `R6-11` | patient/public create has no mirror branch | `PROVENANCE-only` | repository implementation and static proof                                                                           | same prerequisite                                                              |
| `R6-12` | cancel/reschedule skips outbound mirror    | `PROVENANCE-only` | repository implementation                                                                                            | same prerequisite                                                              |
| `R6-13` | webhook route unmounted                    | `PROVENANCE-only` | static mounted-route category `0`                                                                                    | external ingress confirmation still `R6-03`                                    |
| `R6-14` | `/slots` unmounted                         | `PROVENANCE-only` | static mounted-route category `0`                                                                                    | `RR-PROOF-09`                                                                  |
| `R6-15` | `/create-record` unmounted                 | `PROVENANCE-only` | static mounted-route category `0`                                                                                    | `RR-PROOF-09`                                                                  |
| `R6-16` | update/cancel/remove unmounted             | `PROVENANCE-only` | static mounted-route category `0`                                                                                    | `RR-PROOF-09`                                                                  |
| `R6-17` | provider-neutral lifecycle works           | `PROVENANCE-only` | R4/R6 route-split proof                                                                                              | final live lifecycle-only acceptance remains gated                             |
| `R6-18` | handler/schema outside Rubitime registrar  | `PROVENANCE-only` | repository implementation                                                                                            | compatibility/live acceptance remains gated                                    |
| `R6-19` | connector/api2/throttle code removed       | `PROVENANCE-only` | runtime token category `0`                                                                                           | `RR-PROOF-09`; historical migrations/ops refs remain                           |
| `R6-20` | post-create projection removed             | `PROVENANCE-only` | runtime token category `0`                                                                                           | `RR-PROOF-09`                                                                  |
| `R6-21` | runtime env/config retired/archived        | `OPEN-owner`      | no owner-approved env/archive evidence                                                                               | R5/R6 operator decision; no env action by agents                               |
| `R6-22` | integrator checks pass                     | `OPEN-runtime`    | historical focused checks exist; no milestone check tied to completed `RR-PROOF-09`                                  | run after valid R6 gate/branch state                                           |
| `R6-23` | webapp booking checks pass                 | `OPEN-runtime`    | historical focused checks exist; the current R0 aggregate gate is green, but no exact integrated-SHA R6 check exists | run the required R6 checks on the exact integrated SHA after the valid R6 gate |

### R7

| ID      | Atomic owner row                          | Status         | Code/test/runtime evidence                              | Remaining gate                                                      |
| ------- | ----------------------------------------- | -------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| `R7-01` | R1-R6 complete                            | `OPEN-owner`   | R5/R6 final proofs absent                               | complete preceding gates                                            |
| `R7-02` | fresh metadata inventory has no drop refs | `OPEN-runtime` | static inventory still has `21 hits / 6 files` raw refs | approved schema audit and migration/defer packet                    |
| `R7-03` | archive/drop decision recorded            | `OPEN-owner`   | prepared disposition is not final owner decision        | approve archive/drop or explicit defer                              |
| `R7-04` | raw provider archive/export completed     | `OPEN-owner`   | absent                                                  | approve target, retention and execution                             |
| `R7-05` | `appointment_records` decision completed  | `OPEN-owner`   | prepared `archive_before_drop` only                     | owner final decision/proof                                          |
| `R7-06` | `rubitime_records` decision completed     | `OPEN-owner`   | prepared `archive_before_drop` only                     | owner final decision/proof                                          |
| `R7-07` | `rubitime_events` decision completed      | `OPEN-owner`   | prepared `archive_before_drop` only                     | owner final decision/proof                                          |
| `R7-08` | `booking_calendar_map` kept/migrated      | `PASS-repo`    | disposition `keep_until_replacement`                    | do not drop while GCal is live                                      |
| `R7-09` | `patient_bookings` kept                   | `PASS-repo`    | disposition `keep`                                      | none                                                                |
| `R7-10` | `be_external_entity_mappings` kept        | `PASS-repo`    | disposition `keep`                                      | Rubitime-row traceability remains separate owner policy             |
| `R7-11` | public `booking_*` not dropped early      | `PASS-repo`    | disposition `defer_drop`                                | R3C-11 must close before later catalog drop planning                |
| `R7-12` | drop/defer migration generated            | `OPEN-owner`   | intentionally absent                                    | R6 proof + owner decision first                                     |
| `R7-13` | migration tested on TEST/disposable       | `OPEN-owner`   | absent                                                  | explicit non-prod destructive authorization and generated migration |
| `R7-14` | fresh restore+migrate proof               | `OPEN-runtime` | absent                                                  | valid migration/defer state and approved fresh-copy run             |
| `R7-15` | no code refs to dropped tables            | `OPEN-runtime` | nothing has been dropped; raw refs remain visible       | post-migration static/schema proof                                  |
| `R7-16` | rollback archive through horizon          | `OPEN-owner`   | absent                                                  | approve retention/rollback horizon and capture checksums            |

## Exact owner questions

1. **R3-CATALOG compatibility:** the `2026-07-21` removal deadline expired while `branchServiceId` remains a live
   patient/public compatibility input. Approve either (a) a new exact cutoff after evidence that old URLs/rows are
   drained, followed by a bounded code stage that rejects the legacy input, or (b) an explicit defer/rebaseline with
   date, reason and rollback boundary. Until then the adapter stays live and R3-CATALOG remains open.
2. **R6 pre-applied removal:** accept the already integrated route/code removal only as dormant repository
   provenance pending the full owner-approved cutoff/drain/CSV proof, or require a separately scoped restoration
   decision before any deployment. Agents must not infer either choice. In both cases R6 remains open until
   `RR-PROOF-09` exists.
3. **R5/R6/R7 operations:** approve none by implication. Timing, monitoring window, cutoff, provider disable,
   residue waivers, archive/drop/defer and rollback horizon remain the explicit Gate 1-3 questions in
   `RUBITIME_RETIREMENT_OWNER_GATE_PACKET.md`.

## Handoff

- Do not restore or delete compatibility/routes from this reconciliation alone.
- Do not create final proof placeholders.
- Keep `check:rubitime-retirement-complete` red until the required real proof files exist.
- Historical note: an earlier baseline reported an R0 freeze drift. That statement is superseded by the current
  green R0 gate recorded above; it does not close the open exact integrated-SHA R6-23 checks.
