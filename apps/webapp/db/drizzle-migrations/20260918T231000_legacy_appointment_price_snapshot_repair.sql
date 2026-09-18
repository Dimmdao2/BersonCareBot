-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM public.be_appointments AS appointment JOIN (SELECT booking.organization_id, booking.canonical_appointment_id, MIN(booking.price_minor_snapshot) AS price_minor FROM public.patient_bookings AS booking WHERE booking.canonical_appointment_id IS NOT NULL AND booking.price_minor_snapshot IS NOT NULL GROUP BY booking.organization_id, booking.canonical_appointment_id HAVING MIN(booking.price_minor_snapshot) = MAX(booking.price_minor_snapshot)) AS projection ON projection.organization_id = appointment.organization_id AND projection.canonical_appointment_id = appointment.id WHERE appointment.price_minor IS NULL)
--
-- The first appointment-price migration repaired rows which already had a patient-booking
-- projection at that moment. An older staff creation path could still create a later appointment
-- without its own price while its projection carried the exact price shown in the doctor UI. The
-- cash root correctly refuses an appointment without a canonical ceiling, so those rows displayed
-- a payable amount but rejected cash as `invalid_payment_amount`.
--
-- Repair only an unambiguous historical projection: every projection row for the same tenant and
-- canonical appointment must agree on one non-null amount. Current writers already persist the
-- appointment-owned snapshot; this is a bounded compatibility backfill, not a second live source.
UPDATE public.be_appointments AS appointment
SET price_minor = projection.price_minor
FROM (
  SELECT
    booking.organization_id,
    booking.canonical_appointment_id,
    MIN(booking.price_minor_snapshot) AS price_minor
  FROM public.patient_bookings AS booking
  WHERE booking.canonical_appointment_id IS NOT NULL
    AND booking.price_minor_snapshot IS NOT NULL
  GROUP BY booking.organization_id, booking.canonical_appointment_id
  HAVING MIN(booking.price_minor_snapshot) = MAX(booking.price_minor_snapshot)
) AS projection
WHERE projection.organization_id = appointment.organization_id
  AND projection.canonical_appointment_id = appointment.id
  AND appointment.price_minor IS NULL;
