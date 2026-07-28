-- Google Calendar application OAuth remains platform-wide, while the authorized account and
-- selected calendar are clinic-owned. In the historical single-clinic deployment, copy the
-- existing connection rows to that sole clinic without guessing a target in multi-clinic data.
-- Runtime readers use exact organization rows, so legacy global rows can never route another
-- clinic into this calendar.

WITH singleton_organization AS (
  SELECT (array_agg(id))[1] AS id
  FROM public.be_organizations
  HAVING count(*) = 1
), legacy_connection AS (
  SELECT key, scope, value_json, updated_at, updated_by
  FROM public.system_settings
  WHERE scope = 'admin'
    AND organization_id IS NULL
    AND key IN (
      'google_refresh_token',
      'google_calendar_id',
      'google_calendar_enabled',
      'google_connected_email'
    )
)
INSERT INTO public.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
SELECT legacy_connection.key,
       legacy_connection.scope,
       singleton_organization.id,
       legacy_connection.value_json,
       legacy_connection.updated_at,
       legacy_connection.updated_by
FROM legacy_connection
CROSS JOIN singleton_organization
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO NOTHING;
--> statement-breakpoint
WITH singleton_organization AS (
  SELECT (array_agg(id))[1] AS id
  FROM public.be_organizations
  HAVING count(*) = 1
)
INSERT INTO integrator.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
SELECT setting.key,
       setting.scope,
       setting.organization_id,
       setting.value_json,
       setting.updated_at,
       setting.updated_by::text
FROM public.system_settings AS setting
JOIN singleton_organization ON singleton_organization.id = setting.organization_id
WHERE setting.scope = 'admin'
  AND setting.key IN (
    'google_refresh_token',
    'google_calendar_id',
    'google_calendar_enabled',
    'google_connected_email'
  )
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

-- No SECURITY DEFINER function and no runtime-role grant are added by this migration.
