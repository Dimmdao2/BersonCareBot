-- BCB-MIGRATION-OWNER: app_seam_patient_lfk_media_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef('app.create_patient_program_submission_media(uuid,text,text,text,bigint)'::regprocedure) LIKE '%''program_item_submission'', ''patient''%'
--
-- Видео, которое пациент записывает по программе, — данные пациента, а значит живёт в шифрованном
-- хранилище (owner ruling 06.09.2026). Эта строка создаётся здесь, в единственной двери пациента,
-- поэтому хранилище проставляется здесь же.
--
-- Аргумента для этого не заводится: функция создаёт ТОЛЬКО submission пациента, других строк она
-- породить не может. Значение-константа не даёт вызывающему возможности ошибиться, а лишний
-- параметр — дал бы.

CREATE OR REPLACE FUNCTION app.create_patient_program_submission_media(p_media_id uuid, p_filename text, p_key text, p_mime_type text, p_size_bytes bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_root_id uuid;
  v_folder_id uuid;
  v_display_name text;
  v_fallback_name text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_lfk_media_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.media.program-submission.create', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('bigint@1', pg_catalog.int8send($5))::app.port_typed_arg]), 'app.create_patient_program_submission_media(uuid,text,text,text,bigint)'::regprocedure);

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
    uploaded_by, s3_key, status, folder_id, usage_purpose, storage_target
  ) VALUES (
    p_media_id, 'organization', v_organization_id, p_filename, p_key, lower(btrim(p_mime_type)),
    p_size_bytes, v_patient_user_id, p_key, 'pending', v_folder_id,
    'program_item_submission', 'patient'
  );
  RETURN true;
END
$function$;
