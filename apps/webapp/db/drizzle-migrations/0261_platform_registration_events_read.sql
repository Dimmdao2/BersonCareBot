-- Platform operations may inspect the three registration-funnel event classes, but not the
-- rest of product_analytics_events_recent and not the identity/contact tables used to exclude
-- staff and TEST accounts. Clinic staff retain only their existing organization-scoped policy.

SET ROLE app_owner;

CREATE OR REPLACE FUNCTION app.is_platform_registration_analytics_user_excluded(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.platform_users AS platform_user
      WHERE platform_user.id = p_user_id
        AND (
          platform_user.role::text IN ('admin', 'doctor')
          OR platform_user.phone_normalized = '+70000000000'
          OR EXISTS (
            SELECT 1
            FROM public.system_settings AS setting
            CROSS JOIN LATERAL jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(setting.value_json->'value'->'phones') = 'array'
                  THEN setting.value_json->'value'->'phones'
                ELSE '[]'::jsonb
              END
            ) AS configured_phone(value)
            WHERE setting.key = 'test_account_identifiers'
              AND setting.scope = 'admin'
              AND setting.organization_id IS NULL
              AND configured_phone.value = platform_user.phone_normalized
          )
          OR EXISTS (
            SELECT 1
            FROM public.user_channel_bindings AS binding
            JOIN public.system_settings AS setting
              ON setting.key = 'test_account_identifiers'
             AND setting.scope = 'admin'
             AND setting.organization_id IS NULL
            CROSS JOIN LATERAL jsonb_array_elements_text(
              CASE
                WHEN binding.channel_code = 'telegram'
                  AND jsonb_typeof(setting.value_json->'value'->'telegramIds') = 'array'
                  THEN setting.value_json->'value'->'telegramIds'
                WHEN binding.channel_code = 'max'
                  AND jsonb_typeof(setting.value_json->'value'->'maxIds') = 'array'
                  THEN setting.value_json->'value'->'maxIds'
                ELSE '[]'::jsonb
              END
            ) AS configured_external_id(value)
            WHERE binding.user_id = platform_user.id
              AND configured_external_id.value = binding.external_id
          )
        )
    )
  END
$function$;

RESET ROLE;

ALTER FUNCTION app.is_platform_registration_analytics_user_excluded(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.is_platform_registration_analytics_user_excluded(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_platform_registration_analytics_user_excluded(uuid)
  TO app_platform_settings;

GRANT SELECT ON TABLE public.product_analytics_events_recent TO app_platform_settings;

DROP POLICY IF EXISTS product_analytics_registration_platform_operations_select
  ON public.product_analytics_events_recent;
CREATE POLICY product_analytics_registration_platform_operations_select
  ON public.product_analytics_events_recent
  FOR SELECT TO app_platform_settings
  USING (
    event_type IN (
      'auth_register_attempt',
      'auth_register_success',
      'auth_register_failure'
    )
  );

DO $check$
BEGIN
  IF NOT (
    has_table_privilege(
      'app_platform_settings',
      'public.product_analytics_events_recent',
      'SELECT'
    )
    AND NOT has_table_privilege(
      'app_platform_settings',
      'public.product_analytics_events_recent',
      'INSERT'
    )
    AND NOT has_table_privilege(
      'app_platform_settings',
      'public.product_analytics_events_recent',
      'UPDATE'
    )
    AND NOT has_table_privilege(
      'app_platform_settings',
      'public.product_analytics_events_recent',
      'DELETE'
    )
    AND has_function_privilege(
      'app_platform_settings',
      'app.is_platform_registration_analytics_user_excluded(uuid)',
      'EXECUTE'
    )
    AND NOT has_table_privilege('app_platform_settings', 'public.platform_users', 'SELECT')
    AND NOT has_table_privilege('app_platform_settings', 'public.user_channel_bindings', 'SELECT')
  ) THEN
    RAISE EXCEPTION 'platform_registration_events_read_wall_failed';
  END IF;
END
$check$;
