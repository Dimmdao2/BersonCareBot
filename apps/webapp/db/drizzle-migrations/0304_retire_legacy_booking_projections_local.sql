-- V9b S01: retire the five legacy booking projections after canonical be_* adoption.

ALTER TABLE public.patient_bookings
  DROP CONSTRAINT IF EXISTS patient_bookings_branch_id_fkey,
  DROP CONSTRAINT IF EXISTS patient_bookings_branch_service_id_fkey,
  DROP CONSTRAINT IF EXISTS patient_bookings_service_id_fkey;

ALTER TABLE public.appointment_records
  DROP CONSTRAINT IF EXISTS appointment_records_branch_id_fkey;

DROP TABLE IF EXISTS public.booking_branch_services;
DROP TABLE IF EXISTS public.booking_specialists;
DROP TABLE IF EXISTS public.booking_services;
DROP TABLE IF EXISTS public.booking_branches;
DROP TABLE IF EXISTS public.branches;
