-- Seed booking engine admin settings (idempotent).
INSERT INTO system_settings (key, scope, value_json, updated_at, updated_by)
VALUES
  (
    'booking_default_organization_id',
    'admin',
    jsonb_build_object('value', 'a0000000-0000-4000-8000-000000000001'),
    now(),
    NULL
  ),
  (
    'booking_rubitime_bridge_enabled',
    'admin',
    jsonb_build_object('value', false),
    now(),
    NULL
  )
ON CONFLICT (key, scope) DO NOTHING;
--> statement-breakpoint
-- Repair specialist mappings: canonical_id must match rubitime_cooperator_id row, not ambiguous full_name.
DELETE FROM be_external_entity_mappings
WHERE external_system = 'rubitime' AND entity_type = 'specialist';
--> statement-breakpoint
INSERT INTO be_external_entity_mappings (organization_id, entity_type, canonical_id, external_system, external_id, metadata)
SELECT DISTINCT ON (ranked.rubitime_cooperator_id)
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'specialist',
  bes.id,
  'rubitime',
  ranked.rubitime_cooperator_id,
  jsonb_build_object('legacy_booking_specialist_id', ranked.legacy_id::text)
FROM (
  SELECT DISTINCT ON (bs.rubitime_cooperator_id)
    bs.id AS legacy_id,
    bs.rubitime_cooperator_id,
    bs.full_name,
    bs.created_at
  FROM booking_specialists bs
  ORDER BY bs.rubitime_cooperator_id, bs.updated_at DESC
) ranked
JOIN be_specialists bes
  ON bes.organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
  AND bes.full_name = ranked.full_name
  AND bes.created_at = ranked.created_at
ORDER BY ranked.rubitime_cooperator_id
ON CONFLICT (external_system, entity_type, external_id)
DO UPDATE SET
  canonical_id = EXCLUDED.canonical_id,
  metadata = EXCLUDED.metadata,
  updated_at = now();
--> statement-breakpoint
-- Rubitime service id → canonical clinic service (distinct per rubitime_service_id on branch_services).
INSERT INTO be_external_entity_mappings (organization_id, entity_type, canonical_id, external_system, external_id, metadata)
SELECT DISTINCT ON (bbs.rubitime_service_id)
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'service',
  cs.id,
  'rubitime',
  bbs.rubitime_service_id,
  jsonb_build_object('legacy_service_id', s.id::text)
FROM booking_branch_services bbs
JOIN booking_services s ON s.id = bbs.service_id
JOIN be_clinic_services cs
  ON cs.organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
  AND cs.title = s.title
  AND cs.duration_minutes = s.duration_minutes
WHERE NOT EXISTS (
  SELECT 1 FROM be_external_entity_mappings m
  WHERE m.external_system = 'rubitime'
    AND m.entity_type = 'service'
    AND m.external_id = bbs.rubitime_service_id
)
ORDER BY bbs.rubitime_service_id, bbs.updated_at DESC
ON CONFLICT (external_system, entity_type, external_id) DO NOTHING;
