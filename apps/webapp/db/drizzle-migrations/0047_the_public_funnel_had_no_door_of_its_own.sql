-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0047
--
-- Замер 19.08 на DEV (`bcb_webapp_dev`, слаг `dmitryberson`, порт-контекст — тот же режим, что на
-- TEST с 12.08):
--
--   GET /book/dmitryberson  -->  200, «Каталог недоступен»
--   [book/public-catalog] catalog read failed {
--     message: 'Failed query: select … from "be_branches" where "be_branches"."organization_id" = $1',
--     cause: 'Missing declared webapp port capability: tenant_service',
--     source: 'app/book/[slug]:load-cities' }
--
-- Причина. Организационный принципал вебаппа (`withExplicitOrganizationPrincipal`) проецируется на
-- класс контекста `tenant_service`; для ОБЫЧНОГО реляционного чтения берётся способность с именем
-- класса и `purpose='relation'`. У порта `webapp` такой способности нет и по схеме (`SCHEME.md` §3)
-- быть не должно: сквозного реляционного доступа арендаторскому классу не выдают — он ходит
-- ИМЕНОВАННЫМИ КОРНЯМИ от владельца шва. Дверей у публичной записи не было ни одной, поэтому
-- записаться снаружи было нельзя ни в одну опубликованную клинику: это не деградация части, это ноль.
--
-- Здесь объявляются двери. Владелец шва — уже существующий `app_seam_public_booking_owner`
-- (он же держит `app.resolve_public_booking_organization`). Ни одной новой роли, ни одного
-- расширения табличных грантов рантайм-ролям: каждая дверь — SECURITY DEFINER от шва.
--
-- Поверхность анонимная и неаутентифицированная, поэтому КАЖДОЕ тело само проверяет то, что нельзя
-- доверить вызывающему:
--   * организация обязана быть ОПУБЛИКОВАНА (`clinic_public_directory_entries.is_published`) —
--     иначе дверь пуста. Прежний резолвер этого не проверял вовсе: пара «филиал+услуга»
--     неопубликованной клиники резолвилась в её организацию;
--   * всё остальное берётся не из аргумента, а из контекста (`app.current_org_id()`), поэтому
--     подстановка чужого id не расширяет видимое: чужой филиал просто не находится;
--   * услуга видна только публично записываемая: `is_active`, `public_widget_visible`,
--     `NOT admin_manual_only` и назначенная АКТИВНОМУ специалисту в этом филиале.
-- Эта фильтрация до сегодняшнего дня жила в JS (`modules/patient-booking/inPersonServicesCatalog.ts`)
-- поверх сырых чтений таблиц; теперь она внутри двери, и обойти её нечем.

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- Первый корень — резолвер арендатора. Функция СУЩЕСТВОВАЛА (миграция 0042), но:
--   1) её не было ни в одном каталоге способностей, поэтому вызов падал ещё до отправки statement'а
--      («Missing declared webapp port capability: pre_session» под drizzle'вским «Failed query»);
--   2) её гейт `app.require_attested_context_for_roles(..., ARRAY['app_patient'])` — рукописный
--      гейт прежнего контура, он не сверяется ни с классом контекста, ни с типизированными
--      аргументами, ни с самой идентичностью корня. В порт-контекстном режиме это единственный
--      корень публичной записи, доступный ДО выбора арендатора, поэтому он переводится на общий
--      `app.require_accepted_context` с точной идентичностью и хешем аргументов.
--   3) публикация не проверялась.

CREATE OR REPLACE FUNCTION app.resolve_public_booking_organization(
  p_branch_id uuid,
  p_service_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_ids uuid[];
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_booking_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'booking.public-tenant.resolve',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_branch_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_service_id))::app.port_typed_arg
    ]),
    'app.resolve_public_booking_organization(uuid,uuid)'::regprocedure
  );

  -- Обе половины канонической пары обязательны: по половине арендатор не определяется.
  IF p_branch_id IS NULL OR p_service_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(DISTINCT b.organization_id)
  INTO v_organization_ids
  FROM public.be_branches AS b
  INNER JOIN public.clinic_public_directory_entries AS directory
    ON directory.organization_id = b.organization_id
   AND directory.is_published = true
  INNER JOIN public.be_clinic_services AS s
    ON s.organization_id = b.organization_id
  INNER JOIN public.be_specialist_service_availability AS availability
    ON availability.organization_id = b.organization_id
   AND availability.branch_id = b.id
   AND availability.service_id = s.id
  INNER JOIN public.be_specialists AS specialist
    ON specialist.id = availability.specialist_id
   AND specialist.organization_id = availability.organization_id
   AND specialist.is_active = true
  WHERE b.id = p_branch_id
    AND s.id = p_service_id
    AND b.is_active = true
    AND s.is_active = true
    AND s.public_widget_visible = true
    AND s.admin_manual_only = false
    AND availability.is_active = true;

  IF cardinality(v_organization_ids) = 1 THEN
    RETURN v_organization_ids[1];
  END IF;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION app.resolve_public_booking_organization(uuid, uuid) IS
  'Narrow fail-closed tenant resolver for public in-person booking bootstrap. Returns an org only for one PUBLISHED clinic with an active same-org branch+service availability held by an active specialist.';

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- Второй корень — весь каталог, который анонимному посетителю вообще позволено видеть.
--
-- Одна дверь на четыре формы одного вопроса, потому что вопрос один: «что из каталога ЭТОЙ
-- опубликованной клиники видно снаружи». Организация НЕ является аргументом — она берётся из
-- принятого контекста, поэтому подставить чужую нечем.
--
--   (NULL, NULL)      -> активные филиалы клиники (экран выбора города)
--   (branch, NULL)    -> филиал + его публично записываемые услуги (экран выбора услуги)
--   (NULL, service)   -> одна услуга, если она публично записываема хоть в одном филиале клиники
--   (branch, service) -> и то и другое сразу (прямой переход по параметризованной ссылке)
--
-- Возврат — jsonb, а не SETOF: у ответа четыре независимые части, а вызывающему нужен либо список
-- филиалов, либо пара «филиал+услуги». Табличная форма заставила бы либо четыре корня, либо
-- дублирование филиала в каждой строке услуги.

CREATE OR REPLACE FUNCTION app.read_public_booking_catalog(
  p_branch_id uuid,
  p_service_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_branches jsonb;
  v_branch jsonb;
  v_services jsonb;
  v_service jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_booking_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'booking.public-catalog.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_branch_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_service_id))::app.port_typed_arg
    ]),
    'app.read_public_booking_catalog(uuid,uuid)'::regprocedure
  );

  -- Неопубликованная клиника снаружи не существует. Это ЕДИНСТВЕННОЕ место, где проверка стоит
  -- для каталога: маршрут `/book/{slug}` резолвит слаг отдельным корнем, но принципал ставится
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
      );
  END IF;

  RETURN jsonb_build_object(
    'branches', v_branches,
    'branch', v_branch,
    'services', COALESCE(v_services, '[]'::jsonb),
    'service', v_service
  );
END;
$function$;

COMMENT ON FUNCTION app.read_public_booking_catalog(uuid, uuid) IS
  'Anonymous public booking catalog for the PUBLISHED organization of the accepted tenant-service context: active branches, and only publicly bookable services assigned to an active specialist.';

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- Третий корень — шаг выбора времени. Публичный близнец
-- `app.read_current_patient_booking_slot_snapshot(...)`: та же выборка контекста, рабочих часов,
-- рабочих дней, занятых интервалов и двух настроек, — но вместо «активная запись пациента в
-- организации» стоит «организация опубликована», потому что посетителя здесь ещё нет.
--
-- Один корень на весь шаг, а не пять: под пациентом та же работа делается ОДНИМ снимком, и
-- дробить публичный путь на пять дверей значило бы пять раз повторить проверку публикации и
-- согласования филиал/услуга/специалист.

CREATE OR REPLACE FUNCTION app.read_public_booking_slot_snapshot(
  p_branch_id uuid,
  p_service_id uuid,
  p_date_from text,
  p_date_to text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_context record;
  v_working_hours jsonb;
  v_working_days jsonb;
  v_busy jsonb;
  v_buffer_minutes integer;
  v_min_notice_hours integer;
  v_max_consecutive_slot_hours integer;
  v_date_from date;
  v_date_to date;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_booking_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'booking.public-slot-snapshot.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_branch_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_service_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_date_from))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_date_to))::app.port_typed_arg
    ]),
    'app.read_public_booking_slot_snapshot(uuid,uuid,text,text)'::regprocedure
  );

  IF v_org IS NULL OR p_branch_id IS NULL OR p_service_id IS NULL
     OR p_date_from IS NULL OR p_date_to IS NULL
     OR p_date_from !~ '^\d{4}-\d{2}-\d{2}$'
     OR p_date_to !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_public_directory_entries directory
    WHERE directory.organization_id = v_org
      AND directory.is_published = true
  ) THEN
    RETURN NULL;
  END IF;
  v_date_from := p_date_from::date;
  v_date_to := p_date_to::date;
  IF v_date_from > v_date_to OR v_date_to - v_date_from > 92 THEN RETURN NULL; END IF;

  SELECT
    availability.organization_id,
    availability.branch_id,
    availability.specialist_id,
    availability.service_id,
    availability.room_id,
    service.duration_minutes,
    service.buffer_after_minutes,
    branch.timezone
  INTO v_context
  FROM public.be_specialist_service_availability availability
  JOIN public.be_specialists specialist
    ON specialist.id = availability.specialist_id
   AND specialist.organization_id = availability.organization_id
   AND specialist.is_active = TRUE
  JOIN public.be_branches branch
    ON branch.id = availability.branch_id
   AND branch.organization_id = availability.organization_id
   AND branch.is_active = TRUE
  JOIN public.be_clinic_services service
    ON service.id = availability.service_id
   AND service.organization_id = availability.organization_id
   AND service.is_active = TRUE
   AND service.public_widget_visible = TRUE
   AND service.admin_manual_only = FALSE
  WHERE availability.organization_id = v_org
    AND availability.branch_id = p_branch_id
    AND availability.service_id = p_service_id
    AND availability.is_active = TRUE
  ORDER BY availability.created_at DESC, availability.id DESC
  LIMIT 1;

  IF v_context.organization_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'weekday', source.weekday,
    'startMinute', source.start_minute,
    'endMinute', source.end_minute
  ) ORDER BY source.weekday, source.start_minute), '[]'::jsonb)
  INTO v_working_hours
  FROM (
    SELECT hours.weekday, hours.start_minute, hours.end_minute
    FROM public.be_working_hours hours
    WHERE hours.organization_id = v_org
      AND hours.is_active = TRUE
      AND (hours.specialist_id = v_context.specialist_id OR hours.specialist_id IS NULL)
      AND (hours.branch_id = v_context.branch_id OR hours.branch_id IS NULL)
      AND (v_context.room_id IS NULL OR hours.room_id = v_context.room_id OR hours.room_id IS NULL)
  ) source;

  IF jsonb_array_length(v_working_hours) = 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'weekday', hours.weekday,
      'startMinute', hours.start_minute,
      'endMinute', hours.end_minute
    ) ORDER BY hours.weekday, hours.start_minute), '[]'::jsonb)
    INTO v_working_hours
    FROM public.be_working_hours hours
    WHERE hours.organization_id = v_org
      AND hours.is_active = TRUE
      AND hours.specialist_id IS NULL
      AND hours.branch_id IS NULL
      AND hours.room_id IS NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', day.id,
    'organizationId', day.organization_id,
    'specialistId', day.specialist_id,
    'branchId', day.branch_id,
    'roomId', day.room_id,
    'workDate', day.work_date,
    'startMinute', day.start_minute,
    'endMinute', day.end_minute,
    'breaks', COALESCE(day.breaks, '[]'::jsonb),
    'isClosed', day.is_closed
  ) ORDER BY day.work_date), '[]'::jsonb)
  INTO v_working_days
  FROM public.be_working_days day
  WHERE day.organization_id = v_org
    AND day.specialist_id = v_context.specialist_id
    AND day.work_date BETWEEN v_date_from AND v_date_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'startAt', interval_row.start_at,
    'endAt', interval_row.end_at
  ) ORDER BY interval_row.start_at), '[]'::jsonb)
  INTO v_busy
  FROM (
    SELECT
      appointment.start_at,
      appointment.end_at
        + (COALESCE(appointment_service.buffer_after_minutes, 0) * interval '1 minute') AS end_at
    FROM public.be_appointments appointment
    LEFT JOIN public.be_clinic_services appointment_service
      ON appointment_service.id = appointment.service_id
     AND appointment_service.organization_id = appointment.organization_id
    WHERE appointment.organization_id = v_org
      AND appointment.specialist_id = v_context.specialist_id
      AND appointment.deleted_at IS NULL
      AND appointment.status IN (
        'created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled', 'manual_review_required'
      )
      AND appointment.end_at
          + (COALESCE(appointment_service.buffer_after_minutes, 0) * interval '1 minute')
          >= v_date_from::timestamptz
      AND appointment.start_at <= (v_date_to + 1)::timestamptz
    UNION ALL
    SELECT block.start_at, block.end_at
    FROM public.be_schedule_blocks block
    WHERE block.organization_id = v_org
      AND (block.specialist_id = v_context.specialist_id OR block.specialist_id IS NULL)
      AND block.end_at >= v_date_from::timestamptz
      AND block.start_at <= (v_date_to + 1)::timestamptz
  ) interval_row;

  SELECT COALESCE((rule.config ->> 'minutes')::integer, 0)
  INTO v_buffer_minutes
  FROM public.be_availability_rules rule
  WHERE rule.organization_id = v_org
    AND rule.rule_type = 'buffer_minutes'
    AND rule.is_active = TRUE
    AND (rule.specialist_id = v_context.specialist_id OR rule.specialist_id IS NULL)
  ORDER BY rule.specialist_id IS NULL ASC, rule.updated_at DESC
  LIMIT 1;
  v_buffer_minutes := GREATEST(0, COALESCE(v_buffer_minutes, 0));

  SELECT GREATEST(0, LEAST(168, COALESCE((setting.value_json ->> 'value')::integer, 0)))
  INTO v_min_notice_hours
  FROM public.app_runtime_settings setting
  WHERE setting.key = 'booking_min_notice_hours'
    AND setting.scope = 'admin'
    AND setting.audience = 'server'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;

  SELECT GREATEST(1, LEAST(24, COALESCE((setting.value_json ->> 'value')::integer, 1)))
  INTO v_max_consecutive_slot_hours
  FROM public.app_runtime_settings setting
  WHERE setting.key = 'booking_max_consecutive_slot_hours'
    AND setting.scope = 'admin'
    AND setting.audience = 'server'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'context', jsonb_build_object(
      'organizationId', v_context.organization_id,
      'branchId', v_context.branch_id,
      'specialistId', v_context.specialist_id,
      'serviceId', v_context.service_id,
      'roomId', v_context.room_id,
      'durationMinutes', v_context.duration_minutes,
      'bufferAfterMinutes', COALESCE(v_context.buffer_after_minutes, 0),
      'branchTimezone', v_context.timezone
    ),
    'workingHours', v_working_hours,
    'workingDays', v_working_days,
    'busy', v_busy,
    'bufferMinutes', v_buffer_minutes,
    'minNoticeHours', COALESCE(v_min_notice_hours, 0),
    'maxConsecutiveSlotHours', COALESCE(v_max_consecutive_slot_hours, 1)
  );
END;
$function$;

COMMENT ON FUNCTION app.read_public_booking_slot_snapshot(uuid, uuid, text, text) IS
  'Anonymous public booking slot snapshot for the PUBLISHED organization of the accepted tenant-service context: one canonical branch+service context, schedule, busy intervals and the two booking runtime settings.';

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- Четвёртый корень — поля формы записи. Публичный близнец
-- `app.read_current_patient_booking_form_fields()`; отдаются только поля, помеченные видимыми
-- пациенту, потому что заполняет их посетитель, а не персонал.

CREATE OR REPLACE FUNCTION app.list_public_booking_form_fields()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_fields jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_booking_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'booking.public-form-fields.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.list_public_booking_form_fields()'::regprocedure
  );

  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clinic_public_directory_entries directory
    WHERE directory.organization_id = v_org
      AND directory.is_published = true
  ) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', field.id,
    'organizationId', field.organization_id,
    'fieldKey', field.field_key,
    'fieldType', field.field_type,
    'label', field.label,
    'placeholder', field.placeholder,
    'isRequired', field.is_required,
    'visibleToPatient', field.visible_to_patient,
    'visibleToStaff', field.visible_to_staff,
    'sortOrder', field.sort_order,
    'isActive', field.is_active
  ) ORDER BY field.sort_order, field.field_key), '[]'::jsonb)
  INTO v_fields
  FROM public.be_booking_form_fields field
  WHERE field.organization_id = v_org
    AND field.is_active = true
    AND field.visible_to_patient = true;

  RETURN v_fields;
END;
$function$;

COMMENT ON FUNCTION app.list_public_booking_form_fields() IS
  'Anonymous public booking form fields for the PUBLISHED organization of the accepted tenant-service context: active, patient-visible fields only.';
