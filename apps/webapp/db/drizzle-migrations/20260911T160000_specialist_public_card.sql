-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid = pg_catalog.to_regclass('public.be_specialists') AND NOT a.attisdropped AND a.attname IN ('avatar_media_id', 'full_description_markdown', 'card_is_published')) = 3 AND pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.read_public_clinic_card(text)')) LIKE '%be_specialists%'
--
-- #926 §17.G/§17.H. Решение владельца 11.09: «это отдельная страница специалиста… его данные там
-- должны быть», «аватар-специалист обязательно нужно», «короткое описание это просто текст, а
-- подробное описание это markdown материал с возможностью вставки медиа».
--
-- Сегодняшняя `description` и ЕСТЬ короткое описание — оно уже заполнено живыми данными и остаётся
-- на месте. Добавляются три колонки: аватар, полное описание материалом и выключатель публикации.
--
-- Выключатель по умолчанию ВЫКЛЮЧЕН и это не осторожность, а граница: ФИО сотрудника —
-- персональные данные, и «что именно публикуется — решает клиника, а не платформа» (§17.G).
-- Значение `true` по умолчанию опубликовало бы имена всех сегодняшних специалистов всех клиник в
-- момент наката миграции, ничьего решения при этом не спросив.
ALTER TABLE public.be_specialists
  ADD COLUMN avatar_media_id uuid,
  ADD COLUMN full_description_markdown text,
  ADD COLUMN card_is_published boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- `ON DELETE SET NULL` — как у логотипа клиники и иконки бренда: удаление файла из библиотеки
-- вырождает карточку до места под аватар, а не роняет строку специалиста и воркер чистки медиа.
ALTER TABLE public.be_specialists
  ADD CONSTRAINT be_specialists_avatar_media_id_fkey
  FOREIGN KEY (avatar_media_id) REFERENCES public.media_files(id) ON DELETE SET NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Обратный обход «какие специалисты держат этот медиа-файл» — тот же, что у иконки бренда.
CREATE INDEX idx_be_specialists_avatar_media
  ON public.be_specialists (avatar_media_id)
  WHERE avatar_media_id IS NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Горячий путь новой колонки — анонимное чтение визитки: организация равенством, `sort_order`
-- сортировкой, публикация и активность предикатом. Порядок колонок по §1: сначала равенство,
-- потом сортировка; условие вынесено в частичный предикат, потому что опубликованных специалистов
-- в таблице меньшинство.
CREATE INDEX idx_be_specialists_org_public_card
  ON public.be_specialists (organization_id, sort_order)
  WHERE is_active AND card_is_published;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
COMMENT ON COLUMN public.be_specialists.avatar_media_id IS
  'Avatar shown on the specialist public page and in the clinic-card preview (owner decision 2026-09-11). Delivered anonymously only through the media set the clinic-card root returns.';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
COMMENT ON COLUMN public.be_specialists.full_description_markdown IS
  'Long-form public description as GFM markdown with library media links (owner decision 2026-09-11). The short plain-text line stays in be_specialists.description.';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
COMMENT ON COLUMN public.be_specialists.card_is_published IS
  'The clinic decides what is published: false keeps the specialist out of the public card and off the public page entirely, with the same refusal as a switched-off clinic card.';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_clinic_card_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Новой двери НЕ заводится: расширяется уже объявленная (§5 «Один общий проход», §24.2). Та же
-- дверь, которой этап 1 отдал живые филиалы, теперь отдаёт и опубликованных специалистов — именем,
-- коротким описанием, полным описанием и аватаром, — и, главное, ОДИН набор медиа на всю публичную
-- поверхность клиники.
--
-- Почему набор один. Анонимная отдача файла (`/{clinic}/media/{uuid}`) авторизует структурно: файл
-- отдаётся тогда и только тогда, когда его id вернула сама дверь. Если бы медиа специалиста
-- считала отдельная дверь, у маршрута появилась бы вторая ветка, которую можно расширить, — ровно
-- то, чего в этой конструкции нет по построению. Поэтому в набор входят: логотип и фотографии
-- клиники, аватары опубликованных специалистов и файлы, на которые ссылается их ОПУБЛИКОВАННОЕ
-- полное описание. Неопубликованный специалист не приносит в набор ничего.
--
-- Ссылки на медиа вычисляются из самого markdown в момент чтения, а не хранятся снимком рядом:
-- снимок пришлось бы держать в согласии с текстом, и он бы расходился молча — тот самый дефект,
-- который §17.A убрал у `locations_json`.
--
-- Сигнатура НЕ меняется намеренно: миграция едет впереди кода, и дверь обязана остаться вызываемой
-- для уже выложенного приложения. Старые ключи ответа на месте, новые добавлены рядом.
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
    'publicContactPhone', entry.public_contact_phone,
    'publicContactEmail', entry.public_contact_email,
    'publicWebsiteUrl', entry.public_website_url,
    'locations', branches.locations,
    'specialists', specialists.people,
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
    ) AS asset
  ) AS media ON true
  WHERE requested.slug = lower(btrim(p_slug))
    AND requested.kind IN ('current', 'alias')
  LIMIT 1;

  RETURN v_card;
END
$_$;
