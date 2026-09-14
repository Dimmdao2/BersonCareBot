-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.consume_login_security_action(text)') IS NOT NULL
-- #1112 Л-8. Дверь читала строку ЦЕЛИКОМ (`SELECT action.*` в переменную-строку таблицы), а права
-- на этой таблице колоночные: выдано ровно то, что перечислено в декларации, а служебная колонка
-- времени создания там не перечислена и не нужна. Звёздочка молча требовала и её — и живое нажатие
-- кнопки в письме отвечало отказом доступа. Гейт тела функции этого не ловит: он видит имя таблицы,
-- но не разворачивает звёздочку в список колонок. Поэтому берём только те колонки, которые реально
-- нужны; лишнего у двери быть не должно и по сути.
CREATE OR REPLACE FUNCTION app.consume_login_security_action(p_token_hash text)
RETURNS TABLE(outcome text, user_id uuid, email text, source_login_event_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $function$
DECLARE
  v_action_id uuid;
  v_user_id uuid;
  v_used_at timestamptz;
  v_expires_at timestamptz;
  v_source_login_event_id uuid;
  v_email text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'auth.login-security-action.consume',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_token_hash))::app.port_typed_arg
    ]),
    'app.consume_login_security_action(text)'::regprocedure
  );

  SELECT action.id, action.user_id, action.used_at, action.expires_at, action.source_login_event_id
  INTO v_action_id, v_user_id, v_used_at, v_expires_at, v_source_login_event_id
  FROM public.login_security_actions AS action
  WHERE action.token_hash = p_token_hash
    AND action.purpose = 'revoke_sessions_and_require_password_change'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_used_at IS NOT NULL THEN
    RETURN QUERY SELECT 'used'::text, NULL::uuid, NULL::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_expires_at <= statement_timestamp() THEN
    RETURN QUERY SELECT 'expired'::text, NULL::uuid, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.platform_users AS users
  SET session_epoch = users.session_epoch + 1,
      updated_at = statement_timestamp()
  WHERE users.id = v_user_id
    AND users.merged_into_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'login security action user is unavailable'
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.user_password_credentials AS credentials
  SET must_change_at = statement_timestamp(),
      updated_at = statement_timestamp()
  WHERE credentials.user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'login security action password credential is unavailable'
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.login_security_actions AS action
  SET used_at = statement_timestamp()
  WHERE action.id = v_action_id;

  SELECT contact.value_normalized
  INTO v_email
  FROM public.user_contacts AS contact
  WHERE contact.platform_user_id = v_user_id
    AND contact.contact_kind = 'email'
    AND contact.confirmed_at IS NOT NULL
  ORDER BY contact.is_primary DESC, contact.created_at, contact.id
  LIMIT 1;

  RETURN QUERY
  SELECT 'consumed'::text, v_user_id, v_email, v_source_login_event_id;
END
$function$;
