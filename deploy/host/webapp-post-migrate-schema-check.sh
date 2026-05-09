#!/usr/bin/env bash
# Post-migrate guardrail: fail fast if critical public columns are missing (silent schema drift).
# Called by deploy/host/deploy-prod.sh and deploy/host/deploy-webapp-prod.sh AFTER migrations,
# BEFORE restarting systemd units.
#
# Requires: DATABASE_URL (e.g. after sourcing api.prod + webapp.prod), psql on PATH.
#
# Checked columns (runtime-critical webapp / media-worker / integrator sync — see LOG Stage C):
#   test_sets.publication_status
#   recommendations.domain
#   media_files.video_processing_status, video_processing_error, preview_status
#   media_transcode_jobs.media_id, status
#   integrator_push_outbox.idempotency_key
#   system_settings.key
#   platform_users.calendar_timezone
#
set -euo pipefail

fail() {
  echo "webapp-post-migrate-schema-check: $*" >&2
  exit 1
}

if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL is not set (source env with webapp DB URL before calling this script)"
fi

missing_columns="$(
  psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "
    WITH required(table_name, column_name) AS (
      VALUES
        ('test_sets', 'publication_status'),
        ('recommendations', 'domain'),
        ('media_files', 'video_processing_status'),
        ('media_files', 'video_processing_error'),
        ('media_files', 'preview_status'),
        ('media_transcode_jobs', 'media_id'),
        ('media_transcode_jobs', 'status'),
        ('integrator_push_outbox', 'idempotency_key'),
        ('system_settings', 'key'),
        ('platform_users', 'calendar_timezone')
    )
    SELECT required.table_name || '.' || required.column_name
    FROM required
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = required.table_name
     AND c.column_name = required.column_name
    WHERE c.column_name IS NULL
    ORDER BY 1
  "
)"

if [ -n "${missing_columns}" ]; then
  echo "webapp-post-migrate-schema-check: Post-migrate schema check failed. Missing columns:" >&2
  echo "${missing_columns}" >&2
  exit 1
fi
