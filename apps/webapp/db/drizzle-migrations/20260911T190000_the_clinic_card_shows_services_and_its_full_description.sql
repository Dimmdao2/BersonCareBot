-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = pg_catalog.to_regclass('public.clinic_public_directory_entries') AND NOT a.attisdropped AND a.attname = 'full_description_markdown') AND pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.read_public_clinic_card(text)')) LIKE '%be_clinic_services%' AND pg_catalog.to_regprocedure('app.save_public_clinic_card(uuid,text,text,text,text,uuid,text,boolean)') IS NULL
--
-- #926 §17.B (услуги) и §17.H (описание клиники). Решение владельца 11.09, дословно: «короткое
-- описание это просто текст, а подробное описание это markdown материал с возможностью вставки
-- медиа», «и там, и там короткое описание и полное описание должно быть».
--
-- Сегодняшняя `description` визитки И ЕСТЬ короткое описание — она заполнена живыми данными и
-- остаётся на месте. Новая колонка несёт ПОЛНОЕ описание тем же материалом, что у специалиста
-- (этап 2a): GFM-markdown со ссылками на медиабиблиотеку организации.
ALTER TABLE public.clinic_public_directory_entries
  ADD COLUMN full_description_markdown text;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
COMMENT ON COLUMN public.clinic_public_directory_entries.full_description_markdown IS
  'Long-form public description of the clinic as GFM markdown with library media links (owner decision 2026-09-11). The short plain-text line stays in clinic_public_directory_entries.description. Its media are delivered anonymously only through the media set the clinic-card root returns.';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Лимиты длины публичных текстов этой строки живут ОДНИМ ограничением, и новая колонка обязана
-- войти в него, а не остаться единственной без потолка: иначе «сколько сюда влезает» перестаёт
-- читаться в одном месте и расходится молча. 50 000 — тот же потолок, что у полного описания
-- специалиста (`apps/webapp/src/app/api/admin/booking-engine/specialists/route.ts`).
ALTER TABLE public.clinic_public_directory_entries
  DROP CONSTRAINT clinic_public_directory_entries_card_text_limits_check,
  ADD CONSTRAINT clinic_public_directory_entries_card_text_limits_check CHECK (
    (description IS NULL OR length(description) <= 4000)
    AND (public_contact_phone IS NULL OR length(public_contact_phone) <= 64)
    AND (public_contact_email IS NULL OR length(public_contact_email) <= 320)
    AND (public_website_url IS NULL OR length(public_website_url) <= 512)
    AND (full_description_markdown IS NULL OR length(full_description_markdown) <= 50000)
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Горячий путь новой выборки — анонимное чтение визитки: организация равенством, `sort_order`
-- сортировкой, три флага публикации предикатом (§1 «индекс на горячую колонку — в том же PR»).
-- Порядок колонок канонический: сначала равенство, потом сортировка.
CREATE INDEX idx_be_clinic_services_org_public_card
  ON public.be_clinic_services (organization_id, sort_order)
  WHERE is_active AND public_widget_visible AND NOT admin_manual_only;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_clinic_card_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Новой двери НЕ заводится: расширяется та же `app.read_public_clinic_card(text)`, которой этап 1
-- отдал живые филиалы, а этап 2a — опубликованных специалистов (§5 «Один общий проход», §24.2).
-- Причина не стилистическая: набор медиа, который возвращает ЭТА дверь, и есть авторизация
-- анонимной отдачи файла в `/{clinic}/media/{uuid}`. Вторая дверь означала бы вторую ветку в том
-- маршруте, то есть ветку, которую можно расширить, — сейчас её там нет по построению.
--
-- Что добавлено:
--   1. `fullDescriptionMarkdown` — полное описание клиники материалом;
--   2. `services` — что клиника делает, чтобы посетитель узнал это НЕ уходя в мастер записи;
--   3. в набор медиа — файлы, на которые ссылается ОПУБЛИКОВАННОЕ полное описание клиники.
--
-- Отбор услуг НЕ заводит четвёртого флага публикации. Правило «что клиника показывает анониму»
-- на услуге уже записано и уже работает: `is_active AND public_widget_visible AND NOT
-- admin_manual_only` — ровно тот предикат, которым анонимную выдачу услуг отбирает
-- `app.read_public_booking_catalog`. Отдельная колонка `card_is_published` (как у специалиста)
-- здесь была бы ВТОРЫМ смыслом рядом с первым: у специалиста своего публичного флага не было
-- вовсе, а у услуги он есть, и услуга, попавшая на визитку мимо него, обещала бы посетителю то,
-- чего он потом не найдёт в мастере записи.
--
-- Идентификатор услуги наружу НЕ выходит (§3.2): на визитке по услуге нет действия, для которого
-- он бы понадобился, а мастер записи строит свой список своей дверью.
--
-- Сигнатура не меняется: миграция едет впереди кода, и дверь обязана остаться вызываемой для уже
-- выложенного приложения. Старые ключи ответа на месте, новые добавлены рядом.
CREATE OR REPLACE FUNCTION app.read_public_clinic_card(p_slug text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $_$
DECLARE
  v_card jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_clinic_card_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'clinic.public-card.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_public_clinic_card(text)'::regprocedure);

  SELECT jsonb_build_object(
    'requestedSlug', requested.slug,
    'canonicalSlug', current_claim.slug,
    'disposition', CASE WHEN requested.kind = 'alias' THEN 'redirect' ELSE 'current' END,
    'displayName', entry.display_name,
    'description', entry.description,
    'fullDescriptionMarkdown', entry.full_description_markdown,
    'publicContactPhone', entry.public_contact_phone,
    'publicContactEmail', entry.public_contact_email,
    'publicWebsiteUrl', entry.public_website_url,
    'locations', branches.locations,
    'specialists', specialists.people,
    'services', services.items,
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
    -- Живые филиалы клиники в момент самого чтения, не снимок из прошлого сохранения формы.
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('title', branch.title, 'cityCode', branch.city_code, 'address', branch.address)
        ORDER BY branch.sort_order, branch.title
      ),
      '[]'::jsonb
    ) AS locations
    FROM public.be_branches AS branch
    WHERE branch.organization_id = entry.organization_id
      AND branch.is_active = true
  ) AS branches ON true
  LEFT JOIN LATERAL (
    -- Опубликованные специалисты клиники. Неактивный, непубликуемый и несуществующий не попадают
    -- сюда одинаково — страница специалиста отказывает ровно так же, как выключенная визитка, и
    -- по форме ответа перебрать людей нельзя.
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', specialist.id,
          'fullName', specialist.full_name,
          'shortDescription', specialist.description,
          'fullDescriptionMarkdown', specialist.full_description_markdown,
          'avatarMediaId', avatar.id
        )
        ORDER BY specialist.sort_order, specialist.full_name
      ),
      '[]'::jsonb
    ) AS people
    FROM public.be_specialists AS specialist
    LEFT JOIN public.media_files AS avatar
      ON avatar.id = specialist.avatar_media_id
     AND avatar.owner_kind = 'organization'
     AND avatar.organization_id = entry.organization_id
     AND avatar.status = 'ready'
     AND avatar.mime_type LIKE 'image/%'
    WHERE specialist.organization_id = entry.organization_id
      AND specialist.is_active = true
      AND specialist.card_is_published = true
  ) AS specialists ON true
  LEFT JOIN LATERAL (
    -- Услуги, которые клиника показывает анониму. Предикат тот же, которым анонимную выдачу
    -- отбирает дверь публичного каталога записи: неактивная, снятая с публичного виджета и
    -- «только для администратора» наружу не выходят. Стена между арендаторами — равенство по
    -- организации, как у филиалов и специалистов.
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'title', service.title,
          'description', service.description,
          'durationMinutes', service.duration_minutes,
          'priceMinor', service.price_minor
        )
        ORDER BY service.sort_order, service.title
      ),
      '[]'::jsonb
    ) AS items
    FROM public.be_clinic_services AS service
    WHERE service.organization_id = entry.organization_id
      AND service.is_active = true
      AND service.public_widget_visible = true
      AND service.admin_manual_only = false
  ) AS services ON true
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
        ORDER BY asset.position, asset.media_id
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
      UNION ALL
      -- Аватары опубликованных специалистов: та же проверка готовности, что у логотипа.
      SELECT DISTINCT avatar.id, 'specialistAvatar'::text, 1000000::bigint,
             avatar.mime_type, avatar.s3_key, avatar.stored_path
        FROM public.be_specialists AS specialist
        INNER JOIN public.media_files AS avatar
          ON avatar.id = specialist.avatar_media_id
         AND avatar.owner_kind = 'organization'
         AND avatar.organization_id = entry.organization_id
         AND avatar.status = 'ready'
         AND avatar.mime_type LIKE 'image/%'
       WHERE specialist.organization_id = entry.organization_id
         AND specialist.is_active = true
         AND specialist.card_is_published = true
      UNION ALL
      -- Файлы, на которые ссылается опубликованное полное описание. Картиночного предиката здесь
      -- нет намеренно: владелец просил «markdown с возможностью загрузки туда фото и даже видео».
      -- Принадлежность организации и готовность проверяются ровно так же.
      SELECT DISTINCT embedded.id, 'specialistDescription'::text, 2000000::bigint,
             embedded.mime_type, embedded.s3_key, embedded.stored_path
        FROM public.be_specialists AS specialist
        CROSS JOIN LATERAL regexp_matches(
          COALESCE(specialist.full_description_markdown, ''),
          '/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
          'gi'
        ) AS reference(captured)
        INNER JOIN public.media_files AS embedded
          ON embedded.id = (reference.captured)[1]::uuid
         AND embedded.owner_kind = 'organization'
         AND embedded.organization_id = entry.organization_id
         AND embedded.status = 'ready'
       WHERE specialist.organization_id = entry.organization_id
         AND specialist.is_active = true
         AND specialist.card_is_published = true
      UNION ALL
      -- Файлы полного описания САМОЙ клиники. В ТОТ ЖЕ набор и по тем же правилам: иначе картинка
      -- внутри описания не откроется анониму либо под медиа появится вторая дверь (§17.H, граница
      -- 1). Ссылки вычисляются из текста в момент чтения, а не хранятся снимком рядом с ним:
      -- снимок пришлось бы держать в согласии с текстом, и он расходился бы молча.
      SELECT DISTINCT clinic_embedded.id, 'clinicDescription'::text, 3000000::bigint,
             clinic_embedded.mime_type, clinic_embedded.s3_key, clinic_embedded.stored_path
        FROM regexp_matches(
          COALESCE(entry.full_description_markdown, ''),
          '/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
          'gi'
        ) AS clinic_reference(captured)
        INNER JOIN public.media_files AS clinic_embedded
          ON clinic_embedded.id = (clinic_reference.captured)[1]::uuid
         AND clinic_embedded.owner_kind = 'organization'
         AND clinic_embedded.organization_id = entry.organization_id
         AND clinic_embedded.status = 'ready'
    ) AS asset
  ) AS media ON true
  WHERE requested.slug = lower(btrim(p_slug))
    AND requested.kind IN ('current', 'alias')
  LIMIT 1;

  RETURN v_card;
END
$_$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_clinic_card_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Дверь записи получает девятый аргумент — полное описание клиники. Аргумент дописан В КОНЕЦ
-- намеренно: позиции остальных не сдвигаются, значит ни одно существующее сопоставление
-- аргументов не может тихо разъехаться на единицу.
--
-- Записывает по-прежнему ТОЛЬКО эта дверь: у `app_staff` на проекции поколоночный `UPDATE` ровно
-- на `slug, updated_at`, и расширять гранты рабочей роли ради новой колонки запрещено (план §4).
CREATE OR REPLACE FUNCTION app.save_public_clinic_card(
  p_organization_id uuid,
  p_description text,
  p_public_contact_phone text,
  p_public_contact_email text,
  p_public_website_url text,
  p_logo_media_id uuid,
  p_photo_media_ids_json text,
  p_card_is_published boolean,
  p_full_description_markdown text
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $_$
DECLARE
  v_photo_ids uuid[];
  v_locations jsonb;
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
         full_description_markdown = p_full_description_markdown,
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
    'fullDescriptionMarkdown', p_full_description_markdown,
    'publicContactPhone', p_public_contact_phone,
    'publicContactEmail', p_public_contact_email,
    'publicWebsiteUrl', p_public_website_url,
    'logoMediaId', p_logo_media_id,
    'photoMediaIds', to_jsonb(v_photo_ids),
    'locations', v_locations,
    'cardIsPublished', COALESCE(p_card_is_published, false)
  );
END
$_$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_clinic_card_owner
-- Прежняя восьмиаргументная дверь снимается ТЕМ ЖЕ ходом. Оставить её рядом значило бы держать две
-- двери записи одной строки, из которых одна молча теряет полное описание, — ровно тот второй путь,
-- который здесь запрещён (§5 «Один общий проход»).
DROP FUNCTION IF EXISTS app.save_public_clinic_card(uuid, text, text, text, text, uuid, text, boolean);
