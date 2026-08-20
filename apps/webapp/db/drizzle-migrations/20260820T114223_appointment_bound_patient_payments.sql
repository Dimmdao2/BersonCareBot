-- A patient ledger entry may settle exactly one canonical booking appointment.
ALTER TABLE public.patient_payment
  ADD COLUMN appointment_id uuid NULL REFERENCES public.be_appointments(id) ON DELETE SET NULL;

CREATE INDEX idx_patient_payment_appointment_id
  ON public.patient_payment (appointment_id);
