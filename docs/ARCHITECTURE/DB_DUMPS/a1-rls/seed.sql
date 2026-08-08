-- A1 PII-free tenant-isolation fixture layered on the canonical A0 baseline.
-- Reserved `.test` identities only; no delivery address, credential, or real PII belongs here.

BEGIN;

INSERT INTO public.be_organizations (id, title, is_active, sort_order, created_at, updated_at)
VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'A1 Synthetic Clinic B',
  true,
  1,
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
  'b0000000-0000-4000-8000-000000000002',
  NULL,
  'A1 Synthetic Owner B',
  'doctor',
  'Synthetic',
  'Owner B',
  'owner-b@baseline.test',
  'owner-b@baseline.test',
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
  'b0000000-0000-4000-8000-000000000003',
  'b0000000-0000-4000-8000-000000000001',
  'A1 Synthetic Specialist B',
  'Reserved non-production tenant-isolation fixture',
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
  'b0000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'owner',
  'b0000000-0000-4000-8000-000000000003',
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
  'b0000000-0000-4000-8000-000000000005',
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000003',
  'b0000000-0000-4000-8000-000000000002',
  '2099-01-02T10:00:00Z',
  '2099-01-02T11:00:00Z',
  60,
  'native',
  'confirmed',
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z',
  '{"fixture":"a1-rls"}'::jsonb
);

-- Second appointment for EACH tenant. One row per tenant can only prove "visible / not visible";
-- it cannot detect a policy that returns a SUBSET of the caller's own rows, because there is no
-- subset to return. That partial-visibility mode was found live on this database and is invisible
-- to a per-id lookup: the fixture row is returned, the assertion passes, and the other rows the
-- tenant should see are silently missing. With two rows per tenant the runner asserts an exact
-- count, so silent-zero (0), partial (1) and cross-tenant leak (>2) are all one comparison.
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
VALUES
  (
    'a0000000-0000-4000-8000-000000000015',
    'a0000000-0000-4000-8000-000000000001',
    '518ea988-9b5e-4ad8-8194-a2d98f43bd7b',
    'a0000000-0000-4000-8000-000000000002',
    '2099-01-03T10:00:00Z',
    '2099-01-03T11:00:00Z',
    60,
    'native',
    'confirmed',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z',
    '{"fixture":"a1-rls-partial-visibility"}'::jsonb
  ),
  (
    'b0000000-0000-4000-8000-000000000015',
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000003',
    'b0000000-0000-4000-8000-000000000002',
    '2099-01-03T10:00:00Z',
    '2099-01-03T11:00:00Z',
    60,
    'native',
    'confirmed',
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z',
    '{"fixture":"a1-rls-partial-visibility"}'::jsonb
  );

COMMIT;
