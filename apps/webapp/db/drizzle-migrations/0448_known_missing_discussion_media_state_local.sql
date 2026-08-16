-- BCB-MIGRATION-BACKFILL
-- TEMPORARY LOCAL MIGRATION NUMBER 0448
-- Forward convergence for databases that already completed the generated PROD -> target cutover.
DO $known_missing_discussion_media$
DECLARE
  identity_drift text;
  reference_drift text;
  affected_rows integer;
BEGIN
  WITH expected(id, original_name) AS (
    VALUES
      ('02080664-88fd-4430-a94f-0b533b0fea36'::uuid, 'IMG_7795.png'::text),
      ('015dcea9-8793-46a1-8c90-a78b2f3707d7'::uuid, 'image.jpg'::text)
  )
  SELECT string_agg(expected.id::text, ', ' ORDER BY expected.id::text)
  INTO identity_drift
  FROM expected
  LEFT JOIN public.media_files media ON media.id = expected.id
  WHERE media.id IS NULL
     OR media.original_name IS DISTINCT FROM expected.original_name
     OR media.mime_type NOT LIKE 'image/%'
     OR NULLIF(btrim(media.s3_key), '') IS NULL
     OR media.status <> 'ready'
     OR NOT (
       (
         media.preview_status = 'ready'
         AND NULLIF(btrim(media.preview_sm_key), '') IS NOT NULL
         AND NULLIF(btrim(media.preview_md_key), '') IS NOT NULL
       )
       OR (
         media.preview_status = 'failed'
         AND media.preview_sm_key IS NULL
         AND media.preview_md_key IS NULL
         AND media.preview_next_attempt_at IS NULL
       )
     );

  IF identity_drift IS NOT NULL THEN
    RAISE EXCEPTION 'known missing discussion media identity/state drift: %', identity_drift;
  END IF;

  WITH expected(id) AS (
    VALUES
      ('02080664-88fd-4430-a94f-0b533b0fea36'::uuid),
      ('015dcea9-8793-46a1-8c90-a78b2f3707d7'::uuid)
  ), reference_counts AS (
    SELECT expected.id, count(message.id) AS reference_count
    FROM expected
    LEFT JOIN public.program_item_discussion_messages message
      ON message.media_file_id = expected.id
    GROUP BY expected.id
  )
  SELECT string_agg(
    reference_counts.id::text || '=' || reference_counts.reference_count::text,
    ', ' ORDER BY reference_counts.id::text
  )
  INTO reference_drift
  FROM reference_counts
  WHERE reference_counts.reference_count <> 1;

  IF reference_drift IS NOT NULL THEN
    RAISE EXCEPTION 'known missing discussion media reference drift: %', reference_drift;
  END IF;

  UPDATE public.media_files
  SET preview_status = 'failed',
      preview_sm_key = NULL,
      preview_md_key = NULL,
      preview_next_attempt_at = NULL
  WHERE id IN (
    '02080664-88fd-4430-a94f-0b533b0fea36'::uuid,
    '015dcea9-8793-46a1-8c90-a78b2f3707d7'::uuid
  );
  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows <> 2 THEN
    RAISE EXCEPTION 'known missing discussion media update count drift: %', affected_rows;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.media_files media
    WHERE media.id IN (
      '02080664-88fd-4430-a94f-0b533b0fea36'::uuid,
      '015dcea9-8793-46a1-8c90-a78b2f3707d7'::uuid
    )
      AND (
        media.preview_status <> 'failed'
        OR media.preview_sm_key IS NOT NULL
        OR media.preview_md_key IS NOT NULL
        OR media.preview_next_attempt_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'known missing discussion media target state not reached';
  END IF;
END
$known_missing_discussion_media$;
