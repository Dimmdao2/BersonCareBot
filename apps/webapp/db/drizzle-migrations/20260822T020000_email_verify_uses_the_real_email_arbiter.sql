-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-VERIFY: SELECT position('ON CONFLICT (value_normalized)' IN (SELECT p.prosrc FROM pg_catalog.pg_proc AS p WHERE p.oid = 'app.email_auth_verify_user_email(uuid,text)'::regprocedure)) > 0;
-- Регистрация специалиста и любое подтверждение почты падали на `42P10 there is no unique or
-- exclusion constraint matching the ON CONFLICT specification`: тело, приземлённое
-- `20260821T040000_cut_over_canonical_contacts.sql`, называет арбитром
-- `(platform_user_id, contact_kind, value_normalized) WHERE contact_kind = 'email'`, а такого
-- индекса на `public.user_contacts` нет — уникальность почты держит частичный
-- `uq_user_contacts_email (value_normalized) WHERE contact_kind = 'email'`. Планировщик проверяет
-- арбитра при разборе тела, поэтому отказ приходит на КАЖДОМ вызове, а не на коллизии.
--
-- Арбитр здесь — тот же, которым пользуются бэкфиллы той же миграции (её строки 42-52): попадание
-- по значению почты плюс `DO UPDATE ... WHERE` по владельцу строки. Условие владельца обязательно:
-- без него подтверждение своей почты переписывало бы `confirmed_at` в строке ДРУГОГО человека,
-- которому это значение уже принадлежит. С ним поведение ровно то, что и предполагалось прежним
-- (несуществующим) арбитром: функция трогает только собственную строку вызывающего.
CREATE OR REPLACE FUNCTION app.email_auth_verify_user_email(p_user_id uuid, p_email text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.email.verify', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.email_auth_verify_user_email(uuid,text)'::regprocedure);
INSERT INTO public.user_contacts (
  platform_user_id, contact_kind, value_normalized, is_primary,
  confirmed_at, source_origin, updated_at
) VALUES (
  p_user_id, 'email', lower(btrim(p_email)), true, now(), 'direct', now()
)
ON CONFLICT (value_normalized) WHERE contact_kind = 'email'
DO UPDATE SET
  is_primary = true,
  confirmed_at = now(),
  updated_at = now()
WHERE public.user_contacts.platform_user_id = EXCLUDED.platform_user_id
$function$
;
