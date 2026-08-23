-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.integrator_push_outbox') IS NULL
-- The retired M2M push queue and named root are removed; reminder rules remain webapp-owned.

DROP TABLE IF EXISTS public.integrator_push_outbox;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.enqueue_current_reminder_rule_push(text)') IS NULL

DROP FUNCTION IF EXISTS app.enqueue_current_reminder_rule_push(text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.integrator_upsert_reminder_rule(text,text,uuid,bigint,text,boolean,text,text,integer,integer,integer,text,text,text,text,text,text,text,text,integer,integer,text,boolean)') IS NULL

DROP FUNCTION IF EXISTS app.integrator_upsert_reminder_rule(text,text,uuid,bigint,text,boolean,text,text,integer,integer,integer,text,text,text,text,text,text,text,text,integer,integer,text,boolean);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'integrator.direct_public_write_retries'::regclass AND pg_get_constraintdef(oid) LIKE '%reminder_rule_upsert%')

ALTER TABLE integrator.direct_public_write_retries
  DROP CONSTRAINT IF EXISTS direct_public_write_retries_operation_check;
ALTER TABLE integrator.direct_public_write_retries
  ADD CONSTRAINT direct_public_write_retries_operation_check CHECK (
    operation IN (
      'support_delivery_attempt_append',
      'reminder_occurrence_sent_record',
      'reminder_occurrence_failed_record',
      'reminder_occurrence_expired_record',
      'reminder_delivery_log_append'
    )
  );
