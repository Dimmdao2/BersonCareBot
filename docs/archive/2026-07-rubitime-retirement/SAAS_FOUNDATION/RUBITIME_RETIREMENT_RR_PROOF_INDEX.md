# Rubitime retirement RR-PROOF index

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This index maps the required `RR-PROOF-01`..`RR-PROOF-10` gates from
`RUBITIME_RETIREMENT_EXECUTION_PLAN.md` to saved artifacts.

It does not claim Rubitime retirement is complete. `RR-PROOF-09` and `RR-PROOF-10` remain gated by owner-approved
production cutoff/drain and archive/drop operations.

Machine check:

```bash
pnpm run check:rubitime-retirement-proofs
```

Final gate after R6/R7:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-proofs.mjs --require-complete
```

## Proof Matrix

| Proof id                               | Status  | Artifact(s)                                                                                                                                                                                                                                              | Notes                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RR-PROOF-01-DUAL-SOURCE`              | PASS    | `RUBITIME_RETIREMENT_R1_DUAL_SOURCE_REPORT.md`; `RUBITIME_RETIREMENT_R1_OWNER_REVIEW_PACKET.md`; `RUBITIME_RETIREMENT_R1_CLEAN_DUMP_REHEARSAL.md`; `RUBITIME_RETIREMENT_R1_DOCTOR_UI_SMOKE.md`                                                           | Fresh Rubitime CSV is canon; integrator-only rows absent from CSV are audit-only.                                                                                                                                                                                                                                                          |
| `RR-PROOF-02-STATE-HISTORY`            | PASS    | `RUBITIME_RETIREMENT_R1_STATE_HISTORY_PROOF.md`                                                                                                                                                                                                          | Canonical state/history events are present; raw provider events remain archive/drop scope.                                                                                                                                                                                                                                                 |
| `RR-PROOF-03-NO-RUBITIME-SLOTS-CREATE` | PASS    | `RUBITIME_RETIREMENT_R3_SLOTS_CREATE_PROOF.md`                                                                                                                                                                                                           | Patient/public slots/create are canonical-only in code.                                                                                                                                                                                                                                                                                    |
| `RR-PROOF-04-EXACT-TENANT`             | PASS    | `RUBITIME_RETIREMENT_R3_TENANT_PROOF.md`                                                                                                                                                                                                                 | Patient/public booking derives exact tenant from trusted resource/context; no default-org fallback in booking paths.                                                                                                                                                                                                                       |
| `RR-PROOF-05-CATALOG-CUTOVER`          | PASS    | `RUBITIME_RETIREMENT_R3_CATALOG_PROOF.md`                                                                                                                                                                                                                | Patient/public runtime no longer reads public legacy `booking_*` catalog tables.                                                                                                                                                                                                                                                           |
| `RR-PROOF-06-LIFECYCLE-PARITY`         | PASS    | `RUBITIME_RETIREMENT_R4_LIFECYCLE_PROOF.md`                                                                                                                                                                                                              | Provider-neutral lifecycle endpoint preserves notifications, Web Push, reminders, payment, package, delete and reschedule semantics.                                                                                                                                                                                                       |
| `RR-PROOF-07-GCAL-REKEY`               | PASS    | `RUBITIME_RETIREMENT_R4_LIFECYCLE_PROOF.md`                                                                                                                                                                                                              | `booking_calendar_map` remains live and canonical lifecycle uses/adopts `be:*` keys without duplicate GCal events.                                                                                                                                                                                                                         |
| `RR-PROOF-08-IDEMPOTENCY`              | PASS    | `RUBITIME_RETIREMENT_R4_LIFECYCLE_PROOF.md`                                                                                                                                                                                                              | Durable lifecycle idempotency is DB-backed and proven across app instances.                                                                                                                                                                                                                                                                |
| `RR-PROOF-09-CUTOFF-DRAIN`             | PENDING | Prepared: `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md`; `RUBITIME_RETIREMENT_R6_R7_STATIC_INVENTORY.md`. Expected final: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md`                                                   | Needs owner-approved provider cutoff, disabled webhook/outbound bridge, drained queues and fresh post-cutoff CSV reconciliation. Required final interpretation: CSV-present missing delta zero or owner-waived; integrator-only rows absent from CSV are audit-only; integrator-led reconciliation is forbidden when the fresh CSV exists. |
| `RR-PROOF-10-DROP-RESTORE`             | PENDING | Prepared: `RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md`; `RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md`; `RUBITIME_RETIREMENT_R7_STATIC_REFERENCE_AUDIT.md`. Expected final: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` | Needs R1-R6 complete, owner archive/drop decision, archive export, drop migration and fresh restore/migrate proof. Required final interpretation: raw archive is archive-only and must not resurrect integrator-only rows absent from CSV; integrator-led reconciliation is forbidden when the fresh CSV exists.                           |

## Current Interpretation

- Proofs 01-08 are saved and checked by the manifest.
- Proofs 09-10 are intentionally not complete; completing them requires production/ops decisions and destructive-safe
  runbook execution.
- The final checklist item "all `RR-PROOF-*` artifacts are saved" must stay unchecked until the two expected final proof
  files for R6/R7 exist and `--require-complete` passes.
