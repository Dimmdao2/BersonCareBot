-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'find_platform_user_ids_by_any_confirmed_email') = 0 AND pg_catalog.strpos(p.prosrc, 'public.user_contacts AS matched_email') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.email_password_find_login_candidate(text)');
--
-- Переотправка кода регистрации была мертва по построению (находка владельца, живой прогон TEST
-- 22.08.2026). Повторная регистрация клиники той же почтой и тем же паролём отвечала
-- `409 duplicate_email`, хотя маршрут
-- `apps/webapp/src/app/api/auth/specialist-signup/start/route.ts` на отказ дубля НЕ отбивает: он
-- зовёт `tryResendRegistrationChallenge` и посылает код ещё раз. Единственный потребитель этой
-- ветки — `app.email_password_find_login_candidate(text)`, и его тело искало человека через
-- `app.find_platform_user_ids_by_any_confirmed_email(p_email_norm)`, где стоит
-- `uc.confirmed_at IS NOT NULL`. У того, кому переотправка нужна, почта не подтверждена по
-- определению — он кода и не вводил. Функция возвращала пусто, вызывающий получал `{ok:false}`,
-- маршрут отдавал 409. Отдельное условие `WHERE email_verified = false` у вызывающего показывает,
-- что неподтверждённого там ЖДУТ: пара противоречила сама себе.
--
-- Цена для живого человека: не дошло письмо, закрыта вкладка или трижды ошибся в коде — назад
-- дороги нет. Регистрация говорит «уже существует», код не приходит, вход по паролю запрещён
-- (почта не подтверждена), восстановление пароля тоже требует подтверждённой почты. Достаёт из
-- этого только администратор руками.
--
-- Это хвост цутовера почты `20260821T040000`: чтение переехало на ПОДТВЕРЖДЁННЫЕ контакты, а до
-- него `app.find_platform_user_ids_by_any_confirmed_email` отвечала «основной адрес в колонке
-- (любой) ЛИБО подтверждённый вторичный», и неподтверждённый черновик через колонку находился.
-- Флаг `email_verified` этот же случай и кодировал выражением
-- `matched_email.confirmed_at IS NOT NULL OR fpu.matched_primary = false`, которое после цутовера
-- стало тождественно истинным: каждая строка от `fpu` уже подтверждена.
--
-- Что здесь сделано. Дверь ищет человека по `public.user_contacts` напрямую, БЕЗ фильтра
-- подтверждения, и берёт `email_verified` из `confirmed_at` найденной строки. Адрес уникален на
-- всю платформу (`uq_user_contacts_email` — частичный UNIQUE по `value_normalized` при
-- `contact_kind = 'email'`), поэтому строка ровно одна и `LIMIT 1` детерминирован. Так же и по той
-- же причине устроен сосед по шву `app.email_password_find_reset_candidate(text)` — он тоже
-- смотрит `public.user_contacts` сам; второго вида поиска здесь не заводится, наоборот, вызов
-- делегата уходит (`delegatesTo` снят в декларации тем же изменением).
--
-- Дизъюнкт `fpu.matched_primary = false` не переносится сознательно. До цутовера он значил «адрес
-- подтверждён провайдером через OAuth», а после цутовера ровно это записано в `confirmed_at` самой
-- строки контакта (`source_origin = 'oauth'` приезжает с `confirmed_at`). Перенести его как
-- `matched_email.is_primary = false` было бы ОСЛАБЛЕНИЕМ: неподтверждённый вторичный контакт
-- считался бы подтверждённым.
--
-- Граница безопасности не сдвигается. Подтверждённый чужой аккаунт по-прежнему даёт
-- `email_verified = true`, вызывающий отсекает его своим `WHERE email_verified = false`, и маршрут
-- отвечает тем же `409 duplicate_email` — письмо на чужой подтверждённый адрес не уходит.
-- Переотправка своего черновика срабатывает только после `argon2.verify` против сохранённого хеша
-- в `tryResendRegistrationChallenge`, поэтому постороннему, не знающему пароль, оба случая
-- по-прежнему выглядят одинаково (`409`) — требование D27-A2 о нейтральном ответе цело.
--
-- `CREATE OR REPLACE` сохраняет OID, владельца, сигнатуру, тип возврата, волатильность,
-- `SECURITY DEFINER`, `SET search_path` и гейт `require_accepted_context` первым исполняемым
-- оператором дословно, поэтому `function_identity` (`regprocedure`), объявленные capability и все
-- колл-сайты адресуют тот же объект. Поверхность отношений не расширяется: тело читает
-- `public.user_contacts`, `public.platform_users` и `public.user_password_credentials` — ровно то,
-- что уже объявлено. GRANT/REVOKE/POLICY здесь нет (AGENTS.md §1).
CREATE OR REPLACE FUNCTION app.email_password_find_login_candidate(p_email_norm text)
 RETURNS TABLE(user_id uuid, password_hash text, email_verified boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.password.registration.resend-candidate', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.email_password_find_login_candidate(text)'::regprocedure);

  RETURN QUERY
  SELECT upc.user_id, upc.password_hash,
         (matched_email.confirmed_at IS NOT NULL) AS email_verified
  FROM public.user_contacts AS matched_email
  INNER JOIN public.platform_users AS pu ON pu.id = matched_email.platform_user_id
  INNER JOIN public.user_password_credentials AS upc ON upc.user_id = pu.id
  WHERE matched_email.contact_kind = 'email'
    AND matched_email.value_normalized = lower(btrim(p_email_norm))
    AND pu.merged_into_id IS NULL
  LIMIT 1;
END
$function$;
