-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('app.integrator_read_channel_binding_identity(text,text,text)')::oid) LIKE '%''integrator''::app.port_context_class%'
--
-- Опознание получателя во входящем событии: ВТОРАЯ ДВЕРЬ у существующего корня.
--
-- ЧТО СЛОМАНО. `handleIncomingEvent` (`apps/integrator/src/kernel/domain/handleIncomingEvent.ts:122`)
-- читает получателя РОВНО В ОДНОМ месте, но исполняется это место под ТРЕМЯ принципалами: вебхук
-- выбирает их тройкой `integrator` → `organization` → `bootstrap`
-- (`telegram/webhook.ts:372,377,378`, `max/webhook.ts:311,316,317` и `:403,407`,
-- `vk/webhook.ts:62,64,65`). У корня была одна дверь — класса `tenant_service`, — поэтому работал
-- только СРЕДНИЙ маршрут. Под интеграторским рантайм порта не находил возможности и бросал; бросок
-- не ловит никто до `eventGateway` (`kernel/eventGateway/index.ts:67`), тот отвечает
-- `PIPELINE_FAILED`, вебхук пишет warn и возвращает мессенджеру 200. Для человека это НЕ «бот не
-- узнал меня», а «бот молчит»: ни одного ответа, и повтора не будет — 200 его отменяет. Бьёт по
-- самым связанным людям: интеграторский принципал выбирается как раз тогда, когда и клиника, и
-- `integrator_user_id` уже известны.
--
-- ЧТО МЕНЯЕТСЯ. Гейт корня ветвится ПО ДВЕРИ: дверь организационного принципала — класс
-- `tenant_service`, дверь интеграторского — класс `integrator`. Роль у обеих одна и та же,
-- `app_integrator_request`, и это не послабление, а следствие: обе двери принадлежат порту
-- ИНТЕГРАТОРА, чужой роли ни одна ветка не называет. Второго корня нет, роль не расширена, форма
-- «одна дверь принимает две роли» не введена. Форма гейта взята у уже живущего в репозитории
-- соседа `app.record_reminder_occurrence_finalized_projection`
-- (`20260822T140000_the_shared_roots_name_the_role_of_their_door.sql`), второй такой формы не
-- заводим.
--
-- ПОЧЕМУ РАЗЛИЧИТЕЛЬ — `app.current_integrator_user_id()`, А НЕ GUC `role`. У соседа двери
-- различались ролью, поэтому различителем был `current_setting('role')`. Здесь роль у обеих
-- дверей одна, а различается КЛАСС, и `role` его не называет. Класс лежит в
-- `app_ext.accepted_port_contexts`, но владелец этого шва (`app_seam_identity_lookup_owner`)
-- не имеет на неё SELECT (замерено на `bcb_webapp_dev`: `has_table_privilege(...)` = f при
-- USAGE = t); выдать право значило бы завести ВТОРОГО читателя принятого контекста рядом с
-- `app.require_accepted_context` — ровно тот дубль прохода, который запрещает AGENTS.md §5.
-- Поэтому класс называет ЕДИНСТВЕННЫЙ уже объявленный аксессор интеграторской личности:
-- `app.install_port_context` (`deploy/postgres/port-context/contract.sql:399-405`) требует
-- `integrator_user_id IS NOT NULL` у класса `integrator` с ролью `app_integrator_request` и
-- `integrator_user_id IS NULL` у класса `tenant_service` — то есть непустой
-- `app.current_integrator_user_id()` возможен ровно у одного из двух классов и ни у чего больше.
--
-- ПРОБА НЕ ЯВЛЯЕТСЯ ПРОВЕРКОЙ. Она только ВЫБИРАЕТ ветку; принимает или отвергает по-прежнему
-- `app.require_accepted_context`, сверяя роль, класс, цель, хеш типизированных аргументов и
-- идентичность функции со строкой принятого контекста. Ошибись проба в любую сторону — гейт
-- ответит 42501; открыть дверь, которой порт не открывал, она не может. Аксессор при отсутствии
-- интеграторского контекста сам поднимает 42501, поэтому проба обёрнута в обработчик
-- `insufficient_privilege`: «нет интеграторского контекста» — это ответ пробы, а не отказ корня.
--
-- СТЕНА АРЕНДАТОРА НЕ ТРОНУТА и не может ослабнуть новой дверью: у класса `integrator` с ролью
-- `app_integrator_request` `organization_id` обязателен тем же оператором контракта, что и у
-- `tenant_service`, а `app.current_org_id()` читает обе строки (её список target_role включает
-- `app_integrator_request`). Предикат «активный сотрудник ЛИБО активный зачисленный» в теле
-- остался дословно тем же и по-прежнему несущий: инъекция его выреза показана в отчёте
-- `docs/_TODO/runs/integrator-cleanup/INCOMING_EVENT_RECIPIENT_DOOR_2026-08-22.md`.
--
-- ТРЕТЬЕЙ ДВЕРИ НЕТ — bootstrap-маршрут не чинится дверью и не должен. Bootstrap-принципал по
-- построению не несёт организации: `install_port_context` требует `organization_id IS NULL` и у
-- класса `pre_session`, и у класса `integrator` с ролью `app_integrator_resolver` — единственных
-- двух классов, которые рантайм порта вообще подбирает под bootstrap
-- (`portContextRuntime.ts:219-223`). Без организации стена арендатора не выполнима, а дверь без
-- стены была бы ШИРЕ прежнего чтения — чужая клиника стала бы видна. Поэтому под bootstrap чтение
-- не переводится, а НЕ ДЕЛАЕТСЯ: вызывающий (`repos/platformUserByChannel.ts`) не идёт в базу без
-- арендатора и отвечает «получатель не опознан» вместо того, чтобы уронить всё событие.
--
-- ТЕЛО. Сигнатура, возврат, владелец, волатильность, `SECURITY DEFINER`, `search_path` и хеш
-- типизированных аргументов прежние, поэтому `CREATE OR REPLACE` сохраняет OID и ни одна ссылка
-- `regprocedure` не протухает. Тело взято из файла
-- `20260822T150000_the_integrator_readers_get_named_roots.sql` — с DEV его снять нельзя, корень там
-- ещё не приземлён (та миграция pending), и другого источника у него нет. Изменён ТОЛЬКО гейт.
--
-- РАЗБОР ПРАВ (AGENTS.md §1, «Перед приземлением миграции — разбор её прав»).
-- 1. Миграция меняет ОДНО тело функции и не создаёт, не меняет и не удаляет ни одной таблицы,
--    колонки или индекса.
-- 2. Тело исполняется от владельца `app_seam_identity_lookup_owner` (SECURITY DEFINER, не изменён);
--    роль рантайма у ОБЕИХ дверей — `app_integrator_request`.
-- 3. Чтобы тело ИСПОЛНИЛОСЬ, владельцу нужны: SELECT на пяти отношениях `public.*`, которые уже
--    объявлены в `relationSurfaces` этого корня и не расширяются (список читаемых отношений и
--    колонок не изменился ни на одну колонку), плюс EXECUTE на `app.require_accepted_context`,
--    `app.hash_port_typed_args`, `app.current_org_id` и — новое в этой миграции —
--    `app.current_integrator_user_id`. Замер на `bcb_webapp_dev`:
--    `has_function_privilege('app_seam_identity_lookup_owner','app.current_integrator_user_id()','EXECUTE')`
--    = t, право уже есть и декларацией не добавляется.
-- 4. Чего не хватало в декларации: строки возможности для ВТОРОЙ двери. Добавлена в этой же ветке —
--    `integrator_port_channel_binding_identity_read_integrator_context` в
--    `deploy/postgres/privileges/declaration.ts`. `GRANT`/`REVOKE`/`CREATE POLICY` здесь нет: права
--    и строки каталога возможностей кладёт reconcile из декларации (AGENTS.md §1).

CREATE OR REPLACE FUNCTION app.integrator_read_channel_binding_identity(
  p_channel_code text,
  p_external_id text,
  p_phone_normalized text
)
RETURNS TABLE(platform_user_id text, external_id text, display_handle text, phone_normalized text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_org uuid;
  v_current uuid;
  v_next uuid;
  v_depth integer := 0;
  v_handle text;
  v_integrator_user_id bigint;
BEGIN
  -- Проба двери: непустая интеграторская личность бывает ровно у класса `integrator`, пустая — у
  -- класса `tenant_service`. Аксессор при её отсутствии поднимает 42501, и это его нормальный
  -- ответ «интеграторского контекста нет», а не отказ корня.
  BEGIN
    v_integrator_user_id := app.current_integrator_user_id();
  EXCEPTION WHEN insufficient_privilege THEN
    v_integrator_user_id := NULL;
  END;

  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    'app_integrator_request'::name,
    CASE
      WHEN v_integrator_user_id IS NOT NULL THEN 'integrator'::app.port_context_class
      ELSE 'tenant_service'::app.port_context_class
    END,
    'integrator.channel-binding-identity.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg
    ]),
    'app.integrator_read_channel_binding_identity(text,text,text)'::regprocedure
  );

  v_org := app.current_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'integrator_channel_binding_identity_principal_required' USING ERRCODE = '42501';
  END IF;

  -- Ровно один ключ поиска: по внешнему идентификатору канала ЛИБО по подтверждённому телефону.
  -- Прежде это были две разные функции; форма поиска разная, ответ один и тот же, поэтому дверь одна.
  IF (coalesce(pg_catalog.btrim(p_external_id), '') = '')
     = (coalesce(pg_catalog.btrim(p_phone_normalized), '') = '') THEN
    RAISE EXCEPTION 'integrator_channel_binding_identity_needs_exactly_one_key' USING ERRCODE = '22023';
  END IF;
  IF coalesce(pg_catalog.btrim(p_channel_code), '') = '' THEN
    RETURN;
  END IF;

  IF coalesce(pg_catalog.btrim(p_external_id), '') <> '' THEN
    SELECT binding.user_id, binding.display_handle
      INTO v_current, v_handle
      FROM public.user_channel_bindings AS binding
     WHERE binding.channel_code = p_channel_code
       AND binding.external_id = p_external_id
       AND (EXISTS (SELECT 1 FROM public.be_organization_members AS tenant_staff
                     WHERE tenant_staff.platform_user_id = binding.user_id
                       AND tenant_staff.organization_id = v_org
                       AND tenant_staff.status = 'active')
            OR EXISTS (SELECT 1 FROM public.org_enrollments AS tenant_patient
                        WHERE tenant_patient.platform_user_id = binding.user_id
                          AND tenant_patient.organization_id = v_org
                          AND tenant_patient.status = 'active'))
     LIMIT 1;
    IF v_current IS NULL THEN
      RETURN;
    END IF;

    -- Цепочка слияний той же длины, что у прежнего вызывающего (пять шагов): дальше он возвращал
    -- последний прочитанный id, и корень делает то же самое.
    LOOP
      EXIT WHEN v_depth >= 5;
      SELECT platform_user.merged_into_id
        INTO v_next
        FROM public.platform_users AS platform_user
       WHERE platform_user.id = v_current
         AND (EXISTS (SELECT 1 FROM public.be_organization_members AS tenant_staff
                       WHERE tenant_staff.platform_user_id = platform_user.id
                         AND tenant_staff.organization_id = v_org
                         AND tenant_staff.status = 'active')
              OR EXISTS (SELECT 1 FROM public.org_enrollments AS tenant_patient
                          WHERE tenant_patient.platform_user_id = platform_user.id
                            AND tenant_patient.organization_id = v_org
                            AND tenant_patient.status = 'active'))
       LIMIT 1;
      EXIT WHEN v_next IS NULL;
      v_current := v_next;
      v_depth := v_depth + 1;
    END LOOP;

    RETURN QUERY
    SELECT v_current::text,
           p_external_id,
           v_handle,
           (SELECT contact.value_normalized
              FROM public.user_contacts AS contact
             WHERE contact.platform_user_id = v_current
               AND contact.contact_kind = 'phone'
               AND contact.is_primary
               AND (EXISTS (SELECT 1 FROM public.be_organization_members AS tenant_staff
                             WHERE tenant_staff.platform_user_id = contact.platform_user_id
                               AND tenant_staff.organization_id = v_org
                               AND tenant_staff.status = 'active')
                    OR EXISTS (SELECT 1 FROM public.org_enrollments AS tenant_patient
                                WHERE tenant_patient.platform_user_id = contact.platform_user_id
                                  AND tenant_patient.organization_id = v_org
                                  AND tenant_patient.status = 'active'))
             LIMIT 1);
    RETURN;
  END IF;

  -- Поиск по подтверждённому телефону: неоднозначность закрывает дверь, а не выбирает первого.
  RETURN QUERY
  WITH candidate AS (
    SELECT platform_user.id AS candidate_platform_user_id,
           binding.external_id AS candidate_external_id,
           binding.display_handle AS candidate_display_handle,
           contact.value_normalized AS candidate_phone_normalized
      FROM public.platform_users AS platform_user
      INNER JOIN public.user_contacts AS contact
              ON contact.platform_user_id = platform_user.id
             AND contact.contact_kind = 'phone'
             AND contact.is_primary
      INNER JOIN public.user_channel_bindings AS binding
              ON binding.user_id = platform_user.id
     WHERE contact.value_normalized = p_phone_normalized
       AND platform_user.merged_into_id IS NULL
       AND binding.channel_code = p_channel_code
       AND (EXISTS (SELECT 1 FROM public.be_organization_members AS tenant_staff
                     WHERE tenant_staff.platform_user_id = platform_user.id
                       AND tenant_staff.organization_id = v_org
                       AND tenant_staff.status = 'active')
            OR EXISTS (SELECT 1 FROM public.org_enrollments AS tenant_patient
                        WHERE tenant_patient.platform_user_id = platform_user.id
                          AND tenant_patient.organization_id = v_org
                          AND tenant_patient.status = 'active'))
     ORDER BY binding.external_id
     LIMIT 2
  )
  SELECT candidate.candidate_platform_user_id::text,
         candidate.candidate_external_id,
         candidate.candidate_display_handle,
         candidate.candidate_phone_normalized
    FROM candidate
   WHERE (SELECT pg_catalog.count(*) FROM candidate) = 1;
END
$function$;
