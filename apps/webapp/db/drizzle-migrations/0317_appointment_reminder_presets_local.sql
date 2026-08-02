-- TEMPORARY LOCAL MIGRATION NUMBER 0317
-- #190: specialist-owned appointment reminder choices, snapshot on the canonical appointment,
-- and a narrow patient-owned override. The integrator keeps consuming the resolved offsets.

ALTER TABLE public.be_specialists
  ADD COLUMN IF NOT EXISTS appointment_reminder_allowed_preset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS appointment_reminder_default_preset_id text;
--> statement-breakpoint

ALTER TABLE public.be_appointments
  ADD COLUMN IF NOT EXISTS appointment_reminder_allowed_preset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS appointment_reminder_preset_id text,
  ADD COLUMN IF NOT EXISTS appointment_reminder_selection_source text NOT NULL DEFAULT 'specialist_default';
--> statement-breakpoint

ALTER TABLE public.be_appointments
  DROP CONSTRAINT IF EXISTS be_appointments_reminder_selection_source_check;
--> statement-breakpoint

ALTER TABLE public.be_appointments
  ADD CONSTRAINT be_appointments_reminder_selection_source_check
  CHECK (appointment_reminder_selection_source = ANY (ARRAY['specialist_default'::text, 'patient'::text]));
--> statement-breakpoint

-- RLS on be_appointments already limits app_patient to platform_user_id = current patient.
-- Column grants let that patient read and replace only the schedule snapshot, never appointment ownership/state.
GRANT SELECT (id, organization_id, status, appointment_reminder_allowed_preset_ids,
  appointment_reminder_preset_id, appointment_reminder_selection_source)
  ON public.be_appointments TO app_patient;
--> statement-breakpoint

GRANT UPDATE (appointment_reminder_preset_id, appointment_reminder_selection_source, updated_at)
  ON public.be_appointments TO app_patient;
