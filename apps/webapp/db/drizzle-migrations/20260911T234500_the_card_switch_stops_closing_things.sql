-- BCB-MIGRATION-OWNER: app_seam_public_clinic_card_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.read_public_clinic_card(text)')) NOT LIKE '%entry.card_is_published = true%' AND pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.read_public_booking_catalog(uuid,uuid,uuid)')) LIKE '%clinic_booking_show_specialist_cards%'
--
-- #926 §17.F (уточнение владельца 11.09) и §17.Q. Эта миграция почти целиком СНИМАЕТ условия,
-- а не добавляет их.
--
-- ЧТО ПРОИЗОШЛО. Предыдущий ход прочитал галку «Показывать страницу организации» как выключатель
-- публичности и сузил при `card_is_published = false` набор медиа двери до логотипа. Набор двери и
-- есть авторизация анонимной отдачи `/{clinic}/media/{uuid}`, поэтому вместе с визиткой закрылись
-- фотографии клиники, файлы её материалов, аватары и страницы её специалистов.
--
-- Владелец отверг это прямо, дословно: «выключение визитки закрывает заодно страницы специалистов
-- этой клиники и отдачу её фотографий — НЕ ВЕРНО. Специалисты могут быть в публичной форме записи,
-- и там про них можно почитать… ты занимаешься не тем. Ты сейчас пытаешься защитить то, что
-- защищать не надо в принципе… нам не надо сейчас пытаться что-то от кого-то здесь закрыть».
--
-- И назвал, для чего галка существует на самом деле: «можно отобразить расширенный шаблон, а можно
-- отобразить просто форму входа. Вот и всё… сделать так, чтобы, если они не заполнили, чтобы вход
-- выглядел красиво, то есть не было там пустых полей с фотографиями».
--
-- Значит галка — про ВИД корневого экрана, и только. Она не флаг доступа, не граница арендатора и
-- не выключатель медиа. Поэтому дверь возвращает ПОЛНЫЙ ответ всегда, а признак `cardIsPublished`
-- остаётся ровно для одного: по нему страница `/{clinic}` выбирает, рисовать визитку или
-- вырожденный вход в кабинет. Ни одной строки в ответе он больше не режет.
--
-- Всё, что здесь выходит наружу, клиника опубликовала САМА и про себя: свой логотип, свои
-- фотографии, свои материалы, своих специалистов — каждого отдельной галкой `card_is_published`
-- в его собственной карточке. Границы, которые остались нетронутыми: строка каталога
-- (`is_published`), активность организации, принадлежность файла ИМЕННО этой организации,
-- готовность файла и публичность каждого специалиста и каждой услуги по отдельности.
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
    -- ЕДИНСТВЕННОЕ назначение этого признака: страница `/{clinic}` выбирает по нему экран —
    -- визитку или вырожденный вход в кабинет. Содержимое ответа он не режет.
    'cardIsPublished', entry.card_is_published,
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
$_$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- #926 §17.Q. Два изменения, оба по прямому решению владельца 11.09.
--
-- 1. `card_is_published` СПЕЦИАЛИСТА БОЛЬШЕ НЕ УЧАСТВУЕТ В РЕЗОЛВЕ ССЫЛКИ. Слепой аудит этапа 2c
--    нашёл живой дефект: конструктор ссылки в кабинете отбирает специалистов по `is_active`, а
--    дверь сужала по `is_active AND card_is_published`, у которого `DEFAULT false`. По свежей
--    ссылке «к Анне» посетитель поэтому читал «Этот специалист больше не принимает записи в этой
--    клинике» — неправду о человеке, который записи принимает, и клиника об этом не узнавала.
--    Решение владельца: «?specialist= работает для любого активного специалиста; card_is_published
--    перестаёт участвовать в мастере записи вовсе».
--
-- 2. ЧИТАЕМОСТЬ ОПИСАНИЯ В МОДУЛЕ ЗАПИСИ РЕШАЕТ ОДНА ГАЛКА ОРГАНИЗАЦИИ. Дословно: «Нажали
--    отображать визитки специалистов в модуле записи — человек может не просто название его
--    увидеть, но открыть его карточку. Выключили — в модуле записи человек видит только список
--    специалистов. И всё… Просто галочка есть показывать? Показываем, нет галочки, не показываем.»
--    Настройка живёт там же, где соседняя галка организации `clinic_root_skip_public_card`, — в
--    реестре `system-settings` (`scope = 'admin'`, `organization_id` арендатора). Второго механизма
--    настроек не заводится.
--
--    Дверь отдаёт готовый ответ `cardIsReadable`, а не два флага: собственная галка специалиста
--    входит в него потому, что предложить открыть карточку, которой нет, — это ссылка в 404.
--    Дефолт настройки — ВКЛЮЧЕНО (`true`): клиника публикует визитку каждого специалиста отдельной
--    галкой, и молча игнорировать этот её выбор значило бы повторить дефект пункта 1 с другой
--    стороны. Кто показывать не хочет — снимает галку или, словами владельца, «пусть её просто не
--    заполняют, нету проблем».
--
-- Стена между арендаторами и одинаковость отказа §3.3 не тронуты: организация по-прежнему берётся
-- из ПРИНЯТОГО КОНТЕКСТА, а несуществующий, чужой и неактивный специалист дают один и тот же ответ.
CREATE OR REPLACE FUNCTION app.read_public_booking_catalog(
  p_branch_id uuid,
  p_service_id uuid,
  p_specialist_id uuid
) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $_$
DECLARE
  v_org uuid := app.current_org_id();
  v_branches jsonb;
  v_branch jsonb;
  v_services jsonb;
  v_service jsonb;
  v_specialist jsonb;
  v_show_specialist_cards boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'booking.public-catalog.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($3))::app.port_typed_arg]), 'app.read_public_booking_catalog(uuid,uuid,uuid)'::regprocedure);

  -- Неопубликованная клиника снаружи не существует. Это ЕДИНСТВЕННОЕ место, где проверка стоит
  -- для каталога: маршрут `/{slug}/booking` резолвит слаг отдельным корнем, но принципал ставится
  -- кодом приложения, и дверь не обязана верить коду приложения.
  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clinic_public_directory_entries directory
    WHERE directory.organization_id = v_org
      AND directory.is_published = true
  ) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', branch.id,
    'organizationId', branch.organization_id,
    'title', branch.title,
    'shortTitle', branch.short_title,
    'color', branch.color,
    'cityCode', branch.city_code,
    'address', branch.address,
    'timezone', branch.timezone,
    'isActive', branch.is_active,
    'sortOrder', branch.sort_order
  ) ORDER BY branch.sort_order, branch.title), '[]'::jsonb)
  INTO v_branches
  FROM public.be_branches branch
  WHERE branch.organization_id = v_org
    AND branch.is_active = true;

  IF p_specialist_id IS NOT NULL THEN
    -- Галка организации «показывать визитки специалистов в модуле записи» (§17.Q). Строки нет —
    -- настройка не тронута, значит ВКЛЮЧЕНО: обоснование дефолта в шапке блока.
    SELECT COALESCE((setting.value_json ->> 'value')::boolean, true)
      INTO v_show_specialist_cards
      FROM public.system_settings setting
     WHERE setting.key = 'clinic_booking_show_specialist_cards'
       AND setting.scope = 'admin'
       AND setting.organization_id = v_org
     LIMIT 1;
    v_show_specialist_cards := COALESCE(v_show_specialist_cards, true);

    -- Личность специалиста по ссылке. Отбор — только его активность: публичность его карточки
    -- решает, ЧИТАЕТСЯ ли про него описание, а не принимает ли он записи (§17.Q).
    SELECT jsonb_build_object(
      'id', specialist.id,
      'fullName', specialist.full_name,
      -- Филиалы, где он ДЕЙСТВИТЕЛЬНО принимает: первый экран сужается до них (план §6.2), иначе
      -- ссылка «к Анне» отправляет человека в филиал, где под неё нет ни одной услуги.
      'branchIds', COALESCE(practice.branch_ids, '[]'::jsonb),
      -- Можно ли из модуля записи открыть его карточку и прочитать описание. Галка организации И
      -- его собственная публикация: предложить открыть невыпущенную карточку — это ссылка в 404.
      'cardIsReadable', (v_show_specialist_cards AND specialist.card_is_published)
    )
    INTO v_specialist
    FROM public.be_specialists specialist
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(DISTINCT availability.branch_id) AS branch_ids
        FROM public.be_specialist_service_availability availability
       WHERE availability.organization_id = v_org
         AND availability.specialist_id = specialist.id
         AND availability.is_active = true
         AND availability.branch_id IS NOT NULL
    ) AS practice ON true
    WHERE specialist.organization_id = v_org
      AND specialist.id = p_specialist_id
      AND specialist.is_active = true;

    IF v_specialist IS NULL THEN
      -- Один и тот же ответ на все три причины отказа (§3.3). Список филиалов остаётся: экран
      -- «больше не принимает» обязан тут же предложить действующие филиалы, а не пустоту (§6.3).
      RETURN jsonb_build_object(
        'branches', v_branches,
        'branch', NULL,
        'services', '[]'::jsonb,
        'service', NULL,
        'specialist', NULL
      );
    END IF;
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', branch.id,
      'organizationId', branch.organization_id,
      'title', branch.title,
      'shortTitle', branch.short_title,
      'color', branch.color,
      'cityCode', branch.city_code,
      'address', branch.address,
      'timezone', branch.timezone,
      'isActive', branch.is_active,
      'sortOrder', branch.sort_order
    )
    INTO v_branch
    FROM public.be_branches branch
    WHERE branch.organization_id = v_org
      AND branch.id = p_branch_id
      AND branch.is_active = true;

    IF v_branch IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(service_row ORDER BY service_row ->> 'sortOrder', service_row ->> 'title'),
                      '[]'::jsonb)
      INTO v_services
      FROM (
        SELECT DISTINCT jsonb_build_object(
          'id', service.id,
          'organizationId', service.organization_id,
          'title', service.title,
          'description', service.description,
          'durationMinutes', service.duration_minutes,
          'bufferAfterMinutes', service.buffer_after_minutes,
          'priceMinor', service.price_minor,
          'prepaymentApplicable', service.prepayment_applicable,
          'usableInPackages', service.usable_in_packages,
          'onlinePaymentApplicable', service.online_payment_applicable,
          'sortOrder', service.sort_order,
          'isActive', service.is_active
        ) AS service_row
        FROM public.be_clinic_services service
        INNER JOIN public.be_specialist_service_availability availability
          ON availability.organization_id = service.organization_id
         AND availability.service_id = service.id
         AND availability.branch_id = p_branch_id
         AND availability.is_active = true
         -- Сужение по специалисту из ссылки. Здесь мы уже знаем, что он активен: неразрешённый
         -- вернулся выше одинаковым отказом.
         AND (p_specialist_id IS NULL OR availability.specialist_id = p_specialist_id)
        INNER JOIN public.be_specialists specialist
          ON specialist.id = availability.specialist_id
         AND specialist.organization_id = availability.organization_id
         AND specialist.is_active = true
        WHERE service.organization_id = v_org
          AND service.is_active = true
          AND service.public_widget_visible = true
          AND service.admin_manual_only = false
      ) source;
    END IF;
  END IF;

  IF p_service_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', service.id,
      'organizationId', service.organization_id,
      'title', service.title,
      'description', service.description,
      'durationMinutes', service.duration_minutes,
      'bufferAfterMinutes', service.buffer_after_minutes,
      'priceMinor', service.price_minor,
      'prepaymentApplicable', service.prepayment_applicable,
      'usableInPackages', service.usable_in_packages,
      'onlinePaymentApplicable', service.online_payment_applicable,
      'sortOrder', service.sort_order,
      'isActive', service.is_active
    )
    INTO v_service
    FROM public.be_clinic_services service
    WHERE service.organization_id = v_org
      AND service.id = p_service_id
      AND service.is_active = true
      AND service.public_widget_visible = true
      AND service.admin_manual_only = false
      AND EXISTS (
        SELECT 1
        FROM public.be_specialist_service_availability availability
        INNER JOIN public.be_specialists specialist
          ON specialist.id = availability.specialist_id
         AND specialist.organization_id = availability.organization_id
         AND specialist.is_active = true
        WHERE availability.organization_id = v_org
          AND availability.service_id = service.id
          AND availability.is_active = true
          AND (p_branch_id IS NULL OR availability.branch_id = p_branch_id)
          AND (p_specialist_id IS NULL OR availability.specialist_id = p_specialist_id)
      );
  END IF;

  RETURN jsonb_build_object(
    'branches', v_branches,
    'branch', v_branch,
    'services', COALESCE(v_services, '[]'::jsonb),
    'service', v_service,
    'specialist', v_specialist
  );
END;
$_$;
