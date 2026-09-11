-- BCB-MIGRATION-OWNER: app_seam_public_clinic_card_owner
-- BCB-MIGRATION-VERIFY: pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.save_public_clinic_card(uuid,text,text,text,text,uuid,text,boolean,text)')) NOT LIKE '%locations_json%' AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = pg_catalog.to_regclass('public.clinic_public_directory_entries') AND NOT a.attisdropped AND a.attname = 'locations_json')
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- #926 §17.J. Колонка `locations_json` — снимок адресов на момент прошлого сохранения формы. С
-- этапа 1 (`e230083f4`) её НИКТО не читает: публичная дверь джойнит живые `be_branches` в момент
-- чтения, кабинет читает их же. Замер 11.09: во всей базе колонку упоминает ровно одна функция —
-- сама дверь записи, которая её и пишет; в приложении ни одного читателя.
--
-- Снимок рядом с живым источником — это молчащее расхождение: клиника переезжает, адрес в снимке
-- остаётся прежним, и никакая проверка этого не видит, потому что снимок никто не сверяет. Владелец
-- 11.09: «все только ссылками на реальные записи». Поэтому колонка снимается вместе со своим
-- единственным писателем, а не оставляется «на всякий случай».
--
-- Дверь записи вместе со снимком теряет и единственную причину читать `be_branches`: поверхность
-- сужается, её грант уходит из декларации.
CREATE OR REPLACE FUNCTION app.save_public_clinic_card(p_organization_id uuid, p_description text, p_public_contact_phone text, p_public_contact_email text, p_public_website_url text, p_logo_media_id uuid, p_photo_media_ids_json text, p_card_is_published boolean, p_full_description_markdown text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_photo_ids uuid[];
  v_updated boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_clinic_card_owner'::name, 'app_staff'::name, 'staff'::app.port_context_class, 'clinic.public-card.save', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($6))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($8))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($9))::app.port_typed_arg]), 'app.save_public_clinic_card(uuid,text,text,text,text,uuid,text,boolean,text)'::regprocedure);

  -- Организация принципала — единственная организация, которую эта дверь умеет менять. Совпадение
  -- с параметром требуется явно: расхождение означает, что аргумент пришёл не из сессии.
  IF p_organization_id IS NULL OR p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'clinic_public_card_organization_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_description IS NOT NULL AND length(p_description) > 4000 THEN
    RAISE EXCEPTION 'clinic_public_card_description_too_long' USING ERRCODE = '22023';
  END IF;
  IF p_full_description_markdown IS NOT NULL AND length(p_full_description_markdown) > 50000 THEN
    RAISE EXCEPTION 'clinic_public_card_full_description_too_long' USING ERRCODE = '22023';
  END IF;
  IF p_public_contact_phone IS NOT NULL AND length(p_public_contact_phone) > 64 THEN
    RAISE EXCEPTION 'clinic_public_card_phone_too_long' USING ERRCODE = '22023';
  END IF;
  IF p_public_contact_email IS NOT NULL AND length(p_public_contact_email) > 320 THEN
    RAISE EXCEPTION 'clinic_public_card_email_too_long' USING ERRCODE = '22023';
  END IF;
  IF p_public_website_url IS NOT NULL AND length(p_public_website_url) > 512 THEN
    RAISE EXCEPTION 'clinic_public_card_website_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg((value #>> '{}')::uuid ORDER BY ordinality), '{}'::uuid[])
    INTO v_photo_ids
    FROM jsonb_array_elements(COALESCE(p_photo_media_ids_json, '[]')::jsonb)
         WITH ORDINALITY AS photo(value, ordinality);

  IF array_length(v_photo_ids, 1) > 12 THEN
    RAISE EXCEPTION 'clinic_public_card_too_many_photos' USING ERRCODE = '22023';
  END IF;

  -- Стена принадлежности медиа. Ставится ДО записи: чужой файл не может даже попасть в карточку,
  -- поэтому публичной ветке отдачи нечего было бы отдать, даже если бы её кто-то обошёл.
  IF EXISTS (
    SELECT 1
    FROM unnest(
      CASE WHEN p_logo_media_id IS NULL THEN v_photo_ids ELSE v_photo_ids || p_logo_media_id END
    ) AS candidate(media_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.media_files AS owned
      WHERE owned.id = candidate.media_id
        AND owned.owner_kind = 'organization'
        AND owned.organization_id = p_organization_id
    )
  ) THEN
    RAISE EXCEPTION 'clinic_public_card_media_not_owned' USING ERRCODE = '22023';
  END IF;


  UPDATE public.clinic_public_directory_entries AS entry
     SET description = p_description,
         full_description_markdown = p_full_description_markdown,
         public_contact_phone = p_public_contact_phone,
         public_contact_email = p_public_contact_email,
         public_website_url = p_public_website_url,
         logo_media_id = p_logo_media_id,
         photo_media_ids = v_photo_ids,
         card_is_published = COALESCE(p_card_is_published, false),
         updated_at = pg_catalog.now()
   WHERE entry.organization_id = p_organization_id
  RETURNING true INTO v_updated;

  IF v_updated IS NOT TRUE THEN
    RAISE EXCEPTION 'clinic_public_card_entry_missing' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'description', p_description,
    'fullDescriptionMarkdown', p_full_description_markdown,
    'publicContactPhone', p_public_contact_phone,
    'publicContactEmail', p_public_contact_email,
    'publicWebsiteUrl', p_public_website_url,
    'logoMediaId', p_logo_media_id,
    'photoMediaIds', to_jsonb(v_photo_ids),
    'cardIsPublished', COALESCE(p_card_is_published, false)
  );
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.clinic_public_directory_entries
  DROP COLUMN locations_json;
