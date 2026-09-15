-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone)') IS NOT NULL AND to_regprocedure('app.public_lead_consume_altcha_challenge(text,uuid,text)') IS NOT NULL
--
-- Д4 независимого аудита Л3: капча публичной заявки НЕ была одноразовой. Ветка заявки нигде не
-- регистрировала выданную задачку, поэтому один решённый payload оставался действительным всё окно
-- в 5 минут и принимался сколько угодно раз — то есть стоимость решения задачки размазывалась на
-- неограниченный поток заявок, ради чего капчу и ставили.
--
-- Механизм не изобретается: у входа по паролю он уже есть — `public.password_altcha_challenges`
-- с `consumed_at`, выдача через `app.password_login_issue_altcha_challenge`, гашение внутри
-- `app.password_login_acquire`. Та же таблица принимает и задачки заявки, поэтому оба CHECK
-- расширяются на второе назначение, а не подменяются: `password_login` остаётся ровно тем, чем был.
--
-- Rights analysis: обе новые функции — SECURITY DEFINER от `app_seam_password_auth_owner`, того же
-- владельца, что и существующие двери капчи; у него уже есть SELECT/INSERT/UPDATE по всем колонкам
-- `public.password_altcha_challenges` и своя seam-политика под FORCE RLS. Ни одного GRANT здесь нет
-- и быть не может: права принадлежат `deploy/postgres/privileges/declaration.ts` (AGENTS.md §1).
ALTER TABLE public.password_altcha_challenges
  DROP CONSTRAINT IF EXISTS password_altcha_challenge_identifier_key_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.password_altcha_challenges
  ADD CONSTRAINT password_altcha_challenge_identifier_key_check
  CHECK (identifier_key ~ '^(password-email|lead-email):v1:[0-9a-f]{64}$');
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.password_altcha_challenges
  DROP CONSTRAINT IF EXISTS password_altcha_challenge_purpose_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.password_altcha_challenges
  ADD CONSTRAINT password_altcha_challenge_purpose_check
  CHECK (purpose = ANY (ARRAY['password_login'::text, 'public_lead'::text]));

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Выдача. Порога попыток у заявки нет — капча стоит на ней всегда, а не «с третьей ошибки», как у
-- пароля, — но потолок живых задачек на один адрес тот же: три. Без него один посетитель набирает
-- сколько угодно нерешённых задачек и превращает одноразовость обратно в многоразовость.
CREATE OR REPLACE FUNCTION app.public_lead_issue_altcha_challenge(
  p_identifier_key text,
  p_challenge_id uuid,
  p_challenge_digest text,
  p_expires_at timestamp with time zone
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_live_count integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.public-lead.altcha-issue', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,ROW('timestamptz@1', pg_catalog.timestamptz_send($4))::app.port_typed_arg]), 'app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone)'::regprocedure);

  IF p_identifier_key IS NULL
    OR p_identifier_key !~ '^lead-email:v1:[0-9a-f]{64}$'
    OR p_challenge_id IS NULL
    OR p_challenge_digest IS NULL
    OR p_challenge_digest !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL
    OR p_expires_at <= v_now
    OR p_expires_at > v_now + interval '10 minutes'
  THEN
    RETURN false;
  END IF;

  SELECT count(*)::integer
  INTO v_live_count
  FROM public.password_altcha_challenges AS challenge
  WHERE challenge.identifier_key = p_identifier_key
    AND challenge.purpose = 'public_lead'
    AND challenge.consumed_at IS NULL
    AND challenge.expires_at > v_now;

  IF v_live_count >= 3 THEN
    RETURN false;
  END IF;

  INSERT INTO public.password_altcha_challenges (
    challenge_id, identifier_key, purpose, challenge_digest, expires_at
  )
  VALUES (p_challenge_id, p_identifier_key, 'public_lead', p_challenge_digest, p_expires_at);

  RETURN true;
END $$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_password_auth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Гашение. `FOR UPDATE` берётся ДО сверки, как у пароля: два одновременных запроса с одним payload
-- иначе оба увидят `consumed_at IS NULL` и оба пройдут, то есть «одноразовая» задачка отработает
-- дважды. Проигравший получает false и отказ маршрута.
CREATE OR REPLACE FUNCTION app.public_lead_consume_altcha_challenge(
  p_identifier_key text,
  p_challenge_id uuid,
  p_challenge_digest text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_challenge public.password_altcha_challenges%ROWTYPE;
BEGIN
  PERFORM app.require_accepted_context('app_seam_password_auth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.public-lead.altcha-consume', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg,ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg]), 'app.public_lead_consume_altcha_challenge(text,uuid,text)'::regprocedure);

  IF p_identifier_key IS NULL OR p_challenge_id IS NULL OR p_challenge_digest IS NULL THEN
    RETURN false;
  END IF;

  SELECT challenge.*
  INTO v_challenge
  FROM public.password_altcha_challenges AS challenge
  WHERE challenge.challenge_id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_challenge.purpose IS DISTINCT FROM 'public_lead'
    OR v_challenge.identifier_key IS DISTINCT FROM p_identifier_key
    OR v_challenge.challenge_digest IS DISTINCT FROM p_challenge_digest
    OR v_challenge.expires_at <= v_now
    OR v_challenge.consumed_at IS NOT NULL
  THEN
    RETURN false;
  END IF;

  UPDATE public.password_altcha_challenges AS challenge
  SET consumed_at = v_now
  WHERE challenge.challenge_id = p_challenge_id;

  RETURN true;
END $$;
