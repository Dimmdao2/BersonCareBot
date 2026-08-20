-- A patient ledger entry may settle exactly one canonical booking appointment.
ALTER TABLE public.patient_payment
  ADD COLUMN appointment_id uuid NULL REFERENCES public.be_appointments(id) ON DELETE SET NULL;

ALTER TABLE public.patient_payment
  ADD COLUMN idempotency_key text NULL;

CREATE INDEX idx_patient_payment_appointment_id
  ON public.patient_payment (appointment_id);

CREATE UNIQUE INDEX uq_patient_payment_appointment_idempotency
  ON public.patient_payment (organization_id, appointment_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
