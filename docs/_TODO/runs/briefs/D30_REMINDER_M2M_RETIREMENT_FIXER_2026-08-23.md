# D30 — одним проходом закончить снятие reminder-rule M2M

## Роль и результат

Ты один сильный worker на цельный продуктовый этап. Не дели работу на микроисправления и не запускай других
агентов. Доведи ветку `wt/d30-remove-reminder-rule-m2m-20260823` от текущего handoff до одного проверенного
коммита: старый webapp → integrator канал `reminder_rule_upsert` и его `public.integrator_push_outbox` полностью
удалены из активного runtime/deploy/privilege/health-контура, а канонические напоминания и доставка не сломаны.

**Источник оракула:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «интегратору остаётся только доставка входа, а создание учётки, доверие к телефону и синхронизация личности — вебаппу»; `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md` — «Дренаж `integrator_push_outbox` исчезает вместе с M2M-каналом `reminder_rule_upsert`».

Repo-rule `AGENTS.md` §5 требует один общий проход: не заводи новую очередь, второй health-root, новый wrapper или
compat-путь; расширяй/сохраняй существующий `outgoing_delivery_queue` и общий maintenance tick.

## Текущий handoff — не считай готовым

- `d2cce69b3` снял основной producer/consumer и добавил forward migration.
- `2a5b45e3d` сохранил найденные лидом незакрытые зависимости: health/admin/archive, права, retry enum и
  dependency-safe заготовку миграции.
- Ветка уже обновлена текущим `feat/doctor-ui-rebuild`. Работай только здесь; Therapysto-ветки/worktree/docs не
  трогай, не сливай и не удаляй.

Сначала прочитай полный diff от merge-base и фактические active references. Предыдущий worker пропустил живые
SQL-функции, поэтому отчёту не доверяй без переписи.

## Обязательный scope одного прохода

1. Удали весь достижимый webapp → integrator sync правил: producer, signed POST route/contract, retry operation,
   cron/script/package entry и `integrator_push_outbox` schema/runtime code.
2. Сохрани целевой путь: webapp пишет `public.reminder_rules`; scheduler/integrator читает правила через
   существующий webapp API и доставляет готовые задания через `public.outgoing_delivery_queue`. GET-чтения
   integrator → webapp и общую delivery queue не удалять.
3. Forward migration обязана работать без `CASCADE`: сначала `CREATE OR REPLACE` всех живых функций, тела которых
   читают удаляемую таблицу (`app.archive_operator_health_failures`,
   `app.read_curated_system_health_pre_0196`), затем удалить два retired root и таблицу, затем сузить CHECK
   `integrator.direct_public_write_retries_operation_check`. Сохрани `content_access_grant_upsert` и остальные
   живые операции. Каждый statement — по owner-marker contract; никаких GRANT/REVOKE/POLICY в миграции.
4. Удали retired relation/functions/capability из `deploy/postgres/privileges/declaration.ts`, row-lock map,
   function/name census и generated privilege artifacts штатным генератором. Не редактируй generated privilege
   SQL вручную.
5. Удали retired queue из active health/admin/archive surface: curated snapshot schema, critical/digest/banner,
   admin system-health card, archive clear/filter capability, ports/repos/in-memory stubs. Уже сохранённые строки
   `operator_health_failure_archive` не удалять; общий просмотр архива должен продолжать их показывать.
6. Оставь periodic maintenance одним существующим use-case: TTL purge архива + webhook-error retention. Старое
   имя `runIntegratorPushOutboxHealthGuardTick` не должно остаться в активном коде.
7. Обнови active deploy checks/runbooks, которые иначе обратятся к удалённой таблице. Исторические применённые
   миграции не переписывай. Generated schema-B snapshot не refresh-ить до применения forward migration на named
   DEV: он остаётся pre-forward input, новый forward удаляет объект.
8. Проверь точным поиском активные остатки `integrator_push_outbox`, `reminder_rule_upsert`,
   `enqueue_current_reminder_rule_push`, `integrator_upsert_reminder_rule`, `integrator-push-outbox`. Каждое
   оставшееся совпадение классифицируй: историческая migration/evidence либо реальный остаток. Реальный остаток
   закрыть в этом же проходе.

## Проверки

Выбери точные команды по существующим package/scripts; минимум:

- migration parser/order/privilege checks для нового файла;
- `node deploy/postgres/privileges/generate-cli.mjs --all`, затем оба check-режима;
- `pnpm test:db-privileges` либо более узкий эквивалент, который покрывает declaration/census/row-lock;
- затронутые integrator direct-public retry tests;
- затронутые webapp maintenance/health/archive tests;
- строгий typecheck integrator и webapp;
- `git diff --check`.

Полный CI не запускай: этот ход обязан сначала закрыть точный multi-app/DB seam; full CI решает лид на
интеграционной границе. DEV/TEST/PROD, миграции живой БД, deploy, cronport, push и удаление веток запрещены.
Rollback-only candidate preflight и независимый аудит выполняются после твоего коммита отдельным gate.

## Отчёт и коммит

Создай `docs/_TODO/runs/integrator-cleanup/D30_REMINDER_M2M_RETIREMENT_FIXER_2026-08-23.md` с:

- точным списком удалённого активного шва и сознательно оставленных исторических совпадений;
- разбором прав миграции по AGENTS.md §1: объекты, owners, runtime relations/operations, изменения declaration;
- командами и честными результатами проверок;
- тем, что НЕ проверено (named DEV preflight, TEST, full CI, live delivery).

Застейджи только файлы этого этапа явными путями, закоммить один законченный результат, дерево оставь чистым.
В финальном сообщении дай SHA, список gate и оставшийся live/audit handoff.
