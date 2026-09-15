-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_treatment_program_instances_one_active_per_patient' AND indexdef LIKE '%(organization_id, patient_user_id)%' AND indexdef LIKE '%NULLS NOT DISTINCT%');
DROP INDEX public.uq_treatment_program_instances_one_active_per_patient;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX uq_treatment_program_instances_one_active_per_patient
  ON public.treatment_program_instances (organization_id, patient_user_id) NULLS NOT DISTINCT
  WHERE status = 'active'::text;
