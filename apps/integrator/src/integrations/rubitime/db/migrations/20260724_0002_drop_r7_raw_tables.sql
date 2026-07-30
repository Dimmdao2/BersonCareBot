-- Rubitime retirement R7: DROP the 7 raw Rubitime provider tables (owner-authorized, TEST only).
-- Runbook: docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md
-- Disposition: docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md
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
--
-- One statement per table (repo convention -- every other migration in this codebase drops one table per
-- DROP TABLE statement, never a comma-separated multi-table list; a comma-separated list also isn't
-- parsed correctly by docs/_TODO/SAAS_FOUNDATION/scripts/actual-schema-tables.mjs's DROP_TABLE_RE, which
-- only captures the first table name after DROP TABLE). rubitime_booking_profiles is dropped first since
-- it is the FK child (branch_id/service_id/cooperator_id -> rubitime_branches/services/cooperators); the
-- CASCADE on each remaining statement is a defensive no-op once that FK holder is already gone.
-- ── ORDER GUARD (added 2026-07-25 after the from-zero prod-dump rehearsal) ────────────────────────
-- The preconditions in the header ("R1-R6 complete") hold for the long-lived TEST database this
-- migration was authored against, but NOT for a fresh restore of the prod dump: there, the Rubitime
-- history has not been imported yet and `integrator.rubitime_records` / `_events` are still the SOURCE
-- the import reads. The migration chain runs BEFORE that import, so dropping here destroyed the source
-- and the pipeline then aborted at the R1 clean-dump preflight with `schema_not_current`
-- (missing integrator.rubitime_records.{record_at,rubitime_record_id,status}, integrator.rubitime_events.id).
--
-- The binding runbook order is: R1-R6 import → R7 archive → R7 DROP (drop is LAST, owner-gated). So this
-- migration now self-defers instead of running out of order: it drops ONLY when the raw tables are empty
-- or absent, i.e. when there is no history left to lose. On a from-zero run it no-ops with a notice, and
-- the historical drop was completed at the END of the retirement pipeline after archive verification.
-- That procedure and its now-inert one-shot live only under docs/archive/2026-07-rubitime-retirement/;
-- they are not current operator entrypoints.
-- Guard predicate = "is there still raw history to lose?", NOT "does a projection exist". A partially
-- populated `be_appointments.source='rubitime_projection'` is NOT proof the import ran: PROD already
-- projects Rubitime into canonical rows continuously, so a fresh prod dump arrives WITH projection rows
-- AND with the un-imported raw source. Keying on the projection therefore let the drop through on
-- rehearsal run 10 and destroyed the source again. Only emptiness/absence of the raw tables is safe.
DO $r7_order_guard$
DECLARE
  v_raw_records bigint := 0;
  v_raw_events bigint := 0;
BEGIN
  IF to_regclass('integrator.rubitime_records') IS NOT NULL THEN
    SELECT count(*) INTO v_raw_records FROM integrator.rubitime_records;
  END IF;
  IF to_regclass('integrator.rubitime_events') IS NOT NULL THEN
    SELECT count(*) INTO v_raw_events FROM integrator.rubitime_events;
  END IF;

  IF v_raw_records > 0 OR v_raw_events > 0 THEN
    RAISE NOTICE 'R7 raw-table DROP DEFERRED: raw history still present (rubitime_records=%, rubitime_events=%). Rubitime retirement tooling is archived and must not be run; resolve through a new owner-approved migration plan.',
      v_raw_records, v_raw_events;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS rubitime_booking_profiles CASCADE;
  DROP TABLE IF EXISTS rubitime_records CASCADE;
  DROP TABLE IF EXISTS rubitime_events CASCADE;
  DROP TABLE IF EXISTS rubitime_api_throttle CASCADE;
  DROP TABLE IF EXISTS rubitime_branches CASCADE;
  DROP TABLE IF EXISTS rubitime_services CASCADE;
  DROP TABLE IF EXISTS rubitime_cooperators CASCADE;
  RAISE NOTICE 'R7 raw-table DROP applied (raw tables were empty or absent).';
END
$r7_order_guard$;
