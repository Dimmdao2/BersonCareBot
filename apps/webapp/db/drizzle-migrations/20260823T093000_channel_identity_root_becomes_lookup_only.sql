-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.integrator_upsert_channel_identity(text,text,text)')::oid) !~ 'INSERT INTO public[.]platform_users'
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.integrator_upsert_channel_identity(text,text,text)')::oid) ~ 'unknown channel identity is a lookup miss'
--
-- D25 (owner decision 23.08.2026, "Роль бота после появления приложения"): `app.integrator_upsert_
-- channel_identity` перестаёт создавать канонического человека. Это ЕДИНСТВЕННЫЙ SQL-корень за
-- `user.upsert` — тем самым любой Telegram/MAX webhook (произвольный `/start`, сообщение, callback)
-- от неизвестного messenger id перестаёт заводить `public.platform_users` / `public.user_identity` /
-- `public.user_channel_bindings` / `public.user_channel_preferences`. Корень не доказывает владение
-- телефоном — это делает только token-bound `webapp.phoneMessengerBind.complete`
-- (`app.phone_messenger_bind_completion_state`, отдельный корень, не тронут этой миграцией).
--
-- ЧТО СЛОМАНО. `createIncomingEventPipeline` зовёт `ActorResolutionPort.ensureActor` на КАЖДОЕ
-- входящее сообщение/callback юзера, эмитируя `user.upsert`. `writePort.ts` `user.upsert` без
-- условий вызывал этот корень; ветка "не нашли существующую привязку" делала INSERT в
-- `platform_users` (`display_name=''`), `user_identity`, `user_channel_bindings` и
-- `user_channel_preferences`. Итог — произвольный вебхук от НЕИЗВЕСТНОГО messenger id заводил
-- пустую канонической учётку, которую владелец 23.08 прямо запретил: «Произвольный `/start`,
-- сообщение, callback или contact без действующей token-bound попытки не создаёт `platform_users`».
-- Тот факт, что функция принадлежит webapp-владельцу шва, не переносит владение действием —
-- вызов из generic webhook им и остаётся.
--
-- ЧТО МЕНЯЕТСЯ. Тело сужено до READ + опционального UPDATE display_handle УЖЕ существующей
-- привязки. Ветка `IF v_platform_user_id IS NOT NULL THEN … RETURN;` дословно та же. Ветка ниже —
-- четыре INSERT — удалена целиком и заменена на `RETURN;` без строки: неизвестная идентичность —
-- это НЕ ошибка (никакого `RAISE EXCEPTION`), это пустой результат ("lookup miss"), которого
-- вызывающий TS-код (`upsertBootstrapChannelIdentity`) обязан ожидать как обычный случай.
--
-- Сигнатура, возврат, владелец, `SECURITY DEFINER`, `search_path` и хеш типизированных аргументов
-- прежние, поэтому `CREATE OR REPLACE` сохраняет OID и ни одна ссылка `regprocedure` не протухает.
--
-- РАЗБОР ПРАВ (AGENTS.md §1, «Перед приземлением миграции — разбор её прав»).
-- 1. Миграция меняет ОДНО тело функции; не создаёт, не меняет и не удаляет ни одной таблицы,
--    колонки или индекса.
-- 2. Тело исполняется от владельца `app_seam_identity_lookup_owner` (SECURITY DEFINER, не изменён);
--    роль рантайма — `app_integrator_resolver`, дверь и класс контекста те же.
-- 3. Тело теперь исполняется с МЕНЬШИМ набором операций, чем раньше: три `INSERT` (в
--    `public.platform_users`, `public.user_identity`, `public.user_channel_preferences`) и один
--    `INSERT`-путь `public.user_channel_bindings` удалены из тела целиком. Единственные операции,
--    оставшиеся в теле: `SELECT` на `public.platform_users`/`public.user_channel_bindings` и точечный
--    `UPDATE` `public.user_channel_bindings.display_handle` для уже существующей строки. Новых
--    операций и новых отношений тело не приобретает — расширять декларацию не нужно.
-- 4. Чего не хватало в декларации: ничего. Обратное — декларация теперь ШИРЕ фактически исполняемых
--    операций (`operations: ['SELECT','INSERT']` на `platform_users`, лишний `INSERT` на
--    `user_channel_bindings`, обе строки `user_identity`/`user_channel_preferences` целиком) — сужена
--    в этой же ветке в `deploy/postgres/privileges/declaration.ts`, артефакты перегенерированы тем же
--    коммитом (`generate-cli.mjs --all`). Права, выданные reconcile сверх фактически используемых
--    операций, — не риск целостности, но и не цель этой миграции; они убраны, раз тело больше их не
--    использует (см. правило «Удаление колонки» тем же списком в обратную сторону — здесь удаляется
--    операция, а не колонка, тот же принцип).

CREATE OR REPLACE FUNCTION app.integrator_upsert_channel_identity(
  p_channel_code text,
  p_external_id text,
  p_display_handle text
)
RETURNS TABLE(platform_user_id uuid, account_created boolean, channel_binding_inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE
  v_platform_user_id uuid;
  v_display_handle text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_integrator_resolver'::name, 'integrator'::app.port_context_class, 'integrator.channel-identity.upsert', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg]), 'app.integrator_upsert_channel_identity(text,text,text)'::regprocedure);

  IF p_channel_code NOT IN ('telegram', 'max') THEN
    RAISE EXCEPTION 'integrator_channel_identity_channel_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_external_id IS NULL OR btrim(p_external_id) = '' THEN
    RAISE EXCEPTION 'integrator_channel_identity_external_id_required' USING ERRCODE = '22023';
  END IF;

  v_display_handle := nullif(
    left(regexp_replace(btrim(coalesce(p_display_handle, '')), '^@+', ''), 32),
    ''
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended('integrator-channel-identity:' || p_channel_code || ':' || p_external_id, 0)
  );

  SELECT person.id
    INTO v_platform_user_id
    FROM public.user_channel_bindings AS binding
    INNER JOIN public.platform_users AS person ON person.id = binding.user_id
   WHERE binding.channel_code = p_channel_code
     AND binding.external_id = p_external_id
     AND person.merged_into_id IS NULL;

  IF v_platform_user_id IS NOT NULL THEN
    IF v_display_handle IS NOT NULL THEN
      UPDATE public.user_channel_bindings
         SET display_handle = v_display_handle
       WHERE user_id = v_platform_user_id
         AND channel_code = p_channel_code
         AND external_id = p_external_id
         AND display_handle IS DISTINCT FROM v_display_handle;
    END IF;
    RETURN QUERY SELECT v_platform_user_id, false, false;
    RETURN;
  END IF;

  -- D25 correction: unknown channel identity is a lookup miss, not a creation trigger. A generic
  -- Telegram/MAX webhook proves no phone ownership; it must never seed `platform_users`,
  -- `user_identity`, `user_channel_bindings` or `user_channel_preferences`. Zero rows is the whole
  -- contract for "not found" — no exception, the caller treats this as an ordinary unresolved actor.
  RETURN;
END
$function$;
