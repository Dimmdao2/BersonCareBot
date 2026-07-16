-- 0200_current_patient_product_analytics: narrow current-patient analytics write capability.

ALTER TABLE public.product_analytics_hourly
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.be_organizations(id) ON DELETE CASCADE;
ALTER TABLE public.product_analytics_hourly DROP CONSTRAINT IF EXISTS product_analytics_hourly_pkey;
ALTER TABLE public.product_analytics_user_hourly DROP CONSTRAINT IF EXISTS product_analytics_user_hourly_pkey;
CREATE INDEX IF NOT EXISTS idx_product_analytics_hourly_organization_id
  ON public.product_analytics_hourly(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_analytics_hourly_global_unique
  ON public.product_analytics_hourly(bucket_hour,event_type,entry_channel,page_key,topic_code,push_kind,warmup_slogan_key)
  WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_analytics_hourly_org_unique
  ON public.product_analytics_hourly(organization_id,bucket_hour,event_type,entry_channel,page_key,topic_code,push_kind,warmup_slogan_key)
  WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_analytics_user_hourly_global_unique
  ON public.product_analytics_user_hourly(bucket_hour,user_id,entry_channel,page_key)
  WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_analytics_user_hourly_org_unique
  ON public.product_analytics_user_hourly(organization_id,bucket_hour,user_id,entry_channel,page_key)
  WHERE organization_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.record_current_patient_analytics_event(
  p_occurred_at timestamptz,
  p_event_type text,
  p_entry_channel text,
  p_page_key text,
  p_client_session_id text,
  p_metadata jsonb
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
  v_bucket timestamptz := date_trunc('hour', p_occurred_at);
  v_page text := COALESCE(NULLIF(p_page_key, ''), '__all__');
  v_app_opens integer := CASE WHEN p_event_type = 'app_open' THEN 1 ELSE 0 END;
  v_page_views integer := CASE WHEN p_event_type = 'page_view' THEN 1 ELSE 0 END;
  v_active_minutes integer := CASE WHEN p_event_type = 'heartbeat' THEN 1 ELSE 0 END;
BEGIN
  IF v_org IS NULL OR v_patient IS NULL
     OR p_event_type NOT IN ('app_open', 'page_view', 'heartbeat')
     OR NULLIF(p_entry_channel, '') IS NULL
     OR p_occurred_at < now() - interval '7 days'
     OR p_occurred_at > now() + interval '5 minutes' THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.product_analytics_events_recent(
    organization_id, occurred_at, event_type, entry_channel, page_key, user_id, client_session_id, metadata
  ) VALUES (
    v_org, p_occurred_at, p_event_type, p_entry_channel, NULLIF(p_page_key, ''), v_patient,
    NULLIF(p_client_session_id, ''), COALESCE(p_metadata, '{}'::jsonb)
  );

  INSERT INTO public.product_analytics_hourly(
    organization_id, bucket_hour, event_type, entry_channel, page_key, topic_code, push_kind,
    warmup_slogan_key, event_count, updated_at
  ) VALUES (v_org, v_bucket, p_event_type, p_entry_channel, v_page, '__all__', '__all__', '__all__', 1, now())
  ON CONFLICT (organization_id,bucket_hour,event_type,entry_channel,page_key,topic_code,push_kind,warmup_slogan_key)
    WHERE organization_id IS NOT NULL
  DO UPDATE SET event_count = public.product_analytics_hourly.event_count + 1, updated_at = now();

  INSERT INTO public.product_analytics_user_hourly(
    organization_id, bucket_hour, user_id, entry_channel, page_key, app_opens, page_views, push_opens,
    active_minutes, last_seen_at, updated_at
  ) VALUES (
    v_org, v_bucket, v_patient, p_entry_channel,
    CASE WHEN p_event_type = 'page_view' THEN v_page ELSE '__all__' END,
    v_app_opens, v_page_views, 0, v_active_minutes, p_occurred_at, now()
  )
  ON CONFLICT (organization_id,bucket_hour,user_id,entry_channel,page_key)
    WHERE organization_id IS NOT NULL
  DO UPDATE SET
    app_opens = public.product_analytics_user_hourly.app_opens + EXCLUDED.app_opens,
    page_views = public.product_analytics_user_hourly.page_views + EXCLUDED.page_views,
    push_opens = public.product_analytics_user_hourly.push_opens + EXCLUDED.push_opens,
    active_minutes = public.product_analytics_user_hourly.active_minutes + EXCLUDED.active_minutes,
    last_seen_at = GREATEST(public.product_analytics_user_hourly.last_seen_at, EXCLUDED.last_seen_at),
    updated_at = now();
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION app.record_current_patient_analytics_event(timestamptz,text,text,text,text,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.record_current_patient_push_open(
  p_occurred_at timestamptz,
  p_entry_channel text,
  p_push_tracking_id uuid
)
RETURNS TABLE (recorded boolean, deduped boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_occurred_at timestamptz := COALESCE(p_occurred_at, now());
  v_bucket timestamptz := date_trunc('hour', COALESCE(p_occurred_at, now()));
  v_topic_code text;
  v_push_kind text;
  v_warmup_slogan_key text;
  v_inserted bigint := 0;
BEGIN
  IF v_org IS NULL OR v_patient IS NULL OR p_push_tracking_id IS NULL
     OR NULLIF(p_entry_channel, '') IS NULL
     OR v_occurred_at < now() - interval '7 days'
     OR v_occurred_at > now() + interval '5 minutes' THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  SELECT push.topic_code, push.push_kind, push.warmup_slogan_key
  INTO v_topic_code, v_push_kind, v_warmup_slogan_key
  FROM public.product_push_notifications push
  WHERE push.id = p_push_tracking_id
    AND push.organization_id = v_org
    AND push.user_id = v_patient;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  INSERT INTO public.product_analytics_events_recent(
    organization_id, occurred_at, event_type, entry_channel, user_id, push_tracking_id,
    topic_code, push_kind, warmup_slogan_key, metadata
  ) VALUES (
    v_org, v_occurred_at, 'push_open', p_entry_channel, v_patient, p_push_tracking_id,
    v_topic_code, v_push_kind, v_warmup_slogan_key, '{}'::jsonb
  )
  ON CONFLICT (push_tracking_id)
    WHERE event_type = 'push_open' AND push_tracking_id IS NOT NULL
  DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN QUERY SELECT true, true;
    RETURN;
  END IF;

  INSERT INTO public.product_analytics_hourly(
    organization_id, bucket_hour, event_type, entry_channel, page_key, topic_code, push_kind,
    warmup_slogan_key, event_count, updated_at
  ) VALUES (
    v_org, v_bucket, 'push_open', p_entry_channel, '__all__',
    COALESCE(v_topic_code, '__all__'), COALESCE(v_push_kind, '__all__'),
    COALESCE(v_warmup_slogan_key, '__all__'), 1, now()
  )
  ON CONFLICT (organization_id,bucket_hour,event_type,entry_channel,page_key,topic_code,push_kind,warmup_slogan_key)
    WHERE organization_id IS NOT NULL
  DO UPDATE SET event_count = public.product_analytics_hourly.event_count + 1, updated_at = now();

  INSERT INTO public.product_analytics_user_hourly(
    organization_id, bucket_hour, user_id, entry_channel, page_key, app_opens, page_views,
    push_opens, active_minutes, last_seen_at, updated_at
  ) VALUES (v_org, v_bucket, v_patient, p_entry_channel, '__all__', 0, 0, 1, 0, v_occurred_at, now())
  ON CONFLICT (organization_id,bucket_hour,user_id,entry_channel,page_key)
    WHERE organization_id IS NOT NULL
  DO UPDATE SET
    push_opens = public.product_analytics_user_hourly.push_opens + 1,
    last_seen_at = GREATEST(public.product_analytics_user_hourly.last_seen_at, EXCLUDED.last_seen_at),
    updated_at = now();

  RETURN QUERY SELECT true, false;
END
$function$;

REVOKE ALL ON FUNCTION app.record_current_patient_push_open(timestamptz,text,uuid) FROM PUBLIC;
