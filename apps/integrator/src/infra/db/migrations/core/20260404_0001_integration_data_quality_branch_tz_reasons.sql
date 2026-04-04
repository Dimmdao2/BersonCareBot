-- Extend error_reason enum for branch timezone fallback incidents (Stage 3 AUDIT).
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
      'invalid_iana'
    )
  );
