-- Stage 6 (S6.T01): read-only diagnostics for historical timezone corruption.
-- Replace :cutoff with timestamptz literal (exclusive upper bound for "pre-fix" rows), e.g. '2026-04-04T00:00:00Z'.
-- Queries that JOIN `branches` assume it lives in the same database you connect to (as when integrator uses WEBAPP_DATABASE_URL).
-- If topology differs, run those sections against the webapp DB or split into separate queries.

-- --- Integrator DB: rubitime_records ---

-- Volume by month (all rows before cutoff)
SELECT date_trunc('month', created_at AT TIME ZONE 'UTC') AS month_utc, count(*) AS n
FROM rubitime_records
WHERE created_at < :cutoff::timestamptz
GROUP BY 1
ORDER BY 1;

-- Rows with NULL record_at but naive wall clock in payload (S6.T07 candidates)
SELECT id, rubitime_record_id, status, created_at,
       NULLIF(trim(COALESCE(payload_json->>'record', payload_json->>'datetime', '')), '') AS raw_wall
FROM rubitime_records
WHERE record_at IS NULL
  AND created_at < :cutoff::timestamptz
  AND (
    COALESCE(payload_json->>'record', payload_json->>'datetime', '') ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}'
  )
ORDER BY id DESC
LIMIT 500;

-- Heuristic: naive wall in payload vs stored instant interpreted as UTC wall (session-UTC bug class).
-- Requires join to branch timezone (same DB as webapp `branches` when shared).
WITH r AS (
  SELECT
    rr.id,
    rr.rubitime_record_id,
    rr.record_at,
    rr.payload_json,
    rr.created_at,
    NULLIF(trim(COALESCE(rr.payload_json->>'record', rr.payload_json->>'datetime', '')), '') AS raw_wall,
    NULLIF(trim(rr.payload_json->>'branch_id'), '') AS branch_key
  FROM rubitime_records rr
  WHERE rr.record_at IS NOT NULL
    AND rr.created_at < :cutoff::timestamptz
)
SELECT
  r.id,
  r.rubitime_record_id,
  r.raw_wall,
  r.record_at AS stored_instant,
  b.timezone AS branch_tz,
  (r.raw_wall::timestamp AT TIME ZONE COALESCE(NULLIF(trim(b.timezone), ''), 'Europe/Moscow')) AS expected_instant,
  (r.raw_wall::timestamp AT TIME ZONE 'UTC') AS naive_as_utc_instant,
  EXTRACT(
    EPOCH FROM (
      r.record_at
      - (r.raw_wall::timestamp AT TIME ZONE COALESCE(NULLIF(trim(b.timezone), ''), 'Europe/Moscow'))
    )
  ) / 60.0 AS diff_min_vs_branch
FROM r
LEFT JOIN branches b ON b.integrator_branch_id::text = r.branch_key
WHERE r.raw_wall ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$'
ORDER BY abs(
  EXTRACT(
    EPOCH FROM (
      r.record_at
      - (r.raw_wall::timestamp AT TIME ZONE COALESCE(NULLIF(trim(b.timezone), ''), 'Europe/Moscow'))
    )
  )
) DESC
LIMIT 200;

-- --- Webapp DB: appointment_records ---

SELECT date_trunc('month', created_at AT TIME ZONE 'UTC') AS month_utc, count(*) AS n
FROM appointment_records
WHERE created_at < :cutoff::timestamptz
GROUP BY 1
ORDER BY 1;

SELECT id, integrator_record_id, record_at, created_at,
       NULLIF(trim(COALESCE(payload_json->>'record', payload_json->>'datetime', '')), '') AS raw_wall
FROM appointment_records
WHERE record_at IS NULL
  AND created_at < :cutoff::timestamptz
  AND (
    COALESCE(payload_json->>'record', payload_json->>'datetime', '') ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}'
  )
ORDER BY created_at DESC
LIMIT 500;

-- --- Webapp DB: patient_bookings (projection only) ---

SELECT count(*) AS projection_rows_before_cutoff
FROM patient_bookings
WHERE source = 'rubitime_projection'
  AND rubitime_id IS NOT NULL
  AND created_at < :cutoff::timestamptz;
