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
- Archive/export of `integrator.rubitime_records` / `integrator.rubitime_events` done on TEST (owner-authorized
  destructive batch, TEST only; see `RUBITIME_RETIREMENT_TEST_R6_R7_PROGRESS_2026-07-24.md`).
- Last runtime reader removed: `apps/webapp/src/infra/platformUserFullPurge.ts` GDPR full-purge no longer
  deletes from `rubitime_records` / `rubitime_events` (purging rows in a table about to be dropped is moot).
- Drop migration generated (not yet applied to any DB):
  `apps/integrator/src/integrations/rubitime/db/migrations/20260724_0002_drop_r7_raw_tables.sql`. It drops all
  7 tables (`rubitime_records`, `rubitime_events`, `rubitime_api_throttle`, `rubitime_booking_profiles`,
  `rubitime_branches`, `rubitime_services`, `rubitime_cooperators`) with `IF EXISTS ... CASCADE`, idempotent.
  Only internal FK found: `rubitime_booking_profiles` -> `rubitime_branches`/`rubitime_services`/`rubitime_cooperators`,
  all in the same batch; no table outside this batch references any of these 7 tables.
- Non-prod restore/migrate proof is not complete (orchestrator applies the migration on TEST after independent
  audit; this worktree does not apply it).
- R7 archive+code-removal+migration-authoring is done; owner GO to apply on TEST is the remaining gate.
