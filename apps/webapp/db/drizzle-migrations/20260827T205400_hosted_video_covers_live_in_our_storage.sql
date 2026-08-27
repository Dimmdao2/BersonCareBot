-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_media_files_hosted_video_preview_source'
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
