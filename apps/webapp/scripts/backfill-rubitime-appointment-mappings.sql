-- Backfill be_external_entity_mappings for orphan rubitime_projection appointments.
-- Сначала: rubitime-appointment-mapping-audit.sql (dry-run count + sample).
--
-- Запуск на хосте (после проверки кандидатов):
--   set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/webapp/scripts/backfill-rubitime-appointment-mappings.sql

BEGIN;

WITH org AS (
  SELECT COALESCE(
    (
      SELECT (value_json->>'value')::uuid
      FROM system_settings
      WHERE key = 'booking_default_organization_id'
        AND scope = 'admin'
      LIMIT 1
    ),
    'a0000000-0000-4000-8000-000000000001'::uuid
  ) AS organization_id
),
src AS (
  SELECT DISTINCT ON (appointment_id, external_id)
    appointment_id,
    external_id,
    source_table
  FROM (
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
    UNION ALL
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
  ) raw
  ORDER BY appointment_id, external_id, source_table
),
ins AS (
  INSERT INTO be_external_entity_mappings (
    organization_id,
    entity_type,
    canonical_id,
    external_system,
    external_id,
    metadata,
    created_at,
    updated_at
  )
  SELECT
    org.organization_id,
    'appointment',
    src.appointment_id,
    'rubitime',
    src.external_id,
    jsonb_build_object(
      'manualRecovery', true,
      'sourceTable', src.source_table,
      'reason', 'backfill_rubitime_projection_without_mapping'
    ),
    now(),
    now()
  FROM src
  CROSS JOIN org
  ON CONFLICT (external_system, entity_type, external_id)
  DO UPDATE SET
    canonical_id = EXCLUDED.canonical_id,
    metadata = be_external_entity_mappings.metadata || EXCLUDED.metadata,
    updated_at = now()
  RETURNING canonical_id, external_id
)
INSERT INTO be_appointment_history_events (
  organization_id,
  appointment_id,
  event_type,
  payload,
  occurred_at
)
SELECT
  org.organization_id,
  ins.canonical_id,
  'rubitime_projection_mapping_recovered',
  jsonb_build_object('externalId', ins.external_id, 'backfill', true),
  now()
FROM ins
CROSS JOIN org;

COMMIT;
