# Rubitime retirement on TEST — R6 drain + R7 batch plan (2026-07-24)

> Track C execution progress on TEST (owner authorized the destructive batch ON TEST, not prod). Runbooks remain
> authoritative: `RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md`, `RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md`,
> `RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md`. Sequence: R6 drain → R3C-11 branchServiceId removal → R7 archive+DROP.

## R6 drain state on TEST — PROVEN CLEAN (read-only, 2026-07-24)
- `integrator.projection_outbox`: `outbox_due = 0`, `outbox_dead = 0` (3330 done, 9 cancelled). ✓
- Provider quiet: `integrator.rubitime_records` = 91 total, **0 updated in last 24h**. ✓
- `rubitime_create_retry_jobs` renamed → `message_retry_jobs` (generic delivery queue, KEEP); its 46 stuck
  `message.deliver` rows were cleared earlier (owner-authorized test junk). ✓
- No live Rubitime exchange on TEST (send-safety; no provider) → drain trivially satisfied. R6 pass-criteria met.

## R3C-11 branchServiceId removal — IN PROGRESS (worker)
Gates the legacy `booking_*` catalog drop. Removing the deprecated `branchServiceId` compat shim (catalog already
migrated to `be_*`). `patient_bookings.branchServiceId` = historical trace-only, untouched.

## R7 batch plan (for owner GO on the exact list before any DROP)
7 `integrator.rubitime_*` tables present on TEST:

| Table | Rows | Disposition |
|---|---|---|
| `rubitime_records` | 91 | **ARCHIVE** (pg_dump --data-only + SHA) → then DROP |
| `rubitime_events` | 409 | **ARCHIVE** → then DROP |
| `rubitime_api_throttle` | — | **DROP** (after archive + static no-ref) |
| `rubitime_booking_profiles` | — | **DROP** |
| `rubitime_branches` | — | **DROP** |
| `rubitime_services` | — | **DROP** |
| `rubitime_cooperators` | — | **DROP** |

Also archive `public.appointment_records` before its (later) removal. `message_retry_jobs`, `patient_bookings`,
`be_external_entity_mappings`, `integrator.booking_calendar_map`, `public.booking_*` (until R3C-11 done) = **KEEP**.

**Gates before DROP (per runbook):** R3C-11 done → archive done + SHA256SUMS → `pnpm run
check:rubitime-retirement-inventory --expect-post-r6` green + `rg` shows only docs/archives/migrations → generate a
NORMAL repo migration for the DROP (no ad-hoc DROP) → **explicit owner GO on this exact table list** → disposable
restore+migrate proof. Then apply on TEST.

## Status
R6 drain ✓ · R3C-11 in progress · R7 = awaiting R3C-11 + archive + static-no-ref + owner GO on the list above.
