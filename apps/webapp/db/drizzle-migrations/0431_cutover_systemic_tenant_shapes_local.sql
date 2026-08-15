-- BCB-MIGRATION-OWNER: app_object_owner
-- TEMPORARY LOCAL MIGRATION NUMBER 0431
-- Canonical tenant shapes required by the fresh-PROD-dump A -> B transition.
ALTER TABLE integrator.delivery_attempt_logs
  ADD COLUMN IF NOT EXISTS organization_id uuid;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX IF NOT EXISTS idx_delivery_attempt_logs_organization_id
  ON integrator.delivery_attempt_logs (organization_id);
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.media_playback_stats_hourly
  ADD COLUMN IF NOT EXISTS organization_id uuid;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.media_playback_stats_hourly
  DROP CONSTRAINT IF EXISTS media_playback_stats_hourly_pkey;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX IF NOT EXISTS media_playback_stats_hourly_org_bucket_delivery_uidx
  ON public.media_playback_stats_hourly (organization_id, bucket_hour, delivery);
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX IF NOT EXISTS idx_media_playback_stats_hourly_organization_id
  ON public.media_playback_stats_hourly (organization_id);
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.support_conversations
  ADD COLUMN IF NOT EXISTS pending_message_drafts jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_telemetry_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.increment_media_playback_resolution_stat(
  p_user_id uuid,
  p_media_id uuid,
  p_delivery text,
  p_fallback_used boolean
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_telemetry_media_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );

  IF v_organization_id IS NULL OR p_delivery NOT IN ('hls', 'mp4', 'file') THEN
    RAISE EXCEPTION 'media_playback_telemetry_context_denied' USING ERRCODE = '42501';
  END IF;
  IF v_patient_user_id IS NULL OR v_patient_user_id <> p_user_id THEN
    RAISE EXCEPTION 'media_playback_telemetry_actor_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.media_files AS media
    WHERE media.id = p_media_id
      AND media.organization_id = v_organization_id
  ) THEN
    RAISE EXCEPTION 'media_playback_telemetry_media_denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.media_playback_stats_hourly (
    organization_id, bucket_hour, delivery, resolved_count, fallback_count
  ) VALUES (
    v_organization_id,
    date_trunc('hour', clock_timestamp()),
    p_delivery,
    1,
    CASE WHEN p_fallback_used THEN 1 ELSE 0 END
  )
  ON CONFLICT (organization_id, bucket_hour, delivery) DO UPDATE
    SET resolved_count = public.media_playback_stats_hourly.resolved_count + 1,
        fallback_count = public.media_playback_stats_hourly.fallback_count
          + CASE WHEN EXCLUDED.fallback_count > 0 THEN 1 ELSE 0 END;
END
$function$;
