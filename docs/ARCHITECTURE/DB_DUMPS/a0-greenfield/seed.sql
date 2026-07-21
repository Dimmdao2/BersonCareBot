-- A0 PII-free deterministic migration-guard seed.
-- All identities are reserved synthetic `.test` values. No delivery credential or real PII belongs here.

BEGIN;

-- The current organization INSERT hook requires a reference baseline. An empty category list is the
-- minimum structurally valid global baseline and deliberately avoids copying product/demo content.
INSERT INTO public.reference_catalog_baselines (version, definition_json, created_at)
VALUES (1, '{"categories":[]}'::jsonb, '2026-01-01T00:00:00Z')
ON CONFLICT (version) DO NOTHING;

-- Keep the historical canonical organization/specialist identifiers because earlier data-state
-- migrations bind to them. The associated identity is synthetic and has no phone.
INSERT INTO public.be_organizations (id, title, is_active, sort_order, created_at, updated_at)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'A0 Synthetic Clinic',
  true,
  0,
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
);

INSERT INTO public.platform_users (
  id,
  phone_normalized,
  display_name,
  role,
  first_name,
  last_name,
  email,
  email_normalized,
  email_verified_at,
  created_at,
  updated_at
)
VALUES (
  'a0000000-0000-4000-8000-000000000002',
  NULL,
  'A0 Synthetic Owner',
  'doctor',
  'Synthetic',
  'Owner',
  'owner@baseline.test',
  'owner@baseline.test',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
);

INSERT INTO public.be_specialists (
  id,
  organization_id,
  full_name,
  description,
  is_active,
  sort_order,
  created_at,
  updated_at
)
VALUES (
  '518ea988-9b5e-4ad8-8194-a2d98f43bd7b',
  'a0000000-0000-4000-8000-000000000001',
  'A0 Synthetic Specialist',
  'Reserved non-production migration fixture',
  true,
  0,
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
);

INSERT INTO public.be_organization_members (
  id,
  organization_id,
  platform_user_id,
  role,
  specialist_id,
  status,
  created_at,
  updated_at
)
VALUES (
  'a0000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'owner',
  '518ea988-9b5e-4ad8-8194-a2d98f43bd7b',
  'active',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
);

INSERT INTO public.be_appointments (
  id,
  organization_id,
  specialist_id,
  platform_user_id,
  start_at,
  end_at,
  duration_minutes,
  source,
  status,
  created_at,
  updated_at,
  attribution_json
)
VALUES (
  'a0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000001',
  '518ea988-9b5e-4ad8-8194-a2d98f43bd7b',
  'a0000000-0000-4000-8000-000000000002',
  '2099-01-01T10:00:00Z',
  '2099-01-01T11:00:00Z',
  60,
  'native',
  'confirmed',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z',
  '{"fixture":"a0-greenfield"}'::jsonb
);

INSERT INTO public.saas_org_entitlement_overrides (
  id,
  organization_id,
  mechanic,
  enabled,
  created_at,
  updated_at
)
VALUES (
  'a0000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000001',
  'courses',
  true,
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z'
);

COMMIT;
