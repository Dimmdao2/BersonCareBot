-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)') IS NOT NULL
--
-- D15b/7a шаг Ш8 — аудит акта связывания личности с медициной.
--
-- ЧТО ЭТО. Ш1–Ш6 развели «кто действует» и «о ком данные» на две ссылки. Пересечение этой границы
-- остаётся законным, но должно быть ВИДНЫМ: без записи разделение защищает от случайности, но не от
-- злоупотребления — тот, кому связывание положено по работе, делает его тысячу раз в день, и никто
-- не замечает. Четыре точки пересечения и объём записи на каждой заданы планом
-- (`docs/_TODO/runs/integrator-cleanup/D15B7A_ACTOR_SUBJECT_SPLIT_SCHEME_2026-08-22.md`, раздел 4,
-- шаг Ш8; решение владельца — `IDENTITY_AND_MERGE_SCHEME.md` §2c).
--
-- ⛔ НОВОЙ СУЩНОСТИ НЕТ. Пишем в существующий `public.admin_audit_log`, у которого уже есть
-- схлопывание повторов (`conflict_key` + `repeat_count` + `last_seen_at`). Ни новой таблицы, ни
-- новой очереди, ни второго журнала эта миграция не создаёт.
--
-- ⛔ ВТОРОЙ ДВЕРИ НЕТ (AGENTS.md §5, «варианты одного действия — параметры одной точки»). Дверь
-- записи схлопывающегося события в `admin_audit_log` уже существовала — её завёл шаг D17 2b под
-- именем `app.integrator_record_messenger_phone_bind_audit(uuid,text,text,text)`. Эта миграция её
-- НЕ дублирует, а РАСШИРЯЕТ параметром: вид события переехал из тела (там он выводился из
-- «`conflict_key` пуст или нет») в аргумент `p_action`, и та же дверь обслуживает четыре точки
-- пересечения границы. Имя перестало описывать работу — поэтому точка переименована в том же
-- изменении, как того и требует §5, а старая сигнатура снята: два входа в один журнал — это ровно
-- тот обход, против которого правило.
--
-- ЧТО ПРОВЕРЯЕТ ТЕЛО, И ПОЧЕМУ ИМЕННО ОНО.
--
-- 1. ГЕЙТ ПРИНЯТОГО КОНТЕКСТА — рукописный, потому что у одной двери теперь ТРИ возможности с
--    тремя разными парами «роль/класс» (интегратор, персонал, pre-session). Генератор в таком
--    случае переходит в режим `exact_existing`: он не переписывает первый statement, а СВЕРЯЕТ, что
--    в нём присутствуют все токены каждой объявленной тройки (`generate.mjs`,
--    `generateRuntimeDefinerGateSql`). Форма ровно та же, что у `app.pre_session_resolve_identity`.
--
--    Ветка `identity_subject_link_created` — не «ещё одна возможность», а внутренний вызов из
--    `app_ext.resolve_variant_a_identity`: акт связывания рождается ВНУТРИ разрешения ссылки, своей
--    капабилити у него нет и быть не должно. Поэтому эта ветка требует контекст ТОГО САМОГО
--    разрешения: `identity.variant-a.resolve`, `app.pre_session_resolve_identity(uuid,text)` и хеш
--    аргументов ИМЕННО этого человека с видом `subject`. Записать «связка создана» про чужого
--    человека или вне акта разрешения — нечем: хеш не сойдётся.
--
-- 2. ЗАКРЫТЫЙ СПИСОК ДЕЙСТВИЙ. Неизвестное `p_action` отвергается `23514`, а не заводит шестой вид
--    события молча.
--
-- 3. СТЕНА АРЕНДАТОРА повторена дословно, как и у прежней двери: `admin_audit_log` объявлена
--    org=true, `idx_admin_audit_log_conflict_open` уникален по ВСЕЙ таблице, и без сужения каждого
--    поиска организацией совпадение `conflict_key` у двух клиник дописывало бы в чужую строку.
--    Действия без организации (акт связывания, вход) обязаны прийти с `p_organization_id IS NULL`:
--    класс `pre_session` арендатора не несёт вовсе (матрица классов, `contract.sql`).
--
-- 4. СТЕНА АКТОРА. На точках персонала `p_actor_id` обязан совпасть с
--    `app.current_actor_user_id()`: приложение не может записать пересечение границы на ЧУЖОЕ имя.
--    На входе (`identity_session_start`) сверять не с чем — у класса `pre_session` актора нет по
--    построению; это названное ограничение, а не недосмотр.
--
-- 5. ЖУРНАЛ НЕ СТАНОВИТСЯ УТЕЧКОЙ САМ. Для событий пересечения границы `details` проверяется ПО
--    СОДЕРЖИМОМУ: закрытый список ключей, значения `subject_ids`/идентификаторов — только
--    uuid-формы, размер ограничен. Ни имени, ни телефона, ни почты, ни диагноза в запись физически
--    не положить — попытка падает `23514`. В записи остаётся ровно «кто, когда, к кому обратился,
--    сколько раз».
--
-- 6. КЛЮЧ СХЛОПЫВАНИЯ СЧИТАЕТ ДВЕРЬ, А НЕ ВЫЗЫВАЮЩИЙ. Объём записи на каждой точке — часть решения
--    владельца, а не выбор вызывающего: вход — раз на сессию, открытие карточки — раз на пару
--    «врач-пациент» в сутки, список — одно событие на пакет. Считай ключ снаружи — и первый же
--    вызывающий, забывший день или организацию, тихо развалил бы объём.
--
-- 7. ПРАВИЛО ТРЕВОГИ ЖИВЁТ ЗДЕСЬ ЖЕ. Журнал без читателя владелец считает бессмысленным (§2c),
--    поэтому тревога — не соседний модуль, который можно забыть позвать, а последний шаг ТОЙ ЖЕ
--    двери: записать пересечение, не проверив объём, структурно невозможно.
--
--    ПОРОГ. Замер на живой `bcb_webapp_dev` (расписание, перенесённое из прода): 85 рабочих дней
--    специалистов, максимум 7 приёмов и 6 РАЗНЫХ пациентов за день у одного специалиста, p95 = 5,
--    медиана 2–3; за месяц максимум 35 разных пациентов. Живого UI-трафика на DEV нет, поэтому
--    множители «сколько раз врач открывает карточку за приём» и «сколько раз перезагружает список»
--    ЗАМЕРИТЬ БЫЛО НЕ НА ЧЕМ — они взяты щедрой оценкой (5 открытий на пациента, до 30 загрузок
--    списка в день), и это ОЦЕНКА, УТОЧНИТЬ НА TEST. Щедрая верхняя граница нормы получается
--    6×5 + 30 + 1 вход ≈ 60–70 пересечений на человека в сутки; порог поставлен втрое выше —
--    200. Массовая выгрузка (сотни карточек, постраничный обход списка) переходит его за час,
--    занятый врач не переходит никогда.

DROP FUNCTION IF EXISTS app.integrator_record_messenger_phone_bind_audit(uuid, text, text, text);
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.record_collapsing_audit_event(
  p_action text,
  p_organization_id uuid,
  p_actor_id uuid,
  p_target_id text,
  p_conflict_key text,
  p_details text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_details jsonb;
  v_existing_id uuid;
  v_inserted_first boolean;
  v_status text;
  v_needs_org boolean;
  v_crossing boolean;
  v_key text;
  v_day text;
  v_volume bigint;
  v_alarm boolean;
  v_alarm_key text;
  v_uuid_re text;
  v_crossing_actions text[];
  v_volume_threshold bigint;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    CASE
      WHEN p_action IN ('identity_patient_card_open', 'identity_patient_list_view') THEN 'app_staff'::name
      WHEN p_action IN ('identity_subject_link_created', 'identity_session_start') THEN 'app_pre_session'::name
      ELSE 'app_integrator_request'::name
    END,
    CASE
      WHEN p_action IN ('identity_patient_card_open', 'identity_patient_list_view') THEN 'staff'::app.port_context_class
      WHEN p_action IN ('identity_subject_link_created', 'identity_session_start') THEN 'pre_session'::app.port_context_class
      ELSE 'tenant_service'::app.port_context_class
    END,
    CASE
      WHEN p_action = 'identity_subject_link_created' THEN 'identity.variant-a.resolve'
      WHEN p_action IN ('identity_session_start', 'identity_patient_card_open', 'identity_patient_list_view')
        THEN 'identity.boundary-crossing.record'
      ELSE 'integrator.messenger-phone-bind-audit.record'
    END,
    CASE
      WHEN p_action = 'identity_subject_link_created'
        THEN app.hash_port_typed_args(ARRAY[
          ROW('uuid@1', pg_catalog.uuid_send(p_target_id::uuid))::app.port_typed_arg,
          ROW('text@1', pg_catalog.textsend('subject'))::app.port_typed_arg
        ])
      ELSE app.hash_port_typed_args(ARRAY[
        ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
        ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg,
        ROW('uuid@1', pg_catalog.uuid_send($3))::app.port_typed_arg,
        ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg,
        ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg,
        ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg
      ])
    END,
    CASE
      WHEN p_action = 'identity_subject_link_created'
        THEN 'app.pre_session_resolve_identity(uuid,text)'::regprocedure
      ELSE 'app.record_collapsing_audit_event(text,uuid,uuid,text,text,text)'::regprocedure
    END
  );

  v_inserted_first := false;
  v_volume := 0;
  v_alarm := false;
  v_uuid_re := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_crossing_actions := ARRAY['identity_session_start', 'identity_patient_card_open', 'identity_patient_list_view'];
  v_volume_threshold := 200;

  IF p_action IS NULL OR p_action NOT IN (
    'messenger_phone_bind_blocked',
    'messenger_phone_bind_anomaly',
    'identity_subject_link_created',
    'identity_session_start',
    'identity_patient_card_open',
    'identity_patient_list_view'
  ) THEN
    RAISE EXCEPTION 'collapsing_audit_action_not_declared' USING ERRCODE = '23514';
  END IF;

  v_crossing := p_action IN (
    'identity_subject_link_created',
    'identity_session_start',
    'identity_patient_card_open',
    'identity_patient_list_view'
  );
  v_status := CASE WHEN v_crossing THEN 'ok' ELSE 'error' END;
  v_needs_org := p_action IN (
    'messenger_phone_bind_blocked',
    'messenger_phone_bind_anomaly',
    'identity_patient_card_open',
    'identity_patient_list_view'
  );

  IF v_needs_org THEN
    IF app.current_org_id() IS NULL THEN
      RAISE EXCEPTION 'collapsing_audit_principal_required' USING ERRCODE = '42501';
    END IF;
    IF p_organization_id IS DISTINCT FROM app.current_org_id() THEN
      RAISE EXCEPTION 'collapsing_audit_principal_mismatch' USING ERRCODE = '42501';
    END IF;
  ELSIF p_organization_id IS NOT NULL THEN
    RAISE EXCEPTION 'collapsing_audit_tenantless_action_carries_organization' USING ERRCODE = '42501';
  END IF;

  -- Пересечение границы на экране персонала записывается ТОЛЬКО на своё имя.
  IF p_action IN ('identity_patient_card_open', 'identity_patient_list_view') THEN
    IF p_actor_id IS NULL OR p_actor_id IS DISTINCT FROM app.current_actor_user_id() THEN
      RAISE EXCEPTION 'collapsing_audit_actor_mismatch' USING ERRCODE = '42501';
    END IF;
  ELSIF p_action IN ('messenger_phone_bind_blocked', 'messenger_phone_bind_anomaly',
                     'identity_subject_link_created') THEN
    IF p_actor_id IS NOT NULL THEN
      RAISE EXCEPTION 'collapsing_audit_actorless_action_carries_actor' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_details := p_details::jsonb;
  IF v_details IS NULL OR pg_catalog.jsonb_typeof(v_details) <> 'object' THEN
    RAISE EXCEPTION 'collapsing_audit_details_must_be_an_object' USING ERRCODE = '23514';
  END IF;
  IF pg_catalog.pg_column_size(v_details) > 65536 THEN
    RAISE EXCEPTION 'collapsing_audit_details_too_large' USING ERRCODE = '23514';
  END IF;

  IF v_crossing THEN
    -- Утверждение по СОДЕРЖИМОМУ записи, а не «посмотрели глазами»: закрытый список ключей.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(v_details) AS detail_key
       WHERE detail_key NOT IN ('point', 'ref_kind', 'session_ref', 'subject_count')
    ) THEN
      RAISE EXCEPTION 'collapsing_audit_detail_key_not_declared' USING ERRCODE = '23514';
    END IF;
    IF v_details ? 'session_ref' AND (v_details ->> 'session_ref') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'collapsing_audit_session_ref_not_opaque' USING ERRCODE = '23514';
    END IF;
    IF v_details ? 'subject_count'
      AND pg_catalog.jsonb_typeof(v_details -> 'subject_count') <> 'number' THEN
      RAISE EXCEPTION 'collapsing_audit_subject_count_not_a_number' USING ERRCODE = '23514';
    END IF;
    IF p_target_id IS NOT NULL AND p_target_id !~ v_uuid_re THEN
      RAISE EXCEPTION 'collapsing_audit_target_is_not_an_identifier' USING ERRCODE = '23514';
    END IF;
    IF p_conflict_key IS NOT NULL THEN
      RAISE EXCEPTION 'collapsing_audit_crossing_key_belongs_to_the_door' USING ERRCODE = '23514';
    END IF;

    IF p_action = 'identity_session_start' AND NOT (v_details ? 'session_ref') THEN
      RAISE EXCEPTION 'collapsing_audit_session_start_needs_a_session_reference' USING ERRCODE = '23514';
    END IF;
    IF p_action IN ('identity_subject_link_created', 'identity_patient_card_open')
      AND p_target_id IS NULL THEN
      RAISE EXCEPTION 'collapsing_audit_crossing_needs_a_subject' USING ERRCODE = '23514';
    END IF;

    -- Объём записи задан планом и считается ЗДЕСЬ: создание связки — одно событие на человека;
    -- вход — одно на сессию; открытие карточки — одно на пару «врач-пациент» в сутки (повторные
    -- открытия поднимают `repeat_count`); список — одно на пакет, повторные загрузки за те же сутки
    -- тоже идут счётчиком.
    v_day := pg_catalog.to_char(pg_catalog.timezone('UTC', pg_catalog.now()), 'YYYY-MM-DD');
    v_key := CASE p_action
      WHEN 'identity_subject_link_created' THEN 'identity-linkage|link_created|' || p_target_id
      WHEN 'identity_session_start' THEN 'identity-linkage|session_start|'
        || coalesce(v_details ->> 'session_ref', '')
      WHEN 'identity_patient_card_open' THEN 'identity-linkage|card_open|' || p_organization_id::text
        || '|' || p_actor_id::text || '|' || coalesce(p_target_id, '') || '|' || v_day
      ELSE 'identity-linkage|list_view|' || p_organization_id::text
        || '|' || p_actor_id::text || '|' || v_day
    END;
    v_key := pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(v_key, 'UTF8')), 'hex');
  ELSE
    v_key := p_conflict_key;
  END IF;

  IF v_key IS NULL THEN
    -- Аномалия без ключа схлопывания: отдельная строка каждый раз, ровно как до этой правки.
    INSERT INTO public.admin_audit_log (
      organization_id, actor_id, action, target_id, conflict_key, details, status
    ) VALUES (
      p_organization_id, p_actor_id, p_action, p_target_id, NULL, v_details, v_status
    );
    v_inserted_first := true;
  ELSE
    -- `FOR UPDATE` держит открытую строку случая до конца двери: два параллельных пересечения
    -- одной границы не должны разойтись в «оба первые». PostgreSQL берёт за замок право класса
    -- UPDATE, а не SELECT, — оно у владельца шва объявлено.
    SELECT audit_row.id INTO v_existing_id
    FROM public.admin_audit_log AS audit_row
    WHERE audit_row.conflict_key = v_key
      AND audit_row.resolved_at IS NULL
      AND audit_row.organization_id IS NOT DISTINCT FROM p_organization_id
    LIMIT 1
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.admin_audit_log AS audit_row
      SET details = audit_row.details || v_details,
          repeat_count = audit_row.repeat_count + 1,
          last_seen_at = pg_catalog.now(),
          status = v_status
      WHERE audit_row.id = v_existing_id;
    ELSE
      BEGIN
        INSERT INTO public.admin_audit_log (
          organization_id, actor_id, action, target_id, conflict_key, details, status, repeat_count,
          last_seen_at
        ) VALUES (
          p_organization_id, p_actor_id, p_action, p_target_id, v_key,
          v_details, v_status, 1, pg_catalog.now()
        );
        v_inserted_first := true;
      EXCEPTION WHEN unique_violation THEN
        -- Гонка: сосед успел вставить ту же открытую строку между нашим замком и вставкой.
        UPDATE public.admin_audit_log AS audit_row
        SET details = audit_row.details || v_details,
            repeat_count = audit_row.repeat_count + 1,
            last_seen_at = pg_catalog.now(),
            status = v_status
        WHERE audit_row.conflict_key = v_key
          AND audit_row.resolved_at IS NULL
          AND audit_row.organization_id IS NOT DISTINCT FROM p_organization_id;
      END;
    END IF;
  END IF;

  -- ПРАВИЛО ТРЕВОГИ. Одно, на аномальный объём пересечений одним человеком за скользящие сутки.
  -- Считаются события (`repeat_count`), а не люди: список по решению владельца — ОДНО событие на
  -- пакет, поэтому «сколько людей увидел» тут не метрика, а «сколько раз пересёк границу» — метрика.
  -- Акт связывания в счёт не идёт: у него нет актора, его совершает сам порт.
  IF p_actor_id IS NOT NULL AND p_action = ANY (v_crossing_actions) THEN
    SELECT coalesce(pg_catalog.sum(audit_row.repeat_count), 0) INTO v_volume
    FROM public.admin_audit_log AS audit_row
    WHERE audit_row.actor_id = p_actor_id
      AND audit_row.action = ANY (v_crossing_actions)
      AND audit_row.last_seen_at > pg_catalog.now() - interval '24 hours';

    IF v_volume > v_volume_threshold THEN
      v_alarm_key := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        'identity-linkage-volume|' || p_actor_id::text || '|' || pg_catalog.to_char(
          pg_catalog.timezone('UTC', pg_catalog.now()), 'YYYY-MM-DD'), 'UTF8')), 'hex');
      BEGIN
        INSERT INTO public.admin_audit_log (
          organization_id, actor_id, action, target_id, conflict_key, details, status, repeat_count,
          last_seen_at
        ) VALUES (
          p_organization_id, p_actor_id, 'identity_linkage_volume_anomaly', NULL, v_alarm_key,
          pg_catalog.jsonb_build_object(
            'point', 'volume_alarm',
            'window_hours', 24,
            'threshold', v_volume_threshold,
            'crossings', v_volume),
          'error', 1, pg_catalog.now()
        );
        v_alarm := true;
      EXCEPTION WHEN unique_violation THEN
        UPDATE public.admin_audit_log AS audit_row
        SET details = audit_row.details || pg_catalog.jsonb_build_object('crossings', v_volume),
            repeat_count = audit_row.repeat_count + 1,
            last_seen_at = pg_catalog.now()
        WHERE audit_row.conflict_key = v_alarm_key
          AND audit_row.resolved_at IS NULL;
      END;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'inserted_first', v_inserted_first,
    'crossings_24h', v_volume,
    'alarm_fired', v_alarm
  );
END
$function$;
--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_object_owner
-- Горячая колонка правила тревоги: оно считает сумму `repeat_count` одного актора за скользящие
-- сутки на КАЖДОМ пересечении границы. Без частичного индекса это seq scan по всему журналу на
-- каждое открытие карточки — то самое «бешеная нагрузка на БД», против которого возражал владелец.
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_identity_linkage_actor
  ON public.admin_audit_log (actor_id, last_seen_at DESC)
  WHERE action IN ('identity_session_start', 'identity_patient_card_open', 'identity_patient_list_view');
