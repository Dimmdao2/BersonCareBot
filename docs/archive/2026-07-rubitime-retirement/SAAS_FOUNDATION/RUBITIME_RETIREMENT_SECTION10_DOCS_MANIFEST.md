# Rubitime retirement section-10 docs manifest

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This manifest closes the execution-plan requirement "docs listed in section 10 are updated or have assigned follow-up
tasks" without pretending that R6/R7 production/archive work has already happened.

Machine check:

```bash
pnpm run check:rubitime-section10-docs
```

## Disposition

| Document                                                                | Disposition                          | Owner / phase                                                  | Follow-up                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/archive/legacy-underscore/SAAS_FOUNDATION/TENANT_HARD_MODE_EXECUTION_PLAN.md`      | `historical_record_no_execution`     | SaaS documentation owner                                       | Archived reasoning only: retain the Rubitime quarantine discussion as history; do not reopen it as a plan or assign agents from it.                                                                                                                      |
| `docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md`       | `follow_up_after_r6_r7`              | SaaS cleanup owner after R6/R7                                 | Reclassify Rubitime raw/projection rows from quarantine/retain to retired/archive/drop according to `RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md` and final `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md`.                                              |
| `docs/_TODO/SAAS_FOUNDATION/scope-derivation/t0-4-pre-table-matrix.tsv` | `follow_up_after_r7`                 | DB/schema owner after R7 migration proof                       | Move Rubitime raw tables from retain/quarantine to retired/drop; keep `patient_bookings`, `be_external_entity_mappings`, and `booking_calendar_map` according to the R7 disposition.                                                                     |
| `docs/archive/2026-07-rubitime-retirement/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`                        | `follow_up_after_r6`                 | Integrator/architecture owner after runtime route/code removal | Mark the Rubitime pipeline as retired/archived and point live booking docs to provider-neutral canonical lifecycle, canonical slots/create and R7 archive/drop proof.                                                                                    |
| `docs/archive/2026-07-rubitime-retirement/BOOKING_CANONICAL_CUTOVER.md`                          | `archived_after_retirement` | Rubitime retirement owner                                      | Historical canonical cutover background only. Rubitime was retired 2026-07-27; neither this file nor the old fresh-dump packet is a current entrypoint. |
| `docs/ARCHITECTURE/DB_STRUCTURE.md`                                     | `follow_up_after_r7`                 | DB/schema owner after drop/restore proof                       | Update table inventory only after migration-backed archive/drop is applied and fresh restore/migrate proof passes. Do not pre-edit schema inventory for tables that still exist.                                                                         |

## Current Status

- All six section-10 docs have an explicit disposition.
- Post-R6/R7 docs are assigned but intentionally not rewritten before the underlying production/archive proof exists.
- The final checklist can treat section-10 doc coverage as assigned; it must not treat R6/R7 itself as complete.
