-- Stage 6 backfill: incidents for rows that cannot be restored from payload + branch TZ.
ALTER TABLE integration_data_quality_incidents
  DROP CONSTRAINT IF EXISTS integration_data_quality_incidents_error_reason_check;

ALTER TABLE integration_data_quality_incidents
  ADD CONSTRAINT integration_data_quality_incidents_error_reason_check
  CHECK (
    error_reason IN (
      'invalid_datetime',
      'invalid_timezone',
      'unsupported_format',
      'invalid_branch_id',
      'query_failed',
      'missing_or_empty',
      'invalid_iana',
      'backfill_unresolvable'
    )
  );

ALTER TABLE integration_data_quality_incidents
  DROP CONSTRAINT IF EXISTS integration_data_quality_incidents_status_check;

ALTER TABLE integration_data_quality_incidents
  ADD CONSTRAINT integration_data_quality_incidents_status_check
  CHECK (status IN ('open', 'resolved', 'unresolved'));
