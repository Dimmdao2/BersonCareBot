-- BCB-MIGRATION-OWNER: app_seam_public_clinic_card_owner
-- BCB-MIGRATION-VERIFY: pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.read_public_clinic_card(text)')) LIKE '%org_brand_revisions%' AND pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.read_public_clinic_card(text)')) NOT LIKE '%entry.display_name%'
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- #926 §17.R. Владелец 11.09, дословно: «он может же написать вместо названия организации свою
-- фамилию имя. Вот и всё.» Сегодня это невозможно: кабинет правит `org_brand_revisions.display_name`
-- («Название организации» в разделе «Бренд организации»), а публичная визитка читала СВОЮ копию в
-- `clinic_public_directory_entries.display_name`, которую после заведения организации не обновляет
-- никто. Замер аудитора 11.09 в транзакции: кабинет «AUDIT2D Берсон Дмитрий», визитка «AUDIT2D ООО
-- Ромашка».
--
-- Починка — снять копию с пути чтения, а не завести ей второго писателя. Владелец 11.09: «все
-- только ссылками на реальные записи». Настоящая запись имени — `be_organizations.title` с
-- переопределением бренда поверх; ровно так его уже разрешает
-- `app.read_anonymous_patient_surface_projection` и так же его читает публичный каталог клиник
-- (`pgClinicDirectory.ts`). Колонка `clinic_public_directory_entries.display_name` остаётся в
-- таблице NOT NULL, но с пути визитки уходит — её судьба разбирается вместе с `locations_json`
-- (§17.J).
CREATE OR REPLACE FUNCTION app.read_public_clinic_card(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_card jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_clinic_card_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'clinic.public-card.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_public_clinic_card(text)'::regprocedure);

  SELECT jsonb_build_object(
    'requestedSlug', requested.slug,
    'canonicalSlug', current_claim.slug,
    'disposition', CASE WHEN requested.kind = 'alias' THEN 'redirect' ELSE 'current' END,
    -- ЕДИНСТВЕННОЕ назначение этого признака: страница `/{clinic}` выбирает по нему экран —
    -- визитку или вырожденный вход в кабинет. Содержимое ответа он не режет.
    'cardIsPublished', entry.card_is_published,
    -- Имя клиники берётся ЖИВЫМ из того места, которое правит кабинет, а не из копии в строке
    -- каталога: копию не обновлял никто, и «своя фамилия вместо названия организации» (владелец
    -- 11.09) на визитку не доезжала. Формула — та же, что уже стоит в
    -- `app.read_anonymous_patient_surface_projection`: переопределение бренда, иначе каноническое
    -- имя организации. Второй записи этого правила заводить нельзя.
    'displayName', COALESCE(NULLIF(pg_catalog.btrim(brand.display_name), ''), organization.title),
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
  INNER JOIN public.be_organizations AS organization
    ON organization.id = requested.organization_id
   AND organization.is_active = true
  LEFT JOIN LATERAL (
    SELECT revision.display_name
      FROM public.org_brand_revisions AS revision
     WHERE revision.organization_id = requested.organization_id
       AND revision.status = 'published'
     LIMIT 1
  ) AS brand ON true
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
    -- Опубликованные специалисты клиники. Владелец 11.09: «если специалист включён, не надо
    -- выключать его визитку, в принципе». Поэтому здесь ТОЛЬКО его собственные признаки —
    -- активен и опубликован им же, — а галка визитки клиники этот список не трогает: страница
    -- специалиста живёт независимо от вида корневого экрана. Неактивный, непубликуемый и
    -- несуществующий по-прежнему не попадают сюда ОДИНАКОВО, поэтому перебрать людей по форме
    -- ответа нельзя (§3.3).
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
$function$;
