-- BCB-MIGRATION-OWNER: app_seam_reminder_specialist_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.read_current_patient_staff_notification_profiles(
  p_organization_id uuid,
  p_topic_code text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_result jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_reminder_specialist_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );

  IF p_topic_code NOT IN (
    'doctor_patient_messages',
    'doctor_patient_program_notes'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unsupported_doctor_notification_topic');
  END IF;

  IF v_org IS NULL
    OR v_patient IS NULL
    OR p_organization_id IS DISTINCT FROM v_org
    OR NOT EXISTS (
      SELECT 1
      FROM public.org_enrollments AS enrollment
      WHERE enrollment.organization_id = v_org
        AND enrollment.platform_user_id = v_patient
        AND enrollment.status = 'active'
    )
  THEN
    RETURN jsonb_build_object('ok', false, 'code', 'patient_context_required');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'profiles', COALESCE(jsonb_agg(profile_payload ORDER BY platform_user_id), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT
      membership.platform_user_id,
      jsonb_build_object(
        'user_id', membership.platform_user_id,
        'telegram_id', (
          SELECT binding.external_id
          FROM public.user_channel_bindings AS binding
          WHERE binding.user_id = membership.platform_user_id
            AND binding.channel_code = 'telegram'
          ORDER BY binding.updated_at DESC, binding.id DESC
          LIMIT 1
        ),
        'max_id', (
          SELECT binding.external_id
          FROM public.user_channel_bindings AS binding
          WHERE binding.user_id = membership.platform_user_id
            AND binding.channel_code = 'max'
          ORDER BY binding.updated_at DESC, binding.id DESC
          LIMIT 1
        ),
        'has_web_push', EXISTS (
          SELECT 1
          FROM public.user_web_push_subscriptions AS subscription
          WHERE subscription.user_id = membership.platform_user_id
        ),
        'channel_preferences', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'channel_code', preference.channel_code,
            'is_enabled_for_messages', preference.is_enabled_for_messages,
            'is_enabled_for_notifications', preference.is_enabled_for_notifications,
            'is_preferred_for_auth', preference.is_preferred_for_auth
          ) ORDER BY preference.channel_code)
          FROM public.user_channel_preferences AS preference
          WHERE preference.platform_user_id = membership.platform_user_id
            OR (
              preference.platform_user_id IS NULL
              AND preference.user_id = membership.platform_user_id::text
            )
        ), '[]'::jsonb),
        'topic_channel_preferences', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'topic_code', topic_preference.topic_code,
            'channel_code', topic_preference.channel_code,
            'is_enabled', topic_preference.is_enabled
          ) ORDER BY topic_preference.channel_code)
          FROM public.user_notification_topic_channels AS topic_preference
          WHERE topic_preference.user_id = membership.platform_user_id
            AND topic_preference.topic_code = p_topic_code
        ), '[]'::jsonb)
      ) AS profile_payload
    FROM public.be_organization_members AS membership
    INNER JOIN public.platform_users AS platform_user
      ON platform_user.id = membership.platform_user_id
    WHERE membership.organization_id = v_org
      AND membership.status = 'active'
      AND platform_user.role IN ('doctor', 'admin')
      AND platform_user.merged_into_id IS NULL
  ) AS active_staff;

  RETURN COALESCE(v_result, jsonb_build_object('ok', true, 'profiles', '[]'::jsonb));
END
$function$;
