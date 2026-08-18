-- BCB-MIGRATION-OWNER: app_seam_passkey_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0026
--
-- Три тела SECURITY DEFINER с РУКОПИСНЫМ гейтом `app.require_accepted_context(...)` не создаёт ни
-- один файл репозитория. Проверено 18.08:
--   * `grep -rln <имя> --include=*.sql .` находит их только в сгенерированных артефактах прав
--     (`deploy/postgres/generated/*` — ОПИСАНИЕ прав) и в списке грантов
--     `deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql` (строки 372-373, 821-822) —
--     это перечисление сигнатур, а не определение функции;
--   * `apps/webapp/db/drizzle-migrations/0000_b0_baseline.sql` не создаёт объектов вовсе
--     (`grep -c 'CREATE .*FUNCTION'` = 0): B0 — это ПРИНЯТАЯ живая структура DEV, новая среда
--     клонируется с неё, а уже существующая TEST не получает из неё ничего.
-- Значит для существующей TEST-базы прямая forward-миграция — единственный путь.
--
-- Почему это опасно именно здесь: все три стоят на пути входа (passkey-челлендж и разрешение
-- рабочих пространств staff перед маршрутизацией). Их гейт объявлен в декларации как
-- многокапабилитный (`execute` из двух ролей), поэтому генератор ставит режим `exact_existing`
-- (`deploy/postgres/generated/privileges.<db>.sql:2087,2090,2236`), а `generate.mjs` в этом режиме
-- гейт НЕ переписывает — только СВЕРЯЕТ токены декларации с рукописным телом. Тело, живущее лишь
-- в одной базе, во вторую не попадает ничем: ни миграцией, ни реконсайлом.
--
-- Сторона-источник — DEV. Доказательство, а не предположение: тела DEV побайтно совпадают с
-- принятой структурой B0 (`git show 2e8ffe851:deploy/postgres/generated/prod-to-target/schema-pre.sql`,
-- строки 5961 / 6050 / 12620), а на TEST у двух из трёх потеряна пустая строка после гейта —
-- значит расходится TEST. Тела скопированы из `bcb_webapp_dev` через `pg_get_functiondef`, поэтому
-- владелец, SECURITY DEFINER, volatility, parallel safety и `search_path` сохраняются дословно,
-- а на DEV миграция не меняет ни одного определения.
--
-- `BCB-MIGRATION-SCHEMA-CREATE: app` и `BCB-MIGRATION-LANGUAGE-USAGE: plpgsql` обязательны у
-- КАЖДОГО оператора: без них мигратор не выдаёт владельцу шва CREATE на схему `app`, и
-- `CREATE OR REPLACE` падает с «permission denied for schema app».
--
-- `app.pre_session_resolve_identity(uuid)` в эту миграцию НЕ входит намеренно: её создаёт
-- `deploy/postgres/port-context/contract.sql:469`, который reconcile-access применяет к каждой базе
-- (`deploy/postgres/privileges/reconcile-access.mjs:46,97`). Живое тело на обеих базах побайтно
-- равно тексту контракта — второе определение в миграции создало бы второй путь к тому же объекту.
--
-- Выдача passkey-челленджа: одно тело обслуживает и незалогиненный вход (`app_pre_session`), и
-- регистрацию пациента (`app_patient`) — две ветки требует декларация
-- (`declaration.ts:3578`, `execute: ['app_pre_session', 'app_patient']`).
CREATE OR REPLACE FUNCTION app.passkey_issue_challenge(p_id uuid, p_purpose text, p_user_id uuid, p_challenge text, p_expected_origin text, p_rp_id text, p_expires_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_passkey_owner',
    CASE WHEN p_purpose = 'registration' THEN 'app_patient'::name ELSE 'app_pre_session'::name END,
    CASE WHEN p_purpose = 'registration' THEN 'patient'::app.port_context_class
         ELSE 'pre_session'::app.port_context_class END,
    CASE WHEN p_purpose = 'registration' THEN 'auth.passkey.registration-challenge.issue'
         ELSE 'auth.passkey.challenge.issue' END,
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_purpose))::app.port_typed_arg,
      ROW('uuid@1', uuid_send(p_user_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_challenge))::app.port_typed_arg,
      ROW('text@1', textsend(p_expected_origin))::app.port_typed_arg,
      ROW('text@1', textsend(p_rp_id))::app.port_typed_arg,
      ROW('timestamptz@1', timestamptz_send(p_expires_at))::app.port_typed_arg
    ]), 'app.passkey_issue_challenge(uuid,text,uuid,text,text,text,timestamp with time zone)'::regprocedure
  );

  IF p_purpose NOT IN ('authentication', 'registration')
    OR p_id IS NULL
    OR p_challenge !~ '^[A-Za-z0-9_-]{32,1024}$'
    OR p_expected_origin IS NULL
    OR p_rp_id IS NULL
    OR p_expires_at <= statement_timestamp()
    OR p_expires_at > statement_timestamp() + interval '10 minutes'
    OR (p_purpose = 'registration' AND (
      p_user_id IS NULL OR p_user_id IS DISTINCT FROM app.current_patient_user_id()
    ))
    OR (p_purpose = 'authentication' AND p_user_id IS NOT NULL)
  THEN
    RETURN false;
  END IF;

  DELETE FROM public.user_passkey_challenges
   WHERE expires_at < statement_timestamp() - interval '1 day';
  INSERT INTO public.user_passkey_challenges (
    id, purpose, user_id, challenge, expected_origin, rp_id, expires_at
  ) VALUES (
    p_id, p_purpose, p_user_id, p_challenge, p_expected_origin, p_rp_id, p_expires_at
  );
  RETURN true;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_passkey_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Чтение passkey-челленджа: та же двухветочная форма (`declaration.ts:3586`). На TEST это одно из
-- двух тел, где после рукописного гейта потеряна пустая строка — расхождение косметическое, но
-- доказывает, что тело набивали в каждой базе отдельно, а не доставляли из репозитория.
CREATE OR REPLACE FUNCTION app.passkey_read_challenge(p_id uuid, p_purpose text)
 RETURNS TABLE(user_id uuid, challenge text, expected_origin text, rp_id text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_passkey_owner',
    CASE WHEN p_purpose = 'registration' THEN 'app_patient'::name ELSE 'app_pre_session'::name END,
    CASE WHEN p_purpose = 'registration' THEN 'patient'::app.port_context_class
         ELSE 'pre_session'::app.port_context_class END,
    CASE WHEN p_purpose = 'registration' THEN 'auth.passkey.registration-challenge.read'
         ELSE 'auth.passkey.challenge.read' END,
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_id))::app.port_typed_arg,
      ROW('text@1', textsend(p_purpose))::app.port_typed_arg
    ]), 'app.passkey_read_challenge(uuid,text)'::regprocedure
  );

  IF p_purpose NOT IN ('authentication', 'registration') THEN RETURN; END IF;
  RETURN QUERY
  SELECT stored.user_id, stored.challenge, stored.expected_origin, stored.rp_id, stored.expires_at
    FROM public.user_passkey_challenges AS stored
   WHERE stored.id = p_id
     AND stored.purpose = p_purpose
     AND stored.consumed_at IS NULL
     AND stored.expires_at >= statement_timestamp();
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_directory_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Разрешение рабочих пространств staff: до маршрутизации зовётся под `app_pre_session`, после —
-- под `app_staff` с проверкой «только сам себя» (`declaration.ts:5104`). Второе из двух тел, где
-- TEST потерял пустую строку после гейта.
CREATE OR REPLACE FUNCTION app.resolve_staff_workspace_memberships(p_platform_user_id uuid)
 RETURNS TABLE(id uuid, organization_id uuid, platform_user_id uuid, role text, specialist_id uuid, status text, doctor_screens_disabled boolean, created_at text, updated_at text)
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE v_staff_context boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_org_directory_owner',
    CASE WHEN pg_has_role(session_user, 'app_staff', 'MEMBER')
         THEN 'app_staff'::name ELSE 'app_pre_session'::name END,
    CASE WHEN pg_has_role(session_user, 'app_staff', 'MEMBER')
         THEN 'staff'::app.port_context_class
         ELSE 'pre_session'::app.port_context_class END,
    'auth.staff-workspace.resolve',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', uuid_send(p_platform_user_id))::app.port_typed_arg
    ]), 'app.resolve_staff_workspace_memberships(uuid)'::regprocedure
  );

  v_staff_context := pg_has_role(session_user, 'app_staff', 'MEMBER');
  IF p_platform_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'platform user id required';
  END IF;
  IF v_staff_context AND p_platform_user_id <> app.current_actor_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'staff workspace self-resolution required';
  END IF;
  RETURN QUERY
  SELECT membership.id,
         membership.organization_id,
         membership.platform_user_id,
         membership.role,
         membership.specialist_id,
         membership.status,
         membership.doctor_screens_disabled,
         membership.created_at::text,
         membership.updated_at::text
    FROM public.be_organization_members membership
   WHERE membership.platform_user_id = p_platform_user_id
     AND membership.status = 'active'
   ORDER BY membership.created_at, membership.organization_id;
END
$function$;
