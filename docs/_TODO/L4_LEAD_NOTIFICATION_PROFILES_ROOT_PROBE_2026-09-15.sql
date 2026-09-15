\set ON_ERROR_STOP on
BEGIN;

-- 1. Кандидатская функция ровно из файла миграции, владелец — тот же, что в её owner-маркере.
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
  v_organization_id uuid := app.current_org_id();
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

  IF p_topic_code IS DISTINCT FROM 'doctor_patient_messages' THEN
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

ALTER FUNCTION app.read_clinic_lead_notification_profiles(uuid,text) OWNER TO "app_seam_public_booking_owner";

-- 2. Права и RLS — ДОСЛОВНО из сгенерированного артефакта декларации, не придуманы здесь.
REVOKE ALL ON FUNCTION app.read_clinic_lead_notification_profiles(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.read_clinic_lead_notification_profiles(uuid,text) TO "app_tenant_service";
GRANT SELECT ("organization_id", "platform_user_id", "role", "status") ON TABLE "public"."be_organization_members" TO "app_seam_public_booking_owner";
DROP POLICY IF EXISTS "rev10_named_root_owner_gate_32" ON "public"."be_organization_members";
CREATE POLICY "rev10_named_root_owner_gate_32" ON "public"."be_organization_members" AS RESTRICTIVE FOR ALL TO "app_seam_delivery_scope_owner", "app_seam_identity_lookup_owner", "app_seam_org_commerce_owner", "app_seam_org_directory_owner", "app_seam_org_invite_owner", "app_seam_public_booking_owner", "app_seam_reminder_specialist_owner", "app_seam_settings_runtime_owner", "app_seam_specialist_provision_owner", "app_seam_telemetry_operator_owner", "saas_system_health_owner" USING (current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_org_commerce_owner'::name OR current_user = 'app_seam_org_directory_owner'::name OR current_user = 'app_seam_org_invite_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_settings_runtime_owner'::name OR current_user = 'app_seam_specialist_provision_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name OR current_user = 'saas_system_health_owner'::name) WITH CHECK (current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_org_commerce_owner'::name OR current_user = 'app_seam_org_directory_owner'::name OR current_user = 'app_seam_org_invite_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_settings_runtime_owner'::name OR current_user = 'app_seam_specialist_provision_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name OR current_user = 'saas_system_health_owner'::name);
DROP POLICY IF EXISTS "rev10_seam_business_32" ON "public"."be_organization_members";
CREATE POLICY "rev10_seam_business_32" ON "public"."be_organization_members" AS PERMISSIVE FOR ALL TO "app_seam_delivery_scope_owner", "app_seam_identity_lookup_owner", "app_seam_org_commerce_owner", "app_seam_org_directory_owner", "app_seam_org_invite_owner", "app_seam_public_booking_owner", "app_seam_reminder_specialist_owner", "app_seam_settings_runtime_owner", "app_seam_specialist_provision_owner", "app_seam_telemetry_operator_owner", "saas_system_health_owner" USING ((current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_org_commerce_owner'::name OR current_user = 'app_seam_org_directory_owner'::name OR current_user = 'app_seam_org_invite_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_settings_runtime_owner'::name OR current_user = 'app_seam_specialist_provision_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name OR current_user = 'saas_system_health_owner'::name)) WITH CHECK ((current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_org_commerce_owner'::name OR current_user = 'app_seam_org_directory_owner'::name OR current_user = 'app_seam_org_invite_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_settings_runtime_owner'::name OR current_user = 'app_seam_specialist_provision_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name OR current_user = 'saas_system_health_owner'::name));
GRANT SELECT ("id", "merged_into_id", "role") ON TABLE "public"."platform_users" TO "app_seam_public_booking_owner";
GRANT SELECT ("display_name", "first_name", "id", "is_blocked", "last_name", "merged_into_id", "patronymic", "role") ON TABLE "public"."platform_users" TO "app_seam_public_booking_owner";
DROP POLICY IF EXISTS "rev10_named_root_owner_gate_157" ON "public"."platform_users";
CREATE POLICY "rev10_named_root_owner_gate_157" ON "public"."platform_users" AS RESTRICTIVE FOR ALL TO "app_seam_delivery_scope_owner", "app_seam_email_otp_owner", "app_seam_identity_lookup_owner", "app_seam_org_directory_owner", "app_seam_org_invite_owner", "app_seam_password_auth_owner", "app_seam_patient_booking_owner", "app_seam_patient_invite_owner", "app_seam_patient_self_actions_owner", "app_seam_phone_binding_owner", "app_seam_platform_analytics_owner", "app_seam_public_booking_owner", "app_seam_reminder_appointment_owner", "app_seam_reminder_materialization_owner", "app_seam_reminder_patient_owner", "app_seam_reminder_specialist_owner", "app_seam_self_security_owner", "app_seam_specialist_provision_owner", "app_seam_telemetry_exclusion_owner", "app_seam_telemetry_operator_owner" USING (current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_email_otp_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_org_directory_owner'::name OR current_user = 'app_seam_org_invite_owner'::name OR current_user = 'app_seam_password_auth_owner'::name OR current_user = 'app_seam_patient_booking_owner'::name OR current_user = 'app_seam_patient_invite_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_phone_binding_owner'::name OR current_user = 'app_seam_platform_analytics_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_patient_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_self_security_owner'::name OR current_user = 'app_seam_specialist_provision_owner'::name OR current_user = 'app_seam_telemetry_exclusion_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name) WITH CHECK (current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_email_otp_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_org_directory_owner'::name OR current_user = 'app_seam_org_invite_owner'::name OR current_user = 'app_seam_password_auth_owner'::name OR current_user = 'app_seam_patient_booking_owner'::name OR current_user = 'app_seam_patient_invite_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_phone_binding_owner'::name OR current_user = 'app_seam_platform_analytics_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_patient_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_self_security_owner'::name OR current_user = 'app_seam_specialist_provision_owner'::name OR current_user = 'app_seam_telemetry_exclusion_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name);
DROP POLICY IF EXISTS "rev10_seam_business_157" ON "public"."platform_users";
CREATE POLICY "rev10_seam_business_157" ON "public"."platform_users" AS PERMISSIVE FOR ALL TO "app_seam_delivery_scope_owner", "app_seam_email_otp_owner", "app_seam_identity_lookup_owner", "app_seam_org_directory_owner", "app_seam_org_invite_owner", "app_seam_password_auth_owner", "app_seam_patient_booking_owner", "app_seam_patient_invite_owner", "app_seam_patient_self_actions_owner", "app_seam_phone_binding_owner", "app_seam_platform_analytics_owner", "app_seam_public_booking_owner", "app_seam_reminder_appointment_owner", "app_seam_reminder_materialization_owner", "app_seam_reminder_patient_owner", "app_seam_reminder_specialist_owner", "app_seam_self_security_owner", "app_seam_specialist_provision_owner", "app_seam_telemetry_exclusion_owner", "app_seam_telemetry_operator_owner" USING ((current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_email_otp_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_org_directory_owner'::name OR current_user = 'app_seam_org_invite_owner'::name OR current_user = 'app_seam_password_auth_owner'::name OR current_user = 'app_seam_patient_booking_owner'::name OR current_user = 'app_seam_patient_invite_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_phone_binding_owner'::name OR current_user = 'app_seam_platform_analytics_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_patient_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_self_security_owner'::name OR current_user = 'app_seam_specialist_provision_owner'::name OR current_user = 'app_seam_telemetry_exclusion_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name)) WITH CHECK ((current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_email_otp_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_org_directory_owner'::name OR current_user = 'app_seam_org_invite_owner'::name OR current_user = 'app_seam_password_auth_owner'::name OR current_user = 'app_seam_patient_booking_owner'::name OR current_user = 'app_seam_patient_invite_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_phone_binding_owner'::name OR current_user = 'app_seam_platform_analytics_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_patient_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_self_security_owner'::name OR current_user = 'app_seam_specialist_provision_owner'::name OR current_user = 'app_seam_telemetry_exclusion_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name));
GRANT SELECT ("channel_code", "created_at", "external_id", "user_id") ON TABLE "public"."user_channel_bindings" TO "app_seam_public_booking_owner";
DROP POLICY IF EXISTS "rev10_named_root_owner_gate_217" ON "public"."user_channel_bindings";
CREATE POLICY "rev10_named_root_owner_gate_217" ON "public"."user_channel_bindings" AS RESTRICTIVE FOR ALL TO "app_seam_delivery_scope_owner", "app_seam_identity_lookup_owner", "app_seam_patient_self_actions_owner", "app_seam_phone_binding_owner", "app_seam_platform_analytics_owner", "app_seam_public_booking_owner", "app_seam_reminder_appointment_owner", "app_seam_reminder_materialization_owner", "app_seam_reminder_specialist_owner", "app_seam_telemetry_exclusion_owner", "app_seam_telemetry_operator_owner" USING (current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_phone_binding_owner'::name OR current_user = 'app_seam_platform_analytics_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_telemetry_exclusion_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name) WITH CHECK (current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_phone_binding_owner'::name OR current_user = 'app_seam_platform_analytics_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_telemetry_exclusion_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name);
DROP POLICY IF EXISTS "rev10_seam_business_217" ON "public"."user_channel_bindings";
CREATE POLICY "rev10_seam_business_217" ON "public"."user_channel_bindings" AS PERMISSIVE FOR ALL TO "app_seam_delivery_scope_owner", "app_seam_identity_lookup_owner", "app_seam_patient_self_actions_owner", "app_seam_phone_binding_owner", "app_seam_platform_analytics_owner", "app_seam_public_booking_owner", "app_seam_reminder_appointment_owner", "app_seam_reminder_materialization_owner", "app_seam_reminder_specialist_owner", "app_seam_telemetry_exclusion_owner", "app_seam_telemetry_operator_owner" USING ((current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_phone_binding_owner'::name OR current_user = 'app_seam_platform_analytics_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_telemetry_exclusion_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name)) WITH CHECK ((current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_phone_binding_owner'::name OR current_user = 'app_seam_platform_analytics_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_telemetry_exclusion_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name));
GRANT SELECT ("channel_code", "is_enabled_for_messages", "is_enabled_for_notifications", "is_preferred_for_auth", "platform_user_id", "user_id") ON TABLE "public"."user_channel_preferences" TO "app_seam_public_booking_owner";
DROP POLICY IF EXISTS "rev10_named_root_owner_gate_218" ON "public"."user_channel_preferences";
CREATE POLICY "rev10_named_root_owner_gate_218" ON "public"."user_channel_preferences" AS RESTRICTIVE FOR ALL TO "app_seam_delivery_scope_owner", "app_seam_identity_lookup_owner", "app_seam_patient_self_actions_owner", "app_seam_public_booking_owner", "app_seam_reminder_appointment_owner", "app_seam_reminder_materialization_owner", "app_seam_reminder_specialist_owner", "app_seam_telemetry_operator_owner" USING (current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name) WITH CHECK (current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name);
DROP POLICY IF EXISTS "rev10_seam_business_218" ON "public"."user_channel_preferences";
CREATE POLICY "rev10_seam_business_218" ON "public"."user_channel_preferences" AS PERMISSIVE FOR ALL TO "app_seam_delivery_scope_owner", "app_seam_identity_lookup_owner", "app_seam_patient_self_actions_owner", "app_seam_public_booking_owner", "app_seam_reminder_appointment_owner", "app_seam_reminder_materialization_owner", "app_seam_reminder_specialist_owner", "app_seam_telemetry_operator_owner" USING ((current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name)) WITH CHECK ((current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name));
GRANT SELECT ("channel_code", "is_enabled", "topic_code", "user_id") ON TABLE "public"."user_notification_topic_channels" TO "app_seam_public_booking_owner";
DROP POLICY IF EXISTS "rev10_named_root_owner_gate_221" ON "public"."user_notification_topic_channels";
CREATE POLICY "rev10_named_root_owner_gate_221" ON "public"."user_notification_topic_channels" AS RESTRICTIVE FOR ALL TO "app_seam_delivery_scope_owner", "app_seam_patient_self_actions_owner", "app_seam_public_booking_owner", "app_seam_reminder_appointment_owner", "app_seam_reminder_materialization_owner", "app_seam_reminder_patient_owner", "app_seam_reminder_specialist_owner" USING (current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_patient_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name) WITH CHECK (current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_patient_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name);
DROP POLICY IF EXISTS "rev10_seam_business_221" ON "public"."user_notification_topic_channels";
CREATE POLICY "rev10_seam_business_221" ON "public"."user_notification_topic_channels" AS PERMISSIVE FOR ALL TO "app_seam_delivery_scope_owner", "app_seam_patient_self_actions_owner", "app_seam_public_booking_owner", "app_seam_reminder_appointment_owner", "app_seam_reminder_materialization_owner", "app_seam_reminder_patient_owner", "app_seam_reminder_specialist_owner" USING ((current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_patient_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name)) WITH CHECK ((current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_patient_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name));
GRANT SELECT ("user_id") ON TABLE "public"."user_web_push_subscriptions" TO "app_seam_public_booking_owner";
DROP POLICY IF EXISTS "rev10_named_root_owner_gate_230" ON "public"."user_web_push_subscriptions";
CREATE POLICY "rev10_named_root_owner_gate_230" ON "public"."user_web_push_subscriptions" AS RESTRICTIVE FOR ALL TO "app_seam_delivery_scope_owner", "app_seam_identity_lookup_owner", "app_seam_patient_self_actions_owner", "app_seam_public_booking_owner", "app_seam_reminder_appointment_owner", "app_seam_reminder_materialization_owner", "app_seam_reminder_specialist_owner", "app_seam_telemetry_operator_owner", "saas_system_health_owner" USING (current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name OR current_user = 'saas_system_health_owner'::name) WITH CHECK (current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name OR current_user = 'saas_system_health_owner'::name);
DROP POLICY IF EXISTS "rev10_seam_business_230" ON "public"."user_web_push_subscriptions";
CREATE POLICY "rev10_seam_business_230" ON "public"."user_web_push_subscriptions" AS PERMISSIVE FOR ALL TO "app_seam_delivery_scope_owner", "app_seam_identity_lookup_owner", "app_seam_patient_self_actions_owner", "app_seam_public_booking_owner", "app_seam_reminder_appointment_owner", "app_seam_reminder_materialization_owner", "app_seam_reminder_specialist_owner", "app_seam_telemetry_operator_owner", "saas_system_health_owner" USING ((current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name OR current_user = 'saas_system_health_owner'::name)) WITH CHECK ((current_user = 'app_seam_delivery_scope_owner'::name OR current_user = 'app_seam_identity_lookup_owner'::name OR current_user = 'app_seam_patient_self_actions_owner'::name OR current_user = 'app_seam_public_booking_owner'::name OR current_user = 'app_seam_reminder_appointment_owner'::name OR current_user = 'app_seam_reminder_materialization_owner'::name OR current_user = 'app_seam_reminder_specialist_owner'::name OR current_user = 'app_seam_telemetry_operator_owner'::name OR current_user = 'saas_system_health_owner'::name));

-- 3. Способность — дословно из сгенерированного каталога.
INSERT INTO app_ext.port_context_capabilities
  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
VALUES ('31ff56dd-f7f5-5840-a9ce-dacf86293bbc'::uuid, 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name,
        'app_tenant_service'::name, 'tenant_service'::app.port_context_class,
        'leads.clinic-notification-profiles.read',
        'app.read_clinic_lead_notification_profiles(uuid,text)'::regprocedure);

-- 4. Фикстура: свой админ с привязкой telegram, свой врач, выключенный, слитый и ЧУЖАЯ клиника.
INSERT INTO public.be_organizations (id, title) VALUES ('a4000000-0000-4000-8000-00000000f0b0'::uuid, 'AUDITL4 чужая клиника');
INSERT INTO public.platform_users (id, display_name, role) VALUES
  ('a4000000-0000-4000-8000-00000000a001'::uuid, 'AUDITL4 свой админ',  'admin'),
  ('a4000000-0000-4000-8000-00000000a002'::uuid, 'AUDITL4 свой врач',   'doctor'),
  ('a4000000-0000-4000-8000-00000000a003'::uuid, 'AUDITL4 выключенный', 'admin'),
  ('a4000000-0000-4000-8000-00000000a004'::uuid, 'AUDITL4 слитый',      'admin'),
  ('a4000000-0000-4000-8000-00000000b001'::uuid, 'AUDITL4 чужой админ', 'admin');
UPDATE public.platform_users SET merged_into_id = 'a4000000-0000-4000-8000-00000000a001'::uuid
 WHERE id = 'a4000000-0000-4000-8000-00000000a004'::uuid;
INSERT INTO public.be_organization_members (organization_id, platform_user_id, role, status)
SELECT 'a0000000-0000-4000-8000-000000000001'::uuid, u, r, s FROM (VALUES
  ('a4000000-0000-4000-8000-00000000a001'::uuid, 'admin',  'active'),
  ('a4000000-0000-4000-8000-00000000a002'::uuid, 'doctor', 'active'),
  ('a4000000-0000-4000-8000-00000000a003'::uuid, 'admin',  'disabled'),
  ('a4000000-0000-4000-8000-00000000a004'::uuid, 'admin',  'active')) AS v(u,r,s);
INSERT INTO public.be_organization_members (organization_id, platform_user_id, role, status) VALUES
  ('a4000000-0000-4000-8000-00000000f0b0'::uuid, 'a4000000-0000-4000-8000-00000000b001'::uuid, 'owner', 'active');
INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id) VALUES
  ('a4000000-0000-4000-8000-00000000a001'::uuid, 'telegram', 'AUDITL4-tg-own-admin');
INSERT INTO public.user_notification_topic_channels (user_id, topic_code, channel_code, is_enabled) VALUES
  ('a4000000-0000-4000-8000-00000000a001'::uuid, 'doctor_patient_messages', 'telegram', true);

-- 5. Принятый контекст ТОЙ ЖЕ транзакции — ровно тот кортеж, который ставит рантайм.
INSERT INTO app_ext.accepted_port_contexts
  (database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
   context_class, purpose, function_identity, typed_args_hash, organization_id)
SELECT (SELECT oid FROM pg_database WHERE datname = current_database()), pg_backend_pid(), pg_current_xact_id(),
       '31ff56dd-f7f5-5840-a9ce-dacf86293bbc'::uuid, 'bcb_dev_webapp_staff'::name, 'webapp'::app.port_name,
       'app_tenant_service'::name, 'tenant_service'::app.port_context_class,
       'leads.clinic-notification-profiles.read',
       'app.read_clinic_lead_notification_profiles(uuid,text)'::regprocedure,
       app.hash_port_typed_args(ARRAY[
         ROW('uuid@1', pg_catalog.uuid_send('a0000000-0000-4000-8000-000000000001'::uuid))::app.port_typed_arg,
         ROW('text@1', pg_catalog.textsend('doctor_patient_messages'))::app.port_typed_arg]),
       'a0000000-0000-4000-8000-000000000001'::uuid;

SET SESSION AUTHORIZATION "bcb_dev_webapp_staff";
SET ROLE "app_tenant_service";
SELECT session_user, current_user;

\echo '--- ПРОБА 1: своя организация, поддерживаемая тема ---'
SELECT jsonb_pretty(app.read_clinic_lead_notification_profiles('a0000000-0000-4000-8000-000000000001'::uuid, 'doctor_patient_messages')) AS own_org;



RESET ROLE; RESET SESSION AUTHORIZATION;
-- Каждый следующий вызов рантайма ставит СВОЙ принятый контекст под свои аргументы; на транзакцию
-- строка одна (PK), поэтому здесь кортеж переписывается — это та же установка, а не ослабление.
UPDATE app_ext.accepted_port_contexts SET typed_args_hash = app.hash_port_typed_args(ARRAY[
  ROW('uuid@1', pg_catalog.uuid_send('a4000000-0000-4000-8000-00000000f0b0'::uuid))::app.port_typed_arg,
  ROW('text@1', pg_catalog.textsend('doctor_patient_messages'))::app.port_typed_arg]);
SET SESSION AUTHORIZATION "bcb_dev_webapp_staff"; SET ROLE "app_tenant_service";
\echo '--- ПРОБА 2: ЧУЖАЯ организация под тем же принципалом ---'
SELECT app.read_clinic_lead_notification_profiles('a4000000-0000-4000-8000-00000000f0b0'::uuid, 'doctor_patient_messages') AS foreign_org;

RESET ROLE; RESET SESSION AUTHORIZATION;
UPDATE app_ext.accepted_port_contexts SET typed_args_hash = app.hash_port_typed_args(ARRAY[
  ROW('uuid@1', pg_catalog.uuid_send('a0000000-0000-4000-8000-000000000001'::uuid))::app.port_typed_arg,
  ROW('text@1', pg_catalog.textsend('billing_invoices'))::app.port_typed_arg]);
SET SESSION AUTHORIZATION "bcb_dev_webapp_staff"; SET ROLE "app_tenant_service";
\echo '--- ПРОБА 3: неподдерживаемая тема ---'
SELECT app.read_clinic_lead_notification_profiles('a0000000-0000-4000-8000-000000000001'::uuid, 'billing_invoices') AS bad_topic;

RESET ROLE; RESET SESSION AUTHORIZATION;
\echo '--- ПРОБА 4: тот же вызов БЕЗ принятого контекста (гейт двери) ---'
DELETE FROM app_ext.accepted_port_contexts;
SET SESSION AUTHORIZATION "bcb_dev_webapp_staff"; SET ROLE "app_tenant_service";
SELECT app.read_clinic_lead_notification_profiles('a0000000-0000-4000-8000-000000000001'::uuid, 'doctor_patient_messages') AS no_context;

RESET ROLE;
RESET SESSION AUTHORIZATION;
ROLLBACK;

\echo '--- после ROLLBACK функции быть не должно ---'
SELECT to_regprocedure('app.read_clinic_lead_notification_profiles(uuid,text)') IS NULL AS function_rolled_back,
       (SELECT count(*) FROM public.platform_users WHERE display_name LIKE 'AUDITL4 %') AS fixture_residue;
