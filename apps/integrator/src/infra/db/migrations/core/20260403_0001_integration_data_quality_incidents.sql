-- Reusable integration data-quality incidents (deduped per integration/entity/external_id/field/error_reason).
CREATE TABLE IF NOT EXISTS integration_data_quality_incidents (
  id BIGSERIAL PRIMARY KEY,
  integration TEXT NOT NULL,
  entity TEXT NOT NULL,
  external_id TEXT NOT NULL,
  field TEXT NOT NULL,
  raw_value TEXT,
  timezone_used TEXT,
  error_reason TEXT NOT NULL
    CHECK (error_reason IN ('invalid_datetime', 'invalid_timezone', 'unsupported_format')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurrences INT NOT NULL DEFAULT 1,
  CONSTRAINT integration_data_quality_incidents_dedup
    UNIQUE (integration, entity, external_id, field, error_reason)
);

CREATE INDEX IF NOT EXISTS idx_integration_data_quality_incidents_last_seen
  ON integration_data_quality_incidents (last_seen_at DESC);
