-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.record_integrator_support_delivery_attempt(uuid,text,text,text,text,integer,text,text,timestamp with time zone)') IS NULL AND to_regclass('public.support_delivery_events') IS NULL
-- Track D final cutover (#987), section C: public.support_delivery_events' only writer chain
-- (writePort.ts's 'delivery.attempt.log' case -> appendSupportDeliveryEventDirect on the
-- integrator side, and the same case's webapp HTTP sync -> pgIntegratorSupportQuestionOwnership's
-- recordDeliveryAttempt on the webapp side) is unreachable in production: the sole production
-- producer of a 'delivery.attempt.log' mutation is outgoingDeliveryWorker.ts's
-- recordDeliveryFailureAttempt, which routes through operatorDeliveryAttemptWritePort.ts's
-- operator-aware port -- that port intercepts the mutation and returns before ever reaching the
-- generic writePort.ts switch this table's writer lived in. Confirmed by direct measurement: the
-- table's row growth stopped 2026-08-02, three weeks before this migration, independent of this
-- cutover. Its only reader, listRecentDeliveryTrailForConversation, has zero callers anywhere in
-- apps/webapp. No inbound FKs, no views reference it (schema-pre.sql grep). See
-- docs/_TODO/runs/integrator-cleanup/TRACK_D_DUPLICATE_STORE_CUTOVER_2026-08-23.md, section C, for
-- the full producer/reader/registry census.

DROP FUNCTION app.record_integrator_support_delivery_attempt(uuid,text,text,text,text,integer,text,text,timestamp with time zone);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Track D final cutover (#987), section C: dropped together with the function above, forward-only,
-- no CASCADE (no other object references it).

DROP TABLE public.support_delivery_events;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Track D final cutover (#987), section C: 'content_access_grant_upsert' has zero TS producer (not
-- in DirectPublicWriteRetryOperation's union in directPublicWriteRetry.ts) and zero TS consumer
-- (directPublicWriteRetryWorker.ts's executeDirectPublicWriteRetry switch is exhaustive over the
-- 4-value union and cannot dispatch this 5th CHECK value). Its DB-side target function was already
-- dropped one migration after being created
-- (20260822T213000_drop_dead_integrator_content_access_grant_root.sql). 'support_delivery_attempt_append'
-- is dropped together with it here: its only writer (appendSupportDeliveryEventDirect, the function
-- dropped above) is retired in this same migration, so the retry operation has nowhere left to
-- deliver a claimed row. The three reminder_occurrence_* values stay live and untouched.

ALTER TABLE integrator.direct_public_write_retries
  DROP CONSTRAINT IF EXISTS direct_public_write_retries_operation_check;
ALTER TABLE integrator.direct_public_write_retries
  ADD CONSTRAINT direct_public_write_retries_operation_check CHECK (
    operation IN (
      'reminder_occurrence_sent_record',
      'reminder_occurrence_failed_record',
      'reminder_occurrence_expired_record'
    )
  );
