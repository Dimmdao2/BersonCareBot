-- Physical rename of the legacy Rubitime-named retry queue: this table was repurposed into generic
-- message-delivery infra (every row is kind='message.deliver') by
-- 20260310_0002_expand_retry_jobs_for_generic_delivery.sql. The Drizzle TS symbol was already renamed
-- rubitimeCreateRetryJobs -> messageRetryJobs (apps/integrator/src/infra/db/schema/integratorQueues.ts),
-- with the physical rename deferred to R7. Owner directive (2026-07-24): do the physical rename now
-- instead of deferring. This is NOT a Rubitime drop target -- rename only, no data is touched or lost.
-- Idempotent: every statement guards on current state so it is safe to run once, or after a partial apply.

ALTER TABLE IF EXISTS rubitime_create_retry_jobs
  RENAME TO message_retry_jobs;

ALTER INDEX IF EXISTS idx_rubitime_create_retry_jobs_due
  RENAME TO idx_message_retry_jobs_due;

ALTER SEQUENCE IF EXISTS rubitime_create_retry_jobs_id_seq
  RENAME TO message_retry_jobs_id_seq;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rubitime_create_retry_jobs_pkey'
      AND conrelid = 'message_retry_jobs'::regclass
  ) THEN
    ALTER TABLE message_retry_jobs
      RENAME CONSTRAINT rubitime_create_retry_jobs_pkey TO message_retry_jobs_pkey;
  END IF;
END $$;
