CREATE TABLE IF NOT EXISTS public.operator_health_failure_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_by_user_id uuid,
  health_probe text NOT NULL,
  source_kind text NOT NULL,
  source_id text NOT NULL,
  severity_at_archive text NOT NULL DEFAULT 'dead',
  doctor_user_id uuid,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_error_truncated text
);

CREATE INDEX IF NOT EXISTS idx_operator_health_failure_archive_archived_at
  ON public.operator_health_failure_archive (archived_at);

CREATE INDEX IF NOT EXISTS idx_operator_health_failure_archive_probe_archived
  ON public.operator_health_failure_archive (health_probe, archived_at);

CREATE INDEX IF NOT EXISTS idx_operator_health_failure_archive_doctor_archived
  ON public.operator_health_failure_archive (doctor_user_id, archived_at);
