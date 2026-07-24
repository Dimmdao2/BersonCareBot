-- Rubitime retirement R7: DROP the 7 raw Rubitime provider tables (owner-authorized, TEST only).
-- Runbook: docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md
-- Disposition: docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md
--
-- Preconditions already satisfied before this migration was authored:
--   - R1-R6 complete (see RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md / TEST_R6_R7_PROGRESS_2026-07-24.md).
--   - `integrator.rubitime_records` / `integrator.rubitime_events` archived (pg_dump --data-only + SHA256SUMS)
--     per Section 3 of the R7 runbook.
--   - Static reference audit shows no runtime code path reads these 7 tables (the last runtime reader,
--     apps/webapp/src/infra/platformUserFullPurge.ts GDPR full-purge, had its rubitime_records/rubitime_events
--     deletes removed -- purging rows in a table that is about to be dropped is moot).
--   - `check:rubitime-r7-table-disposition` is green.
--
-- Scope: ONLY the 7 Rubitime raw-provider tables below. Does NOT touch `public.appointment_records`
-- (still has runtime refs, dropped separately later), `integrator.message_retry_jobs` (renamed off the
-- Rubitime name, generic delivery infra, KEEP), `public.patient_bookings`, `public.be_external_entity_mappings`,
-- `integrator.booking_calendar_map`, or any `public.booking_*` catalog table.
--
-- FK dependency check performed before authoring this migration: `integrator.rubitime_booking_profiles` has
-- FKs to `rubitime_branches(id)`, `rubitime_services(id)`, `rubitime_cooperators(id)` -- all three are in this
-- same drop batch, so no CASCADE effect reaches outside this table list. No table outside this batch has an
-- FK referencing any of these 7 tables (verified via schema dump + repo-wide grep for "REFERENCES rubitime").
--
-- Idempotent: IF EXISTS guards make this safe to run once, or again after a partial apply.
-- Unqualified names, matching every other migration in this directory (connection search_path resolves
-- to the integrator schema; these tables were originally created unqualified by
-- 20260306_0009_add_rubitime_tables.sql / 20260401_0004_rubitime_booking_profiles.sql / 20260413_0001_rubitime_api_throttle.sql).
DROP TABLE IF EXISTS
  rubitime_records,
  rubitime_events,
  rubitime_api_throttle,
  rubitime_booking_profiles,
  rubitime_branches,
  rubitime_services,
  rubitime_cooperators
CASCADE;
