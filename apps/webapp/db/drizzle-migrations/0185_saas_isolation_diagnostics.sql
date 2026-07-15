-- True-global redacted INFRA telemetry for SaaS isolation diagnostics.
-- Deliberately no organization/user/patient identifiers and no tenant RLS policy.

CREATE TABLE IF NOT EXISTS "saas_isolation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fingerprint" text NOT NULL,
  "event_class" text NOT NULL,
  "source_service" text NOT NULL,
  "source_operation" text NOT NULL,
  "explanation_status" text DEFAULT 'unexplained' NOT NULL,
  "lifecycle_status" text DEFAULT 'active' NOT NULL,
  "occurrence_count" integer DEFAULT 1 NOT NULL,
  "first_seen_at" timestamptz DEFAULT now() NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  "resolved_at" timestamptz,
  CONSTRAINT "saas_isolation_events_event_class_check" CHECK (
    "event_class" = ANY (ARRAY[
      'missing_principal'::text,
      'invalid_signature_or_install'::text,
      'role_pool_mismatch'::text,
      'rls_denial'::text,
      'cleanup_failure'::text,
      'unclassified_background_operation'::text
    ])
  ),
  CONSTRAINT "saas_isolation_events_source_service_check" CHECK (
    "source_service" = ANY (ARRAY['webapp','integrator','worker','scheduler','media_worker','cron']::text[])
  ),
  CONSTRAINT "saas_isolation_events_source_operation_check" CHECK (
    ("source_service", "source_operation") IN (
      ('webapp', 'webapp_db_request'),
      ('webapp', 'webapp_admin_system_health'),
      ('integrator', 'integrator_http_request'),
      ('integrator', 'integrator_projection'),
      ('worker', 'worker_queue_drain'),
      ('worker', 'worker_projection_delivery'),
      ('worker', 'worker_outgoing_delivery'),
      ('scheduler', 'scheduler_lock'),
      ('scheduler', 'scheduler_dispatch_tick'),
      ('media_worker', 'media_transcode_tick'),
      ('cron', 'cron_health'),
      ('cron', 'cron_media'),
      ('cron', 'cron_analytics'),
      ('cron', 'cron_reminders'),
      ('cron', 'cron_specialist_tasks')
    )
  ),
  CONSTRAINT "saas_isolation_events_explanation_status_check" CHECK (
    "explanation_status" = ANY (ARRAY['explained'::text, 'unexplained'::text])
  ),
  CONSTRAINT "saas_isolation_events_lifecycle_status_check" CHECK (
    "lifecycle_status" = ANY (ARRAY['active'::text, 'resolved'::text])
  ),
  CONSTRAINT "saas_isolation_events_occurrence_count_check" CHECK ("occurrence_count" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "saas_isolation_events_fingerprint_uidx"
  ON "saas_isolation_events" ("fingerprint");
CREATE INDEX IF NOT EXISTS "saas_isolation_events_status_last_seen_idx"
  ON "saas_isolation_events" ("lifecycle_status", "last_seen_at");

-- Bounded hourly facts are required for a real rolling 24h comparison. They contain
-- only the redacted aggregate foreign key and a UTC bucket; never request payloads.
CREATE TABLE IF NOT EXISTS "saas_isolation_event_hourly" (
  "event_id" uuid NOT NULL REFERENCES "saas_isolation_events"("id") ON DELETE CASCADE,
  "bucket_start" timestamptz NOT NULL,
  "occurrence_count" integer DEFAULT 1 NOT NULL,
  PRIMARY KEY ("event_id", "bucket_start"),
  CONSTRAINT "saas_isolation_event_hourly_bucket_check" CHECK (
    "bucket_start" = date_trunc('hour', "bucket_start" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
  ),
  CONSTRAINT "saas_isolation_event_hourly_count_check" CHECK ("occurrence_count" > 0)
);

CREATE INDEX IF NOT EXISTS "saas_isolation_event_hourly_bucket_idx"
  ON "saas_isolation_event_hourly" ("bucket_start");

CREATE TABLE IF NOT EXISTS "saas_isolation_coverage_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status" text NOT NULL,
  "started_at" timestamptz NOT NULL,
  "finished_at" timestamptz NOT NULL,
  "services_checked" text[] DEFAULT '{}'::text[] NOT NULL,
  "checks_count" integer DEFAULT 0 NOT NULL,
  "unexpected_errors_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "saas_isolation_coverage_runs_status_check" CHECK (
    "status" = ANY (ARRAY['complete'::text, 'incomplete'::text, 'failed'::text])
  ),
  CONSTRAINT "saas_isolation_coverage_runs_time_check" CHECK ("finished_at" >= "started_at"),
  CONSTRAINT "saas_isolation_coverage_runs_services_check" CHECK (
    "services_checked" <@ ARRAY['webapp','integrator','worker','scheduler','media_worker','cron']::text[]
  ),
  CONSTRAINT "saas_isolation_coverage_runs_complete_check" CHECK (
    "status" <> 'complete'
    OR (
      "services_checked" @> ARRAY['webapp','integrator','worker','scheduler','media_worker','cron']::text[]
      AND "checks_count" >= 6
    )
  ),
  CONSTRAINT "saas_isolation_coverage_runs_checks_count_check" CHECK ("checks_count" >= 0),
  CONSTRAINT "saas_isolation_coverage_runs_unexpected_count_check" CHECK ("unexpected_errors_count" >= 0)
);

CREATE INDEX IF NOT EXISTS "saas_isolation_coverage_runs_finished_at_idx"
  ON "saas_isolation_coverage_runs" ("finished_at");
