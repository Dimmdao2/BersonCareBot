-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.list_operator_web_push_recipients(text)') IS NOT NULL AND to_regprocedure('app.list_operator_alert_staff_push_recipients()') IS NULL AND position('require_accepted_context' in pg_get_functiondef('app.stage_orphan_hosted_video_covers_for_purge(integer)'::regprocedure)) > 0;
DROP FUNCTION app.list_operator_alert_staff_push_recipients();

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.list_operator_web_push_recipients(p_audience text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path TO 'pg_catalog'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'notifications.operator-push-audience.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_audience))::app.port_typed_arg
    ]),
    'app.list_operator_web_push_recipients(text)'::regprocedure
  );

  IF p_audience NOT IN ('staff', 'global_admin') THEN
    RAISE EXCEPTION 'unsupported operator web-push audience'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT staff_user.id AS user_id, member.organization_id
      FROM public.be_organization_members AS member
      JOIN public.platform_users AS staff_user
        ON staff_user.id = member.platform_user_id
     WHERE p_audience = 'staff'
       AND member.status = 'active'
       AND staff_user.role IN ('doctor', 'admin')
       AND staff_user.is_archived = false
       AND staff_user.is_blocked = false
       AND staff_user.merged_into_id IS NULL
    UNION ALL
    SELECT global_admin.id AS user_id, NULL::uuid AS organization_id
      FROM public.platform_users AS global_admin
     WHERE p_audience = 'global_admin'
       AND global_admin.role = 'admin'
       AND global_admin.is_archived = false
       AND global_admin.is_blocked = false
       AND global_admin.merged_into_id IS NULL
  ), eligible AS (
    SELECT candidate.user_id, candidate.organization_id
      FROM candidates AS candidate
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.user_channel_preferences AS preference
        WHERE preference.channel_code = 'web_push'
          AND preference.is_enabled_for_notifications = false
          AND (
            preference.platform_user_id = candidate.user_id
            OR (preference.platform_user_id IS NULL AND preference.user_id = candidate.user_id::text)
          )
     )
       AND EXISTS (
         SELECT 1
           FROM public.user_web_push_subscriptions AS subscription
          WHERE subscription.user_id = candidate.user_id
       )
  )
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'userId', eligible.user_id,
           'organizationId', eligible.organization_id
         )), '[]'::jsonb)
    INTO v_result
    FROM eligible;

  RETURN v_result;
END
$$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- The previous migration created this exact-gated body before its runtime capability existed.
-- Reconcile therefore downgraded the live function to the attested fallback. Restore the same body
-- in the forward migration that introduces the capability, so order can no longer decide the gate.
CREATE OR REPLACE FUNCTION app.stage_orphan_hosted_video_covers_for_purge(
  p_limit integer
)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_staged bigint;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_lfk_media_owner'::name,
    'app_operational_media_worker'::name,
    'service'::app.port_context_class,
    'media.hosted-cover.orphan-stage',
    app.hash_port_typed_args(ARRAY[
      ROW('integer@1', pg_catalog.int4send(p_limit))::app.port_typed_arg
    ]),
    'app.stage_orphan_hosted_video_covers_for_purge(integer)'::regprocedure
  );

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'hosted_video_cover_purge_limit_invalid' USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT cover.id
      FROM public.media_files AS cover
     WHERE cover.usage_purpose = 'hosted_video_preview'
       AND cover.status IN ('ready', 'failed')
       AND cover.created_at < now() - interval '1 day'
       AND NOT EXISTS (
         SELECT 1
           FROM public.lfk_exercise_media AS exercise_media
          WHERE exercise_media.organization_id = cover.organization_id
            AND exercise_media.media_url = cover.hosted_video_source_url
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.treatment_program_instance_stage_items AS instance_item
          WHERE instance_item.organization_id = cover.organization_id
            AND jsonb_path_exists(
              instance_item.snapshot,
              '$.media[*] ? ((@.mediaType == "hosted_video" || @.type == "hosted_video") && @.mediaUrl == $url)',
              jsonb_build_object('url', to_jsonb(cover.hosted_video_source_url))
            )
       )
     ORDER BY cover.created_at ASC, cover.id ASC
     LIMIT p_limit
     FOR UPDATE OF cover SKIP LOCKED
  )
  UPDATE public.media_files AS cover
     SET status = 'pending_delete',
         next_attempt_at = NULL
    FROM candidates
   WHERE cover.id = candidates.id;

  GET DIAGNOSTICS v_staged = ROW_COUNT;
  RETURN v_staged;
END
$function$;
