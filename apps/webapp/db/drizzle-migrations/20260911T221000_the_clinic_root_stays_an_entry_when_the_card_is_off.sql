-- BCB-MIGRATION-OWNER: app_seam_public_clinic_card_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.read_public_clinic_card(text)')) LIKE '%cardIsPublished%'
--
-- #926 §17.F. РЕШЕНИЕ ВЛАДЕЛЬЦА 11.09, дословно: «корень клиники должен стать входом в кабинет. Не
-- должно быть исчезнувшего адреса, то есть там будет вход в кабинет, там название клиники, и что
-- это на платформе Therapysto работает. То есть это надо делать».
--
-- Замер, из которого выросло решение: из четырёх сочетаний двух настроек три давали живой экран, а
-- `clinic_root_skip_public_card = false` × `card_is_published = false` давало 404 — клиника,
-- снявшая галку «Показывать страницу организации», получала МЁРТВЫЙ собственный адрес, хотя запись
-- у неё в это же время открыта (она висит на другом флаге, `is_published` каталога).
--
-- ГДЕ ПРОХОДИТ ГРАНИЦА §3.3 И ПОЧЕМУ ИМЕННО ТАМ. Требование «неизвестный, неопубликованный,
-- неактивный слаг дают один и тот же 404» существует, чтобы аноним не мог перебирать клиники по
-- форме ответа. Решение владельца снимает одинаковость ровно для одного из четырёх случаев, и
-- граница проходит по `is_published` каталога, а НЕ по `card_is_published` визитки:
--
--   • `is_published = true` — существование клиники УЖЕ публично: `/{slug}/booking` отвечает ей
--     200 живым каталогом (дверь `app.read_public_booking_catalog` проверяет ровно этот флаг и
--     ничего не знает про визитку). Показать на корне вход с её именем не открывает НИЧЕГО нового;
--   • `is_published = false`, организация неактивна или слага нет вовсе — дверь по-прежнему
--     возвращает NULL, то есть ТОТ ЖЕ 404, что и раньше. Здесь перебор был бы настоящим.
--
-- Поэтому из условия чтения убран ТОЛЬКО `card_is_published`, а `is_published` и `is_active`
-- остались там же. Вместо отсутствия строки дверь теперь отдаёт признак `cardIsPublished`, и
-- страница по нему выбирает, что рисовать: визитку или вход в кабинет.
--
-- ЧТО ВЫХОДИТ НАРУЖУ ПРИ ВЫКЛЮЧЕННОЙ ВИЗИТКЕ. Только имя клиники и её логотип — ровно то, что
-- владелец назвал содержимым этого экрана. Описание, контакты, адреса филиалов, специалисты,
-- услуги и остальные медиа не выходят: клиника их сознательно сняла с публики, и «выключено»
-- обязано означать выключено. Набор медиа двери И ЕСТЬ авторизация анонимной отдачи файла
-- (`/{clinic}/media/{uuid}`), поэтому сужение набора до логотипа — это и есть закрытие фотографий
-- и материалов, а не косметика разметки.
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
    -- Признак, по которому страница выбирает экран. Имя клиники выходит наружу в обоих случаях:
    -- это то, что владелец прямо назвал содержимым вырожденного корня.
    'cardIsPublished', entry.card_is_published,
    'displayName', entry.display_name,
    'description', CASE WHEN entry.card_is_published THEN entry.description END,
    'fullDescriptionMarkdown',
      CASE WHEN entry.card_is_published THEN entry.full_description_markdown END,
    'publicContactPhone', CASE WHEN entry.card_is_published THEN entry.public_contact_phone END,
    'publicContactEmail', CASE WHEN entry.card_is_published THEN entry.public_contact_email END,
    'publicWebsiteUrl', CASE WHEN entry.card_is_published THEN entry.public_website_url END,
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
      AND entry.card_is_published = true
  ) AS branches ON true
  LEFT JOIN LATERAL (
    -- Опубликованные специалисты клиники. Неактивный, непубликуемый и несуществующий не попадают
    -- сюда одинаково — страница специалиста отказывает ровно так же, как выключенная визитка, и
    -- по форме ответа перебрать людей нельзя. При выключенной визитке набор пуст: страница
    -- специалиста этой клиники перестаёт открываться вместе с самой визиткой.
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
      AND entry.card_is_published = true
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
      AND entry.card_is_published = true
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
      -- Логотип — ЕДИНСТВЕННОЕ, что остаётся в наборе при выключенной визитке: вырожденный корень
      -- показывает его рядом с именем клиники, а набор двери и есть право на анонимную отдачу.
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
       WHERE entry.card_is_published = true
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
         AND entry.card_is_published = true
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
         AND entry.card_is_published = true
      UNION ALL
      -- Файлы полного описания САМОЙ клиники. В ТОТ ЖЕ набор и по тем же правилам: иначе картинка
      -- внутри описания не откроется анониму либо под медиа появится вторая дверь (§17.H, граница
      -- 1). Ссылки вычисляются из текста в момент чтения, а не хранятся снимком рядом с ним:
      -- снимок пришлось бы держать в согласии с текстом, и он расходился бы молча.
      SELECT DISTINCT clinic_embedded.id, 'clinicDescription'::text, 3000000::bigint,
             clinic_embedded.mime_type, clinic_embedded.s3_key, clinic_embedded.stored_path
        FROM regexp_matches(
          COALESCE(
            CASE WHEN entry.card_is_published THEN entry.full_description_markdown END,
            ''
          ),
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
