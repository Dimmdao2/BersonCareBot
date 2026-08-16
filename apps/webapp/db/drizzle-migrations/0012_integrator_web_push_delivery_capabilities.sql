-- BCB-MIGRATION-OWNER: app_seam_reminder_specialist_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.read_integrator_web_push_subscriptions(
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_subscriptions jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_reminder_specialist_owner'::name,
    ARRAY['app_tenant_service'::name]::name[]
  );

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RETURN jsonb_build_object('ok', false, 'code', 'organization_context_required');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = p_user_id
      AND enrollment.status = 'active'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.be_organization_members AS membership
    WHERE membership.organization_id = v_org
      AND membership.platform_user_id = p_user_id
      AND membership.status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'notification_target_outside_organization');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'endpoint', subscription.endpoint,
        'p256dh', subscription.p256dh,
        'auth', subscription.auth
      )
      ORDER BY subscription.updated_at DESC, subscription.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_subscriptions
  FROM public.user_web_push_subscriptions AS subscription
  WHERE subscription.user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'subscriptions', v_subscriptions);
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.read_integrator_web_push_delivery_settings(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_vapid jsonb;
  v_vapid_subject text;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_settings_integrator_owner'::name,
    ARRAY['app_tenant_service'::name]::name[]
  );

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RETURN jsonb_build_object('ok', false, 'code', 'organization_context_required');
  END IF;

  SELECT setting.value_json
  INTO v_vapid
  FROM public.system_settings AS setting
  WHERE setting.key = 'web_push_vapid'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1;

  SELECT COALESCE(setting.value_json #>> '{value,from}', setting.value_json ->> 'from')
  INTO v_vapid_subject
  FROM public.system_settings AS setting
  WHERE setting.key = 'smtp_outbound'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'web_push_vapid', v_vapid,
    'vapid_subject', CASE
      WHEN v_vapid_subject ~ '^[^[:space:]@]+@[^[:space:]@]+$' THEN 'mailto:' || v_vapid_subject
      ELSE NULL
    END
  );
END
$function$;
