-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.record_login_failure(uuid,text,text,text)') IS NOT NULL
-- #1112, Л-8. Дверь, через которую копится итог неудачных попыток.
--
-- Счётчик блокировки НЕ ТРОГАЕМ вообще: он остаётся ровно таким, каким был, со своими правилами
-- обнуления. Здесь ведётся своя, независимая запись — владелец 14.09: «копить не счетчик для
-- блокировки а сумму попыток для устройства».
--
-- Личность СЮДА ПЕРЕДАЁТСЯ, и это не противоречие с дверью чтения, которая идентификатор не
-- принимает. Там запрет смыслообразующий: «покажи чужие устройства» не должно существовать как
-- действие. Здесь наоборот — вызывающий уже держит идентификатор на руках (`password_login_acquire`
-- вернул его ему же мгновением раньше), и ничего нового этим аргументом не открывается: дверь только
-- ПИШЕТ и не возвращает ни единого поля. Подобрать чужой идентификатор ею нельзя — ответа нет.
--
-- Почему запись не внутри дверей пароля, где личность и так известна: те двери ничего не знают ни о
-- метке устройства, ни об адресе обращения, и чтобы узнали — пришлось бы менять подпись механизма
-- блокировки входа. Менять несущую конструкцию аутентификации ради журнала — плохой размен.
CREATE OR REPLACE FUNCTION app.record_login_failure(
  p_user_id uuid,
  p_device_key text,
  p_source_ip text,
  p_kind text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $function$
DECLARE
  v_key text;
  v_addr inet;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'auth.login-failure.record',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_user_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_device_key))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_source_ip))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_kind))::app.port_typed_arg
    ]),
    'app.record_login_failure(uuid,text,text,text)'::regprocedure
  );

  IF p_user_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('password', 'second_factor') THEN
    RAISE EXCEPTION 'invalid login failure record'
      USING ERRCODE = '23514';
  END IF;

  -- Метка либо ровно та же форма, что в журнале входов, либо её нет. Мусор не «фильтруется потом»: он
  -- сложился бы в отдельный мешок и разошёлся с тем, что человек видит на экране как своё устройство.
  v_key := COALESCE(pg_catalog.btrim(p_device_key), '');
  IF v_key <> '' AND v_key !~ '^[0-9a-f]{32}$' THEN
    v_key := '';
  END IF;

  -- Адрес необязателен и неверный не роняет запись: считаем мы попытки, а не адреса. Потерять из-за
  -- кривого заголовка сам факт попытки было бы куда хуже, чем потерять её адрес.
  BEGIN
    v_addr := NULLIF(pg_catalog.btrim(COALESCE(p_source_ip, '')), '')::inet;
  EXCEPTION WHEN others THEN
    v_addr := NULL;
  END;

  INSERT INTO public.login_failure_tally AS t (
    user_id, device_key, failed_passwords, failed_second_factor,
    source_addresses, first_failure_at, last_failure_at
  ) VALUES (
    p_user_id,
    v_key,
    CASE WHEN p_kind = 'password' THEN 1 ELSE 0 END,
    CASE WHEN p_kind = 'second_factor' THEN 1 ELSE 0 END,
    CASE WHEN v_addr IS NULL THEN '{}'::inet[] ELSE ARRAY[v_addr] END,
    now(),
    now()
  )
  ON CONFLICT (user_id, device_key) DO UPDATE SET
    -- Потолок в миллион — не бизнес-правило, а защита разрядности: год непрерывного стука не должен
    -- переполнить колонку и превратить огромное число в отрицательное.
    failed_passwords =
      pg_catalog.least(t.failed_passwords + excluded.failed_passwords, 1000000),
    failed_second_factor =
      pg_catalog.least(t.failed_second_factor + excluded.failed_second_factor, 1000000),
    source_addresses =
      CASE
        WHEN v_addr IS NULL THEN t.source_addresses
        WHEN v_addr = ANY (t.source_addresses) THEN t.source_addresses
        WHEN pg_catalog.cardinality(t.source_addresses) >= 32 THEN t.source_addresses
        ELSE t.source_addresses || v_addr
      END,
    first_failure_at = pg_catalog.least(t.first_failure_at, excluded.first_failure_at),
    last_failure_at = excluded.last_failure_at;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT prosrc LIKE '%login_failure_tally%' FROM pg_catalog.pg_proc WHERE oid = 'app.append_user_login_event(uuid,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure
-- #1112, Л-8. Заморозка итога в строку входа.
--
-- Подпись НЕ МЕНЯЕТСЯ: у этой двери уже есть всё нужное — и человек, и метка устройства. Поэтому
-- каталог возможностей и вызывающий код остаются прежними.
--
-- Гашение итога и запись строки идут ОДНОЙ операцией намеренно. Разнеси их по двум вызовам — и
-- появится промежуток, в котором итог уже обнулён, а строки журнала ещё нет; отказ в этом промежутке
-- стирал бы ровно то число, ради которого всё это затеяно, и никто бы не заметил.
--
-- Гасим ДВА мешка: свой (по метке устройства) и общий «с неизвестных». Общий сливается в ближайший
-- успешный вход — он не принадлежит никакому устройству по построению, и держать его вечно незачем:
-- человек, который вошёл, уже увидел на экране, что к его учётной записи стучались.
CREATE OR REPLACE FUNCTION app.append_user_login_event(
  p_user_id uuid,
  p_method text,
  p_role text,
  p_ip text,
  p_user_agent text,
  p_device_kind text,
  p_os text,
  p_browser text,
  p_host text,
  p_session_ref text,
  p_device_id text,
  p_country text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app, app_ext, pg_temp
AS $function$
DECLARE
  inserted_id uuid;
  v_pw_device integer;
  v_pw_unknown integer;
  v_unknown_sources integer;
  v_second_factor integer;
  v_since timestamptz;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'auth.user-login-event.append',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_user_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_method))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_role))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_ip))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_user_agent))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_device_kind))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_os))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_browser))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_host))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_session_ref))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_device_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_country))::app.port_typed_arg
    ]),
    'app.append_user_login_event(uuid,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  );

  -- Метка устройства и страна приходят СНАРУЖИ, но форму им задаёт дверь: метка — ровно 32 знака
  -- шестнадцатеричного алфавита (её выдаёт приложение и никто её не вводит руками), страна — две
  -- заглавные латинские буквы кода страны. Мусор в этих колонках сделал бы разбор взлома
  -- недостоверным, поэтому он отказывается здесь, а не «отфильтруется потом на экране».
  IF p_user_id IS NULL
    OR p_method IS NULL
    OR pg_catalog.btrim(p_method) = ''
    OR p_role IS NULL
    OR p_role NOT IN ('client', 'doctor', 'admin')
    OR p_session_ref IS NULL
    OR pg_catalog.btrim(p_session_ref) = ''
    OR pg_catalog.length(p_method) > 100
    OR pg_catalog.length(p_role) > 100
    OR pg_catalog.length(p_user_agent) > 8192
    OR pg_catalog.length(p_device_kind) > 100
    OR pg_catalog.length(p_os) > 200
    OR pg_catalog.length(p_browser) > 200
    OR pg_catalog.length(p_host) > 500
    OR pg_catalog.length(p_session_ref) > 200
    OR (p_device_id IS NOT NULL AND p_device_id !~ '^[0-9a-f]{32}$')
    OR (p_country IS NOT NULL AND p_country !~ '^[A-Z]{2}$')
  THEN
    RAISE EXCEPTION 'invalid user login event'
      USING ERRCODE = '23514';
  END IF;

  -- Когда метки нет, оба условия совпадают на пустой строке, и весь итог законно оказывается
  -- «с неизвестного устройства»: вход из браузера без метки — это и есть неизвестное устройство.
  WITH drained AS (
    DELETE FROM public.login_failure_tally t
     WHERE t.user_id = p_user_id
       AND t.device_key IN (COALESCE(p_device_id, ''), '')
    RETURNING t.device_key, t.failed_passwords, t.failed_second_factor,
              t.source_addresses, t.first_failure_at
  )
  SELECT
    COALESCE(pg_catalog.sum(d.failed_passwords) FILTER (WHERE d.device_key <> ''), 0)::integer,
    COALESCE(pg_catalog.sum(d.failed_passwords) FILTER (WHERE d.device_key = ''), 0)::integer,
    COALESCE(
      pg_catalog.max(pg_catalog.cardinality(d.source_addresses))
        FILTER (WHERE d.device_key = ''),
      0)::integer,
    COALESCE(pg_catalog.sum(d.failed_second_factor), 0)::integer,
    pg_catalog.min(d.first_failure_at)
  INTO v_pw_device, v_pw_unknown, v_unknown_sources, v_second_factor, v_since
  FROM drained d;

  INSERT INTO public.user_login_events (
    user_id,
    occurred_at,
    outcome,
    failure_reason,
    method,
    role,
    ip,
    user_agent,
    device_kind,
    os,
    browser,
    host,
    session_ref,
    device_id,
    country,
    failed_passwords_before,
    failed_passwords_before_unknown,
    unknown_sources_before,
    failed_second_factor_before,
    failures_since
  ) VALUES (
    p_user_id,
    now(),
    'success',
    NULL,
    pg_catalog.btrim(p_method),
    p_role,
    NULLIF(pg_catalog.btrim(p_ip), '')::inet,
    p_user_agent,
    p_device_kind,
    p_os,
    p_browser,
    p_host,
    p_session_ref,
    p_device_id,
    p_country,
    COALESCE(v_pw_device, 0),
    COALESCE(v_pw_unknown, 0),
    COALESCE(v_unknown_sources, 0),
    COALESCE(v_second_factor, 0),
    v_since
  )
  RETURNING id INTO inserted_id;

  RETURN inserted_id;
END
$function$;
