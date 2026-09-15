-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.read_clinic_lead_notification_profiles(uuid,text)') IS NOT NULL
--
-- Rights analysis: this SECURITY DEFINER root runs as app_seam_public_booking_owner and is
-- executable only by app_tenant_service after the accepted tenant_service context has bound one
-- organization. Its body needs SELECT on the declared columns of be_organization_members,
-- platform_users, user_channel_bindings, user_channel_preferences, user_notification_topic_channels
-- and user_web_push_subscriptions; deploy/postgres/privileges/declaration.ts owns those rights and
-- the runtime capability. No role grants live in this migration.
--
-- Why the whole delivery profile and not just the audience: the only door that creates a lead is
-- the public one, and it holds an organization principal. That class has no relational path to the
-- staff preference, binding and subscription tables, and it must not be given one — those are staff
-- data and the class belongs to a public surface. One root answers the one question the send has
-- ("who hears about this lead and through which channel"), so the request reads the database once
-- behind one gate instead of five times behind none.
CREATE FUNCTION app.read_clinic_lead_notification_profiles(
  p_organization_id uuid,
  p_topic_code text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path TO 'pg_catalog'
AS $$
DECLARE
  v_organization_id uuid;
  v_result jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_booking_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'leads.clinic-notification-profiles.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_topic_code))::app.port_typed_arg
    ]),
    'app.read_clinic_lead_notification_profiles(uuid,text)'::regprocedure
  );

  v_organization_id := app.current_org_id();

  IF p_topic_code IS DISTINCT FROM 'doctor_leads' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unsupported_lead_notification_topic');
  END IF;

  IF v_organization_id IS NULL OR p_organization_id IS DISTINCT FROM v_organization_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'lead_notification_organization_mismatch');
  END IF;

  SELECT jsonb_build_object(
           'ok', true,
           'profiles', COALESCE(jsonb_agg(profile_payload ORDER BY platform_user_id), '[]'::jsonb)
         )
    INTO v_result
    FROM (
      SELECT
        member.platform_user_id,
        jsonb_build_object(
          'user_id', member.platform_user_id,
          'telegram_id', (
            SELECT binding.external_id
              FROM public.user_channel_bindings AS binding
             WHERE binding.user_id = member.platform_user_id
               AND binding.channel_code = 'telegram'
             ORDER BY binding.created_at DESC, binding.external_id DESC
             LIMIT 1
          ),
          'max_id', (
            SELECT binding.external_id
              FROM public.user_channel_bindings AS binding
             WHERE binding.user_id = member.platform_user_id
               AND binding.channel_code = 'max'
             ORDER BY binding.created_at DESC, binding.external_id DESC
             LIMIT 1
          ),
          'has_web_push', EXISTS (
            SELECT 1
              FROM public.user_web_push_subscriptions AS subscription
             WHERE subscription.user_id = member.platform_user_id
          ),
          'channel_preferences', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                     'channel_code', preference.channel_code,
                     'is_enabled_for_messages', preference.is_enabled_for_messages,
                     'is_enabled_for_notifications', preference.is_enabled_for_notifications,
                     'is_preferred_for_auth', preference.is_preferred_for_auth
                   ) ORDER BY preference.channel_code)
              FROM public.user_channel_preferences AS preference
             WHERE preference.platform_user_id = member.platform_user_id
                OR (
                     preference.platform_user_id IS NULL
                 AND preference.user_id = member.platform_user_id::text
                   )
          ), '[]'::jsonb),
          'topic_channel_preferences', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                     'topic_code', topic_preference.topic_code,
                     'channel_code', topic_preference.channel_code,
                     'is_enabled', topic_preference.is_enabled
                   ) ORDER BY topic_preference.channel_code)
              FROM public.user_notification_topic_channels AS topic_preference
             WHERE topic_preference.user_id = member.platform_user_id
               AND topic_preference.topic_code = p_topic_code
          ), '[]'::jsonb)
        ) AS profile_payload
        FROM public.be_organization_members AS member
        INNER JOIN public.platform_users AS staff_user
          ON staff_user.id = member.platform_user_id
       WHERE member.organization_id = v_organization_id
         AND member.status = 'active'
         AND member.role IN ('owner', 'admin')
         AND staff_user.role IN ('doctor', 'admin')
         AND staff_user.merged_into_id IS NULL
    ) AS clinic_admins;

  RETURN COALESCE(v_result, jsonb_build_object('ok', true, 'profiles', '[]'::jsonb));
END
$$;
