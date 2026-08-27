-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT (SELECT count(*) = 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_media_files_hosted_video_preview_source') AND to_regprocedure('app.stage_orphan_hosted_video_covers_for_purge(integer)') IS NOT NULL
--
-- Owner requirement (docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md, «Превью для видео по
-- ссылке»): «картинку скачиваем один раз и кладём в НАШЕ хранилище». A hosted-video cover we
-- downloaded IS one of our stored files, so it lives in `media_files` and walks the same
-- preview/status/purge/storage doors as every other file — not in a second table beside them.
--
-- One nullable column carries the fact `media_files` does not have today: which hosted-video link
-- this row is the cover OF. It is the canonical viewer URL produced by
-- `apps/webapp/src/shared/lib/hostingEmbedUrls.ts` (the same string stored in
-- `lfk_exercise_media.media_url`), so the cover is found by the link the doctor pasted and is
-- downloaded exactly once per clinic.
ALTER TABLE public.media_files
  ADD COLUMN hosted_video_source_url text;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- `usage_purpose` is the existing label that separates a service row from a doctor's library file.
-- It gets one more value rather than a second label column beside it.
ALTER TABLE public.media_files
  DROP CONSTRAINT media_files_usage_purpose_check,
  ADD CONSTRAINT media_files_usage_purpose_check
    CHECK ((usage_purpose IS NULL) OR (usage_purpose = ANY (ARRAY['program_item_submission'::text, 'hosted_video_preview'::text])));
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Coupling: the source link exists on hosted-cover rows and on nothing else, and such a row is
-- always clinic-owned. Without this an ordinary upload could carry a source URL (and be picked up
-- by the preview worker's hosted branch), or a hosted cover could exist with no link to resolve.
ALTER TABLE public.media_files
  ADD CONSTRAINT media_files_hosted_video_preview_check
    CHECK (
      (usage_purpose = 'hosted_video_preview'
        AND hosted_video_source_url IS NOT NULL
        AND owner_kind = 'organization'
        AND organization_id IS NOT NULL)
      OR (usage_purpose IS DISTINCT FROM 'hosted_video_preview' AND hosted_video_source_url IS NULL)
    );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Re-saving the same link must reuse the row, not download the cover again: this is the dedup key
-- the save path's ON CONFLICT infers, and the lookup index for the read door
-- (`catalogMediaLadderLookup`), which resolves covers by clinic + source URL. `owner_kind` is not
-- in the key because the constraint above pins it to 'organization' for these rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_files_hosted_video_preview_source
  ON public.media_files (organization_id, hosted_video_source_url)
  WHERE (usage_purpose = 'hosted_video_preview');
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Existing media purge owns the whole file lifecycle. This root only stages hosted covers which
-- have been unreferenced for a full day; the same purge then removes S3 objects and the row. A
-- current exercise reference keeps the cover, and an immutable assigned-program snapshot keeps it
-- too, so a doctor's later edit cannot break media already issued to a patient.
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
