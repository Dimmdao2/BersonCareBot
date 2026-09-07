-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'doctor_patient_support' AND column_name = 'direct_chat_enabled' AND is_nullable = 'YES')
-- C3M-09: nullable preserves inherit semantics and never alters existing comment/media choices.
ALTER TABLE public.doctor_patient_support
  ADD COLUMN direct_chat_enabled boolean;
