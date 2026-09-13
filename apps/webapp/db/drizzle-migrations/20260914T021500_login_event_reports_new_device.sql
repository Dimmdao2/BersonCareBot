-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- #1112, Л-8.2а. Дверь записи входа теперь говорит, видели ли мы это устройство у этого человека.
--
-- Зачем менять возврат, а не спрашивать отдельным запросом: ответ зависит от того, ЕСТЬ ЛИ уже
-- строка этого входа в журнале. Спроси до вставки отдельным вызовом — и между вопросом и вставкой
-- окажется промежуток, в котором параллельный вход с той же метки успеет записаться; спроси после —
-- и найдёшь собственную только что вставленную строку, то есть никогда не увидишь нового
-- устройства. Внутри двери оба действия идут по порядку в одном вызове, и вопрос задаётся ДО вставки.
--
-- Возврат меняется, поэтому нужен DROP: PostgreSQL не позволяет `CREATE OR REPLACE` со сменой типа
-- результата. Список аргументов прежний, так что запись в каталоге возможностей порта не меняется.
DROP FUNCTION IF EXISTS app.append_user_login_event(uuid,text,text,text,text,text,text,text,text,text,text,text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_function_result('app.append_user_login_event(uuid,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure) LIKE '%first_login_ever%'
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
RETURNS TABLE(event_id uuid, device_was_new boolean, first_login_ever boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app, app_ext, pg_temp
AS $function$
DECLARE
  v_event_id uuid;
  v_device_new boolean;
  v_first_login boolean;
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

  -- ⛔ СТРОГО ДО вставки: после неё этот вопрос отвечает сам себе.
  --
  -- Браузер без метки считается НОВЫМ устройством, и это не поблажка, а точное утверждение: узнать
  -- его нечем. Метка, оставшаяся от входа ДРУГОГО человека на общем компьютере, тоже даёт «новое» —
  -- для ЭТОЙ учётной записи место действительно новое, и сказать иначе значило бы соврать.
  v_device_new := p_device_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.user_login_events e
     WHERE e.user_id = p_user_id
       AND e.outcome = 'success'
       AND e.device_id = p_device_id
  );

  -- Первый вход в жизни учётной записи — не «вход из нового места», а просто первый вход. Человек
  -- только что зарегистрировался и стоит перед экраном; письмо «вас взломали» здесь было бы
  -- испугом на ровном месте. Признак отдаётся отдельно, а не подмешивается в предыдущий, чтобы оба
  -- поля значили ровно то, как называются.
  v_first_login := NOT EXISTS (
    SELECT 1
      FROM public.user_login_events e
     WHERE e.user_id = p_user_id
       AND e.outcome = 'success'
  );

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
  RETURNING id INTO v_event_id;

  RETURN QUERY SELECT v_event_id, v_device_new, v_first_login;
END
$function$;
