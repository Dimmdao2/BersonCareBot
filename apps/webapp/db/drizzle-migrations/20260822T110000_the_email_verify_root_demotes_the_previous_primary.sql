-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'demoted_other_primary') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = 'app.email_auth_verify_user_email(uuid,text)'::regprocedure;
-- D15b/6 (22.08.2026): подтверждение почты владело операцией в ДВА прохода — именованный корень
-- `app.email_auth_verify_user_email(uuid,text)` и сразу за ним сырой проход канонического движка
-- контактов (`packages/platform-merge/src/userContactsMirrorWrite.ts`) из
-- `apps/webapp/src/infra/repos/pgEmailAuth.ts`. Второй проход не нёс именованной операции, поэтому
-- под bootstrap-принципалом дверей почты просил ОБОБЩЁННУЮ способность `pre_session`; такой в
-- каталоге нет и быть не должно — каждая pre_session-способность называет свою функцию. Отсюда
-- «Missing declared webapp port capability: pre_session» на подтверждении, корень которого уже
-- отработал. Лечение — §5: операцией владеет ОДИН корень, второй проход убран.
--
-- Убрать второй проход можно только после того, как корень покроет ВСЁ, что тот делал. Замер на
-- живой `bcb_webapp_dev` (проба в транзакции с ROLLBACK, 22.08): у человека уже есть первичная
-- почта, дверь зовут на ДРУГУЮ — корень отвечает
-- `23505 duplicate key value violates unique constraint "uq_user_contacts_primary_email"`
-- (`UNIQUE (platform_user_id) WHERE contact_kind = 'email' AND is_primary`). Понижением прежней
-- первичной занимался именно второй проход (CTE `demoted_primary` в движке), и простое удаление
-- вызова заменило бы один отказ другим — на смене почты. Эта миграция переносит понижение в корень.
--
-- Это не новое поведение, а возврат утраченного: до цутовера 21.08 почта была скалярной колонкой
-- `platform_users.email`, и `UPDATE ... SET email = p_email` вытеснял прежний адрес физически —
-- «прежняя перестала быть первичной» было свойством самой колонки. `20260821T040000` увёл почту в
-- `public.user_contacts`, где основных строк может быть много, и вытеснение потерялось.
--
-- Форма понижения повторяет единственного канонического писателя: отдельный data-modifying CTE
-- `demoted_other_primary`, на который два следующих шага ссылаются через
-- `(SELECT count(*) FROM demoted_other_primary) >= 0`. Ссылка не косметическая: без неё нет порядка
-- между подпредложениями одной команды, и вставка новой первичной строки может дойти до
-- `uq_user_contacts_primary_email` раньше, чем понижение уберёт оттуда старую. Чтение CTE делает
-- понижение InitPlan-ом, то есть выполненным до первой изменённой строки.
--
-- Чужая почта по-прежнему отбивается ошибкой, а не перевешивается: `confirmed_own_contact` не найдёт
-- чужую строку, вставка дойдёт до `uq_user_contacts_email` и вернёт `23505`. Понижение при этом
-- откатывается вместе со всей командой — это одна команда, не три.
--
-- Владелец, сигнатура, список аргументов и гейт `require_accepted_context` первым исполняемым
-- оператором сохранены дословно, поэтому `function_identity` (`regprocedure`), строка способности и
-- пин тела гейта адресуют тот же объект.
--
-- Разбор прав (AGENTS.md §1). Тело трогает ровно одно отношение — `public.user_contacts`, и ровно
-- те колонки, что уже объявлены за этим корнем в
-- `deploy/postgres/privileges/declaration.ts` (`CANONICAL_CONTACT_SURFACE_CORRECTIONS`:
-- platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin,
-- created_at, updated_at — SELECT+INSERT+UPDATE). Новых колонок нет, новых отношений нет.
-- `SELECT ... FOR UPDATE`/`FOR SHARE` не появляется и не исчезает — `ROW_LOCK_SURFACES` не меняется,
-- `deploy/postgres/privileges/row-lock-privileges.test.mjs` остаётся зелёным. GRANT/REVOKE/POLICY
-- здесь нет (§1).
--
-- Живое доказательство поведения:
-- `deploy/postgres/privileges/canonical-email-contact-upsert.devDbProof.test.mjs`.
CREATE OR REPLACE FUNCTION app.email_auth_verify_user_email(p_user_id uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.email.verify', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.email_auth_verify_user_email(uuid,text)'::regprocedure);

  WITH demoted_other_primary AS (
    UPDATE public.user_contacts
    SET is_primary = false,
        updated_at = now()
    WHERE platform_user_id = p_user_id
      AND contact_kind = 'email'
      AND is_primary = true
      AND value_normalized <> lower(btrim(p_email))
    RETURNING 1
  ), confirmed_own_contact AS (
    UPDATE public.user_contacts
    SET is_primary = true,
        confirmed_at = now(),
        updated_at = now()
    WHERE platform_user_id = p_user_id
      AND contact_kind = 'email'
      AND value_normalized = lower(btrim(p_email))
      AND (SELECT count(*) FROM demoted_other_primary) >= 0
    RETURNING 1
  )
  INSERT INTO public.user_contacts (
    platform_user_id, contact_kind, value_normalized, is_primary,
    confirmed_at, source_origin, updated_at
  )
  SELECT p_user_id, 'email', lower(btrim(p_email)), true, now(), 'direct', now()
  WHERE NOT EXISTS (SELECT 1 FROM confirmed_own_contact)
    AND (SELECT count(*) FROM demoted_other_primary) >= 0;
END
$function$;
