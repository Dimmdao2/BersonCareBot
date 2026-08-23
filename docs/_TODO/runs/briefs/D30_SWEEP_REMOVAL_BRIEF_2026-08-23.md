# D30 Ш3, пункт (3): снять legacy-sweep напоминаний о задачах специалиста

**Источник оракула:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «sweep/route/registry/host cron для закрытых code-side шагов тем же коммитом, что и пост-деплойные проверки»

Канон — `AGENTS.md` (`grep -n "^## \|^### " AGENTS.md`), §1, §5, §10a, §24.

## Почему это можно снимать именно сейчас

Оба условия, которые план ставил перед снятием, выполнены и записаны в плане:

- **(1)** именованная DEV/TEST сверка старых будущих задач — обе базы дали `future without queue=0`,
  то есть материализовать легаси-хвост не из чего;
- **(2)** живой прогон `create/update/complete/delete` на TEST 23.08.2026 доказал write-time доставку:
  создание кладёт `specialist_task_reminder|email|pending` с `event_id`
  `specialist-task:<id>:<remindAt>:email`, перенос времени убивает старую строку и ставит новую,
  завершение и удаление терминализуют всё.

То есть producer — это `createPgSpecialistTasksPort` write-time, а тик остался страховкой,
которую план велел снять тем же коммитом, что и пост-деплойные проверки.

## Что снять

Одним коммитом, полностью — не оставляя мёртвых упоминаний:

1. Роут `apps/webapp/src/app/api/internal/specialist-task-reminders/tick/route.ts` и его каталог.
2. Строку `specialist_task_reminders_tick` в `apps/webapp/src/modules/operator-health/cronJobRegistry.ts`
   (и всё, что становится неиспользуемым: `OPERATOR_SPECIALIST_TASK_REMINDERS_TICK_JOB_KEY`,
   `OPERATOR_SPECIALIST_TASKS_JOB_FAMILY` — **только если** на них не осталось других живых ссылок;
   проверь, а не предполагай).
3. Путь в allowlist `apps/webapp/src/middleware/csrfOrigin.ts`.
4. Запись роута в `deploy/postgres/privileges/relation-access.ts` — через генерацию, а не руками.
5. Документы: `apps/webapp/src/app/api/api.md`, `deploy/HOST_DEPLOY_README.md` (описание джобы, строка
   cron-примера, упоминание в списке `INTERNAL_JOB_SECRET`, таблица host scheduled jobs).
6. Host-cron: перепись 22.08 показала, что строки нет вовсе. **Проверь сам** (`node
   /home/dev/brain/tools/cronport.mjs list`) и напиши результат. `crontab` напрямую запрещён.

## Границы

- Write-time producer и очередь **не трогать** — они и есть целевая архитектура.
- Прав в миграциях нет: `GRANT`/`REVOKE`/`CREATE ROLE`/`CREATE POLICY` запрещены. Если снятие роута
  меняет декларацию прав — только через `declaration.ts` и генерацию
  (`--all`, `--all --port-context-only`, `--all --check` побайтово).
- `--execute`, TEST, PROD, push — запрещены. Галочку в плане ставит ведущий, не ты.

## Доказательство

- Перепись мёртвых упоминаний: `grep -rn "specialist-task-reminders\|specialist_task_reminders_tick"`
  по всему репозиторию должен вернуть ноль строк, кроме исторических отчётов в `docs/_TODO/runs/`
  и `docs/archive/` — их не переписываем.
- `typecheck`, `lint`, затронутые тесты — зелёные.
- Инъекция не требуется (это удаление), но **обязательна проверка обратного знака**: докажи, что
  напоминание по-прежнему материализуется без тика — вызови write-time путь в тестах и покажи
  появление строки в очереди.

Отчёт: `docs/_TODO/runs/integrator-cleanup/D30_SWEEP_REMOVAL_2026-08-23.md`.
