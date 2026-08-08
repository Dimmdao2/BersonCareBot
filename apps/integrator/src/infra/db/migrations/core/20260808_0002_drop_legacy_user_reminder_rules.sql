-- Снос легаси-таблицы integrator.user_reminder_rules.
-- Решение владельца 08.08.2026: «так сноси, миграцией, чтобы и в тесте и в проде снеслось».
-- Разбор: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/15-integrator-tables-disposition.md §4
-- План:   docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/17-integrator-removal-plan.md
--
-- ПОЧЕМУ. Канонические правила напоминаний переехали в public.reminder_rules (D5, forward-copy
-- миграцией apps/webapp/db/drizzle-migrations/0323_reminder_rules_scheduler_canonical_forward_local.sql).
-- Рантайм интегратора читает УЖЕ public: apps/integrator/src/infra/db/repos/reminders.ts:14 импортирует
-- символ reminderRules из schema/integratorPublicProduct.ts:107, а это pgTable('reminder_rules'),
-- т.е. public.reminder_rules (комментарий там же, :104-106: «Canonical reminder business rules owned
-- by webapp»). Репозиторий фиксирует это дословно: apps/webapp/src/modules/reminders/reminders.md:5 —
-- «integrator.user_reminder_rules не является runtime-источником и не получает новых записей».
--
-- ЗАМЕРЫ ПЕРЕД СНОСОМ (bersoncarebot_test, 08.08.2026, только чтение):
--   * count(*) = 27, из них 27 имеют пару в public.reminder_rules по integrator_rule_id — 27/27;
--   * pg_stat_user_tables: n_tup_ins = 27, n_tup_del = 0 — после копирования ни одной вставки;
--   * Drizzle-объявления НЕТ ни в одном из двух приложений (символ userReminderRules не существует);
--   * pg_constraint: входящих FK нет. FK integrator.user_reminder_occurrences.rule_id смотрит на
--     public.reminder_rules(integrator_rule_id) — проверено pg_get_constraintdef, НЕ на эту таблицу;
--   * pg_proc: ни одна функция (в т.ч. SECURITY DEFINER) не упоминает таблицу;
--   * pg_rewrite: представлений нет; pg_trigger: пользовательских триггеров нет.
--
-- ⚠ ОПРОВЕРЖЕНИЕ ПРЕЖНЕЙ ТРЕВОГИ (проверено на живой базе, а не по файлу миграции).
-- Миграция 0175_p0_8_b4_roles_1_is_staff_wall_rls.sql:525,528 создавала политики
-- saas_org_dormant_p0_8_5 на ОСТАЮЩИХСЯ таблицах user_reminder_occurrences и
-- user_reminder_delivery_logs, чья пациентская ветка джойнила integrator.user_reminder_rules.
-- Если бы это было так сегодня, дроп сломал бы стену на двух живых таблицах. НО живой pg_policies
-- показывает, что обе политики УЖЕ переписаны на public.reminder_rules (b4f_rule.integrator_rule_id /
-- b4f_rule.integrator_user_id). Авторитетная проверка pg_depend: НИ ОДНА политика на таблице вне
-- набора сноса не зависит от integrator.user_reminder_rules. Блокера нет.
-- (Это же объясняет 3 769 609 idx_scan по её pkey: они накоплены СТАРОЙ политикой за время её жизни,
-- а не живым читателем. Кумулятивная статистика ни разу не сбрасывалась — pg_stat_database.stats_reset IS NULL.)
--
-- КОД СНИМАЕТСЯ ДО ЭТОЙ МИГРАЦИИ:
--   * apps/webapp/scripts/backfill-reminders-domain.mjs:69,140,209 и reconcile-reminders-domain.mjs:67;
--   * apps/webapp/scripts/integrator-schema-cleanup/{01_audit.ts:23, 03_reconcile.ts:21,24, 05_drop_deprecated.ts:22,25};
--   * GRANT-списки: deploy/postgres/p0-5b-grants.sql:75 (через генератор + регенерация)
--     и жёсткий ассерт scripts/deploy-saas-667.sh:485 (массив таблиц в FOREACH — упадёт на
--     `SELECT count(*) FROM integrator.user_reminder_rules WHERE organization_id IS NULL`).
-- Миграции НЕ трогаем. Старые webapp-миграции (0109, 0260, 0282, 0312, 0323), которые ссылаются на
-- эту таблицу, безопасны: они идут в ФАЗЕ 2 scripts/migrate-all.sh, а эта миграция — в ФАЗЕ 3
-- (имя файла ≥ 20260708). На from-zero прогоне они успевают отработать до сноса.
--
-- ⚠ ГЕЙТ ПРОДА. Замер 27/27 сделан на TEST и для PROD НЕ доказан. Миграция проверяет тот же
-- инвариант на своей базе и самоустраняется, если он не держится.
--
-- Идемпотентна.

DO $drop_user_reminder_rules$
DECLARE
  v_total bigint;
  v_mirrored bigint;
BEGIN
  IF to_regclass('integrator.user_reminder_rules') IS NULL THEN
    RAISE NOTICE 'integrator.user_reminder_rules уже отсутствует — пропуск.';
    RETURN;
  END IF;

  SELECT count(*),
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM public.reminder_rules p WHERE p.integrator_rule_id = r.id
           )
         )
    INTO v_total, v_mirrored
    FROM integrator.user_reminder_rules r;

  IF v_mirrored <> v_total THEN
    RAISE NOTICE 'СНОС integrator.user_reminder_rules ОТЛОЖЕН: строк %, скопировано в public.reminder_rules только %. На данной базе forward-copy (0323) не завершён — снос уничтожил бы % правил напоминаний. Догнать копирование и повторить.',
      v_total, v_mirrored, v_total - v_mirrored;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS integrator.user_reminder_rules;
  RAISE NOTICE 'integrator.user_reminder_rules снесена (строк было %, все % есть в public.reminder_rules).', v_total, v_mirrored;
END
$drop_user_reminder_rules$;
