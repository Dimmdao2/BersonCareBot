-- BCB-MIGRATION-OWNER: app_object_owner
-- TEMPORARY LOCAL MIGRATION NUMBER 0051
--
-- Публичная запись: половина ЧТЕНИЯ починена миграцией 0047 (четыре корня от
-- `app_seam_public_booking_owner`), половина ЗАПИСИ — мертва. Посетитель теперь видит города,
-- услуги и свободное время, доходит до подтверждения и получает 503 `create_failed`.
--
-- Замер на DEV 19.08 (`bcb_webapp_dev`, слаг `dmitryberson`, порт-контекст):
--
--   POST /api/booking/public/create/confirm  ->  503 {"ok":false,"error":"create_failed"}
--   Error: Failed query: select "id" from "platform_users" where (( SELECT ... user_contacts ... ) = $1 …)
--     at resolveOrCreateTrustedPatientUserByPhone (src/infra/repos/pgPublicBookingUserResolve.ts:29)
--     [cause]: Missing declared webapp port capability: pre_session
--
-- Дальше по пути та же причина повторяется ещё восемь раз (создание записи, ответы формы,
-- контакты, абонемент), и два места — вообще не «нет двери», а ПАЦИЕНТСКИЕ корни, вызванные под
-- организационным принципалом: `app.is_current_patient_self_booking_allowed()`
-- (`modules/patient-booking/canonicalCreate.ts`) и `app.read_current_patient_booking_packages(uuid)`
-- (`modules/memberships/service.ts`).
--
-- РЕШЕНИЕ. Воронка переключается на ПАЦИЕНТСКИЙ принципал в момент идентификации. После
-- `identifyPublicBookingPayer` посетитель уже не аноним: он назвал себя ровно затем, чтобы его
-- записали, — это и есть то, что описывает пациентский принципал. Одиннадцать пациентских корней
-- записи уже существуют и уже проверены (`create_current_patient_booking_pending`,
-- `create_current_patient_booking_appointments`, `save_current_patient_booking_form_answers`,
-- `reserve_current_patient_booking_package`, `record_current_patient_booking_contact` и соседние).
-- Параллельный публичный шов записи был бы второй реализацией тех же правил.
--
-- Не хватает ровно двух вещей, и обе — про ОТНОШЕНИЕ человека с клиникой, а не про запись:
--
--   1. личность. Резолв-или-создание человека по подтверждённому телефону идёт реляционно по
--      `platform_users` из класса `pre_session`, у которого сквозной двери нет и не будет.
--   2. клиент клиники. `identifyPublicBookingPayer` не создаёт строку `org_enrollments`, а
--      `app.create_current_patient_booking_appointments(text)` требует её (`status = 'active'`), и
--      тот же список — единственный канонический список клиентов клиники.
--
-- Решение владельца 19.08 (`docs/_TODO/TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md`), дословно:
-- «КЛИЕНТ — ТОТ У КОГО ЕСТЬ ВИЗИТ ИЛИ НАЗНАЧЕНА ПРОГРАММА ИЛИ ЕСТЬ ПРИГЛАШЕНИЕ ИЛИ ПЕРЕПИСКА ИЛИ
-- ЗАПИСЬ — короче есть аккаунт и какой-то контекст от этой клиники/специалиста». Посетитель,
-- подтвердивший владение телефоном ради записи в конкретную клинику, имеет и аккаунт, и контекст
-- от неё. Значит первая публичная запись СОЗДАЁТ отношение, и создаёт его в момент идентификации —
-- до того, как появится сама запись, потому что запись без клиента база не примет.
--
-- Статус — `active`, а не `invited`. `invited` в этой схеме означает «карточка заведена клиникой,
-- портал ещё не активирован»; `active` ставится, когда человек доказал владение контактом и получил
-- рабочую сессию портала — ровно то, что делает `confirm` (`deps.auth.setSessionFromUser`). Никакого
-- расширения доступа при этом не происходит: сессию этот человек и так получает.
--
-- Ни одной новой роли, ни одного нового гранта рантайм-роли: обе двери — SECURITY DEFINER от
-- существующего шва `app_seam_public_booking_owner`, и ни одна из них не принимает идентификатор
-- человека от вызывающего.

ALTER TABLE public.org_enrollments
  DROP CONSTRAINT IF EXISTS org_enrollments_portal_activation_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Провенанс активации портала перестаёт быть одноимённой константой: до сегодняшнего дня портал
-- активировался единственным способом (погашение приглашения по почте), поэтому проверка
-- перечисляла ровно одно значение. Публичная запись — второй способ, и он записывается своим
-- именем, а не прячется под NULL.
ALTER TABLE public.org_enrollments
  ADD CONSTRAINT org_enrollments_portal_activation_check CHECK (
    (portal_activated_at IS NULL AND portal_activated_via IS NULL)
    OR (portal_activated_at IS NOT NULL
        AND portal_activated_via IN ('patient_invite_email_otp', 'public_booking_phone_otp'))
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Первая дверь — ЛИЧНОСТЬ. Организации здесь нет и быть не может: класс `pre_session` стоит до
-- выбора арендатора, а телефон принадлежит человеку, а не клинике. Дверь возвращает канонический
-- `platform_users.id` и НЕ принимает его — подставить чужой нечем.
--
-- Тело повторяет ровно то, что делал JS (`infra/repos/pgPublicBookingUserResolve.ts`): поиск по
-- ПЕРВИЧНОМУ телефону в `user_contacts` (источник истины уникальности «один телефон = один
-- аккаунт»), отказ при неоднозначности, вставка с `patient_phone_trust_at` только когда владение
-- телефоном доказано на ЭТОМ запросе, и пересборка обоих зеркал (`user_identity`, `user_contacts`).
-- Зеркала обязательны: без строки `user_contacts` следующий заход по тому же телефону не нашёл бы
-- этого человека и создал бы второго.
CREATE OR REPLACE FUNCTION app.resolve_public_booking_client_by_phone(
  p_phone_normalized text,
  p_display_name text,
  p_phone_proven boolean
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_candidates uuid[];
  v_id uuid;
  v_display text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_booking_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'booking.public-client.resolve',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_phone_normalized))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_display_name))::app.port_typed_arg,
      ROW('boolean@1', pg_catalog.boolsend(p_phone_proven))::app.port_typed_arg
    ]),
    'app.resolve_public_booking_client_by_phone(text,text,boolean)'::regprocedure
  );

  -- Формат телефона проверяет сама дверь: вызывающий нормализует, но дверь ему не верит.
  IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN NULL;
  END IF;

  v_display := pg_catalog.btrim(COALESCE(p_display_name, ''));
  IF v_display = '' THEN
    v_display := p_phone_normalized;
  END IF;
  v_display := pg_catalog.left(v_display, 500);

  SELECT pg_catalog.array_agg(candidate.id)
  INTO v_candidates
  FROM (
    SELECT person.id
    FROM public.platform_users AS person
    WHERE person.merged_into_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.user_contacts AS contact
        WHERE contact.platform_user_id = person.id
          AND contact.contact_kind = 'phone'
          AND contact.is_primary = true
          AND contact.value_normalized = p_phone_normalized
      )
    LIMIT 2
  ) AS candidate;

  -- Два живых аккаунта на один телефон — состояние, которое разбирают слиянием, а не догадкой.
  IF pg_catalog.cardinality(v_candidates) > 1 THEN
    RETURN NULL;
  END IF;
  IF pg_catalog.cardinality(v_candidates) = 1 THEN
    RETURN v_candidates[1];
  END IF;

  INSERT INTO public.platform_users (phone_normalized, display_name, role, patient_phone_trust_at)
  VALUES (
    p_phone_normalized,
    v_display,
    'client',
    CASE WHEN p_phone_proven THEN now() ELSE NULL END
  )
  RETURNING id INTO v_id;

  INSERT INTO public.user_identity (
    platform_user_id, first_name, last_name, patronymic, display_name, birth_date, updated_at
  )
  SELECT person.id, person.first_name, person.last_name, person.patronymic,
         COALESCE(person.display_name, ''), person.birth_date, now()
  FROM public.platform_users AS person
  WHERE person.id = v_id
  ON CONFLICT (platform_user_id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    patronymic = EXCLUDED.patronymic,
    display_name = EXCLUDED.display_name,
    birth_date = EXCLUDED.birth_date,
    updated_at = now();

  DELETE FROM public.user_contacts WHERE platform_user_id = v_id;
  INSERT INTO public.user_contacts (
    platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at
  )
  SELECT person.id, 'phone', person.phone_normalized, true, person.patient_phone_trust_at,
         'platform_users', now()
  FROM public.platform_users AS person
  WHERE person.id = v_id AND person.phone_normalized IS NOT NULL;

  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION app.resolve_public_booking_client_by_phone(text, text, boolean) IS
  'Resolve-or-create the canonical platform person for a proven public-booking phone. Takes no person id from the caller and no organization: identity only.';

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Вторая дверь — ОТНОШЕНИЕ. Класс здесь уже `patient`, и человек берётся ИЗ КОНТЕКСТА
-- (`app.current_patient_user_id()`), а не из аргумента. Это не косметика: дверь, принимающая чужой
-- `platform_user_id` из класса `pre_session`, позволила бы анониму записать любого человека в
-- клиенты опубликованной клиники, то есть показать его имя и телефон её персоналу.
--
-- Организация в аргументе — единственное, что вызывающий сообщает, и дверь проверяет её сама:
-- клиника обязана быть ОПУБЛИКОВАНА. Уже выписанный (`discharged`) или архивный (`archived`) клиент
-- обратно не открывается: это отказ, а не тихое воскрешение строки.
CREATE OR REPLACE FUNCTION app.enroll_current_patient_in_public_booking_clinic(
  p_organization_id uuid
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient uuid := app.current_patient_user_id();
  v_status text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_booking_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'booking.public-client.enroll',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg
    ]),
    'app.enroll_current_patient_in_public_booking_clinic(uuid)'::regprocedure
  );

  IF v_patient IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'public booking enrollment context unavailable' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_public_directory_entries AS directory
    WHERE directory.organization_id = p_organization_id
      AND directory.is_published = true
  ) THEN
    RAISE EXCEPTION 'public booking clinic is not published' USING ERRCODE = '42501';
  END IF;

  SELECT enrollment.status
  INTO v_status
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.organization_id = p_organization_id
    AND enrollment.platform_user_id = v_patient;

  IF v_status IS NOT NULL THEN
    IF v_status NOT IN ('invited', 'active') THEN
      RAISE EXCEPTION 'public booking client relationship denied' USING ERRCODE = '42501';
    END IF;
    -- Карточка, заведённая клиникой (`invited`), становится действующей ровно здесь: человек сам
    -- доказал владение контактом и получил сессию портала.
    IF v_status = 'invited' THEN
      UPDATE public.org_enrollments AS enrollment
      SET status = 'active',
          portal_activated_at = COALESCE(enrollment.portal_activated_at, now()),
          portal_activated_via = COALESCE(enrollment.portal_activated_via, 'public_booking_phone_otp')
      WHERE enrollment.organization_id = p_organization_id
        AND enrollment.platform_user_id = v_patient;
      RETURN 'active';
    END IF;
    RETURN v_status;
  END IF;

  INSERT INTO public.org_enrollments (
    organization_id, platform_user_id, status, portal_activated_at, portal_activated_via
  )
  VALUES (p_organization_id, v_patient, 'active', now(), 'public_booking_phone_otp')
  ON CONFLICT (organization_id, platform_user_id) DO NOTHING;

  SELECT enrollment.status
  INTO v_status
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.organization_id = p_organization_id
    AND enrollment.platform_user_id = v_patient;

  IF v_status IS NULL OR v_status NOT IN ('invited', 'active') THEN
    RAISE EXCEPTION 'public booking client relationship denied' USING ERRCODE = '42501';
  END IF;
  RETURN v_status;
END;
$function$;

COMMENT ON FUNCTION app.enroll_current_patient_in_public_booking_clinic(uuid) IS
  'Make the identified public-booking visitor a client of a PUBLISHED clinic. The person comes from the accepted patient context, never from the caller; discharged/archived relationships stay denied.';

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Третья правка — ПРОВЕНАНС записи. Пациентский корень создания приёма принимал ровно один
-- `source` — `'native'` — и вписывал его литералом. Публичная запись после переключения на
-- пациентский принципал идёт через этот же корень, и на ней он отказывал: «invalid current patient
-- appointment payload» (22023) на `source = 'public_widget'`.
--
-- `public_widget` — не новое значение: оно уже перечислено в `be_appointments_source_check` и до
-- сегодняшнего дня не встречалось в данных ни разу (замер на DEV: imported 380, native 24,
-- admin_manual 2, public_widget 0), потому что путь, который его писал, был мёртв. Подставить
-- вместо него `'native'` значило бы стереть единственное различие между записью из кабинета и
-- записью с публичной страницы — то самое, ради чего колонка существует.
--
-- Список остаётся закрытым: два значения, оба проверяются, вписывается ровно проверенное.

CREATE OR REPLACE FUNCTION app.create_current_patient_booking_appointments(p_inputs_json text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  p_inputs jsonb := p_inputs_json::jsonb;
  v_input jsonb;
  v_row public.be_appointments%ROWTYPE;
  v_results jsonb := '[]'::jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_duration integer;
  v_status text;
  v_branch uuid;
  v_room uuid;
  v_specialist uuid;
  v_service uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.patient-appointments.create', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.create_current_patient_booking_appointments(text)'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR jsonb_typeof(p_inputs) <> 'array'
     OR jsonb_array_length(p_inputs) < 1 OR jsonb_array_length(p_inputs) > 8
     OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments enrollment
       WHERE enrollment.organization_id = v_org
         AND enrollment.platform_user_id = v_patient
         AND enrollment.status = 'active'
     ) THEN
    RAISE EXCEPTION 'patient appointment context unavailable' USING ERRCODE = '42501';
  END IF;

  FOR v_input IN SELECT value FROM jsonb_array_elements(p_inputs)
  LOOP
    v_start := NULLIF(v_input ->> 'startAt', '')::timestamptz;
    v_end := NULLIF(v_input ->> 'endAt', '')::timestamptz;
    v_duration := NULLIF(v_input ->> 'durationMinutes', '')::integer;
    v_status := v_input ->> 'status';
    v_branch := NULLIF(v_input ->> 'branchId', '')::uuid;
    v_room := NULLIF(v_input ->> 'roomId', '')::uuid;
    v_specialist := NULLIF(v_input ->> 'specialistId', '')::uuid;
    v_service := NULLIF(v_input ->> 'serviceId', '')::uuid;
    IF NULLIF(v_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
       OR NULLIF(v_input ->> 'platformUserId', '')::uuid IS DISTINCT FROM v_patient
       OR v_input ->> 'source' NOT IN ('native', 'public_widget')
       OR v_status NOT IN ('confirmed', 'awaiting_payment')
       OR v_start IS NULL OR v_end IS NULL OR v_end <= v_start
       OR v_duration IS NULL OR v_duration < 1
       OR extract(epoch FROM (v_end - v_start))::integer <> v_duration * 60
       OR v_branch IS NULL OR v_specialist IS NULL OR v_service IS NULL THEN
      RAISE EXCEPTION 'invalid current patient appointment payload' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
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
        AND availability.branch_id = v_branch
        AND availability.specialist_id = v_specialist
        AND availability.service_id = v_service
        AND availability.room_id IS NOT DISTINCT FROM v_room
        AND availability.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'patient appointment catalog mismatch' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.patient_specialist_links (
      organization_id, patient_user_id, specialist_id, status, created_via
    ) VALUES (v_org, v_patient, v_specialist, 'active', 'first_appointment')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.be_appointments (
      organization_id, branch_id, room_id, specialist_id, service_id, platform_user_id,
      start_at, end_at, duration_minutes, chain_id, chain_position, source, status,
      original_start_at, reschedule_count, phone_normalized, attribution_json,
      appointment_reminder_allowed_preset_ids, appointment_reminder_preset_id,
      appointment_reminder_selection_source, created_at, updated_at
    ) VALUES (
      v_org, v_branch, v_room, v_specialist, v_service, v_patient,
      v_start, v_end, v_duration, NULLIF(v_input ->> 'chainId', '')::uuid,
      NULLIF(v_input ->> 'chainPosition', '')::integer, v_input ->> 'source', v_status,
      v_start, 0, NULLIF(v_input ->> 'phoneNormalized', ''),
      COALESCE(v_input -> 'attributionJson', '{}'::jsonb),
      COALESCE(v_input -> 'appointmentReminderAllowedPresetIds', '[]'::jsonb),
      NULLIF(v_input ->> 'appointmentReminderPresetId', ''),
      COALESCE(NULLIF(v_input ->> 'appointmentReminderSelectionSource', ''), 'specialist_default'),
      now(), now()
    ) RETURNING * INTO v_row;

    INSERT INTO public.be_appointment_history_events (
      organization_id, appointment_id, event_type, actor_id, payload, occurred_at
    ) VALUES (v_org, v_row.id, 'created', v_patient, jsonb_build_object('status', v_status), now());
    INSERT INTO public.be_patient_timeline_events (
      organization_id, platform_user_id, domain, event_type, linked_object_type,
      linked_object_id, payload, occurred_at
    ) VALUES (
      v_org, v_patient, 'appointment', 'appointment_created', 'appointment', v_row.id::text,
      jsonb_build_object('status', v_status), now()
    );
    v_results := v_results || jsonb_build_array(to_jsonb(v_row));
  END LOOP;
  RETURN v_results;
END
$function$;
