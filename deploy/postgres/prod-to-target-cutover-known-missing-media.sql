-- Two image objects in the current PROD-dump lineage have lost their original, sm and md S3
-- objects while their database rows and discussion-message references remain valid. Preserve the
-- audit metadata and messages, but converge the preview state so the UI renders its canonical
-- unavailable state instead of requesting known-missing objects.
DO $known_missing_discussion_media$
DECLARE
  identity_drift text;
  reference_drift text;
  before_metadata jsonb;
  after_metadata jsonb;
  before_references jsonb;
  after_references jsonb;
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

  SELECT jsonb_agg(
    to_jsonb(media) - ARRAY[
      'preview_status', 'preview_sm_key', 'preview_md_key', 'preview_next_attempt_at'
    ] ORDER BY media.id
  )
  INTO before_metadata
  FROM public.media_files media
  WHERE media.id IN (
    '02080664-88fd-4430-a94f-0b533b0fea36'::uuid,
    '015dcea9-8793-46a1-8c90-a78b2f3707d7'::uuid
  );

  SELECT jsonb_agg(to_jsonb(message) ORDER BY message.id)
  INTO before_references
  FROM public.program_item_discussion_messages message
  WHERE message.media_file_id IN (
    '02080664-88fd-4430-a94f-0b533b0fea36'::uuid,
    '015dcea9-8793-46a1-8c90-a78b2f3707d7'::uuid
  );

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

  SELECT jsonb_agg(
    to_jsonb(media) - ARRAY[
      'preview_status', 'preview_sm_key', 'preview_md_key', 'preview_next_attempt_at'
    ] ORDER BY media.id
  )
  INTO after_metadata
  FROM public.media_files media
  WHERE media.id IN (
    '02080664-88fd-4430-a94f-0b533b0fea36'::uuid,
    '015dcea9-8793-46a1-8c90-a78b2f3707d7'::uuid
  );

  SELECT jsonb_agg(to_jsonb(message) ORDER BY message.id)
  INTO after_references
  FROM public.program_item_discussion_messages message
  WHERE message.media_file_id IN (
    '02080664-88fd-4430-a94f-0b533b0fea36'::uuid,
    '015dcea9-8793-46a1-8c90-a78b2f3707d7'::uuid
  );

  IF after_metadata IS DISTINCT FROM before_metadata THEN
    RAISE EXCEPTION 'known missing discussion media audit metadata changed';
  END IF;
  IF after_references IS DISTINCT FROM before_references THEN
    RAISE EXCEPTION 'known missing discussion media references changed';
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
