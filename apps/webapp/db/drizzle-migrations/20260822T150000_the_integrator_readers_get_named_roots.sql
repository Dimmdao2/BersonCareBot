-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.integrator_read_channel_binding_identity(text,text,text)') IS NOT NULL
--
-- D17 финал (часть 1 из 2). Реляционные ЧИТАТЕЛИ интегратора по `public.*` уходят на именованные
-- корни — то же лекарство, которым шаги 1 и 2b вылечили писателей. Здесь три корня на СЕМЬ живых
-- читателей; какие именно, перечислено ниже поимённо. Остаток читателей и причина, по которой
-- членство `bcb_*_integrator` в `app_tenant_service` этой веткой НЕ снимается, — в отчёте
-- `docs/_TODO/runs/integrator-cleanup/D17_RELATION_READERS_2026-08-22.md`.
--
-- РАЗБОР ПРАВ (AGENTS.md §1, «Перед приземлением миграции — разбор её прав»).
-- Миграция создаёт три функции и не трогает ни одной таблицы. `GRANT`/`REVOKE`/`CREATE POLICY`
-- здесь нет: права кладёт reconcile из `deploy/postgres/privileges/declaration.ts`.
--
-- Владелец всех трёх тел — `app_seam_identity_lookup_owner`. Выбран не по названию, а по тому, что
-- он УЖЕ владеет ровно этим швом: у него объявлены SELECT на `public.platform_users`
-- (`id, integrator_user_id, merged_into_id`), `public.user_contacts`
-- (`platform_user_id, contact_kind, is_primary, value_normalized`), `public.user_channel_bindings`
-- (`user_id, channel_code, external_id, display_handle`), `public.org_enrollments` и
-- `public.be_organization_members` (`platform_user_id, organization_id, status`) — тот же владелец
-- несёт `app.resolve_active_organization_for_integrator_user_id(bigint)`, читающий те же пять
-- отношений. Новых колонок ни одному владельцу шва не требуется; полный список того, что читает
-- ТЕЛО каждого корня, объявлен в `relationSurfaces` декларации и приезжает грантом оттуда.
--
-- Роль рантайма у корней 1 и 3 — `app_integrator_request` (класс `tenant_service`), у корня 2 —
-- `app_integrator_resolver` (класс `integrator`). Это НЕ выбор автора: класс контекста задан живым
-- принципалом вызывающего. Корни 1 и 3 зовут маршруты внутри
-- `runWithOrganizationPrincipal(...)` (вебхук уже знает клинику), корень 2 зовёт ПРЕД-маршрутизация
-- `app/routes.ts`, которая клинику ещё только ищет и потому идёт под bootstrap-принципалом.
--
-- СТЕНА АРЕНДАТОРА ПОВТОРЕНА ДОСЛОВНО в корнях 1 и 3. Сегодня эти чтения идут под ролью вебаппа
-- `app_tenant_service`, и их сужает RLS-политика `rev10_tenant_select_*`: человек виден клинике,
-- только если он её активный сотрудник (`be_organization_members`) ЛИБО активный зачисленный
-- (`org_enrollments`). `SECURITY DEFINER` обходит RLS, поэтому предикат выписан в теле — иначе
-- корень был бы ШИРЕ прежнего реляционного чтения, а не уже.
--
-- У корня 2 повторять нечего: сегодня он бежит под `app_integrator_resolver`, у которой табличных
-- прав нет ВООБЩЕ (замер: `deploy/postgres/generated/privileges.bcb_webapp_dev.sql` не содержит ни
-- одного `GRANT … TO "app_integrator_resolver"` на таблицу), то есть чтение всегда падало 42501 и
-- пред-маршрутизация всегда получала `null`. Стена здесь — сам корень: он отдаёт ТОЛЬКО id
-- организации и только когда активное зачисление ровно одно; ни одной колонки о человеке наружу не
-- выходит. Форма — дословный сосед `app.resolve_active_organization_for_integrator_user_id(bigint)`.
--
-- Каждый корень отдаёт ровно то, что нужно вызывающему: корень 1 — id человека, ручку канала и
-- подтверждённый телефон (а не карточку из `platform_users`), корень 2 — один uuid организации,
-- корень 3 — телефон доставки и integrator_user_id.

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
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    'app_integrator_request'::name,
    'tenant_service'::app.port_context_class,
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
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.resolve_active_organization_for_channel_binding(
  p_channel_code text,
  p_external_id text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_current uuid;
  v_next uuid;
  v_depth integer := 0;
  v_organization_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    'app_integrator_resolver'::name,
    'integrator'::app.port_context_class,
    'integrator.channel-organization.resolve',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg
    ]),
    'app.resolve_active_organization_for_channel_binding(text,text)'::regprocedure
  );

  IF coalesce(pg_catalog.btrim(p_channel_code), '') = ''
     OR coalesce(pg_catalog.btrim(p_external_id), '') = '' THEN
    RETURN NULL;
  END IF;

  SELECT binding.user_id
    INTO v_current
    FROM public.user_channel_bindings AS binding
   WHERE binding.channel_code = p_channel_code
     AND binding.external_id = p_external_id
   LIMIT 1;
  IF v_current IS NULL THEN
    RETURN NULL;
  END IF;

  LOOP
    EXIT WHEN v_depth >= 5;
    SELECT platform_user.merged_into_id
      INTO v_next
      FROM public.platform_users AS platform_user
     WHERE platform_user.id = v_current
     LIMIT 1;
    EXIT WHEN v_next IS NULL;
    v_current := v_next;
    v_depth := v_depth + 1;
  END LOOP;

  -- Ноль и неоднозначность одинаково означают «клиника не определена»: пред-маршрутизация обязана
  -- закрыться, а не выбрать первую попавшуюся организацию.
  SELECT (pg_catalog.array_agg(DISTINCT enrollment.organization_id))[1]
    INTO v_organization_id
    FROM public.org_enrollments AS enrollment
   WHERE enrollment.platform_user_id = v_current
     AND enrollment.status = 'active'
  HAVING pg_catalog.count(DISTINCT enrollment.organization_id) = 1;

  RETURN v_organization_id;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.integrator_read_platform_user_delivery_identity(
  p_user_key text
)
RETURNS TABLE(phone_normalized text, integrator_user_id text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
DECLARE
  v_org uuid;
  v_key text;
  v_current uuid;
  v_next uuid;
  v_depth integer := 0;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    'app_integrator_request'::name,
    'tenant_service'::app.port_context_class,
    'integrator.platform-user-delivery-identity.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg
    ]),
    'app.integrator_read_platform_user_delivery_identity(text)'::regprocedure
  );

  v_org := app.current_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'integrator_platform_user_delivery_identity_principal_required' USING ERRCODE = '42501';
  END IF;

  v_key := coalesce(pg_catalog.btrim(p_user_key), '');
  IF v_key = '' THEN
    RETURN;
  END IF;

  -- Ключ вызывающего — либо `platform_users.id`, либо `integrator_user_id`: обе формы жили в двух
  -- прежних читателях, и дверь принимает обе, а не заводит вторую.
  SELECT platform_user.id
    INTO v_current
    FROM public.platform_users AS platform_user
   WHERE (platform_user.id::text = v_key
          OR (v_key ~ '^[0-9]+$' AND platform_user.integrator_user_id::text = v_key))
     AND (EXISTS (SELECT 1 FROM public.be_organization_members AS tenant_staff
                   WHERE tenant_staff.platform_user_id = platform_user.id
                     AND tenant_staff.organization_id = v_org
                     AND tenant_staff.status = 'active')
          OR EXISTS (SELECT 1 FROM public.org_enrollments AS tenant_patient
                      WHERE tenant_patient.platform_user_id = platform_user.id
                        AND tenant_patient.organization_id = v_org
                        AND tenant_patient.status = 'active'))
   ORDER BY (platform_user.merged_into_id IS NULL) DESC, platform_user.id
   LIMIT 1;
  IF v_current IS NULL THEN
    RETURN;
  END IF;

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

  -- Строка возвращается и без телефона: прежний вызывающий отличал «человека нет» от «телефона нет»,
  -- и это различие сохраняется.
  RETURN QUERY
  SELECT (SELECT contact.value_normalized
            FROM public.user_contacts AS contact
           WHERE contact.platform_user_id = platform_user.id
             AND contact.contact_kind = 'phone'
             AND contact.is_primary
           LIMIT 1),
         platform_user.integrator_user_id::text
    FROM public.platform_users AS platform_user
   WHERE platform_user.id = v_current
   LIMIT 1;
END
$function$;
