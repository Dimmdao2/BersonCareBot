-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT prosrc NOT LIKE '%pg_catalog.least%' FROM pg_catalog.pg_proc WHERE oid = 'app.record_login_failure(uuid,text,text,text)'::regprocedure
-- #1112, Л-8. Исправление: `LEAST` — конструкция языка, а не функция каталога.
--
-- В предыдущей версии стояло `pg_catalog.least(...)`. Такой функции не существует: `LEAST`/`GREATEST`
-- разбирает сам парсер, как `COALESCE`, и схемы у них нет. Тело plpgsql имена не разрешает при
-- создании, поэтому миграция прошла молча, а первый же неверный пароль получил 42883 — и попытка не
-- считалась. Поймано живым прогоном на DEV, статические проверки этого увидеть не могли.
--
-- Полный текст повторён целиком, а не заплаткой: тело функции — это её определение, и заменять его
-- надо целиком, иначе следующий читающий не поймёт, какая версия перед ним.
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

  -- Метка либо ровно той же формы, что в журнале входов, либо её нет. Мусор не «отфильтруется
  -- потом»: он сложился бы в отдельный мешок и разошёлся с тем, что человек видит как своё устройство.
  v_key := COALESCE(pg_catalog.btrim(p_device_key), '');
  IF v_key <> '' AND v_key !~ '^[0-9a-f]{32}$' THEN
    v_key := '';
  END IF;

  -- Адрес необязателен, и неверный не роняет запись: считаем мы попытки, а не адреса. Потерять из-за
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
    failed_passwords = LEAST(t.failed_passwords + excluded.failed_passwords, 1000000),
    failed_second_factor = LEAST(t.failed_second_factor + excluded.failed_second_factor, 1000000),
    source_addresses =
      CASE
        WHEN v_addr IS NULL THEN t.source_addresses
        WHEN v_addr = ANY (t.source_addresses) THEN t.source_addresses
        WHEN pg_catalog.cardinality(t.source_addresses) >= 32 THEN t.source_addresses
        ELSE t.source_addresses || v_addr
      END,
    -- LEAST пропускает NULL и возвращает непустое значение — ровно то, что нужно строке, заведённой
    -- до появления этой колонки.
    first_failure_at = LEAST(t.first_failure_at, excluded.first_failure_at),
    last_failure_at = excluded.last_failure_at;
END
$function$;
