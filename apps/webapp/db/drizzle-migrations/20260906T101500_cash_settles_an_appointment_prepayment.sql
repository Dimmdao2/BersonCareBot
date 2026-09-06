-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.settle_appointment_cash_prepayment(text)') IS NOT NULL AND pg_catalog.pg_get_functiondef(to_regprocedure('app.apply_current_patient_booking_reschedule(text)')) LIKE '%prepayment_required_minor%'
--
-- PAY-APPT-11 / PAY-APPT-12 (owner acceptance 2026-09-04, раздел K): два стыка нового состояния
-- `awaiting_payment` с уже существующими путями.
--
-- ПЕРВЫЙ. Пациентский перенос завершал запись жёстким `status = 'confirmed'`. Для записи, ожидающей
-- предоплаты, это молчаливое подтверждение неоплаченного: тик истечения отбирает строки по
-- `status = 'awaiting_payment'` и подтверждённую больше не видит — слот навсегда держит
-- неоплаченная запись. Правило то же, что у врачебного переноса
-- (`appointmentStatusAfterReschedule` в `modules/payments/appointmentFinancialSnapshot.ts`):
-- ожидающая с непокрытым требованием возвращается в ожидание, любая другая — в `confirmed`.
--
-- Прав функция не трогает: `status` уже объявлен в её UPDATE-поверхности, финансовые колонки она
-- по-прежнему только читает.
CREATE OR REPLACE FUNCTION app.apply_current_patient_booking_reschedule(p_input_json text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  p_input jsonb := p_input_json::jsonb;
  v_id uuid := NULLIF(p_input ->> 'appointmentId', '')::uuid;
  v_start timestamptz := NULLIF(p_input ->> 'newStartAt', '')::timestamptz;
  v_end timestamptz := NULLIF(p_input ->> 'newEndAt', '')::timestamptz;
  v_duration integer := NULLIF(p_input ->> 'durationMinutes', '')::integer;
  v_current public.be_appointments%ROWTYPE;
  v_updated public.be_appointments%ROWTYPE;
  v_original_start timestamptz;
  v_to_status text;
  v_payload jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.patient-reschedule.apply', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.apply_current_patient_booking_reschedule(text)'::regprocedure);
  IF NULLIF(p_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
     OR NULLIF(p_input ->> 'actorId', '')::uuid IS DISTINCT FROM v_patient
     OR p_input ->> 'actorType' <> 'patient'
     OR COALESCE((p_input ->> 'manualOverride')::boolean, FALSE) = TRUE
     OR v_start IS NULL OR v_end IS NULL OR v_end <= v_start OR v_duration < 1
     OR extract(epoch FROM (v_end - v_start))::integer <> v_duration * 60 THEN
    RAISE EXCEPTION 'invalid patient reschedule payload' USING ERRCODE = '22023';
  END IF;
  SELECT appointment.* INTO v_current
  FROM public.be_appointments appointment
  WHERE appointment.id = v_id
    AND appointment.organization_id = v_org
    AND appointment.platform_user_id = v_patient
    AND appointment.deleted_at IS NULL
  FOR UPDATE;
  IF v_current.id IS NULL THEN
    RAISE EXCEPTION 'patient appointment not found' USING ERRCODE = '42501';
  END IF;
  IF v_current.status IN ('cancelled_by_patient', 'cancelled_by_specialist', 'no_show', 'late_cancellation') THEN
    RAISE EXCEPTION 'state_conflict' USING ERRCODE = '55000';
  END IF;
  IF NULLIF(p_input ->> 'branchId', '')::uuid IS DISTINCT FROM v_current.branch_id
     OR NULLIF(p_input ->> 'roomId', '')::uuid IS DISTINCT FROM v_current.room_id
     OR NULLIF(p_input ->> 'specialistId', '')::uuid IS DISTINCT FROM v_current.specialist_id
     OR NULLIF(p_input ->> 'serviceId', '')::uuid IS DISTINCT FROM v_current.service_id THEN
    RAISE EXCEPTION 'patient reschedule catalog change denied' USING ERRCODE = '42501';
  END IF;

  -- PAY-APPT-12: перенос денег не двигает, поэтому и подтверждать неоплаченное не вправе.
  v_to_status := CASE
    WHEN v_current.status = 'awaiting_payment'
         AND v_current.payment_ref IS NULL
         AND COALESCE(v_current.prepayment_paid_minor, 0) < COALESCE(v_current.prepayment_required_minor, 0)
    THEN 'awaiting_payment'
    ELSE 'confirmed'
  END;

  v_original_start := COALESCE(v_current.original_start_at, v_current.start_at);
  UPDATE public.be_appointments
  SET start_at = v_start,
      end_at = v_end,
      duration_minutes = v_duration,
      original_start_at = v_original_start,
      reschedule_count = v_current.reschedule_count + 1,
      status = v_to_status,
      updated_at = now()
  WHERE id = v_id
  RETURNING * INTO v_updated;

  INSERT INTO public.be_appointment_reschedules (
    organization_id, appointment_id, from_start_at, from_end_at, to_start_at, to_end_at,
    actor_type, actor_id, was_in_free_reschedule_window,
    free_cancellation_available_at_reschedule, free_cancellation_available_after,
    applied_policy_id, applied_policy_snapshot, reason, staff_comment,
    notifications_sent, manual_override, created_at
  ) VALUES (
    v_org, v_id, v_current.start_at, v_current.end_at, v_start, v_end,
    'patient', v_patient, (p_input ->> 'wasInFreeRescheduleWindow')::boolean,
    (p_input ->> 'freeCancellationAvailableAtReschedule')::boolean,
    (p_input ->> 'freeCancellationAvailableAfter')::boolean,
    CASE WHEN p_input -> 'policy' ->> 'id' = 'default' THEN NULL
      ELSE NULLIF(p_input -> 'policy' ->> 'id', '')::uuid END,
    COALESCE(p_input -> 'policy', '{}'::jsonb) || jsonb_build_object(
      'cancellationPolicyId', p_input -> 'cancellationPolicy' ->> 'id'
    ),
    NULLIF(p_input ->> 'reason', ''), NULL, COALESCE(p_input -> 'notificationsSent', '{}'::jsonb),
    FALSE, now()
  );
  v_payload := jsonb_build_object(
    'fromStatus', v_current.status, 'toStatus', v_to_status,
    'fromStartAt', v_current.start_at, 'toStartAt', v_start, 'manualOverride', FALSE
  );
  INSERT INTO public.be_appointment_history_events (
    organization_id, appointment_id, event_type, actor_id, payload, occurred_at
  ) VALUES (v_org, v_id, 'rescheduled', v_patient, v_payload, now());
  INSERT INTO public.be_patient_timeline_events (
    organization_id, platform_user_id, domain, event_type, linked_object_type,
    linked_object_id, payload, occurred_at
  ) VALUES (
    v_org, v_patient, 'appointment', 'appointment_rescheduled', 'appointment',
    v_id::text, v_payload, now()
  );
  RETURN to_jsonb(v_updated);
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- ВТОРОЙ стык. PAY-APPT-11/12: приём наличных в кассе не гасил требование предоплаты.
--
-- Что происходило с человеком: пациент платил в кассе, врач жал «Оплачено наличными», запись
-- оставалась в `awaiting_payment` с `prepayment_paid_minor = 0`, и через `payment_deadline_at`
-- минутный тик отменял её как `cancelled_by_specialist`. Человек заплатил и остался без приёма, а
-- в календаре это выглядело отменой клиникой. Тем же нулём был открыт и замок на переписывание
-- финансовых значений: после кассы врач всё ещё мог переписать стоимость.
--
-- Почему это КОРЕНЬ, а не запись отношением. Фактически полученные деньги
-- (`prepayment_paid_minor`) пишет только платёжный шов: `app_staff` этой колонки не имеет и иметь
-- не должен — иначе обычная правка записи умеет подделать оплату. Врач приносит сюда наличные
-- ровно одной дверью, и дверь эта — того же шва, что уже проводит предоплату вебхуком.
--
-- Почему журнал кассы (`patient_payment`) пишется ЗДЕСЬ ЖЕ. Именованный корень не стартует внутри
-- уже открытой реляционной транзакции, поэтому «сначала журнал, потом запись» распалось бы на два
-- коммита: упади второй — деньги в журнале есть, а запись отменит истечение. Обе записи делает
-- один statement-атомарный корень; второй платёжной модели рядом не заводится, `patient_payment`
-- остаётся единственным журналом наличных.
--
-- Идемпотентность — существующий уникальный ключ журнала
-- (`uq_patient_payment_appointment_idempotency`): повторное нажатие вставляет ноль строк, и
-- зачисление на запись выполняется ТОЛЬКО при фактической вставке. Семантика вебхука не тронута.
CREATE OR REPLACE FUNCTION app.settle_appointment_cash_prepayment(p_input_json text)
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
  p_input jsonb;
  v_appointment_id uuid;
  v_patient_user_id uuid;
  v_amount_minor integer;
  v_currency text;
  v_idempotency_key text;
  v_created_by uuid;
  v_payment public.patient_payment%ROWTYPE;
  v_inserted boolean := false;
  v_appointment public.be_appointments%ROWTYPE;
  v_paid_minor integer;
  v_to_status text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner'::name,
    'app_staff'::name,
    'staff'::app.port_context_class,
    'booking-payment.prepayment.cash-settle',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg
    ]),
    'app.settle_appointment_cash_prepayment(text)'::regprocedure
  );

  -- Клиника — только принятый контекст. Аргументом её не назвать: молчаливый NULL провёл бы
  -- наличные мимо арендатора.
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'appointment_cash_settle_principal_required' USING ERRCODE = '42501';
  END IF;

  p_input := p_input_json::jsonb;
  v_appointment_id := NULLIF(p_input ->> 'appointmentId', '')::uuid;
  v_patient_user_id := NULLIF(p_input ->> 'patientUserId', '')::uuid;
  v_amount_minor := NULLIF(p_input ->> 'amountMinor', '')::integer;
  v_currency := COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_input ->> 'currency', '')), ''), 'RUB');
  v_idempotency_key := NULLIF(pg_catalog.btrim(COALESCE(p_input ->> 'idempotencyKey', '')), '');
  v_created_by := NULLIF(p_input ->> 'createdBy', '')::uuid;

  IF NULLIF(p_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
     OR v_appointment_id IS NULL
     OR v_patient_user_id IS NULL
     OR v_created_by IS NULL
     OR v_idempotency_key IS NULL
     OR v_amount_minor IS NULL
     OR v_amount_minor <= 0 THEN
    RAISE EXCEPTION 'appointment_cash_settle_payload_invalid' USING ERRCODE = '22023';
  END IF;

  -- Блокируем запись ДО журнала: зачисление и статус решаются на одной версии строки, а
  -- параллельный тик истечения ждёт этой блокировки вместо гонки за неё.
  SELECT appointment.* INTO v_appointment
    FROM public.be_appointments AS appointment
   WHERE appointment.id = v_appointment_id
     AND appointment.organization_id = v_org
     AND appointment.platform_user_id = v_patient_user_id
     AND appointment.deleted_at IS NULL
   FOR UPDATE;
  IF v_appointment.id IS NULL THEN
    RAISE EXCEPTION 'appointment_cash_settle_appointment_not_found' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.patient_payment (
    organization_id, patient_user_id, amount_minor, currency, kind, status,
    comment, service, visit_id, appointment_id, patient_package_id,
    idempotency_key, provider, provider_payment_id, created_by
  )
  VALUES (
    v_org, v_patient_user_id, v_amount_minor, v_currency, 'cash', 'paid',
    NULLIF(p_input ->> 'comment', ''), NULLIF(p_input ->> 'service', ''), NULL,
    v_appointment_id, NULL, v_idempotency_key, NULL, NULL, v_created_by
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_payment;

  IF v_payment.id IS NOT NULL THEN
    v_inserted := true;
  ELSE
    SELECT payment.* INTO v_payment
      FROM public.patient_payment AS payment
     WHERE payment.organization_id = v_org
       AND payment.appointment_id = v_appointment_id
       AND payment.idempotency_key = v_idempotency_key;
    IF v_payment.id IS NULL THEN
      RAISE EXCEPTION 'appointment_cash_settle_idempotency_lookup_failed' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_paid_minor := COALESCE(v_appointment.prepayment_paid_minor, 0);
  IF v_inserted THEN
    -- Зачисление ровно один раз на вставленную строку журнала: повтор нажатия ничего не прибавит.
    v_paid_minor := v_paid_minor + v_amount_minor;
    UPDATE public.be_appointments AS appointment
       SET prepayment_paid_minor = v_paid_minor,
           updated_at = v_now
     WHERE appointment.id = v_appointment_id
       AND appointment.organization_id = v_org;
  END IF;

  v_to_status := v_appointment.status;
  IF v_appointment.status = 'awaiting_payment'
     AND v_paid_minor >= COALESCE(v_appointment.prepayment_required_minor, 0) THEN
    -- Тот же выход из ожидания, что и у вебхука, с теми же событиями истории и ленты. Срок оплаты
    -- при этом НЕ переписывается: он часть финансового снимка, а снимок пишет только врачебная
    -- правка. Истечению он больше не страшен — тик отбирает строки по `status` и по нулю денег.
    UPDATE public.be_appointments AS appointment
       SET status = 'confirmed',
           updated_at = v_now
     WHERE appointment.id = v_appointment_id
       AND appointment.organization_id = v_org;
    v_to_status := 'confirmed';
    INSERT INTO public.be_appointment_history_events (
      organization_id, appointment_id, event_type, actor_id, payload, occurred_at
    )
    VALUES (v_org, v_appointment_id, 'status_changed', v_created_by,
            pg_catalog.jsonb_build_object('fromStatus', 'awaiting_payment', 'toStatus', 'confirmed',
                                          'source', 'cash_prepayment_settled',
                                          'paymentId', v_payment.id::text),
            v_now);
    INSERT INTO public.be_patient_timeline_events (
      organization_id, platform_user_id, domain, event_type,
      linked_object_type, linked_object_id, payload, occurred_at
    )
    VALUES (v_org, v_patient_user_id, 'appointment', 'appointment_status_changed',
            'appointment', v_appointment_id::text,
            pg_catalog.jsonb_build_object('fromStatus', 'awaiting_payment', 'toStatus', 'confirmed',
                                          'source', 'cash_prepayment_settled',
                                          'paymentId', v_payment.id::text),
            v_now);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'payment', pg_catalog.to_jsonb(v_payment),
    'credited', v_inserted,
    'prepaymentPaidMinor', v_paid_minor,
    'appointmentStatus', v_to_status
  );
END
$function$;
