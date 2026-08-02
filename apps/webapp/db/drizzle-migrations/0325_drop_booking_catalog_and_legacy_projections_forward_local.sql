-- TEMPORARY LOCAL MIGRATION NUMBER 0325
-- Forward-only idempotent cleanup of the accepted 0298 product catalog removal
-- and 0304 legacy booking-projection retirement. Canonical booking be_* tables are not touched.

DROP TABLE IF EXISTS "be_product_history_events";
--> statement-breakpoint

DROP TABLE IF EXISTS "be_product_purchases";
--> statement-breakpoint

DROP TABLE IF EXISTS "be_product_pay_links";
--> statement-breakpoint

DROP TABLE IF EXISTS "be_products";
--> statement-breakpoint

ALTER TABLE IF EXISTS public.patient_bookings
  DROP CONSTRAINT IF EXISTS patient_bookings_branch_id_fkey,
  DROP CONSTRAINT IF EXISTS patient_bookings_branch_service_id_fkey,
  DROP CONSTRAINT IF EXISTS patient_bookings_service_id_fkey;
--> statement-breakpoint

ALTER TABLE IF EXISTS public.appointment_records
  DROP CONSTRAINT IF EXISTS appointment_records_branch_id_fkey;
--> statement-breakpoint

DROP TABLE IF EXISTS public.booking_branch_services;
DROP TABLE IF EXISTS public.booking_specialists;
DROP TABLE IF EXISTS public.booking_services;
DROP TABLE IF EXISTS public.booking_branches;
DROP TABLE IF EXISTS public.branches;
