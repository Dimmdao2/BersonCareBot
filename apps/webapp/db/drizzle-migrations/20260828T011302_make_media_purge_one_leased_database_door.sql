-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'media_files' AND column_name = 'delete_claim_token') AND to_regprocedure('app.process_media_pending_delete_step(text,uuid,integer,uuid)') IS NOT NULL AND to_regprocedure('app.stage_orphan_hosted_video_covers_for_purge(integer)') IS NULL AND position('require_accepted_context' in pg_get_functiondef('app.process_media_pending_delete_step(text,uuid,integer,uuid)'::regprocedure)) > 0;
ALTER TABLE public.media_files
  ADD COLUMN delete_claim_token uuid;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
DROP FUNCTION app.stage_orphan_hosted_video_covers_for_purge(integer);

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.process_media_pending_delete_step(
  p_action text,
  p_media_id uuid,
  p_limit integer,
  p_claim_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_claim jsonb;
  v_deleted bigint;
  v_deleted_patient_files bigint;
  v_empty_ids uuid[];
  v_result jsonb;
  v_staged_hosted bigint := 0;
  v_staged_single_put bigint := 0;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_lfk_media_owner'::name,
    'app_operational_media_worker'::name,
    'service'::app.port_context_class,
    'media.pending-delete.step',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_action))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_media_id))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send(p_limit))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_claim_token))::app.port_typed_arg
    ]),
    'app.process_media_pending_delete_step(text,uuid,integer,uuid)'::regprocedure
  );

  IF p_action = 'stage' THEN
    IF p_media_id IS NOT NULL OR p_claim_token IS NOT NULL
       OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
      RAISE EXCEPTION 'media_pending_delete_stage_arguments_invalid' USING ERRCODE = '22023';
    END IF;

    WITH candidates AS (
      SELECT cover.id
        FROM public.media_files AS cover
       WHERE cover.usage_purpose = 'hosted_video_preview'
         AND cover.status IN ('ready', 'failed')
         AND cover.created_at < pg_catalog.now() - interval '1 day'
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
              AND pg_catalog.jsonb_path_exists(
                instance_item.snapshot,
                '$.media[*] ? ((@.mediaType == "hosted_video" || @.type == "hosted_video") && @.mediaUrl == $url)',
                pg_catalog.jsonb_build_object('url', pg_catalog.to_jsonb(cover.hosted_video_source_url))
              )
         )
       ORDER BY cover.created_at ASC, cover.id ASC
       LIMIT p_limit
       FOR UPDATE OF cover SKIP LOCKED
    ), staged AS (
      UPDATE public.media_files AS cover
         SET status = 'pending_delete',
             next_attempt_at = NULL,
             delete_claim_token = NULL
        FROM candidates
       WHERE cover.id = candidates.id
      RETURNING cover.id
    )
    SELECT pg_catalog.count(*) INTO v_staged_hosted FROM staged;

    WITH candidates AS (
      SELECT media.id
        FROM public.media_files AS media
       WHERE media.status = 'pending'
         AND media.created_at < pg_catalog.now() - interval '1 day'
         AND NOT EXISTS (
           SELECT 1
             FROM public.media_upload_sessions AS session
            WHERE session.media_id = media.id
         )
       ORDER BY media.created_at ASC, media.id ASC
       LIMIT p_limit
       FOR UPDATE OF media SKIP LOCKED
    ), staged AS (
      UPDATE public.media_files AS media
         SET status = 'pending_delete',
             next_attempt_at = NULL,
             delete_claim_token = NULL
        FROM candidates
       WHERE media.id = candidates.id
      RETURNING media.id
    )
    SELECT pg_catalog.count(*) INTO v_staged_single_put FROM staged;

    SELECT COALESCE(pg_catalog.array_agg(candidate.id), ARRAY[]::uuid[])
      INTO v_empty_ids
      FROM (
        SELECT media.id
          FROM public.media_files AS media
         WHERE (media.s3_key IS NULL OR pg_catalog.btrim(media.s3_key) = '')
           AND (
             media.status = 'pending_delete'
             OR (media.status = 'deleting'
               AND (media.next_attempt_at IS NULL OR media.next_attempt_at <= pg_catalog.now()))
           )
         ORDER BY media.id ASC
         LIMIT p_limit
         FOR UPDATE OF media SKIP LOCKED
      ) AS candidate;

    DELETE FROM public.patient_files AS patient_file
     WHERE patient_file.media_file_id = ANY(v_empty_ids);

    DELETE FROM public.media_files AS media
     WHERE media.id = ANY(v_empty_ids)
       AND (media.s3_key IS NULL OR pg_catalog.btrim(media.s3_key) = '')
       AND (
         media.status = 'pending_delete'
         OR (media.status = 'deleting'
           AND (media.next_attempt_at IS NULL OR media.next_attempt_at <= pg_catalog.now()))
       );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN pg_catalog.jsonb_build_object(
      'action', 'stage',
      'stagedCount', v_staged_hosted + v_staged_single_put,
      'stagedHosted', v_staged_hosted,
      'stagedSinglePut', v_staged_single_put,
      'removedEmpty', v_deleted
    );
  ELSIF p_action = 'claim' THEN
    IF p_media_id IS NOT NULL OR p_limit IS NOT NULL OR p_claim_token IS NOT NULL THEN
      RAISE EXCEPTION 'media_pending_delete_claim_arguments_invalid' USING ERRCODE = '22023';
    END IF;

    WITH candidate AS (
      SELECT media.id
        FROM public.media_files AS media
       WHERE media.status IN ('pending_delete', 'deleting')
         AND media.s3_key IS NOT NULL
         AND pg_catalog.btrim(media.s3_key) <> ''
         AND (media.next_attempt_at IS NULL OR media.next_attempt_at <= pg_catalog.now())
       ORDER BY media.id ASC
       LIMIT 1
       FOR UPDATE OF media SKIP LOCKED
    ), leased AS (
      UPDATE public.media_files AS media
         SET status = 'deleting',
             delete_claim_token = pg_catalog.gen_random_uuid(),
             next_attempt_at = pg_catalog.clock_timestamp() + interval '15 minutes'
        FROM candidate
       WHERE media.id = candidate.id
      RETURNING media.id, media.s3_key, media.preview_sm_key, media.preview_md_key,
                media.hls_artifact_prefix, media.poster_s3_key,
                media.hls_master_playlist_s3_key, media.delete_attempts,
                media.delete_claim_token, media.next_attempt_at
    )
    SELECT pg_catalog.jsonb_build_object(
             'id', leased.id,
             's3Key', leased.s3_key,
             'previewSmKey', leased.preview_sm_key,
             'previewMdKey', leased.preview_md_key,
             'hlsArtifactPrefix', leased.hls_artifact_prefix,
             'posterS3Key', leased.poster_s3_key,
             'hlsMasterPlaylistS3Key', leased.hls_master_playlist_s3_key,
             'deleteAttempts', leased.delete_attempts,
             'claimToken', leased.delete_claim_token,
             'claimUntil', leased.next_attempt_at,
             'pendingAborts', COALESCE((
               SELECT pg_catalog.jsonb_agg(
                        pg_catalog.jsonb_build_object(
                          's3Key', session.s3_key,
                          'uploadId', session.upload_id
                        ) ORDER BY session.id
                      )
                 FROM public.media_upload_sessions AS session
                WHERE session.media_id = leased.id
                  AND session.upload_id IS NOT NULL
                  AND pg_catalog.btrim(session.upload_id) <> ''
                  AND session.status NOT IN ('completed', 'aborted')
             ), '[]'::jsonb)
           )
      INTO v_claim
      FROM leased;

    RETURN pg_catalog.jsonb_build_object('action', 'claim', 'claim', v_claim);
  ELSIF p_action = 'retry' THEN
    IF p_media_id IS NULL OR p_limit IS NOT NULL OR p_claim_token IS NULL THEN
      RAISE EXCEPTION 'media_pending_delete_retry_arguments_invalid' USING ERRCODE = '22023';
    END IF;

    WITH retried AS (
      UPDATE public.media_files AS media
         SET status = 'pending_delete',
             delete_attempts = media.delete_attempts + 1,
             next_attempt_at = pg_catalog.clock_timestamp()
               + (pg_catalog.least(1440, pg_catalog.power(
                    2::numeric,
                    pg_catalog.least(media.delete_attempts + 1, 20)
                  )) * interval '1 minute'),
             delete_claim_token = NULL
       WHERE media.id = p_media_id
         AND media.status = 'deleting'
         AND media.delete_claim_token = p_claim_token
      RETURNING media.delete_attempts, media.next_attempt_at
    )
    SELECT pg_catalog.jsonb_build_object(
             'deleteAttempts', retried.delete_attempts,
             'nextAttemptAt', retried.next_attempt_at
           )
      INTO v_result
      FROM retried;

    RETURN pg_catalog.jsonb_build_object(
      'action', 'retry',
      'retryScheduled', v_result IS NOT NULL,
      'retry', v_result
    );
  ELSIF p_action = 'complete' THEN
    IF p_media_id IS NULL OR p_limit IS NOT NULL OR p_claim_token IS NULL THEN
      RAISE EXCEPTION 'media_pending_delete_complete_arguments_invalid' USING ERRCODE = '22023';
    END IF;

    PERFORM media.id
      FROM public.media_files AS media
     WHERE media.id = p_media_id
       AND media.status = 'deleting'
       AND media.delete_claim_token = p_claim_token
     FOR UPDATE OF media;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'action', 'complete',
        'deleted', false,
        'deletedPatientFiles', 0
      );
    END IF;

    DELETE FROM public.patient_files AS patient_file
     WHERE patient_file.media_file_id = p_media_id;
    GET DIAGNOSTICS v_deleted_patient_files = ROW_COUNT;

    DELETE FROM public.media_files AS media
     WHERE media.id = p_media_id
       AND media.status = 'deleting'
       AND media.delete_claim_token = p_claim_token;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN pg_catalog.jsonb_build_object(
      'action', 'complete',
      'deleted', v_deleted = 1,
      'deletedPatientFiles', v_deleted_patient_files
    );
  END IF;

  RAISE EXCEPTION 'unsupported media pending-delete action' USING ERRCODE = '22023';
END
$function$;
