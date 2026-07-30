# Rubitime retirement R3-CATALOG — `branchServiceId` removal preparation

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-22. Taskdb: `#981`. Branch: `codex/rubitime-provenance-981`.

## Scope and boundary

This is a repository-only preparation record for the owner-authorized TEST-only
removal of the patient/public `branchServiceId` compatibility input. It does
not record a TEST deployment, database mutation, archive/export, table drop,
cutoff, or final R5/R6/R7 proof.

Historical `patient_bookings.branchServiceId` values remain untouched. The
R7 keep list remains unchanged: `public.patient_bookings`,
`public.be_external_entity_mappings`, `integrator.booking_calendar_map`, and
public `booking_*` are not dropped by this preparation.

Fresh Rubitime CSV remains the preservation canon. Raw
`integrator.rubitime_records` is audit-only when the CSV exists and may not
create an import or drop blocker.

## Atomic evidence matrix

| Exact checklist intent                                                                        | Code evidence                                                                                                                                         | Test/static evidence                                                                                                                                                                                              | Runtime/owner gate                                                                                 | Verdict                           |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------- |
| compatibility adapters are removed by the bounded deadline or explicitly rebaselined by owner | Patient/public schemas and resolver now require `branchId + serviceId`; canonical scheduling resolves an active SSA directly.                         | `check-rubitime-retirement-r0-freeze.mjs` now rejects any `branchServiceId` in patient/public runtime roots; current run PASS. Focused route and resolver tests assert canonical input and legacy-only rejection. | No TEST deploy/window has run. TEST owner authorization is limited to the later serialized window. | repository-prepared, runtime open |
| public slots use canonical catalog ids                                                        | `/api/booking/public/slots` passes only canonical ids into `patientBooking.getSlots`; public widget links emit canonical ids.                         | R0 guard PASS; focused public slots test updated.                                                                                                                                                                 | Requires TEST smoke through the trusted slug path.                                                 | repository-prepared, runtime open |
| public create uses canonical catalog ids                                                      | `/api/booking/public/create` resolves slug-bound canonical ids and creates with canonical ids; city is read from canonical branch.                    | R0 guard PASS; focused public create test updated.                                                                                                                                                                | Requires TEST create smoke and rollback observation.                                               | repository-prepared, runtime open |
| patient create works without Rubitime                                                         | `/api/booking/create` and `canonicalCreate` receive canonical ids; new `patient_bookings` projection writes no legacy catalog link.                   | R0 guard PASS; focused patient create/canonical-create tests updated.                                                                                                                                             | Requires TEST create, cancel/reschedule observation.                                               | repository-prepared, runtime open |
| archive/drop/rollback machinery is prepared without fake proof                                | Existing DB cleanup sequence, R7 disposition and archive/drop runbook remain canonical; only the R0 wrapper was extended with a bounded static guard. | `check-rubitime-db-cleanup-sequence` PASS; `check-rubitime-r7-table-disposition` PASS.                                                                                                                            | R6 cutoff/drain, owner archive decision, migration and TEST restore proof remain mandatory.        | prepared, not complete            |

## Pre-window verification actually run

```text
node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-r0-freeze.mjs                 PASS
node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-r0-freeze.mjs --self-test     PASS
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6   PASS
node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-db-cleanup-sequence.mjs                  PASS
node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-r7-table-disposition.mjs                 PASS
```

The post-R6 inventory still reports `rubitimeRawTableRuntimeRefs = 21 hits / 6
files`. They are the documented R7 schema/defer references and are not
removed in this pass.

## READY_FOR_TEST: existing wrappers and protected inputs

Do not run this section until the orchestrator grants the serialized TEST
window. The only destructive fresh-copy entrypoint is the existing wrapper:

```bash
bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset ...
```

Use the exact complete argument set, CSV SHA-256 and owner-reviewed FIO hashes
from `RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md` and
`deploy/host/deploy-test-saas.sh`; do not invent SQL, run a standalone restore,
or call a direct DROP. Required protected inputs before that wrapper runs:

- owner-approved fresh Rubitime CSV with the documented one-specialist context;
- its staged checksum and the owner-reviewed FIO manifest/review hashes;
- explicit TEST target confirmation and the orchestrator's destructive window;
- approved archive/defer decision and rollback horizon before any R7 migration.

For code-only TEST deployment use the documented non-restore wrapper
`bash deploy/host/deploy-test.sh [branch]`. It is not archive/drop authority.

## Explicitly not closed

- No TEST flag, data, archive, export, drop migration, restore or deployment was run.
- R5 monitoring, R6 cutoff/drain and R7 archive/drop/restore remain open.
- `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` and
  `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` were not created.
