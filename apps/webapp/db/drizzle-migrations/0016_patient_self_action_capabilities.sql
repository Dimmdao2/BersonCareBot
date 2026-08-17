-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0016

CREATE OR REPLACE FUNCTION app.record_current_patient_practice_completion(
  p_content_page_id uuid,
  p_source text,
  p_feeling integer
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL
     OR p_source NOT IN ('home', 'reminder', 'section_page', 'daily_warmup')
     OR (p_feeling IS NOT NULL AND p_feeling NOT BETWEEN 1 AND 5)
     OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments e
       WHERE e.organization_id = v_org AND e.platform_user_id = v_patient AND e.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.content_pages p
       WHERE p.id = p_content_page_id
         AND p.organization_id = v_org
         AND p.is_published
         AND p.archived_at IS NULL
         AND p.deleted_at IS NULL
         AND (
           p_source <> 'daily_warmup'
           OR EXISTS (
             SELECT 1
             FROM public.patient_home_blocks b
             JOIN public.patient_home_block_items bi ON bi.block_code = b.code
             WHERE b.code = 'daily_warmup'
               AND b.organization_id = v_org
               AND b.is_visible
               AND bi.organization_id = v_org
               AND bi.is_visible
               AND bi.target_type = 'content_page'
               AND btrim(bi.target_ref) = p.slug
           )
         )
     ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  INSERT INTO public.patient_practice_completions (
    organization_id, user_id, content_page_id, source, feeling, notes
  ) VALUES (v_org, v_patient, p_content_page_id, p_source, p_feeling, '')
  RETURNING patient_practice_completions.id;
END
$function$;

DROP FUNCTION IF EXISTS app.upsert_current_patient_material_rating(text,uuid,integer);

CREATE OR REPLACE FUNCTION app.upsert_current_patient_material_rating(
  p_target_kind text,
  p_target_id uuid,
  p_stars integer,
  p_program_instance_id uuid,
  p_program_stage_item_id uuid
)
RETURNS TABLE(updated boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR p_target_kind NOT IN ('content_page', 'lfk_exercise', 'lfk_complex')
     OR p_stars NOT BETWEEN 1 AND 5
     OR NOT coalesce((
       SELECT (s.value_json->>'value')::boolean
       FROM public.app_runtime_settings s
       WHERE s.key = 'material_ratings_enabled'
         AND s.scope = 'admin'
         AND s.audience = 'server'
         AND s.organization_id IS NULL
       LIMIT 1
     ), true)
     OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments e
       WHERE e.organization_id = v_org AND e.platform_user_id = v_patient AND e.status = 'active'
     )
     OR NOT (
       (p_target_kind = 'content_page' AND EXISTS (
         SELECT 1 FROM public.content_pages p
         WHERE p.id = p_target_id AND p.organization_id = v_org
           AND p.is_published AND p.archived_at IS NULL AND p.deleted_at IS NULL
       ) AND (
         (p_program_instance_id IS NULL AND p_program_stage_item_id IS NULL)
         OR EXISTS (
           SELECT 1
           FROM public.treatment_program_instance_stage_items si
           JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
           JOIN public.treatment_program_instances i ON i.id = s.instance_id
           WHERE i.id = p_program_instance_id
             AND si.id = p_program_stage_item_id
             AND si.item_type = 'lesson'
             AND si.item_ref_id = p_target_id
             AND si.organization_id = v_org
             AND s.organization_id = v_org
             AND i.organization_id = v_org
             AND i.patient_user_id = v_patient
             AND i.status = 'active'
             AND si.status = 'active'
         )
       ))
       OR (p_target_kind IN ('lfk_exercise', 'lfk_complex') AND EXISTS (
         SELECT 1
         FROM public.treatment_program_instance_stage_items si
         JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
         JOIN public.treatment_program_instances i ON i.id = s.instance_id
         WHERE i.id = p_program_instance_id
           AND si.id = p_program_stage_item_id
           AND si.item_ref_id = p_target_id
           AND (
             (p_target_kind = 'lfk_exercise' AND si.item_type = 'exercise')
             OR (p_target_kind = 'lfk_complex' AND si.item_type = 'lfk_complex')
           )
           AND si.organization_id = v_org
           AND s.organization_id = v_org
           AND i.organization_id = v_org
           AND i.patient_user_id = v_patient
           AND i.status = 'active'
           AND si.status = 'active'
       ))
     ) THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;
  INSERT INTO public.material_ratings (
    organization_id, user_id, target_kind, target_id, stars, updated_at
  ) VALUES (v_org, v_patient, p_target_kind, p_target_id, p_stars, statement_timestamp())
  ON CONFLICT (user_id, target_kind, target_id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      stars = EXCLUDED.stars,
      updated_at = EXCLUDED.updated_at
  WHERE material_ratings.user_id = v_patient;
  RETURN QUERY SELECT FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.update_current_patient_practice_completion_feeling(
  p_completion_id uuid,
  p_feeling integer
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR p_feeling NOT IN (1, 3, 5) THEN
    RETURN false;
  END IF;
  UPDATE public.patient_practice_completions
  SET feeling = p_feeling
  WHERE id = p_completion_id
    AND organization_id = v_org
    AND user_id = v_patient;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.save_current_patient_daily_warmup_presentation(
  p_content_page_id uuid,
  p_last_rotation_at timestamptz,
  p_skip_next_scheduled_rotation boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL
     OR p_last_rotation_at IS NULL
     OR p_last_rotation_at > statement_timestamp() + interval '5 minutes'
     OR NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments e
    WHERE e.organization_id = v_org AND e.platform_user_id = v_patient AND e.status = 'active'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.content_pages p
    WHERE p.id = p_content_page_id
      AND p.organization_id = v_org
      AND p.is_published
      AND p.archived_at IS NULL
      AND p.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.patient_home_blocks b
        JOIN public.patient_home_block_items bi ON bi.block_code = b.code
        WHERE b.code = 'daily_warmup'
          AND b.organization_id = v_org
          AND b.is_visible
          AND bi.organization_id = v_org
          AND bi.is_visible
          AND bi.target_type = 'content_page'
          AND btrim(bi.target_ref) = p.slug
      )
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.patient_daily_warmup_presentations (
    organization_id, user_id, content_page_id, last_rotation_at,
    skip_next_scheduled_rotation, updated_at
  ) VALUES (
    v_org, v_patient, p_content_page_id, p_last_rotation_at,
    coalesce(p_skip_next_scheduled_rotation, false), statement_timestamp()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      content_page_id = EXCLUDED.content_page_id,
      last_rotation_at = EXCLUDED.last_rotation_at,
      skip_next_scheduled_rotation = EXCLUDED.skip_next_scheduled_rotation,
      updated_at = EXCLUDED.updated_at
  WHERE patient_daily_warmup_presentations.user_id = v_patient
    AND (
      patient_daily_warmup_presentations.last_rotation_at IS NULL
      OR EXCLUDED.last_rotation_at >= patient_daily_warmup_presentations.last_rotation_at
    );
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.record_current_patient_daily_warmup_video_view(
  p_content_page_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.patient_daily_warmup_presentations p
    JOIN public.content_pages c ON c.id = p.content_page_id
    WHERE p.user_id = v_patient
      AND p.organization_id = v_org
      AND p.content_page_id = p_content_page_id
      AND c.organization_id = v_org
      AND c.is_published
      AND c.archived_at IS NULL
      AND c.deleted_at IS NULL
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.patient_daily_warmup_video_views (
    organization_id, user_id, content_page_id
  ) VALUES (v_org, v_patient, p_content_page_id);
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION app.record_current_patient_content_rating_feedback(
  p_content_page_id uuid,
  p_rating_value integer,
  p_reason_codes text,
  p_comment text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_reason_codes jsonb := p_reason_codes::jsonb;
  v_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL
     OR p_rating_value IS NULL OR p_rating_value NOT BETWEEN 1 AND 3
     OR coalesce(jsonb_typeof(v_reason_codes), '') <> 'array'
     OR jsonb_array_length(v_reason_codes) > 6
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements_text(v_reason_codes) reason(code)
       WHERE reason.code NOT IN (
         'worse_wellbeing', 'too_hard', 'unclear_explanation', 'disliked_movement',
         'video_quality', 'other'
       )
     )
     OR (jsonb_array_length(v_reason_codes) = 0 AND nullif(btrim(p_comment), '') IS NULL)
     OR length(coalesce(p_comment, '')) > 2000
     OR NOT coalesce((
       SELECT (s.value_json->>'value')::boolean
       FROM public.app_runtime_settings s
       WHERE s.key = 'material_ratings_enabled'
         AND s.scope = 'admin'
         AND s.audience = 'server'
         AND s.organization_id IS NULL
       LIMIT 1
     ), true)
     OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments e
       WHERE e.organization_id = v_org AND e.platform_user_id = v_patient AND e.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.content_pages p
       WHERE p.id = p_content_page_id
         AND p.organization_id = v_org
         AND p.is_published
         AND p.archived_at IS NULL
         AND p.deleted_at IS NULL
         AND EXISTS (
           SELECT 1
           FROM public.patient_home_blocks b
           JOIN public.patient_home_block_items bi ON bi.block_code = b.code
           WHERE b.code = 'daily_warmup'
             AND b.organization_id = v_org
             AND b.is_visible
             AND bi.organization_id = v_org
             AND bi.is_visible
             AND bi.target_type = 'content_page'
             AND btrim(bi.target_ref) = p.slug
         )
     ) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.patient_content_rating_feedback (
    organization_id, user_id, content_page_id, rating_value, reason_codes, comment
  ) VALUES (
    v_org, v_patient, p_content_page_id, p_rating_value, v_reason_codes, nullif(btrim(p_comment), '')
  ) RETURNING id INTO v_id;
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION app.record_current_patient_playback_client_event(
  p_media_id uuid,
  p_event_class text,
  p_delivery text,
  p_error_detail text,
  p_user_agent text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL
     OR p_event_class NOT IN (
       'hls_fatal', 'video_error', 'hls_import_failed', 'playback_refetch_failed',
       'playback_refetch_exception', 'hls_js_unsupported'
     )
     OR (p_delivery IS NOT NULL AND p_delivery NOT IN ('hls', 'mp4', 'file'))
     OR NOT EXISTS (
       SELECT 1
       FROM public.media_files m
       WHERE m.id = p_media_id
         AND m.organization_id = v_org
         AND (
           (m.usage_purpose = 'program_item_submission' AND m.uploaded_by = v_patient)
           OR EXISTS (
             SELECT 1 FROM public.content_pages p
             WHERE p.organization_id = v_org
               AND p.is_published AND p.archived_at IS NULL AND p.deleted_at IS NULL
               AND (p.video_url LIKE '%' || p_media_id::text || '%'
                    OR p.image_url LIKE '%' || p_media_id::text || '%'
                    OR p.body_md LIKE '%' || p_media_id::text || '%'
                    OR p.body_html LIKE '%' || p_media_id::text || '%')
           )
           OR EXISTS (
             SELECT 1
             FROM public.treatment_program_instance_stage_items si
             JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
             JOIN public.treatment_program_instances i ON i.id = s.instance_id
             WHERE i.organization_id = v_org AND i.patient_user_id = v_patient
               AND i.status = 'active' AND si.status <> 'disabled'
               AND si.snapshot::text LIKE '%' || p_media_id::text || '%'
           )
           OR EXISTS (
             SELECT 1
             FROM public.program_item_discussion_messages dm
             JOIN public.treatment_program_instance_stage_items si
               ON si.id = dm.instance_stage_item_id
             JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
             JOIN public.treatment_program_instances i ON i.id = s.instance_id
             WHERE dm.media_file_id = p_media_id AND dm.organization_id = v_org
               AND i.organization_id = v_org AND i.patient_user_id = v_patient
           )
         )
     ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.media_playback_client_events (
    organization_id, media_id, user_id, event_class, delivery, error_detail, user_agent
  ) VALUES (
    v_org, p_media_id, v_patient, p_event_class, p_delivery,
    left(nullif(btrim(p_error_detail), ''), 500),
    left(nullif(btrim(p_user_agent), ''), 400)
  );
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION app.record_current_patient_playback_first_resolve(
  p_media_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.media_files m
    WHERE m.id = p_media_id
      AND m.organization_id = v_org
      AND (
        (m.usage_purpose = 'program_item_submission' AND m.uploaded_by = v_patient)
        OR EXISTS (
          SELECT 1 FROM public.content_pages p
          WHERE p.organization_id = v_org
            AND p.is_published AND p.archived_at IS NULL AND p.deleted_at IS NULL
            AND (p.video_url LIKE '%' || p_media_id::text || '%'
                 OR p.image_url LIKE '%' || p_media_id::text || '%'
                 OR p.body_md LIKE '%' || p_media_id::text || '%'
                 OR p.body_html LIKE '%' || p_media_id::text || '%')
        )
        OR EXISTS (
          SELECT 1
          FROM public.treatment_program_instance_stage_items si
          JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
          JOIN public.treatment_program_instances i ON i.id = s.instance_id
          WHERE i.organization_id = v_org AND i.patient_user_id = v_patient
            AND i.status = 'active' AND si.status <> 'disabled'
            AND si.snapshot::text LIKE '%' || p_media_id::text || '%'
        )
        OR EXISTS (
          SELECT 1
          FROM public.program_item_discussion_messages dm
          JOIN public.treatment_program_instance_stage_items si
            ON si.id = dm.instance_stage_item_id
          JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
          JOIN public.treatment_program_instances i ON i.id = s.instance_id
          WHERE dm.media_file_id = p_media_id AND dm.organization_id = v_org
            AND i.organization_id = v_org AND i.patient_user_id = v_patient
        )
      )
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.media_playback_user_video_first_resolve (
    organization_id, user_id, media_id
  ) VALUES (v_org, v_patient, p_media_id)
  ON CONFLICT (user_id, media_id) DO NOTHING;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.capture_current_patient_diary_day_snapshot(
  p_local_date text,
  p_iana text,
  p_warmup_slot_limit integer,
  p_warmup_done_count integer,
  p_warmup_all_done boolean,
  p_plan_instance_id uuid,
  p_plan_item_ids text,
  p_plan_done_mask text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_plan_item_ids jsonb := p_plan_item_ids::jsonb;
  v_plan_done_mask jsonb := p_plan_done_mask::jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR p_local_date !~ '^\d{4}-\d{2}-\d{2}$'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_iana)
     OR p_iana IS DISTINCT FROM coalesce(
       (SELECT u.calendar_timezone FROM public.platform_users u WHERE u.id = v_patient),
       (SELECT s.value_json->>'value'
        FROM public.app_runtime_settings s
        WHERE s.key = 'app_display_timezone'
          AND s.scope = 'admin'
          AND s.audience = 'public'
          AND s.organization_id IS NULL
        LIMIT 1),
       'Europe/Moscow'
     )
     OR p_local_date::date >= (statement_timestamp() AT TIME ZONE p_iana)::date
     OR p_warmup_slot_limit < 0 OR p_warmup_done_count < 0
     OR p_warmup_done_count > p_warmup_slot_limit
     OR jsonb_typeof(v_plan_item_ids) <> 'array'
     OR jsonb_typeof(v_plan_done_mask) <> 'array'
     OR jsonb_array_length(v_plan_item_ids) <> jsonb_array_length(v_plan_done_mask)
     OR (p_plan_instance_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.treatment_program_instances i
       WHERE i.id = p_plan_instance_id
         AND i.organization_id = v_org
         AND i.patient_user_id = v_patient
     ))
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements_text(v_plan_item_ids) WITH ORDINALITY item(item_id, ord)
       LEFT JOIN jsonb_array_elements_text(v_plan_done_mask) WITH ORDINALITY done(done_value, ord)
         USING (ord)
       LEFT JOIN public.treatment_program_instance_stage_items si
         ON si.id = item.item_id::uuid
       LEFT JOIN public.treatment_program_instance_stages s
         ON s.id = si.stage_id
       WHERE p_plan_instance_id IS NULL
          OR si.id IS NULL
          OR si.organization_id <> v_org
          OR s.instance_id <> p_plan_instance_id
          OR (done.done_value::boolean) IS DISTINCT FROM EXISTS (
            SELECT 1
            FROM public.program_action_log l
            WHERE l.organization_id = v_org
              AND l.patient_user_id = v_patient
              AND l.instance_id = p_plan_instance_id
              AND l.instance_stage_item_id = si.id
              AND l.action_type = 'done'
              AND (l.created_at AT TIME ZONE p_iana)::date = p_local_date::date
          )
     )
     OR p_warmup_done_count <> (
       SELECT count(*)::integer
       FROM public.patient_practice_completions c
       WHERE c.organization_id = v_org
         AND c.user_id = v_patient
         AND c.source = 'daily_warmup'
         AND (c.completed_at AT TIME ZONE p_iana)::date = p_local_date::date
     )
     OR p_warmup_all_done IS DISTINCT FROM (p_warmup_done_count >= p_warmup_slot_limit) THEN
    RETURN false;
  END IF;
  INSERT INTO public.patient_diary_day_snapshots (
    organization_id, platform_user_id, local_date, iana, warmup_slot_limit,
    warmup_done_count, warmup_all_done, plan_instance_id, plan_item_ids, plan_done_mask
  ) VALUES (
    v_org, v_patient, p_local_date::date, p_iana, p_warmup_slot_limit,
    p_warmup_done_count, p_warmup_all_done, p_plan_instance_id, v_plan_item_ids, v_plan_done_mask
  ) ON CONFLICT (platform_user_id, local_date) DO NOTHING;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.set_current_patient_notification_topic(
  p_topic_code text,
  p_is_enabled boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_topic text := btrim(p_topic_code);
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR p_is_enabled IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments e
       WHERE e.organization_id = v_org AND e.platform_user_id = v_patient AND e.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(coalesce(
         (SELECT s.value_json->'value'
          FROM public.app_runtime_settings s
          WHERE s.key = 'notifications_topics'
            AND s.scope = 'admin'
            AND s.audience = 'authenticated_client'
            AND (s.organization_id = v_org OR s.organization_id IS NULL)
          ORDER BY s.organization_id NULLS LAST
          LIMIT 1),
         '[]'::jsonb
       )) topic(value)
       WHERE btrim(topic.value->>'id') = v_topic
     ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_notification_topics (user_id, topic_code, is_enabled, updated_at)
  VALUES (v_patient, v_topic, p_is_enabled, statement_timestamp())
  ON CONFLICT (user_id, topic_code) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = EXCLUDED.updated_at
  WHERE user_notification_topics.user_id = v_patient;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION app.set_current_patient_notification_topic_channel(
  p_topic_code text,
  p_channel_code text,
  p_is_enabled boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_topic text := btrim(p_topic_code);
  v_channel text := btrim(p_channel_code);
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR p_is_enabled IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments e
       WHERE e.organization_id = v_org AND e.platform_user_id = v_patient AND e.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(coalesce(
         (SELECT s.value_json->'value'
          FROM public.app_runtime_settings s
          WHERE s.key = 'notifications_topics'
            AND s.scope = 'admin'
            AND s.audience = 'authenticated_client'
            AND (s.organization_id = v_org OR s.organization_id IS NULL)
          ORDER BY s.organization_id NULLS LAST
          LIMIT 1),
         '[]'::jsonb
       )) topic(value)
       WHERE btrim(topic.value->>'id') = v_topic
     )
     OR v_channel NOT IN ('telegram', 'max', 'email', 'web_push')
     OR (v_topic IN ('warmup_reminders', 'training_reminders') AND v_channel = 'email') THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_notification_topic_channels (
    user_id, topic_code, channel_code, is_enabled, updated_at
  ) VALUES (
    v_patient, v_topic, v_channel, p_is_enabled, statement_timestamp()
  )
  ON CONFLICT (user_id, topic_code, channel_code) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = EXCLUDED.updated_at
  WHERE user_notification_topic_channels.user_id = v_patient;
  RETURN FOUND;
END
$function$;
