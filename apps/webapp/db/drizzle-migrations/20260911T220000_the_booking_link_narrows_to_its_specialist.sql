-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.read_public_booking_catalog(uuid,uuid)') IS NULL AND pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.read_public_booking_catalog(uuid,uuid,uuid)')) LIKE '%card_is_published%'
--
-- #926 §17.C. Конструктор ссылки в кабинете выдаёт клинике `/{slug}/booking?specialist=<id>`, а
-- приёмный экран этот параметр ИГНОРИРОВАЛ и писал `console.warn`: посетитель по ссылке «к Анне»
-- получал весь филиал. Кабинет обещал то, чего не делает, и делал это молча.
--
-- Новой двери НЕ заводится: расширяется та самая `app.read_public_booking_catalog`, которая уже
-- читает `be_specialist_service_availability` и уже отбирает услуги по АКТИВНОМУ специалисту, то
-- есть связь «специалист ↔ услуга ↔ филиал» у неё в руках (§5 «Один общий проход», §24.2). Вторым
-- кандидатом была `app.read_public_clinic_card`, но она про визитку: тянуть в неё расписание
-- значило бы смешать две публичные поверхности с разными правилами отбора.
--
-- Что добавлено:
--   1. третий аргумент `p_specialist_id` — сужение услуг до тех, что ведёт ИМЕННО этот специалист;
--   2. ключ `specialist` — его публичная личность: идентификатор, имя и филиалы, где он принимает.
--
-- ОТБОР ТОТ ЖЕ, ЧТО НА ВИЗИТКЕ, и второй его записи здесь не заводится: наружу выходит только
-- `is_active AND card_is_published` (`app.read_public_clinic_card`, миграция 20260911T160000).
-- Специалист, которого клиника не опубликовала, по ссылке не открывается — иначе публичная запись
-- называла бы человека, которого клиника со своей визитки сознательно убрала.
--
-- §3.3 ОДИНАКОВЫЙ ОТКАЗ. Несуществующий, чужой, неактивный и неопубликованный специалист дают ОДИН
-- И ТОТ ЖЕ ответ: `specialist` = NULL, `branch` = NULL, `services` = пусто. Различать их формой
-- ответа значило бы дать анониму перебирать людей по ссылке. Стена между арендаторами при этом
-- стоит не на аргументе: организация берётся из ПРИНЯТОГО КОНТЕКСТА (`app.current_org_id()`), а не
-- из ссылки, поэтому чужой идентификатор просто не находится.
--
-- §3.2 внутренних полей арендатора в ответ не добавлено: имя специалиста клиника уже публикует
-- сама, а `branchIds` — те же идентификаторы филиалов, что дверь и так отдаёт в `branches` и без
-- которых ссылка на следующий шаг не строится.
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
    -- Личность специалиста по ссылке. Отбор — тот же, что на визитке; организация берётся из
    -- контекста, не из аргумента.
    SELECT jsonb_build_object(
      'id', specialist.id,
      'fullName', specialist.full_name,
      -- Филиалы, где он ДЕЙСТВИТЕЛЬНО принимает: первый экран сужается до них (план §6.2), иначе
      -- ссылка «к Анне» отправляет человека в филиал, где под неё нет ни одной услуги.
      'branchIds', COALESCE(practice.branch_ids, '[]'::jsonb)
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
      AND specialist.is_active = true
      AND specialist.card_is_published = true;

    IF v_specialist IS NULL THEN
      -- Один и тот же ответ на все четыре причины отказа (§3.3). Список филиалов остаётся: экран
      -- «этот специалист больше не принимает» обязан тут же предложить действующие филиалы, а не
      -- пустоту (план §6.3).
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
         -- Сужение по специалисту из ссылки. Здесь мы уже знаем, что он опубликован и активен:
         -- неразрешённый вернулся выше одинаковым отказом.
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
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- Прежняя двухаргументная дверь снимается ТЕМ ЖЕ ходом. Осиротевшая перегрузка — тихая развилка
-- поведения: по ней параметр `specialist` снова молча теряется, а вызывающий об этом не узнаёт.
DROP FUNCTION IF EXISTS app.read_public_booking_catalog(uuid, uuid);
