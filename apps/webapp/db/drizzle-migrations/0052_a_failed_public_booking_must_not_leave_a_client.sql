-- BCB-MIGRATION-OWNER: app_object_owner
-- TEMPORARY LOCAL MIGRATION NUMBER 0052
--
-- Три находки слепого аудита половины ЗАПИСИ публичной воронки
-- (`docs/REPORTS/PUBLIC_BOOKING_WRITE_BLIND_AUDIT_2026-08-19.md`). Все три — не про сами двери, а
-- про то, что вокруг них: оплаченная квота клиники, след неудавшейся записи и зашитые константы.
--
-- F1. КВОТА `patient_count`. Клиентов клиники считает и ограничивает ровно одно место —
-- `ensureInvitedOrganizationClientRelationship` (`infra/repos/pgPatientOrganizationEnrollment.ts`),
-- и после переключения публичной воронки на пациентский принципал она перестала быть проходом:
-- второй создатель отношения (дверь ниже) шёл мимо. Замер аудита на DEV: тариф с лимитом 1 при 245
-- клиентах — публичное подтверждение прошло, стало 246, после чего регистратура той же клиники
-- получает `patient_count_limit_reached` и карточку завести не может.
--
-- По §5 («один общий проход, и мимо него нельзя») копий проверки быть не должно, поэтому правило
-- переезжает в ОДНУ функцию базы — `app.assert_org_patient_count_quota_available` — и её зовут ОБА
-- создателя отношения. Создателей ровно два, это измерено:
--
--   создатели строки `org_enrollments`:
--     1. TS `ensureInvitedOrganizationClientRelationship` (карточка от персонала клиники)
--     2. `app.enroll_current_patient_in_public_booking_clinic` (публичная запись)
--   остальные два писателя строку НЕ создают, а только поднимают уже существующую:
--     `app.redeem_patient_invite_email`, `app.claim_unbound_patient_invite_email`
--     (обе требуют `enrollment_id` уже выпущенного приглашения)
--
-- Проверка стоит в базе, а не в приложении, ровно потому, что в базе оба пути сходятся: у
-- публичного нет реляционного доступа к тарифам вовсе (пациентский логин не читает
-- `be_organizations`/`saas_*`), а advisory-замок и сама вставка обязаны быть в одной транзакции.
-- Ключ замка тот же, что был у `transactionQuotaPort` (`saas_quota:patient_count:<org>`), поэтому
-- два создателя сериализуются друг относительно друга, а не каждый сам с собой.
--
-- F2. СЛЕД НЕУДАВШЕЙСЯ ЗАПИСИ. Зачисление коммитится своей порт-транзакцией ДО записи, и обойти
-- это нечем: именованный корень физически отказывается работать внутри реляционной транзакции
-- (`runWebappSql.ts:68`). Замер аудита: проигравший гонку за слот получил 409, приёмов 0, а
-- зачисление осталось `active` — человек, которому клиника ничего не оказала, попал в её список
-- клиентов и занял оплаченное место. Порядок починить нельзя (корень приёма ТРЕБУЕТ строку
-- зачисления заранее), поэтому вводится компенсация: `app.revoke_public_booking_enrollment`.
--
-- Компенсация НЕ ВЕРИТ вызывающему ни в чём: что именно откатывать, дверь решает по самой строке —
-- по её провенансу (`portal_activated_via` из закрытого списка публичных каналов), по её возрасту
-- (окно одной попытки записи) и по отсутствию приёмов у этого человека в этой клинике. Иначе
-- посетитель мог бы намеренно завалить запись и стереть карточку, заведённую клиникой.
--
-- F3. ЗАШИТЫЕ КОНСТАНТЫ. `public_booking_phone_otp` стоял в двери литералом, хотя почта — такой же
-- полноправный канал подтверждения (`AUTH_AND_IDENTITY_CANON.md` §15), а состав обязательных полей
-- публичной формы задаёт КЛИНИКА (`OWNER_PRODUCT_RULES.md` §33). По §5 «варианты одного действия —
-- параметры одной точки»: канал становится АРГУМЕНТОМ двери, а закрытый список — один и тот же в
-- аргументе и в CHECK таблицы. Записывается то, чем человек подтвердился НА ЭТОЙ записи.
--
-- Что в этой миграции НЕ решается и вынесено ведущему (см. отчёт): статус `active` у публичного
-- зачисления. Он не выбран разработчиком — он ВЫНУЖДЕН конструкцией: `invited` отвергают
-- `app.create_current_patient_booking_pending`, `app.create_current_patient_booking_appointments`,
-- `app.reserve_current_patient_booking_package`, `app.read_current_patient_booking_packages`.
-- Утверждение прежней миграции 0051 («никакого расширения доступа не происходит») неверно и здесь
-- исправлено: `active` — и есть гейт портала.

ALTER TABLE public.org_enrollments
  DROP CONSTRAINT IF EXISTS org_enrollments_portal_activation_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Закрытый список каналов активации портала. До 0051 значение было одно (погашение приглашения по
-- почте), 0051 добавила ровно одно публичное — телефонный код. Список ниже перечисляет то, чем
-- посетитель РЕАЛЬНО подтверждается на публичной форме сегодня, по одному имени на канал:
-- код в SMS, уже подтверждённая почта учётной записи и уже действующая сессия. Разложение по
-- каналам — требование §15 канона личности («почта наравне с телефоном») и §33 правил владельца.
ALTER TABLE public.org_enrollments
  ADD CONSTRAINT org_enrollments_portal_activation_check CHECK (
    (portal_activated_at IS NULL AND portal_activated_via IS NULL)
    OR (portal_activated_at IS NOT NULL
        AND portal_activated_via IN (
          'patient_invite_email_otp',
          'public_booking_phone_otp',
          'public_booking_verified_email',
          'public_booking_session'
        ))
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- ЕДИНСТВЕННАЯ проверка оплаченного числа клиентов. Владелец шва — коммерческий: у него уже есть
-- ровно те чтения, которых требует правило (`be_organizations.tariff_id`, тариф с учётом снимка
-- подписки, точечные включения механик, список клиентов), и ни одного лишнего.
--
-- Правило дословно повторяет то, что до сегодняшнего дня жило в `decideStockQuota`
-- (`infra/repos/transactionQuotaPort.ts`) и решением владельца 18.08 звучит так: «ЛИБО ЛИМИТ ЛИБО
-- БЕЗ ЛИМИТА». Потолок существует только там, где тариф назвал ЧИСЛО; отсутствие ключа, явный
-- `unlimited` и строка без числа — это «без лимита». Клиника вообще без тарифа отказывает — так же,
-- как отказывал `assertStockAvailable` при `!context.tariffId`.
--
-- Замок берётся ДО счёта и живёт до конца транзакции, поэтому счёт и последующая вставка атомарны
-- у обоих создателей отношения.
CREATE OR REPLACE FUNCTION app.assert_org_patient_count_quota_available(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_tariff uuid;
  v_quota jsonb;
  v_limit numeric;
  v_used bigint;
-- Гейт обязан открывать тело и ничего между ними: проверка деплоя читает начало тела дословно, и
-- даже комментарий на этом месте роняет её. Список ролей ровно тот, что выводит декларация
-- (`execute` + распространение по `delegatesTo`): персонал клиники зовёт функцию напрямую из своей
-- реляционной транзакции, публичная дверь — изнутри себя.
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_org_commerce_owner'::name,
    ARRAY['app_patient'::name, 'app_staff'::name]::name[]
  );

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'saas_quota_reached:patient_count' USING ERRCODE = '53400';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas_quota:patient_count:' || p_organization_id::text, 0)
  );

  SELECT organization.tariff_id
  INTO v_tariff
  FROM public.be_organizations AS organization
  WHERE organization.id = p_organization_id;

  -- Клиника без тарифа не имеет оплаченного числа клиентов, а значит и права завести следующего.
  IF v_tariff IS NULL THEN
    RAISE EXCEPTION 'saas_quota_reached:patient_count' USING ERRCODE = '53400';
  END IF;

  SELECT override.quota
  INTO v_quota
  FROM public.saas_org_entitlement_overrides AS override
  WHERE override.organization_id = p_organization_id
    AND override.mechanic = 'patient_count'
    AND (override.expires_at IS NULL OR override.expires_at > now())
  LIMIT 1;

  IF v_quota IS NULL THEN
    SELECT tariff.quotas -> 'patient_count'
    INTO v_quota
    FROM app.saas_billing_effective_tariff(p_organization_id, v_tariff) AS tariff
    LIMIT 1;
  END IF;

  IF v_quota IS NULL
     OR jsonb_typeof(v_quota) <> 'object'
     OR (v_quota ->> 'kind') IS DISTINCT FROM 'numeric'
     OR jsonb_typeof(v_quota -> 'limit') <> 'number' THEN
    RETURN;
  END IF;

  v_limit := (v_quota ->> 'limit')::numeric;

  SELECT pg_catalog.count(*)
  INTO v_used
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.organization_id = p_organization_id
    AND enrollment.status IN ('invited', 'active');

  IF v_used + 1 > v_limit THEN
    RAISE EXCEPTION 'saas_quota_reached:patient_count' USING ERRCODE = '53400';
  END IF;
END;
$function$;

COMMENT ON FUNCTION app.assert_org_patient_count_quota_available(uuid) IS
  'The only patient_count ceiling: both creators of an org_enrollments row call it under the same transaction-scoped advisory lock.';

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- Прежняя дверь принимала только организацию и вписывала канал константой. Подпись меняется, поэтому
-- старая снимается целиком: двух дверей одного действия быть не должно.
DROP FUNCTION IF EXISTS app.enroll_current_patient_in_public_booking_clinic(uuid);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Дверь ОТНОШЕНИЯ с клиникой. Человек — из принятого пациентского контекста, а не из аргумента:
-- записать в клиенты можно только себя. Организация — единственное, что сообщает вызывающий, и она
-- обязана быть ОПУБЛИКОВАНА.
--
-- Что добавилось против 0051:
--   * канал подтверждения стал аргументом (F3) и проверяется по тому же закрытому списку, что и
--     CHECK таблицы;
--   * перед созданием НОВОГО отношения зовётся единственная проверка квоты (F1) — ровно там же, где
--     её зовёт персонал клиники: только на новом отношении, потому что уже существующая карточка
--     (`invited`/`active`) в счёте и так учтена;
--   * дверь возвращает, ЧТО она сделала (`created` / `activated` / `unchanged`) — это нужно
--     компенсации ниже, чтобы у неудавшейся записи не осталось следа.
CREATE OR REPLACE FUNCTION app.enroll_current_patient_in_public_booking_clinic(
  p_organization_id uuid,
  p_confirmation_channel text
)
RETURNS jsonb
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
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_confirmation_channel))::app.port_typed_arg
    ]),
    'app.enroll_current_patient_in_public_booking_clinic(uuid,text)'::regprocedure
  );

  IF v_patient IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'public booking enrollment context unavailable' USING ERRCODE = '42501';
  END IF;

  -- Канал проверяет сама дверь: вызывающий его называет, но дверь ему не верит.
  IF p_confirmation_channel IS NULL
     OR p_confirmation_channel NOT IN (
       'public_booking_phone_otp',
       'public_booking_verified_email',
       'public_booking_session'
     ) THEN
    RAISE EXCEPTION 'public booking confirmation channel is not a confirmed contact channel'
      USING ERRCODE = '22023';
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
    AND enrollment.platform_user_id = v_patient
  FOR UPDATE;

  IF v_status IS NULL THEN
    -- Новый клиент клиники — и единственный случай, когда тратится оплаченное место.
    PERFORM app.assert_org_patient_count_quota_available(p_organization_id);

    INSERT INTO public.org_enrollments (
      organization_id, platform_user_id, status, portal_activated_at, portal_activated_via
    )
    VALUES (p_organization_id, v_patient, 'active', now(), p_confirmation_channel)
    ON CONFLICT (organization_id, platform_user_id) DO NOTHING;

    SELECT enrollment.status
    INTO v_status
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = v_patient;

    IF v_status IS NULL OR v_status NOT IN ('invited', 'active') THEN
      RAISE EXCEPTION 'public booking client relationship denied' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('status', v_status, 'effect', 'created');
  END IF;

  -- Уже выписанный или архивный клиент обратно не открывается: это отказ, а не тихое воскрешение.
  IF v_status NOT IN ('invited', 'active') THEN
    RAISE EXCEPTION 'public booking client relationship denied' USING ERRCODE = '42501';
  END IF;

  IF v_status = 'invited' THEN
    UPDATE public.org_enrollments AS enrollment
    SET status = 'active',
        portal_activated_at = COALESCE(enrollment.portal_activated_at, now()),
        portal_activated_via = COALESCE(enrollment.portal_activated_via, p_confirmation_channel)
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = v_patient;
    RETURN jsonb_build_object('status', 'active', 'effect', 'activated');
  END IF;

  RETURN jsonb_build_object('status', v_status, 'effect', 'unchanged');
END;
$function$;

COMMENT ON FUNCTION app.enroll_current_patient_in_public_booking_clinic(uuid, text) IS
  'Make the identified public-booking visitor a client of a PUBLISHED clinic under the one patient_count ceiling. The person comes from the accepted patient context, the confirmation channel is an argument checked against the closed list, and the door reports what it did so a failed booking can be compensated.';

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Компенсация неудавшейся записи (F2). Зачисление коммитится раньше приёма и откатиться вместе с
-- ним не может, поэтому провалившаяся запись обязана убрать за собой сама.
--
-- Дверь не принимает от вызывающего НИЧЕГО, кроме организации, и решает по самой строке:
--   * трогает строку только с публичным провенансом и только внутри окна одной попытки записи
--     (15 минут) — карточку, заведённую клиникой месяц назад, стереть этой дверью нельзя;
--   * молчит и ничего не делает, если у человека в этой клинике есть хоть один живой приём: значит
--     запись всё-таки состоялась, и отношение — её законное следствие;
--   * строку, СОЗДАННУЮ этой воронкой, удаляет целиком — иначе человек, которому клиника ничего не
--     оказала, остаётся в её списке клиентов и занимает оплаченное место. «Создана воронкой» — это
--     не догадка по времени: только здесь отметка активации портала ставится ОДНОВРЕМЕННО с самой
--     строкой, поэтому `created_at = portal_activated_at` бывает ровно у такой строки. Писатель
--     карточек клиники вставляет `invited` вообще без отметки, а погашение приглашения ставит её
--     UPDATE'ом на строку, заведённую раньше;
--   * строку, которую воронка лишь ПОДНЯЛА из `invited`, возвращает в `invited` и снимает отметку
--     активации портала — клиника не выпускала приглашения, и запись не состоялась.
CREATE OR REPLACE FUNCTION app.revoke_public_booking_enrollment(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient uuid := app.current_patient_user_id();
  v_created_at timestamptz;
  v_portal_at timestamptz;
  v_portal_via text;
  v_status text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_public_booking_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'booking.public-client.revoke',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg
    ]),
    'app.revoke_public_booking_enrollment(uuid)'::regprocedure
  );

  IF v_patient IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'public booking enrollment context unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT enrollment.status, enrollment.created_at,
         enrollment.portal_activated_at, enrollment.portal_activated_via
  INTO v_status, v_created_at, v_portal_at, v_portal_via
  FROM public.org_enrollments AS enrollment
  WHERE enrollment.organization_id = p_organization_id
    AND enrollment.platform_user_id = v_patient
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('effect', 'absent');
  END IF;

  IF v_portal_via IS NULL
     OR v_portal_via NOT IN (
       'public_booking_phone_otp',
       'public_booking_verified_email',
       'public_booking_session'
     )
     OR v_portal_at IS NULL
     OR v_portal_at < now() - '00:15:00'::interval THEN
    RETURN jsonb_build_object('effect', 'kept');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.be_appointments AS appointment
    WHERE appointment.organization_id = p_organization_id
      AND appointment.platform_user_id = v_patient
      AND appointment.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('effect', 'kept');
  END IF;

  IF v_created_at = v_portal_at THEN
    DELETE FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = v_patient;
    RETURN jsonb_build_object('effect', 'deleted');
  END IF;

  UPDATE public.org_enrollments AS enrollment
  SET status = 'invited',
      portal_activated_at = NULL,
      portal_activated_via = NULL
  WHERE enrollment.organization_id = p_organization_id
    AND enrollment.platform_user_id = v_patient;
  RETURN jsonb_build_object('effect', 'reverted');
END;
$function$;

COMMENT ON FUNCTION app.revoke_public_booking_enrollment(uuid) IS
  'Undo the public-booking client relationship when the booking itself failed. Decides from the row (public provenance, one-attempt age window, no live appointment) and never from the caller.';

