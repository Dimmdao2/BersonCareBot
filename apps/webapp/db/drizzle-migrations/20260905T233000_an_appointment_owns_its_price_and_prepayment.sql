-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.expire_due_booking_prepayments(integer)') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'be_appointments' AND column_name = 'prepayment_required_minor') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'be_appointments' AND column_name = 'payment_deadline_at')
--
-- PAY-APPT-01…12 / PAY-APPT-18 / PAY-APPT-19 (owner acceptance 2026-09-04, раздел K).
--
-- До этого шага стоимость записи жила ТОЛЬКО в проекции `patient_bookings.price_minor_snapshot`,
-- условие предоплаты пересчитывалось из каталога при каждом чтении, а срока оплаты не
-- существовало вовсе. Следствия для человека: сохранённая врачом цена уезжала за прайсом услуги
-- (`ensureStaffBookingProjection` перечитывал `service.price_minor`), запись врача не умела
-- требовать предоплату вообще, а неоплаченное ожидание держало слот бесконечно.
--
-- Запись становится владельцем своего финансового снимка: цена, условие/сумма предоплаты, срок
-- оплаты и фактически зачисленная сумма — колонки самой записи. Второй платёжной модели рядом не
-- появляется: значения `prepayment_mode` те же, что в `be_prepayment_policies`, а зачисление
-- по-прежнему делает существующий корень вебхука.
--
-- Деньги — целочисленные минорные единицы; процент — базисные пункты. Ни одного `numeric`/`float`.
--
-- Права целиком принадлежат `deploy/postgres/privileges` (§1 «Миграция не выдаёт и не отзывает
-- права»); здесь только объекты.

ALTER TABLE public.be_appointments
  ADD COLUMN IF NOT EXISTS price_minor integer,
  ADD COLUMN IF NOT EXISTS price_currency text NOT NULL DEFAULT 'RUB',
  ADD COLUMN IF NOT EXISTS prepayment_mode text NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS prepayment_percent_bps integer,
  ADD COLUMN IF NOT EXISTS prepayment_amount_minor integer,
  ADD COLUMN IF NOT EXISTS prepayment_required_minor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prepayment_paid_minor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_deadline_at timestamptz;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.be_appointments
  DROP CONSTRAINT IF EXISTS be_appointments_prepayment_mode_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.be_appointments
  ADD CONSTRAINT be_appointments_prepayment_mode_check CHECK (
    prepayment_mode = ANY (ARRAY['disabled'::text, 'fixed_minor'::text, 'percent'::text, 'full_price'::text])
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.be_appointments
  DROP CONSTRAINT IF EXISTS be_appointments_money_nonnegative_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Отрицательных денег не бывает, а процент живёт в базисных пунктах: неверная настройка обязана
-- отказать на записи, а не превратиться в неверную сумму к оплате.
ALTER TABLE public.be_appointments
  ADD CONSTRAINT be_appointments_money_nonnegative_check CHECK (
    (price_minor IS NULL OR price_minor >= 0)
    AND (prepayment_amount_minor IS NULL OR prepayment_amount_minor >= 0)
    AND (prepayment_percent_bps IS NULL OR (prepayment_percent_bps >= 0 AND prepayment_percent_bps <= 10000))
    AND prepayment_required_minor >= 0
    AND prepayment_paid_minor >= 0
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Тик истечения читает ровно одну горячую выборку: ожидающие оплаты записи с наступившим сроком.
CREATE INDEX IF NOT EXISTS idx_be_appointments_payment_deadline
  ON public.be_appointments USING btree (payment_deadline_at)
  WHERE status = 'awaiting_payment' AND payment_deadline_at IS NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- Совместимость уже существующих записей: снимок цены переносится из исторической проекции, из
-- которой карточка его сегодня и читает. Записи без проекции остаются с `price_minor IS NULL` —
-- читатели трактуют NULL как «снимка нет» и продолжают показывать прежнее значение проекции.
-- Идемпотентно: пишет только там, где снимка ещё нет.
UPDATE public.be_appointments AS appointment
   SET price_minor = booking.price_minor_snapshot
  FROM public.patient_bookings AS booking
 WHERE booking.canonical_appointment_id = appointment.id
   AND appointment.price_minor IS NULL
   AND booking.price_minor_snapshot IS NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- Фактически зачисленные деньги уже существуют в журнале платежей; без переноса замок на
-- переписывание финансовых значений («после оплаты не переписываем») не увидел бы прошлые оплаты.
-- Идемпотентно: пишет только нулевые значения и только там, где платёж действительно проведён.
UPDATE public.be_appointments AS appointment
   SET prepayment_paid_minor = payment.amount_minor
  FROM public.be_payments AS payment
 WHERE payment.id::text = appointment.payment_ref
   AND payment.organization_id = appointment.organization_id
   AND payment.status IN ('captured', 'succeeded')
   AND appointment.prepayment_paid_minor = 0
   AND (
     SELECT pg_catalog.count(*)
       FROM public.be_appointments AS sibling
      WHERE sibling.payment_ref = appointment.payment_ref
        AND sibling.organization_id = appointment.organization_id
   ) = 1;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- PAY-APPT-08: платформенное умолчание срока ожидания предоплаты — 20 минут. Клиника, которая
-- ничего не настраивала (в том числе только что созданная), работает по нему; собственная строка
-- клиники, как и у соседних настроек записи, побеждает. Существующие значения не трогаем.
INSERT INTO public.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
VALUES (
  'booking_prepayment_wait_minutes', 'admin', NULL,
  pg_catalog.jsonb_build_object('value', 20), pg_catalog.now(), NULL
)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- PAY-APPT-04: пациентская дверь записи берёт ЦЕНУ ИЗ КАТАЛОГА, а не из полезной нагрузки —
-- подставить свою стоимость нечем по построению. Условие и сумма предоплаты приходят из
-- единственного доменного расчёта вебаппа, но дверь всё равно не верит вызывающему: ожидание
-- оплаты без положительного требования и без срока она не принимает.
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
  v_price_minor integer;
  v_prepayment_mode text;
  v_prepayment_percent_bps integer;
  v_prepayment_amount_minor integer;
  v_prepayment_required_minor integer;
  v_payment_deadline_at timestamptz;
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
    v_prepayment_mode := COALESCE(NULLIF(v_input ->> 'prepaymentMode', ''), 'disabled');
    v_prepayment_percent_bps := NULLIF(v_input ->> 'prepaymentPercentBps', '')::integer;
    v_prepayment_amount_minor := NULLIF(v_input ->> 'prepaymentAmountMinor', '')::integer;
    v_prepayment_required_minor := COALESCE(NULLIF(v_input ->> 'prepaymentRequiredMinor', '')::integer, 0);
    v_payment_deadline_at := NULLIF(v_input ->> 'paymentDeadlineAt', '')::timestamptz;
    IF NULLIF(v_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
       OR NULLIF(v_input ->> 'platformUserId', '')::uuid IS DISTINCT FROM v_patient
       OR v_input ->> 'source' NOT IN ('native', 'public_widget')
       OR v_status NOT IN ('confirmed', 'awaiting_payment')
       OR v_start IS NULL OR v_end IS NULL OR v_end <= v_start
       OR v_duration IS NULL OR v_duration < 1
       OR extract(epoch FROM (v_end - v_start))::integer <> v_duration * 60
       OR v_branch IS NULL OR v_specialist IS NULL OR v_service IS NULL
       OR v_prepayment_mode NOT IN ('disabled', 'fixed_minor', 'percent', 'full_price')
       OR v_prepayment_required_minor < 0
       OR (v_prepayment_percent_bps IS NOT NULL
           AND (v_prepayment_percent_bps < 0 OR v_prepayment_percent_bps > 10000))
       OR (v_prepayment_amount_minor IS NOT NULL AND v_prepayment_amount_minor < 0) THEN
      RAISE EXCEPTION 'invalid current patient appointment payload' USING ERRCODE = '22023';
    END IF;
    -- Ожидание оплаты без положительного требования и точного срока — состояние, из которого
    -- слот не освободится никогда. Такую запись дверь не создаёт.
    IF v_status = 'awaiting_payment'
       AND (v_prepayment_required_minor <= 0 OR v_payment_deadline_at IS NULL) THEN
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

    -- PAY-APPT-04: цена — факт каталога клиники. Аргументом её не передают, поэтому и подменить
    -- нечем; переопределение цены существует только у врача и только на его собственном пути.
    SELECT service.price_minor
      INTO v_price_minor
      FROM public.be_clinic_services service
     WHERE service.id = v_service
       AND service.organization_id = v_org;

    -- Требование не может превышать стоимость визита.
    IF v_price_minor IS NOT NULL AND v_prepayment_required_minor > v_price_minor THEN
      RAISE EXCEPTION 'invalid current patient appointment payload' USING ERRCODE = '22023';
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
      appointment_reminder_selection_source,
      price_minor, price_currency, prepayment_mode, prepayment_percent_bps,
      prepayment_amount_minor, prepayment_required_minor, prepayment_paid_minor,
      payment_deadline_at,
      created_at, updated_at
    ) VALUES (
      v_org, v_branch, v_room, v_specialist, v_service, v_patient,
      v_start, v_end, v_duration, NULLIF(v_input ->> 'chainId', '')::uuid,
      NULLIF(v_input ->> 'chainPosition', '')::integer, v_input ->> 'source', v_status,
      v_start, 0, NULLIF(v_input ->> 'phoneNormalized', ''),
      COALESCE(v_input -> 'attributionJson', '{}'::jsonb),
      COALESCE(v_input -> 'appointmentReminderAllowedPresetIds', '[]'::jsonb),
      NULLIF(v_input ->> 'appointmentReminderPresetId', ''),
      COALESCE(NULLIF(v_input ->> 'appointmentReminderSelectionSource', ''), 'specialist_default'),
      v_price_minor,
      COALESCE(NULLIF(v_input ->> 'priceCurrency', ''), 'RUB'),
      v_prepayment_mode, v_prepayment_percent_bps, v_prepayment_amount_minor,
      v_prepayment_required_minor, 0, v_payment_deadline_at,
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
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- PAY-APPT-08: пациентская половина записи считает свой срок оплаты тем же доменным расчётом,
-- что и врачебная, поэтому ей нужен тот же настроечный ключ. Список ключей остаётся закрытым.
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_runtime_integer(p_key text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_value text;
  v_result integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.patient-runtime-integer.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_current_patient_booking_runtime_integer(text)'::regprocedure);

  IF v_org IS NULL OR v_patient IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_key NOT IN ('booking_min_notice_hours', 'booking_max_consecutive_slot_hours', 'booking_prepayment_wait_minutes') THEN
    RAISE EXCEPTION 'unsupported patient booking runtime integer: %', p_key
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT setting.value_json ->> 'value'
  INTO v_value
  FROM public.system_settings setting
  WHERE setting.key = p_key
    AND setting.scope = 'admin'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;

  -- Срок ожидания предоплаты — единственный ключ с продуктовым умолчанием: клиника, которая его
  -- не трогала, работает по 20 минутам, а не остаётся без записи вовсе.
  IF v_value IS NULL AND p_key = 'booking_prepayment_wait_minutes' THEN
    RETURN 20;
  END IF;
  IF v_value IS NULL OR v_value !~ '^\d+$' THEN
    RAISE EXCEPTION 'patient booking runtime integer is unavailable: %', p_key
      USING ERRCODE = '22023';
  END IF;
  v_result := v_value::integer;
  IF (p_key = 'booking_min_notice_hours' AND (v_result < 0 OR v_result > 168))
     OR (p_key = 'booking_max_consecutive_slot_hours' AND (v_result < 1 OR v_result > 24))
     OR (p_key = 'booking_prepayment_wait_minutes' AND (v_result < 1 OR v_result > 525600)) THEN
    RAISE EXCEPTION 'patient booking runtime integer is out of range: %', p_key
      USING ERRCODE = '22023';
  END IF;
  RETURN v_result;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- PAY-APPT-10: тот же самый корень проведения вебхука, что и раньше, — второй платёжной двери
-- рядом не появляется. Добавлено ровно одно: успешный платёж зачисляется на запись
-- (`prepayment_paid_minor`), потому что именно этот факт держит замок «после состоявшихся денег
-- финансовые значения не переписываются».
--
-- Идемпотентность зачисления сделана сравнением-и-записью на самой строке записи: сумма
-- прибавляется только когда `payment_ref` этой записи ещё не указывает на этот платёж. Повтор
-- уведомления провайдера (и любой второй `payment.succeeded` по тому же намерению) прибавляет
-- ноль, а не вторую сумму.
CREATE OR REPLACE FUNCTION app.settle_booking_payment_webhook_event(
  p_provider_id text,
  p_idempotency_key text,
  p_event_type text,
  p_intent_ref text,
  p_payload_json text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_payload jsonb;
  v_intent_ref text;
  v_event_id uuid;
  v_event_processed_at timestamptz;
  v_inserted boolean := false;
  v_payload_intent text;
  v_intent_id uuid;
  v_intent_appointment_id uuid;
  v_intent_platform_user_id uuid;
  v_intent_provider_id text;
  v_intent_amount_minor integer;
  v_intent_currency text;
  v_intent_purpose text;
  v_intent_product_ref text;
  v_payment_id uuid;
  v_chain_id uuid;
  v_appointment_id uuid;
  v_appointment_status text;
  v_appointment_user_id uuid;
  v_appointment_count integer;
  v_share_minor integer;
  v_confirmed text[] := ARRAY[]::text[];
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'booking-payment.webhook.settle',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg
    ]),
    'app.settle_booking_payment_webhook_event(text,text,text,text,text)'::regprocedure
  );

  -- The tenant is the accepted context, never an argument: without one there is no clinic to settle
  -- inside, and a silent NULL scope would settle across every clinic at once.
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'booking_payment_webhook_settle_principal_required' USING ERRCODE = '42501';
  END IF;

  IF p_provider_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_event_type IS NULL
     OR pg_catalog.btrim(p_provider_id) = ''
     OR pg_catalog.btrim(p_idempotency_key) = ''
     OR pg_catalog.btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'booking_payment_webhook_event_incomplete' USING ERRCODE = '22023';
  END IF;

  v_payload := COALESCE(p_payload_json::jsonb, '{}'::jsonb);
  IF pg_catalog.jsonb_typeof(v_payload) <> 'object' THEN
    v_payload := '{}'::jsonb;
  END IF;
  v_intent_ref := NULLIF(pg_catalog.btrim(COALESCE(p_intent_ref, '')), '');

  -- The provider event row IS the idempotency record: its unique key is (provider, key, type), so a
  -- retry of the same notification cannot insert a second one.
  INSERT INTO public.be_payment_provider_events AS event (
    organization_id, provider_id, idempotency_key, event_type, intent_ref, payload_json
  )
  VALUES (v_org, p_provider_id, p_idempotency_key, p_event_type, v_intent_ref, v_payload)
  ON CONFLICT (provider_id, idempotency_key, event_type) DO NOTHING
  RETURNING event.id INTO v_event_id;

  IF v_event_id IS NOT NULL THEN
    v_inserted := true;
  ELSE
    SELECT event.id, event.processed_at
      INTO v_event_id, v_event_processed_at
      FROM public.be_payment_provider_events AS event
     WHERE event.provider_id = p_provider_id
       AND event.idempotency_key = p_idempotency_key
       AND event.event_type = p_event_type
       AND event.organization_id = v_org;

    -- The lifecycle key is global, the settlement is not: an event already recorded for ANOTHER
    -- clinic is not this callback's to settle, and must not be reported as handled here.
    IF v_event_id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('outcome', 'not_found', 'duplicate', true);
    END IF;
    IF v_event_processed_at IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object('outcome', 'already_processed', 'duplicate', true);
    END IF;
  END IF;

  -- Only a confirmed success moves money in our journal. Anything else is recorded and acknowledged
  -- so the provider stops retrying, exactly as the previous code did.
  IF p_event_type <> 'payment.succeeded' THEN
    UPDATE public.be_payment_provider_events AS event
       SET processed_at = v_now
     WHERE event.id = v_event_id
       AND event.organization_id = v_org
       AND event.processed_at IS NULL;
    RETURN pg_catalog.jsonb_build_object('outcome', 'recorded', 'duplicate', NOT v_inserted);
  END IF;

  v_payload_intent := NULLIF(pg_catalog.btrim(COALESCE(v_payload ->> 'intentId', '')), '');
  IF v_payload_intent IS NOT NULL
     AND v_payload_intent ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    SELECT intent.id, intent.appointment_id, intent.platform_user_id, intent.provider_id,
           intent.amount_minor, intent.currency, intent.purpose, intent.product_ref
      INTO v_intent_id, v_intent_appointment_id, v_intent_platform_user_id, v_intent_provider_id,
           v_intent_amount_minor, v_intent_currency, v_intent_purpose, v_intent_product_ref
      FROM public.be_payment_intents AS intent
     WHERE intent.id = v_payload_intent::uuid
       AND intent.organization_id = v_org;
  END IF;

  IF v_intent_id IS NULL AND v_intent_ref IS NOT NULL THEN
    SELECT intent.id, intent.appointment_id, intent.platform_user_id, intent.provider_id,
           intent.amount_minor, intent.currency, intent.purpose, intent.product_ref
      INTO v_intent_id, v_intent_appointment_id, v_intent_platform_user_id, v_intent_provider_id,
           v_intent_amount_minor, v_intent_currency, v_intent_purpose, v_intent_product_ref
      FROM public.be_payment_intents AS intent
     WHERE intent.organization_id = v_org
       AND intent.provider_intent_ref = v_intent_ref
     ORDER BY intent.created_at DESC, intent.id DESC
     LIMIT 1;
  END IF;

  IF v_intent_id IS NULL THEN
    UPDATE public.be_payment_provider_events AS event
       SET processed_at = v_now
     WHERE event.id = v_event_id
       AND event.organization_id = v_org
       AND event.processed_at IS NULL;
    RETURN pg_catalog.jsonb_build_object('outcome', 'intent_not_found', 'duplicate', NOT v_inserted);
  END IF;

  -- Compare-and-set, not read-then-write: two copies of the same notification both reach this
  -- statement and only the one that finds the intent unsettled writes.
  UPDATE public.be_payment_intents AS intent
     SET status = 'succeeded', updated_at = v_now
   WHERE intent.id = v_intent_id
     AND intent.organization_id = v_org
     AND intent.status <> 'succeeded';

  INSERT INTO public.be_payments AS payment (
    organization_id, payment_intent_id, appointment_id, platform_user_id, provider_id,
    amount_minor, currency, status, purpose, captured_at, created_at
  )
  VALUES (v_org, v_intent_id, v_intent_appointment_id, v_intent_platform_user_id, v_intent_provider_id,
          v_intent_amount_minor, v_intent_currency, 'captured', v_intent_purpose, v_now, v_now)
  ON CONFLICT (payment_intent_id) DO NOTHING
  RETURNING payment.id INTO v_payment_id;

  IF v_payment_id IS NULL THEN
    SELECT payment.id
      INTO v_payment_id
      FROM public.be_payments AS payment
     WHERE payment.payment_intent_id = v_intent_id
       AND payment.organization_id = v_org;
  END IF;
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'booking_payment_webhook_payment_persist_failed' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.be_payment_history_events (
    organization_id, appointment_id, platform_user_id, payment_id, event_type,
    amount_minor, currency, provider_id, status, purpose
  )
  VALUES (v_org, v_intent_appointment_id, v_intent_platform_user_id, v_payment_id, 'payment_captured',
          v_intent_amount_minor, v_intent_currency, v_intent_provider_id, 'captured', v_intent_purpose)
  ON CONFLICT DO NOTHING;

  IF v_intent_appointment_id IS NOT NULL THEN
    SELECT appointment.chain_id
      INTO v_chain_id
      FROM public.be_appointments AS appointment
     WHERE appointment.id = v_intent_appointment_id
       AND appointment.organization_id = v_org;

    -- Доля одной записи в платеже, покрывающем цепочку слотов, — то же правило, что и у
    -- читателей карточки (`splitAppointmentPaymentAmountMinor`): делим только нацело. Неделимую
    -- сумму зачисляем целиком на запись намерения, чтобы не выдумывать копейки.
    SELECT pg_catalog.count(*)::integer
      INTO v_appointment_count
      FROM public.be_appointments AS appointment
     WHERE appointment.organization_id = v_org
       AND (appointment.id = v_intent_appointment_id
            OR (v_chain_id IS NOT NULL AND appointment.chain_id = v_chain_id));
    IF v_appointment_count IS NOT NULL AND v_appointment_count > 0
       AND v_intent_amount_minor % v_appointment_count = 0 THEN
      v_share_minor := v_intent_amount_minor / v_appointment_count;
    ELSE
      v_share_minor := NULL;
    END IF;

    -- A patient can book several consecutive slots under one chain and pay for them once; the
    -- payment reference belongs to every slot of that chain, as it did before.
    FOR v_appointment_id, v_appointment_status, v_appointment_user_id IN
      SELECT appointment.id, appointment.status, appointment.platform_user_id
        FROM public.be_appointments AS appointment
       WHERE appointment.organization_id = v_org
         AND (appointment.id = v_intent_appointment_id
              OR (v_chain_id IS NOT NULL AND appointment.chain_id = v_chain_id))
       ORDER BY appointment.id
    LOOP
      UPDATE public.be_appointments AS appointment
         SET payment_ref = v_payment_id::text,
             prepayment_paid_minor = appointment.prepayment_paid_minor
               + CASE
                   WHEN appointment.payment_ref IS DISTINCT FROM v_payment_id::text
                        AND v_intent_purpose = 'appointment_prepayment'
                   THEN COALESCE(
                          v_share_minor,
                          CASE WHEN appointment.id = v_intent_appointment_id
                               THEN v_intent_amount_minor ELSE 0 END)
                   ELSE 0
                 END,
             updated_at = v_now
       WHERE appointment.id = v_appointment_id
         AND appointment.organization_id = v_org;

      IF v_appointment_status = 'awaiting_payment' THEN
        UPDATE public.be_appointments AS appointment
           SET status = 'paid', updated_at = v_now
         WHERE appointment.id = v_appointment_id
           AND appointment.organization_id = v_org;
        INSERT INTO public.be_appointment_history_events (
          organization_id, appointment_id, event_type, payload, occurred_at
        )
        VALUES (v_org, v_appointment_id, 'status_changed',
                pg_catalog.jsonb_build_object('fromStatus', 'awaiting_payment', 'toStatus', 'paid',
                                              'source', 'payment_capture', 'paymentId', v_payment_id::text),
                v_now);
        IF v_appointment_user_id IS NOT NULL THEN
          INSERT INTO public.be_patient_timeline_events (
            organization_id, platform_user_id, domain, event_type,
            linked_object_type, linked_object_id, payload, occurred_at
          )
          VALUES (v_org, v_appointment_user_id, 'appointment', 'appointment_status_changed',
                  'appointment', v_appointment_id::text,
                  pg_catalog.jsonb_build_object('fromStatus', 'awaiting_payment', 'toStatus', 'paid',
                                                'source', 'payment_capture', 'paymentId', v_payment_id::text),
                  v_now);
        END IF;
        v_appointment_status := 'paid';
      END IF;

      IF v_appointment_status = 'paid' THEN
        UPDATE public.be_appointments AS appointment
           SET status = 'confirmed', updated_at = v_now
         WHERE appointment.id = v_appointment_id
           AND appointment.organization_id = v_org;
        INSERT INTO public.be_appointment_history_events (
          organization_id, appointment_id, event_type, payload, occurred_at
        )
        VALUES (v_org, v_appointment_id, 'status_changed',
                pg_catalog.jsonb_build_object('fromStatus', 'paid', 'toStatus', 'confirmed',
                                              'source', 'payment_confirmed', 'paymentId', v_payment_id::text),
                v_now);
        IF v_appointment_user_id IS NOT NULL THEN
          INSERT INTO public.be_patient_timeline_events (
            organization_id, platform_user_id, domain, event_type,
            linked_object_type, linked_object_id, payload, occurred_at
          )
          VALUES (v_org, v_appointment_user_id, 'appointment', 'appointment_status_changed',
                  'appointment', v_appointment_id::text,
                  pg_catalog.jsonb_build_object('fromStatus', 'paid', 'toStatus', 'confirmed',
                                                'source', 'payment_confirmed', 'paymentId', v_payment_id::text),
                  v_now);
        END IF;
      END IF;

      v_confirmed := v_confirmed || v_appointment_id::text;
    END LOOP;
  END IF;

  UPDATE public.be_payment_provider_events AS event
     SET processed_at = v_now
   WHERE event.id = v_event_id
     AND event.organization_id = v_org
     AND event.processed_at IS NULL;

  RETURN pg_catalog.jsonb_build_object(
    'outcome', 'captured',
    'duplicate', NOT v_inserted,
    'paymentId', v_payment_id::text,
    'platformUserId', v_intent_platform_user_id::text,
    'productRef', v_intent_product_ref,
    'confirmedAppointmentIds', pg_catalog.to_jsonb(v_confirmed)
  );
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- PAY-APPT-11: просроченное ожидание предоплаты перестаёт занимать слот.
--
-- Работа МЕЖАРЕНДНАЯ: заранее неизвестно, у какой клиники сегодня истёк срок, а машинный тик
-- вебаппа входит без арендатора (`app.current_org_id()` пуст), поэтому реляционного пути к
-- `be_appointments` у него нет вовсе. Отсюда собственный корень у ТОГО ЖЕ шва, что уже проводит
-- предоплату записи, — второй платёжной модели рядом не заводится.
--
-- Гонка «оплата пришла ровно на границе срока» закрыта конструкцией, а не порядком вызовов:
-- отбор берёт строки `FOR UPDATE SKIP LOCKED`, а сам UPDATE ПОВТОРНО проверяет
-- `status = 'awaiting_payment' AND prepayment_paid_minor = 0 AND payment_ref IS NULL`. В
-- READ COMMITTED это условие перепроверяется на новой версии строки после снятия блокировки, то
-- есть оплаченная на границе запись из-под истечения выпадает, а не переписывается.
--
-- Статус — существующий `cancelled_by_specialist`: он выведен из
-- `be_appointments_specialist_no_overlap`, поэтому слот освобождается самим переходом. Причина
-- («истёк срок предоплаты») живёт в payload события истории — там же, где живёт причина любой
-- другой отмены, и читается одним источником.
CREATE OR REPLACE FUNCTION app.expire_due_booking_prepayments(p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_limit integer := pg_catalog.least(pg_catalog.greatest(COALESCE(p_limit, 50), 1), 500);
  v_expired text[] := ARRAY[]::text[];
  v_appointment_id uuid;
  v_organization_id uuid;
  v_platform_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'booking-payment.prepayment.expire',
    app.hash_port_typed_args(ARRAY[
      ROW('integer@1', pg_catalog.int4send($1))::app.port_typed_arg
    ]),
    'app.expire_due_booking_prepayments(integer)'::regprocedure
  );

  FOR v_appointment_id, v_organization_id, v_platform_user_id IN
    UPDATE public.be_appointments AS appointment
       SET status = 'cancelled_by_specialist',
           payment_deadline_at = NULL,
           updated_at = v_now
     WHERE appointment.id IN (
       SELECT candidate.id
         FROM public.be_appointments AS candidate
        WHERE candidate.status = 'awaiting_payment'
          AND candidate.payment_deadline_at IS NOT NULL
          AND candidate.payment_deadline_at <= v_now
          AND candidate.deleted_at IS NULL
        ORDER BY candidate.payment_deadline_at
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
     )
       AND appointment.status = 'awaiting_payment'
       AND appointment.prepayment_paid_minor = 0
       AND appointment.payment_ref IS NULL
    RETURNING appointment.id, appointment.organization_id, appointment.platform_user_id
  LOOP
    INSERT INTO public.be_appointment_history_events (
      organization_id, appointment_id, event_type, payload, occurred_at
    )
    VALUES (v_organization_id, v_appointment_id, 'status_changed',
            pg_catalog.jsonb_build_object('fromStatus', 'awaiting_payment',
                                          'toStatus', 'cancelled_by_specialist',
                                          'source', 'prepayment_expired'),
            v_now);
    IF v_platform_user_id IS NOT NULL THEN
      INSERT INTO public.be_patient_timeline_events (
        organization_id, platform_user_id, domain, event_type,
        linked_object_type, linked_object_id, payload, occurred_at
      )
      VALUES (v_organization_id, v_platform_user_id, 'appointment', 'appointment_status_changed',
              'appointment', v_appointment_id::text,
              pg_catalog.jsonb_build_object('fromStatus', 'awaiting_payment',
                                            'toStatus', 'cancelled_by_specialist',
                                            'source', 'prepayment_expired'),
              v_now);
    END IF;
    v_expired := v_expired || v_appointment_id::text;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'expired', pg_catalog.cardinality(v_expired),
    'appointmentIds', pg_catalog.to_jsonb(v_expired)
  );
END
$function$;
