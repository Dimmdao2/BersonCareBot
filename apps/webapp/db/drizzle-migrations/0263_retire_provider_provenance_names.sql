-- Retire the last provider-named values and comments left in the booking provenance columns.
--
-- Owner, 2026-07-27: «Я СКАЗАЛ В ПИЗДУ» — Rubitime leaves the product entirely. Migration 0262 removed the
-- tables, columns and the `rubitime_projection` source label. This one finishes the job in the two places the
-- name survived: the provenance VALUES (`rubitime_external`, 127 + 74 rows on TEST) and the two column
-- COMMENTS that still quoted the provider as an example.
--
-- The neutral value is `external_import`, matching `source = 'imported'` from 0262: the row came from an
-- external booking system that no longer exists. Which system it was is deliberately no longer recorded.

UPDATE public.patient_bookings
SET provenance_created_by = 'external_import'
WHERE provenance_created_by = 'rubitime_external';
--> statement-breakpoint
UPDATE public.patient_bookings
SET provenance_updated_by = 'external_import'
WHERE provenance_updated_by = 'rubitime_external';
--> statement-breakpoint
COMMENT ON COLUMN public.patient_bookings.provenance_created_by IS
  'Origin of create: e.g. external_import, patient_native';
--> statement-breakpoint
COMMENT ON COLUMN public.patient_bookings.provenance_updated_by IS
  'Last external sync actor hint: e.g. external_import';
