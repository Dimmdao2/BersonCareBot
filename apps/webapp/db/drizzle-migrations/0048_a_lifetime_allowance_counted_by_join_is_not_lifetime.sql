-- BCB-MIGRATION-OWNER: app_object_owner
-- TEMPORARY LOCAL MIGRATION NUMBER 0048
--
-- Решение владельца 19.08, дословно: «Клинике дается ОДНА смена слаг самостоятельно (за весь период
-- жизни) - остальное через админа только если сами напишут в поддержку». «За весь период жизни»
-- значит, что израсходованное право не имеет права вернуться НИКОГДА и ни от какого стороннего
-- события.
--
-- Как оно возвращалось. Признак «эту смену сделала сама клиника» не хранился — он ВЫЧИСЛЯЛСЯ каждый
-- раз соединением события с текущим членством (`pgClinicDirectory.getSlugManagementState`,
-- INNER JOIN на `be_organization_members`). Членство удаляется каскадом от `platform_users`
-- (`be_organization_members_platform_user_id_fkey ... ON DELETE CASCADE`), а сама событийная таблица
-- только дозаписывается. Значит удаление аккаунта того сотрудника, который менял адрес, — обычная
-- будущая операция «удалить пользователя» — молча превращает израсходованное право в неизрасходованное.
-- Ни клиника, ни поддержка этого не увидят: счётчик просто станет другим.
--
-- Замер 19.08 на DEV (`bcb_webapp_dev`): 3 строки в `organization_slug_rename_events`; связь события
-- с актором держится ТОЛЬКО через `actor_platform_user_id`, отдельного признака инициатора нет.
--
-- Чинится штампом: факт ставится НА СОБЫТИЕ в момент записи и после этого не зависит ни от чего
-- внешнего. Производного счётчика-колонки на организации по-прежнему нет намеренно — источник истины
-- остаётся один, событийная таблица.
--
-- DEFAULT намеренно ограничительный. Забытый штамп должен ТРАТИТЬ право, а не выдавать бесконечные
-- смены: ошибка в сторону «клиника обратится в поддержку» обратима, ошибка в сторону «лимита нет»
-- необратима и незаметна.
--
-- Отдельного индекса на колонку нет сознательно. Единственное чтение —
-- `WHERE organization_id = $1 AND initiated_by = 'clinic'`; ведущий столбец уже покрыт
-- `idx_organization_slug_rename_events_org_created`, а число строк на организацию ограничено самим
-- правилом (одна самостоятельная смена плюс редкие админские). Второй индекс с тем же ведущим
-- столбцом дал бы стоимость записи без выигрыша чтения.

ALTER TABLE public.organization_slug_rename_events
  ADD COLUMN IF NOT EXISTS initiated_by text NOT NULL DEFAULT 'clinic';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Разовый бэкфилл существующих строк. Соединение с членством здесь верно ровно один раз — сейчас,
-- пока ни одного удаления аккаунта ещё не произошло; после этой миграции оно больше не используется.
UPDATE public.organization_slug_rename_events AS ev
SET initiated_by = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.be_organization_members AS member
      WHERE member.platform_user_id = ev.actor_platform_user_id
        AND member.organization_id = ev.organization_id
    ) THEN 'clinic'
    ELSE 'platform_admin'
  END;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.organization_slug_rename_events
  DROP CONSTRAINT IF EXISTS organization_slug_rename_events_initiated_by_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.organization_slug_rename_events
  ADD CONSTRAINT organization_slug_rename_events_initiated_by_check
  CHECK (initiated_by = ANY (ARRAY['clinic'::text, 'platform_admin'::text]));
