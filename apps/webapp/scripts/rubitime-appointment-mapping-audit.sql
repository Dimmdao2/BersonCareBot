-- Rubitime ↔ canonical: audit перед backfill (production).
-- Запуск на хосте:
--   set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/webapp/scripts/rubitime-appointment-mapping-audit.sql

\echo '=== Counts ==='
SELECT 'legacy_future_active' AS metric, count(*)::text AS value
FROM appointment_records ar
WHERE ar.deleted_at IS NULL
  AND ar.status IN ('created', 'updated')
  AND ar.record_at IS NOT NULL
  AND ar.record_at >= now()
UNION ALL
SELECT 'canonical_future_active' AS metric, count(*)::text AS value
FROM be_appointments
WHERE status IN (
    'created', 'awaiting_payment', 'paid', 'confirmed',
    'rescheduled', 'manual_review_required'
  )
  AND start_at >= now()
UNION ALL
SELECT 'rubitime_projection_without_mapping' AS metric, count(*)::text AS value
FROM be_appointments a
WHERE a.source = 'rubitime_projection'
  AND NOT EXISTS (
    SELECT 1
    FROM be_external_entity_mappings m
    WHERE m.external_system = 'rubitime'
      AND m.entity_type = 'appointment'
      AND m.canonical_id = a.id
  );

\echo '=== Orphan canonical rubitime_projection (sample) ==='
SELECT
  a.id,
  a.specialist_id,
  a.start_at,
  a.end_at,
  a.status,
  a.phone_normalized
FROM be_appointments a
WHERE a.source = 'rubitime_projection'
  AND NOT EXISTS (
    SELECT 1
    FROM be_external_entity_mappings m
    WHERE m.external_system = 'rubitime'
      AND m.entity_type = 'appointment'
      AND m.canonical_id = a.id
  )
ORDER BY a.start_at DESC
LIMIT 50;

\echo '=== Backfill candidates (dry-run count) ==='
WITH src AS (
  SELECT
    a.id AS appointment_id,
    ar.integrator_record_id AS external_id,
    'appointment_records'::text AS source_table
  FROM be_appointments a
  JOIN appointment_records ar
    ON ar.deleted_at IS NULL
   AND ar.record_at = a.start_at
   AND ar.phone_normalized IS NOT DISTINCT FROM a.phone_normalized
  WHERE a.source = 'rubitime_projection'
    AND NOT EXISTS (
      SELECT 1
      FROM be_external_entity_mappings m
      WHERE m.external_system = 'rubitime'
        AND m.entity_type = 'appointment'
        AND m.canonical_id = a.id
    )
  UNION
  SELECT
    a.id,
    rr.rubitime_record_id,
    'rubitime_records'::text
  FROM be_appointments a
  JOIN rubitime_records rr
    ON rr.record_at = a.start_at
   AND rr.phone_normalized IS NOT DISTINCT FROM a.phone_normalized
  WHERE a.source = 'rubitime_projection'
    AND NOT EXISTS (
      SELECT 1
      FROM be_external_entity_mappings m
      WHERE m.external_system = 'rubitime'
        AND m.entity_type = 'appointment'
        AND m.canonical_id = a.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM appointment_records ar2
      WHERE ar2.deleted_at IS NULL
        AND ar2.record_at = a.start_at
        AND ar2.phone_normalized IS NOT DISTINCT FROM a.phone_normalized
    )
)
SELECT count(*)::text AS candidate_count FROM src;
