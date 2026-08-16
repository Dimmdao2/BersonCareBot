-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Patient uploads and transcode producers cross relation boundaries that remain closed to
-- app_patient/app_staff/app_operational_media_worker.  These exact roots keep that write surface
-- inside one attested capability and derive patient/org ownership from the accepted context.

CREATE OR REPLACE FUNCTION app.enqueue_media_transcode_job_core(p_media_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_media record;
  v_job_id uuid;
BEGIN
  SELECT media.id, media.organization_id, media.mime_type, media.s3_key,
         media.hls_master_playlist_s3_key, media.video_processing_status
    INTO v_media
    FROM public.media_files AS media
   WHERE media.id = p_media_id
     AND (media.status IS NULL OR media.status NOT IN ('pending', 'deleting', 'pending_delete'));

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.media_files AS media WHERE media.id = p_media_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_readable');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_media.s3_key IS NULL OR btrim(v_media.s3_key) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_s3_key');
  END IF;
  IF lower(v_media.mime_type) NOT LIKE 'video/%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_video');
  END IF;
  IF v_media.hls_master_playlist_s3_key IS NOT NULL
     AND btrim(v_media.hls_master_playlist_s3_key) <> ''
     AND v_media.video_processing_status = 'ready' THEN
    RETURN jsonb_build_object('ok', true, 'kind', 'already_ready');
  END IF;

  SELECT job.id
    INTO v_job_id
    FROM public.media_transcode_jobs AS job
   WHERE job.media_id = p_media_id
     AND job.status IN ('pending', 'processing')
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'queued', 'jobId', v_job_id::text, 'alreadyQueued', true
    );
  END IF;

  BEGIN
    INSERT INTO public.media_transcode_jobs (
      media_id, organization_id, status, attempts, created_at, updated_at
    ) VALUES (
      p_media_id, v_media.organization_id, 'pending', 0, now(), now()
    )
    RETURNING id INTO v_job_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT job.id
      INTO v_job_id
      FROM public.media_transcode_jobs AS job
     WHERE job.media_id = p_media_id
       AND job.status IN ('pending', 'processing')
     LIMIT 1;
    IF v_job_id IS NULL THEN
      RAISE;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'queued', 'jobId', v_job_id::text, 'alreadyQueued', true
    );
  END;

  UPDATE public.media_files
     SET video_processing_status = 'pending', video_processing_error = NULL
   WHERE id = p_media_id;

  RETURN jsonb_build_object(
    'ok', true, 'kind', 'queued', 'jobId', v_job_id::text, 'alreadyQueued', false
  );
END
$function$;

CREATE OR REPLACE FUNCTION app.create_patient_program_submission_media(
  p_media_id uuid,
  p_filename text,
  p_key text,
  p_mime_type text,
  p_size_bytes bigint
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_root_id uuid;
  v_folder_id uuid;
  v_display_name text;
  v_fallback_name text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_lfk_media_owner', 'app_patient', 'patient',
    'patient.media.program-submission.create',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', CASE WHEN p_media_id IS NULL THEN NULL ELSE uuid_send(p_media_id) END)::app.port_typed_arg,
      ROW('text@1', textsend(p_filename))::app.port_typed_arg,
      ROW('text@1', textsend(p_key))::app.port_typed_arg,
      ROW('text@1', textsend(p_mime_type))::app.port_typed_arg,
      ROW('bigint@1', CASE WHEN p_size_bytes IS NULL THEN NULL ELSE int8send(p_size_bytes) END)::app.port_typed_arg
    ]),
    'app.create_patient_program_submission_media(uuid,text,text,text,bigint)'::regprocedure
  );

  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RAISE EXCEPTION 'patient_organization_context_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
     WHERE enrollment.organization_id = v_organization_id
       AND enrollment.platform_user_id = v_patient_user_id
       AND enrollment.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_patient_enrollment_required' USING ERRCODE = '42501';
  END IF;
  IF p_media_id IS NULL OR p_filename IS NULL OR btrim(p_filename) = ''
     OR p_key IS NULL OR btrim(p_key) = '' OR p_size_bytes IS NULL
     OR p_size_bytes <= 0 OR p_size_bytes > 262144000
     OR lower(btrim(p_mime_type)) NOT IN (
       'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
       'video/mp4', 'video/quicktime', 'video/webm'
     ) THEN
    RAISE EXCEPTION 'invalid_patient_program_submission_media' USING ERRCODE = '22023';
  END IF;

  SELECT folder.id INTO v_folder_id
    FROM public.media_folders AS folder
   WHERE folder.kind = 'client_patient'
     AND folder.patient_user_id = v_patient_user_id
     AND folder.organization_id = v_organization_id
   LIMIT 1;

  IF v_folder_id IS NULL THEN
    SELECT folder.id INTO v_root_id
      FROM public.media_folders AS folder
     WHERE folder.kind = 'client_files_root'
       AND folder.organization_id = v_organization_id
     LIMIT 1;

    IF v_root_id IS NULL THEN
      INSERT INTO public.media_folders (organization_id, parent_id, name, kind)
      VALUES (v_organization_id, NULL, 'Пациенты', 'client_files_root')
      RETURNING id INTO v_root_id;
    END IF;

    SELECT left(COALESCE(
      NULLIF(btrim(concat_ws(' ', identity.last_name, identity.first_name, identity.patronymic)), ''),
      NULLIF(btrim(identity.display_name), ''),
      'Клиент'
    ), 180)
      INTO v_display_name
      FROM public.user_identity AS identity
     WHERE identity.platform_user_id = v_patient_user_id;
    v_display_name := COALESCE(v_display_name, 'Клиент');
    v_fallback_name := left(v_display_name || ' · ' || left(v_patient_user_id::text, 8), 180);

    BEGIN
      INSERT INTO public.media_folders (
        organization_id, parent_id, name, kind, patient_user_id
      ) VALUES (
        v_organization_id, v_root_id, v_display_name, 'client_patient', v_patient_user_id
      )
      RETURNING id INTO v_folder_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT folder.id INTO v_folder_id
        FROM public.media_folders AS folder
       WHERE folder.kind = 'client_patient'
         AND folder.patient_user_id = v_patient_user_id
         AND folder.organization_id = v_organization_id
       LIMIT 1;
      IF v_folder_id IS NULL THEN
        INSERT INTO public.media_folders (
          organization_id, parent_id, name, kind, patient_user_id
        ) VALUES (
          v_organization_id, v_root_id, v_fallback_name, 'client_patient', v_patient_user_id
        )
        RETURNING id INTO v_folder_id;
      END IF;
    END;
  END IF;

  INSERT INTO public.media_files (
    id, owner_kind, organization_id, original_name, stored_path, mime_type, size_bytes,
    uploaded_by, s3_key, status, folder_id, usage_purpose, video_delivery_override
  ) VALUES (
    p_media_id, 'organization', v_organization_id, p_filename, p_key, lower(btrim(p_mime_type)),
    p_size_bytes, v_patient_user_id, p_key, 'pending', v_folder_id,
    'program_item_submission',
    CASE WHEN lower(btrim(p_mime_type)) LIKE 'video/%' THEN 'mp4' ELSE NULL END
  );
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION app.confirm_patient_program_submission_media(p_media_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_is_video boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_lfk_media_owner', 'app_patient', 'patient',
    'patient.media.program-submission.confirm',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', CASE WHEN p_media_id IS NULL THEN NULL ELSE uuid_send(p_media_id) END)::app.port_typed_arg
    ]),
    'app.confirm_patient_program_submission_media(uuid)'::regprocedure
  );

  SELECT lower(media.mime_type) LIKE 'video/%'
    INTO v_is_video
    FROM public.media_files AS media
   WHERE media.id = p_media_id
     AND media.organization_id = v_organization_id
     AND media.uploaded_by = v_patient_user_id
     AND media.usage_purpose = 'program_item_submission'
     AND media.status = 'pending'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.media_files
     SET status = 'ready'
   WHERE id = p_media_id;

  IF v_is_video THEN
    PERFORM app.enqueue_media_transcode_job_core(p_media_id);
  END IF;
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION app.abort_patient_program_submission_media(p_media_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_updated integer := 0;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_lfk_media_owner', 'app_patient', 'patient',
    'patient.media.program-submission.abort',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', CASE WHEN p_media_id IS NULL THEN NULL ELSE uuid_send(p_media_id) END)::app.port_typed_arg
    ]),
    'app.abort_patient_program_submission_media(uuid)'::regprocedure
  );

  UPDATE public.media_files
     SET status = 'pending_delete'
   WHERE id = p_media_id
     AND organization_id = app.current_org_id()
     AND uploaded_by = app.current_patient_user_id()
     AND usage_purpose = 'program_item_submission'
     AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END
$function$;

CREATE OR REPLACE FUNCTION app.enqueue_media_transcode_job_for_staff(p_media_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_lfk_media_owner', 'app_staff', 'staff',
    'media.transcode.enqueue',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', CASE WHEN p_media_id IS NULL THEN NULL ELSE uuid_send(p_media_id) END)::app.port_typed_arg
    ]),
    'app.enqueue_media_transcode_job_for_staff(uuid)'::regprocedure
  );
  RETURN app.enqueue_media_transcode_job_core(p_media_id);
END
$function$;

CREATE OR REPLACE FUNCTION app.enqueue_media_transcode_job_for_service(p_media_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_lfk_media_owner', 'app_operational_media_worker', 'service',
    'media.transcode.enqueue',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', CASE WHEN p_media_id IS NULL THEN NULL ELSE uuid_send(p_media_id) END)::app.port_typed_arg
    ]),
    'app.enqueue_media_transcode_job_for_service(uuid)'::regprocedure
  );
  RETURN app.enqueue_media_transcode_job_core(p_media_id);
END
$function$;
