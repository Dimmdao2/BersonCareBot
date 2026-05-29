-- Backfill canonical model from legacy booking_* (idempotent). Rollback: truncate be_* (except org seed) — legacy tables untouched.
--> statement-breakpoint
INSERT INTO be_branches (organization_id, title, city_code, address, timezone, is_active, sort_order, created_at, updated_at)
SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid,
  bb.title,
  bc.code,
  bb.address,
  bb.timezone,
  bb.is_active,
  bb.sort_order,
  bb.created_at,
  bb.updated_at
FROM booking_branches bb
JOIN booking_cities bc ON bc.id = bb.city_id
WHERE NOT EXISTS (
  SELECT 1 FROM be_external_entity_mappings m
  WHERE m.external_system = 'rubitime'
    AND m.entity_type = 'branch'
    AND m.external_id = bb.rubitime_branch_id
);
--> statement-breakpoint
INSERT INTO be_external_entity_mappings (organization_id, entity_type, canonical_id, external_system, external_id, metadata)
SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'branch',
  beb.id,
  'rubitime',
  bb.rubitime_branch_id,
  jsonb_build_object('legacy_booking_branch_id', bb.id::text)
FROM booking_branches bb
JOIN booking_cities bc ON bc.id = bb.city_id
JOIN be_branches beb ON beb.organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
  AND beb.city_code = bc.code
  AND beb.title = bb.title
WHERE NOT EXISTS (
  SELECT 1 FROM be_external_entity_mappings m
  WHERE m.external_system = 'rubitime' AND m.entity_type = 'branch' AND m.external_id = bb.rubitime_branch_id
);
--> statement-breakpoint
INSERT INTO be_specialists (organization_id, full_name, description, is_active, sort_order, created_at, updated_at)
SELECT DISTINCT ON (bs.rubitime_cooperator_id)
  'a0000000-0000-4000-8000-000000000001'::uuid,
  bs.full_name,
  bs.description,
  bs.is_active,
  bs.sort_order,
  bs.created_at,
  bs.updated_at
FROM booking_specialists bs
WHERE NOT EXISTS (
  SELECT 1 FROM be_external_entity_mappings m
  WHERE m.external_system = 'rubitime' AND m.entity_type = 'specialist' AND m.external_id = bs.rubitime_cooperator_id
)
ORDER BY bs.rubitime_cooperator_id, bs.updated_at DESC;
--> statement-breakpoint
INSERT INTO be_external_entity_mappings (organization_id, entity_type, canonical_id, external_system, external_id, metadata)
SELECT
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
ON CONFLICT (external_system, entity_type, external_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO be_specialist_locations (organization_id, specialist_id, branch_id, is_active)
SELECT DISTINCT
  'a0000000-0000-4000-8000-000000000001'::uuid,
  m_spec.canonical_id,
  m_branch.canonical_id,
  true
FROM booking_specialists bs
JOIN be_external_entity_mappings m_spec ON m_spec.external_id = bs.rubitime_cooperator_id AND m_spec.entity_type = 'specialist'
JOIN booking_branches bb ON bb.id = bs.branch_id
JOIN be_external_entity_mappings m_branch ON m_branch.external_id = bb.rubitime_branch_id AND m_branch.entity_type = 'branch'
ON CONFLICT ON CONSTRAINT uq_be_specialist_locations DO NOTHING;
--> statement-breakpoint
INSERT INTO be_clinic_services (organization_id, title, description, duration_minutes, price_minor, is_active, sort_order, created_at, updated_at)
SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid,
  s.title,
  s.description,
  s.duration_minutes,
  s.price_minor,
  s.is_active,
  s.sort_order,
  s.created_at,
  s.updated_at
FROM booking_services s
ON CONFLICT ON CONSTRAINT uq_be_clinic_services_org_title_duration DO NOTHING;
--> statement-breakpoint
INSERT INTO be_service_location_availability (organization_id, service_id, branch_id, is_active)
SELECT DISTINCT
  'a0000000-0000-4000-8000-000000000001'::uuid,
  cs.id,
  m_branch.canonical_id,
  true
FROM booking_branch_services bbs
JOIN booking_services s ON s.id = bbs.service_id
JOIN be_clinic_services cs ON cs.organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
  AND cs.title = s.title AND cs.duration_minutes = s.duration_minutes
JOIN booking_branches bb ON bb.id = bbs.branch_id
JOIN be_external_entity_mappings m_branch ON m_branch.external_id = bb.rubitime_branch_id AND m_branch.entity_type = 'branch'
ON CONFLICT ON CONSTRAINT uq_be_sla_service_branch DO NOTHING;
--> statement-breakpoint
INSERT INTO be_specialist_service_availability (
  organization_id, specialist_id, service_id, branch_id, is_active, sort_order, created_at, updated_at
)
SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid,
  m_spec.canonical_id,
  cs.id,
  m_branch.canonical_id,
  bbs.is_active,
  bbs.sort_order,
  bbs.created_at,
  bbs.updated_at
FROM booking_branch_services bbs
JOIN booking_services s ON s.id = bbs.service_id
JOIN be_clinic_services cs ON cs.organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
  AND cs.title = s.title AND cs.duration_minutes = s.duration_minutes
JOIN booking_specialists bs ON bs.id = bbs.specialist_id
JOIN be_external_entity_mappings m_spec ON m_spec.external_id = bs.rubitime_cooperator_id AND m_spec.entity_type = 'specialist'
JOIN booking_branches bb ON bb.id = bbs.branch_id
JOIN be_external_entity_mappings m_branch ON m_branch.external_id = bb.rubitime_branch_id AND m_branch.entity_type = 'branch'
ON CONFLICT ON CONSTRAINT uq_be_ssa_specialist_service_scope DO NOTHING;
--> statement-breakpoint
INSERT INTO be_external_entity_mappings (organization_id, entity_type, canonical_id, external_system, external_id, metadata)
SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'availability',
  ssa.id,
  'rubitime',
  bbs.rubitime_service_id,
  jsonb_build_object('legacy_branch_service_id', bbs.id::text)
FROM booking_branch_services bbs
JOIN booking_specialists bs ON bs.id = bbs.specialist_id
JOIN be_external_entity_mappings m_spec ON m_spec.external_id = bs.rubitime_cooperator_id AND m_spec.entity_type = 'specialist'
JOIN booking_services s ON s.id = bbs.service_id
JOIN be_clinic_services cs ON cs.title = s.title AND cs.duration_minutes = s.duration_minutes
JOIN be_specialist_service_availability ssa ON ssa.specialist_id = m_spec.canonical_id AND ssa.service_id = cs.id
WHERE NOT EXISTS (
  SELECT 1 FROM be_external_entity_mappings m
  WHERE m.external_system = 'rubitime' AND m.entity_type = 'availability' AND m.external_id = bbs.rubitime_service_id
)
ON CONFLICT (external_system, entity_type, external_id) DO NOTHING;
