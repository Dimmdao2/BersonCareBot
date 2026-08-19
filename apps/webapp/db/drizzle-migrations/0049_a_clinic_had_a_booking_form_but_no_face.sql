-- BCB-MIGRATION-OWNER: app_object_owner
-- TEMPORARY LOCAL MIGRATION NUMBER 0049
--
-- Решение владельца 19.08, дословно: «надо сделать публичную страницу для клиник уже (не записи а
-- просто их визитку с описанием) и в кабинете админа клиники настройку что на ней писать», и
-- отдельной строкой того же дня: «Логотип и фотографии на визитке — сейчас».
--
-- Разбор и границы — `docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` §3, §4, шаги Ш2–Ш5.
--
-- ЧТО ЗДЕСЬ ЕСТЬ И ПОЧЕМУ ИМЕННО ТАК.
--
-- 1. Содержимое визитки живёт в УЖЕ существующей публичной проекции
--    `public.clinic_public_directory_entries`, а не в новой таблице и не в арендаторских таблицах.
--    Это буквальное исполнение `SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md` §5: анонимный запрос
--    читает ОДНУ строку ОДНОЙ таблицы и не касается ни `be_branches`, ни `be_organizations`, ни
--    `media_files` иначе как внутри тела двери. Адреса филиалов приходят СНИМКОМ в момент
--    сохранения владельцем: второго места, где живёт адрес, не заводится — филиал остаётся
--    единственным источником, а `locations_json` его копией на публику.
--
-- 2. Почему дверь, а не грант. Замер на сгенерированных привилегиях
--    (`deploy/postgres/generated/privileges.bersoncarebot_test.sql:12268-12274`):
--      • `app_pre_session` и `app_patient` на этой таблице отозваны ЦЕЛИКОМ — прямой SELECT
--        анонимного посетителя даёт 42501;
--      • у `app_staff` на ней ПОКОЛОНОЧНЫЙ `UPDATE ("slug","updated_at")` — и ничего больше.
--    Выдать рабочей роли новые колонки значило бы расширить её гранты, что запрещено. Поэтому
--    появляются ровно две объявленные двери: чтение визитки под bootstrap-ролью и запись владельцем
--    клиники под staff-ролью. Ни одна рабочая роль не получает НИ ОДНОЙ новой привилегии на
--    отношение — только EXECUTE на свою дверь (гранты приходят следующим шагом прогона из
--    `deploy/postgres/generated/privileges.<база>.sql`).
--
-- 3. Почему СОБСТВЕННЫЙ владелец шва, а не соседний. Ближайший — `app_seam_public_slug_owner`: он
--    уже читает `organization_slug_claims`, `clinic_public_directory_entries` и `be_organizations`.
--    Но визитка добавляет к ним `media_files` (готовность логотипа и фотографий) и `be_branches`
--    (снимок адресов), а запись добавляет `UPDATE` на проекцию. Растянуть шов резолвера slug на
--    медиа-библиотеку и филиалы значило бы расширить его ровно так, как объявленные корни и
--    существуют, чтобы не расширять: после этого ЛЮБАЯ дверь резолвера slug несла бы право читать
--    медиа. Поэтому `app_seam_public_clinic_card_owner` — свой, узкий, и его поверхность целиком
--    описана двумя телами ниже.
--
-- 4. Чужой `uuid` в публичной ветке медиа отказывает ПО ПОСТРОЕНИЮ, а не проверкой на месте.
--    Дверь чтения возвращает карточку ВМЕСТЕ с набором её медиа; публичный маршрут отдаёт файл
--    только если запрошенный id лежит в этом наборе. Плюс вторая стена на записи: дверь сохранения
--    отказывается принимать медиа, не принадлежащее этой организации (22023). То есть чужой файл
--    не может ни попасть в карточку, ни быть выданным из неё. Общий чокпоинт `/api/media/{uuid}`
--    при этом НЕ ослабляется ни на одну строку.
--
-- 5. Готовность медиа считается ТЕМ ЖЕ предикатом, что и логотип бренда организации
--    (`apps/webapp/src/infra/repos/pgOrgBranding.ts:88` — принадлежит организации, ИМЕННО этой,
--    загрузка завершена, это картинка). Второе определение «готово» для того же класса файлов
--    разъехалось бы с первым; здесь оно одно.

ALTER TABLE public.clinic_public_directory_entries
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS public_contact_phone text,
  ADD COLUMN IF NOT EXISTS public_contact_email text,
  ADD COLUMN IF NOT EXISTS public_website_url text,
  ADD COLUMN IF NOT EXISTS locations_json jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS logo_media_id uuid,
  ADD COLUMN IF NOT EXISTS photo_media_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  ADD COLUMN IF NOT EXISTS card_is_published boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.clinic_public_directory_entries
  DROP CONSTRAINT IF EXISTS clinic_public_directory_entries_card_text_limits_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Пределы стоят в строке, а не только в форме: форма — вежливость, ограничение — стена. Рекламный
-- текст клиники не должен уметь стать блобом на публичной странице.
ALTER TABLE public.clinic_public_directory_entries
  ADD CONSTRAINT clinic_public_directory_entries_card_text_limits_check CHECK (
    (description IS NULL OR length(description) <= 4000)
    AND (public_contact_phone IS NULL OR length(public_contact_phone) <= 64)
    AND (public_contact_email IS NULL OR length(public_contact_email) <= 320)
    AND (public_website_url IS NULL OR length(public_website_url) <= 512)
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.clinic_public_directory_entries
  DROP CONSTRAINT IF EXISTS clinic_public_directory_entries_photo_media_ids_bound_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.clinic_public_directory_entries
  ADD CONSTRAINT clinic_public_directory_entries_photo_media_ids_bound_check CHECK (
    array_length(photo_media_ids, 1) IS NULL OR array_length(photo_media_ids, 1) <= 12
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_clinic_card_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Дверь чтения визитки. Единственный путь от анонимного slug к содержимому карточки.
--
-- Отдаёт NULL одинаково для: неизвестного slug, невыпущенной проекции, неактивной организации и
-- выключенного владельцем показа страницы. Различать их наружу нельзя — иначе аноним перечисляет
-- клиники. NULL здесь означает 404; отказ привилегии (42501) поднимается исключением и означает
-- 503, а не пустую карточку (план §3.3).
--
-- Алиас разрешается той же формой, что и в резолвере записи: строка `alias` не хранит целевой slug,
-- джойнится единственная `current`-строка организации, поэтому цепочки редиректов невозможны.
CREATE OR REPLACE FUNCTION app.read_public_clinic_card(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_card jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_clinic_card_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'clinic.public-card.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_slug))::app.port_typed_arg
    ]),
    'app.read_public_clinic_card(text)'::regprocedure
  );

  SELECT jsonb_build_object(
    'requestedSlug', requested.slug,
    'canonicalSlug', current_claim.slug,
    'disposition', CASE WHEN requested.kind = 'alias' THEN 'redirect' ELSE 'current' END,
    'displayName', entry.display_name,
    'description', entry.description,
    'publicContactPhone', entry.public_contact_phone,
    'publicContactEmail', entry.public_contact_email,
    'publicWebsiteUrl', entry.public_website_url,
    'locations', entry.locations_json,
    'media', media.assets
  )
  INTO v_card
  FROM public.organization_slug_claims AS requested
  INNER JOIN public.organization_slug_claims AS current_claim
    ON current_claim.organization_id = requested.organization_id
   AND current_claim.kind = 'current'
  INNER JOIN public.clinic_public_directory_entries AS entry
    ON entry.organization_id = requested.organization_id
   AND entry.is_published = true
   AND entry.card_is_published = true
  INNER JOIN public.be_organizations AS organization
    ON organization.id = requested.organization_id
   AND organization.is_active = true
  LEFT JOIN LATERAL (
    -- Тот же предикат готовности, что у логотипа бренда организации: файл принадлежит организации,
    -- ИМЕННО этой, загрузка завершена, это картинка. Не прошедший файл просто не попадает в набор —
    -- страница показывает место под логотип, а не битую картинку.
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', asset.media_id,
          'role', asset.role,
          'mimeType', asset.mime_type,
          's3Key', asset.s3_key,
          'storedPath', asset.stored_path
        )
        ORDER BY asset.position
      ),
      '[]'::jsonb
    ) AS assets
    FROM (
      SELECT logo.id AS media_id, 'logo'::text AS role, 0::bigint AS position,
             logo.mime_type, logo.s3_key, logo.stored_path
        FROM public.media_files AS logo
       WHERE logo.id = entry.logo_media_id
         AND logo.owner_kind = 'organization'
         AND logo.organization_id = entry.organization_id
         AND logo.status = 'ready'
         AND logo.mime_type LIKE 'image/%'
      UNION ALL
      SELECT photo.id, 'photo'::text, requested_photo.position,
             photo.mime_type, photo.s3_key, photo.stored_path
        FROM unnest(entry.photo_media_ids) WITH ORDINALITY AS requested_photo(media_id, position)
        INNER JOIN public.media_files AS photo
          ON photo.id = requested_photo.media_id
         AND photo.owner_kind = 'organization'
         AND photo.organization_id = entry.organization_id
         AND photo.status = 'ready'
         AND photo.mime_type LIKE 'image/%'
    ) AS asset
  ) AS media ON true
  WHERE requested.slug = lower(btrim(p_slug))
    AND requested.kind IN ('current', 'alias')
  LIMIT 1;

  RETURN v_card;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_clinic_card_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Дверь записи визитки. Гейт роли/организации стоит выше (`requireClinicManagementApiContext`), а
-- здесь стоит то, что нельзя доверить вызывающему: организация берётся из ПРИНЦИПАЛА сессии, а не
-- из тела запроса, и медиа проверяется на принадлежность ЭТОЙ организации до записи.
--
-- Снимок адресов собирается ЗДЕСЬ и только из активных филиалов этой организации: `title`,
-- `cityCode`, `address`. Внутренние `id`, `timezone`, `color`, `sort_order` в публичную проекцию
-- не попадают никогда.
CREATE OR REPLACE FUNCTION app.save_public_clinic_card(
  p_organization_id uuid,
  p_description text,
  p_public_contact_phone text,
  p_public_contact_email text,
  p_public_website_url text,
  p_logo_media_id uuid,
  p_photo_media_ids_json text,
  p_card_is_published boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_photo_ids uuid[];
  v_locations jsonb;
  v_updated boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_clinic_card_owner'::name,
    'app_staff'::name,
    'staff'::app.port_context_class,
    'clinic.public-card.save',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_description))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_public_contact_phone))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_public_contact_email))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_public_website_url))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_logo_media_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_photo_media_ids_json))::app.port_typed_arg,
      ROW('boolean@1', pg_catalog.boolsend(p_card_is_published))::app.port_typed_arg
    ]),
    'app.save_public_clinic_card(uuid,text,text,text,text,uuid,text,boolean)'::regprocedure
  );

  -- Организация принципала — единственная организация, которую эта дверь умеет менять. Совпадение
  -- с параметром требуется явно: расхождение означает, что аргумент пришёл не из сессии.
  IF p_organization_id IS NULL OR p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'clinic_public_card_organization_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_description IS NOT NULL AND length(p_description) > 4000 THEN
    RAISE EXCEPTION 'clinic_public_card_description_too_long' USING ERRCODE = '22023';
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

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('title', branch.title, 'cityCode', branch.city_code,
                         'address', branch.address)
      ORDER BY branch.sort_order, branch.title
    ),
    '[]'::jsonb
  )
  INTO v_locations
  FROM public.be_branches AS branch
  WHERE branch.organization_id = p_organization_id
    AND branch.is_active = true;

  UPDATE public.clinic_public_directory_entries AS entry
     SET description = p_description,
         public_contact_phone = p_public_contact_phone,
         public_contact_email = p_public_contact_email,
         public_website_url = p_public_website_url,
         logo_media_id = p_logo_media_id,
         photo_media_ids = v_photo_ids,
         locations_json = v_locations,
         card_is_published = COALESCE(p_card_is_published, false),
         updated_at = pg_catalog.now()
   WHERE entry.organization_id = p_organization_id
  RETURNING true INTO v_updated;

  IF v_updated IS NOT TRUE THEN
    RAISE EXCEPTION 'clinic_public_card_entry_missing' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'description', p_description,
    'publicContactPhone', p_public_contact_phone,
    'publicContactEmail', p_public_contact_email,
    'publicWebsiteUrl', p_public_website_url,
    'logoMediaId', p_logo_media_id,
    'photoMediaIds', to_jsonb(v_photo_ids),
    'locations', v_locations,
    'cardIsPublished', COALESCE(p_card_is_published, false)
  );
END
$function$;
