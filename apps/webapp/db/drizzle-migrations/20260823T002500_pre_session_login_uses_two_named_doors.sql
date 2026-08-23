-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.pre_session_load_email_auth_state(text)') IS NOT NULL
--
-- D15b/6: опознание почты до человеческой сессии не получает реляционную дверь. Раньше
-- `pgEmailPasswordLookup.loadEmailAuthStateRows` само читало `platform_users`, `user_contacts` и
-- `user_password_credentials` под bootstrap-принципалом, поэтому port runtime отказывал ещё до
-- SQL: capability `pre_session` с purpose=relation намеренно не существует. Эта дверь возвращает
-- только три уже потребляемых признака и сохраняет прежний resolver подтверждённых адресов и
-- отсечение `merged_into_id IS NOT NULL`.
CREATE FUNCTION app.pre_session_load_email_auth_state(p_email_norm text)
 RETURNS TABLE(id uuid, email_verified boolean, has_password boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER PARALLEL RESTRICTED
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-password.account-state', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.pre_session_load_email_auth_state(text)'::regprocedure);

  RETURN QUERY
  SELECT users.id,
         (EXISTS (
           SELECT 1
           FROM public.user_contacts AS contact
           WHERE contact.platform_user_id = users.id
             AND contact.contact_kind = 'email'
             AND contact.is_primary = true
             AND contact.confirmed_at IS NOT NULL
         ) OR matched.matched_primary = false) AS email_verified,
         EXISTS (
           SELECT 1
           FROM public.user_password_credentials AS credentials
           WHERE credentials.user_id = users.id
         ) AS has_password
  FROM public.platform_users AS users
  INNER JOIN app.find_platform_user_ids_by_any_confirmed_email(p_email_norm) AS matched
    ON matched.user_id = users.id
  WHERE users.merged_into_id IS NULL;
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app_ext
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app_ext.read_preferred_auth_channel_code(uuid)') IS NOT NULL
--
-- Единственный SELECT предпочтительного канала. Обе публичные двери ниже делегируют сюда, поэтому
-- pre-session и patient пути не могут разъехаться по семантике чтения.
CREATE FUNCTION app_ext.read_preferred_auth_channel_code(p_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER PARALLEL UNSAFE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT preference.channel_code
  FROM public.user_channel_preferences AS preference
  WHERE (
      preference.platform_user_id = p_user_id
      OR (preference.platform_user_id IS NULL AND preference.user_id = p_user_id::text)
    )
    AND preference.is_preferred_for_auth = true
  LIMIT 1
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'auth.phone-login.preferred-channel') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.get_preferred_auth_channel_code(uuid)')
--
-- Та же pre-session граница для уже существующей двери предпочтительного канала. Старое тело
-- принимало любой attested patient/staff context и потому не могло доказать новую exact capability.
-- Сигнатура и смысл чтения не меняются; меняется только входной гейт на точную дверь телефонного
-- логина. EXECUTE и строку capability выдаёт privilege reconcile, не миграция.
CREATE OR REPLACE FUNCTION app.get_preferred_auth_channel_code(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER PARALLEL UNSAFE
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.phone-login.preferred-channel', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.get_preferred_auth_channel_code(uuid)'::regprocedure);

  RETURN app_ext.read_preferred_auth_channel_code(p_user_id);
END
$function$
;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'patient.preferred-auth-channel.read') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.get_current_patient_preferred_auth_channel_code()')
--
-- Страница профиля уже несёт принятую личность пациента. Её дверь не принимает user id из кода:
-- субъект берётся только из принятого patient-контекста, а чтение делегируется общему helper выше.
CREATE FUNCTION app.get_current_patient_preferred_auth_channel_code()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER PARALLEL UNSAFE
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.preferred-auth-channel.read', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.get_current_patient_preferred_auth_channel_code()'::regprocedure);

  RETURN app_ext.read_preferred_auth_channel_code(app.current_patient_user_id());
END
$function$
;
