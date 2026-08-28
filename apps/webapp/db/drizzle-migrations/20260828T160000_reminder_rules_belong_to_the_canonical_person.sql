-- BCB-MIGRATION-BACKFILL
-- Track D final public identity cutover (#987).
--
-- Правило напоминания принадлежит КАНОНИЧЕСКОМУ человеку, и только ему. До этой миграции владельца
-- можно было узнать двумя способами: `reminder_rules.platform_user_id` либо переход
-- `reminder_rules.integrator_user_id -> platform_users.integrator_user_id`. Рантайм-чтения держали
-- второй способ как fallback, и из-за этого канонический пациент БЕЗ retired numeric identity
-- (нормальное состояние после перехода на webapp-регистрацию) местами просто не находился:
-- его правила не попадали в списки, статистику и журнал.
--
-- Здесь остаётся ОДИН способ: backfill канонического владельца из однозначных существующих
-- отображений и снятие последнего живого писателя retired-id на пути создания правила.
--
-- ⚠️ `ALTER COLUMN platform_user_id SET NOT NULL` в этот проход НЕ входит, и это замер, а не
-- осторожность. На DEV backfill разрешает ноль строк: обе строки без канонического владельца
-- (`wp-122c3af1…`, `wp-78d3c36d…`, обе `is_enabled = false`, ноль вхождений в журнале) ссылаются на
-- `integrator_user_id = 3`, а строки `platform_users` с таким id НЕТ вовсе — ни живой, ни слитой.
-- Их владелец не «не сопоставлен», его не существует. Такую строку миграция не имеет права ни
-- удалить, ни угадать, поэтому `NOT NULL` (и вместе с ним смена `ON DELETE SET NULL` → `CASCADE`,
-- без которой `NOT NULL` запрещает удаление человека) ждёт решения владельца по сиротам —
-- отдельным forward-проходом после того, как решение принято.
--
-- ⛔ Прав миграция не выдаёт и не отзывает (AGENTS.md §1). DDL исполняет владелец затронутого
-- объекта: корень `app.create_current_patient_reminder_rule(text,text)` — его действующий владелец
-- `app_seam_patient_self_actions_owner`. Сигнатура корня НЕ меняется, поэтому это
-- `CREATE OR REPLACE`, а не `DROP`+`CREATE`, и выданные ему гранты остаются на месте.
--
-- Новых горячих колонок нет: `idx_reminder_rules_platform_user_id` и
-- `idx_reminder_rules_platform_user_updated_at` уже покрывают оба новых пути чтения
-- (`listByPlatformUser*` в `pgReminderRules.ts`), поэтому отдельный индекс не заводится.
--
-- Однозначное существующее отображение: ровно одна каноническая (не слитая) строка
-- `platform_users` с этим retired-id. Неоднозначность (двойник) backfill НЕ разрешает — такая
-- строка останется NULL и упрётся в проверку следующим шагом.
UPDATE public.reminder_rules AS rule
   SET platform_user_id = resolved.id
  FROM (
    SELECT platform_user.integrator_user_id AS integrator_user_id, platform_user.id AS id
      FROM public.platform_users AS platform_user
     WHERE platform_user.integrator_user_id IS NOT NULL
       AND platform_user.merged_into_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.platform_users AS twin
          WHERE twin.integrator_user_id = platform_user.integrator_user_id
            AND twin.merged_into_id IS NULL
            AND twin.id <> platform_user.id
       )
  ) AS resolved
 WHERE rule.platform_user_id IS NULL
   AND rule.integrator_user_id IS NOT NULL
   AND rule.integrator_user_id = resolved.integrator_user_id;

--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM public.reminder_rules rule WHERE rule.platform_user_id IS NULL AND EXISTS (SELECT 1 FROM public.platform_users u WHERE u.integrator_user_id = rule.integrator_user_id AND u.merged_into_id IS NULL))
--
-- FAIL-CLOSED: если после backfill осталась строка, чей retired-id ВСЁ-ТАКИ разрешается в живого
-- канонического человека, — сопоставление выше сработало неверно, и миграция падает, называя
-- количество. Ни удаления, ни догадки: строка-сирота (человека с таким id не существует) сюда не
-- попадает — она не «не сопоставлена», она без владельца, и это решение владельца, а не миграции.
--
-- Проверка идёт ИМЕННО backfill-шагом. RLS на `public.reminder_rules` включена в режиме FORCE и не
-- обходится ни `bcb_dev_migrator`, ни `app_object_owner`: под `SET LOCAL ROLE` этот SELECT видит
-- ноль строк и «проходит» на любых данных. Backfill-шаг мигратор исполняет под `RESET ROLE` /
-- `RESET SESSION AUTHORIZATION` (deploy/postgres/privileges/migrate-local.mjs), то есть видит
-- таблицу целиком. Поймано preflight-ом: под владельцем проверка молча прошла, а следующий DDL
-- упал на реальных NULL.
DO $$
DECLARE
  v_resolvable_left bigint;
BEGIN
  SELECT count(*) INTO v_resolvable_left
    FROM public.reminder_rules AS rule
   WHERE rule.platform_user_id IS NULL
     AND EXISTS (
       SELECT 1 FROM public.platform_users AS platform_user
        WHERE platform_user.integrator_user_id = rule.integrator_user_id
          AND platform_user.merged_into_id IS NULL
     );
  IF v_resolvable_left > 0 THEN
    RAISE EXCEPTION
      'reminder_rules_canonical_owner_backfill_incomplete: % rule(s) still have no canonical platform_user_id although their integrator_user_id does resolve to a live canonical person',
      v_resolvable_left
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT position('integrator_user_id' in pg_catalog.pg_get_functiondef('app.create_current_patient_reminder_rule(text,text)'::regprocedure)) = 0
--
-- Пациент создаёт правило себе, и владелец известен канонически (`app.current_patient_user_id()`).
-- Корень при этом ходил в `platform_users` ЗА retired numeric identity только чтобы записать её в
-- новую строку. Это был последний живой писатель публичного retired-id на пути создания напоминания
-- (класс 2 переписи): у канонического пациента без retired-id он писал NULL, а сам лишний SELECT
-- ничего не решал. Тело сокращено ровно на этот SELECT и на эту колонку; всё остальное — стена
-- принятого контекста, проверка действующего зачисления и сам INSERT — дословно прежнее.
CREATE OR REPLACE FUNCTION app.create_current_patient_reminder_rule(p_rule_id text, p_payload_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_row public.reminder_rules%ROWTYPE;
  v_payload jsonb := p_payload_text::jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.reminder-rule.create', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.create_current_patient_reminder_rule(text,text)'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR nullif(btrim(p_rule_id), '') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.org_enrollments e
                    WHERE e.organization_id = v_org AND e.platform_user_id = v_patient
                      AND e.status = 'active') THEN
    RAISE EXCEPTION 'current_patient_reminder_rule_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.reminder_rules (
    integrator_rule_id, organization_id, platform_user_id,
    category, is_enabled, schedule_type, timezone, interval_minutes,
    window_start_minute, window_end_minute, days_mask, content_mode,
    linked_object_type, linked_object_id, custom_title, custom_text,
    schedule_data, reminder_intent, display_title, display_description,
    quiet_hours_start_minute, quiet_hours_end_minute, notification_topic_code, updated_at
  ) VALUES (
    btrim(p_rule_id), v_org, v_patient,
    v_payload->>'category', (v_payload->>'enabled')::boolean,
    v_payload->>'scheduleType', v_payload->>'timezone',
    (v_payload->>'intervalMinutes')::integer,
    (v_payload->>'windowStartMinute')::integer,
    (v_payload->>'windowEndMinute')::integer,
    v_payload->>'daysMask', 'none', v_payload->>'linkedObjectType',
    v_payload->>'linkedObjectId', v_payload->>'customTitle', v_payload->>'customText',
    v_payload->'scheduleData', coalesce(v_payload->>'reminderIntent', 'generic'),
    v_payload->>'displayTitle', v_payload->>'displayDescription',
    (v_payload->>'quietHoursStartMinute')::integer,
    (v_payload->>'quietHoursEndMinute')::integer,
    v_payload->>'notificationTopicCode', statement_timestamp()
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END
$function$;
