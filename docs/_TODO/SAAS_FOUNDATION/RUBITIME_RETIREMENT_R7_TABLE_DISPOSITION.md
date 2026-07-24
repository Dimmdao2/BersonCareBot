# Rubitime retirement R7 table disposition

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This is the explicit R7 table disposition for Rubitime retirement. It does not approve any archive/export/drop and does
not execute SQL. R7 remains blocked until R1-R6 are complete and the owner records the archive/drop decision.

repo-first DB cleanup sequence for the current prep scope:
`docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md`. It explains how this disposition is used to
hand off SaaS Foundation cleanup planning without treating live archive/drop as a current blocker and without
hiding remaining raw references.

Machine check:

```bash
pnpm run check:rubitime-r7-table-disposition
```

Final destructive gate:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-r7-table-disposition.mjs --require-drop-ready
```

The final gate must fail until `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md`,
`RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md`, archive export evidence and the owner archive/drop decision exist.

## Keep / Defer

| Table | Decision | Reason |
| --- | --- | --- |
| `public.patient_bookings` | `keep` | Canonical patient booking history/runtime table. It is not Rubitime raw history and must not be dropped by Rubitime retirement. |
| `public.be_external_entity_mappings` | `keep` | Canonical external identity/mapping table. Rubitime rows can be handled by a later traceability policy, but the table itself remains live. |
| `integrator.booking_calendar_map` | `keep_until_replacement` | Active provider-neutral Google Calendar map while GCal sync is live. It may only be replaced by a tested canonical map/rekey migration. |
| `public.booking_*` | `defer_drop` | Legacy public catalog compatibility. These tables are not Rubitime raw provider history and are not dropped by the Rubitime raw-table retirement batch. |

## Archive Before Drop

Archive/export decision is required before destructive migration:

- `public.appointment_records`
- `integrator.rubitime_records`
- `integrator.rubitime_events`
- `public.rubitime_records`, if present
- `public.rubitime_events`, if present

The raw archive is archive-only; it must not resurrect integrator-only rows absent from CSV or expand the
canonical preservation set beyond the fresh Rubitime export.
Fresh Rubitime CSV remains the preservation canon. Integrator-only rows absent from the CSV are audit/rollback deltas,
not import targets and not standalone R1/R2/R7 blockers.
Integrator-led reconciliation is forbidden when the fresh CSV exists: raw integrator state cannot create a new import
backlog or block final gates for rows absent from the CSV.

## Drop Candidates

Drop candidates only after archive/export, R6 runtime removal, static no-reference proof and owner approval:

- `integrator.rubitime_api_throttle`
- `integrator.rubitime_booking_profiles`
- `integrator.rubitime_branches`
- `integrator.rubitime_services`
- `integrator.rubitime_cooperators`

`integrator.rubitime_create_retry_jobs` is not in this list: it was a legacy-Rubitime-named table already
repurposed into generic message-delivery infra (`kind='message.deliver'`), not Rubitime raw provider history.
Owner directive 2026-07-24: physically renamed now to `integrator.message_retry_jobs` (not deferred to R7) --
`apps/integrator/src/infra/db/migrations/core/20260724_0001_rename_rubitime_create_retry_jobs_to_message_retry_jobs.sql`.
It is not a drop candidate.

## Current Status

- Keep/defer decisions above are explicit and checked.
- Non-final post-R6 static reference audit is prepared in `RUBITIME_RETIREMENT_R7_STATIC_REFERENCE_AUDIT.md`.
- Archive/export is not complete.
- Drop migration is not generated.
- Non-prod restore/migrate proof is not complete.
- R7 remains pending until the R7 runbook is executed after R6 cutoff/drain.
