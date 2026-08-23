# D30: удалить дублирующий M2M-путь синхронизации правил напоминаний

## Роль и режим

Ты — implementation worker в отдельной ветке. Выполни весь bounded scope одним ходом, проверь, закоммить только явно затронутые пути и дай точный отчёт. Не пушь, не деплой, не трогай DEV/TEST/PROD и никакую живую БД. Долгие проверки выполняй на переднем плане и дождись результата; не заканчивай ход с незакоммиченным деревом.

Сначала прочитай карту и применимые разделы `AGENTS.md`: «Как решать, что делать», §1 migrations, §5, §7, §9–§10b, §24. Затем прочитай полностью authority ниже и измерь текущий код через `code-search`, после чего делай минимальный coherent pass.

## Authority

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2.3, **Р-D30** — «владение решением (какие напоминания, сроки и тексты) — webapp; исполнение по расписанию — integrator»; «Повторы исполняются через единственную `public.outgoing_delivery_queue`».

Дополнительная действующая authority:

- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D30: «Цель — перенести подходящие scheduled jobs ... при сохранении webapp-ownership правил, сроков и текстов».
- `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md` Ш8: «B3 — ВЕДЁТСЯ В ... §D5–D7/D25. Дренаж `integrator_push_outbox` исчезает вместе с M2M-каналом `reminder_rule_upsert`. В этом плане фиксируется только зависимость; работа здесь не начинается».
- `AGENTS.md` §5 «Один общий проход»: второй способ той же операции запрещён; варианты должны быть параметрами существующей точки, не новой функцией/обёрткой/гейтом.
- `AGENTS.md` §5 «Доступ к базе — оба приложения»: только через DB-port своего приложения на Drizzle; новый raw SQL запрещён.

Более позднего owner-решения, сохраняющего `reminder_rule_upsert`, нет. Техническая проза старого плана не сильнее Р-D30.

## Человеческий разрыв

Сейчас webapp уже сохраняет каноническое правило в `public.reminder_rules`, затем отправляет тот же rule в integrator вторым HTTP-путём. Отказ второго пути не отменяет успешное сохранение, но возвращает человеку ложное «не удалось синхронизировать с ботом». Затем тот же rule повторно пишется в ту же таблицу через integrator и может породить две разные retry-системы. Удалить надо именно дубль; каноническое сохранение и реальный scheduler/materialization/delivery путь остаются.

## Точный scope реализации

Сначала переписью подтвердить call graph и удалить только ставший лишним M2M-канал:

### Webapp

- В `apps/webapp/src/modules/reminders/service.ts` убрать dependency/calls `notifyIntegratorRuleUpdated`, `tryNotifyIntegrator`, `syncWarning` и ложное warning-поведение после успешного канонического save.
- Убрать соответствующую DI-wiring из `buildAppDeps` и типов зависимостей.
- Удалить `apps/webapp/src/modules/reminders/notifyIntegrator.ts`.
- Удалить только инфраструктуру `apps/webapp/src/infra/integrator-push/**`, если перепись докажет, что после снятия rule M2M у неё нет другого живого назначения.
- Удалить `apps/webapp/scripts/integrator-push-outbox-tick.ts` и его package-script, если они обслуживают только этот outbox.
- В admin/system-health сохранить общий health/TTL и другие поверхности; убрать только ветку/метрики `integrator_push_outbox`, ставшие недостижимыми.

### Integrator

- Удалить `reminderRulesRoute.ts` и регистрацию `POST /api/integrator/reminders/rules`.
- Удалить mutation contract/handler/write-port operation `reminders.rule.upsert`.
- Удалить `writeReminderRulesDirect.ts`.
- Из `directPublicWriteRetry` убрать только operation `reminder_rule_upsert`; сам общий retry-механизм, таблицу и все остальные operations сохранить.

### База и privilege artifacts

- Добавить только новую forward migration с именем `YYYYMMDDTHHMMSS_slug.sql`; исторические миграции не переписывать.
- Миграция удаляет `public.integrator_push_outbox`, принадлежащие ей индексы/sequence и `app.enqueue_current_reminder_rule_push`, а также `app.integrator_upsert_reminder_rule`.
- Из CHECK/type поверхности `integrator.direct_public_write_retries` убрать только `reminder_rule_upsert`; остальные операции не менять.
- В migration запрещены `GRANT`, `REVOKE`, роли и политики. Все declaration/capability изменения сделать до migration и пересобрать все generated privilege artifacts штатными генераторами.
- Добавить `BCB-MIGRATION-VERIFY` по действующему шаблону репозитория.
- В отчёте дать обязательный разбор прав миграции из `AGENTS.md` §1: объекты, owners/execution roles, необходимые права, соответствие declaration. Не обращаться к БД; preflight на named DEV/TEST будет отдельным независимым gate перед landing.

## Неприкосновенные рабочие пути

Обязательно сохранить:

- канонический save/read `public.reminder_rules` webapp-портом;
- scheduler → signed materialize wake → webapp materialization → `public.outgoing_delivery_queue` → integrator delivery;
- `public.outgoing_delivery_queue`, её claim/idempotency/retry/dead-letter поведение;
- общий `integrator.direct_public_write_retries` и все operations кроме `reminder_rule_upsert`;
- общие operator-health/TTL механизмы, не завязанные исключительно на `integrator_push_outbox`.

Не создавай заменяющий wrapper, новый route, новую очередь, новый retry-контур или новую функцию. Кандидат консолидации уже назван: каноническая запись правила остаётся в существующем webapp reminders port; доставка остаётся в существующей `public.outgoing_delivery_queue`.

## Тесты и приёмка воркера

Удалить как намеренно устаревшие только тесты старого пути:

- `notifyIntegrator.test.ts`;
- `integratorM2mPosts.test.ts`;
- `writePort.reminderRuleFallback.test.ts`;
- только reminder-rule cases из `deliveryIdempotency.route.test.ts`, `directPublicWriteRetryWorker.test.ts`, `directPublicWriteRetry.unit.test.ts` и named-root writer tests.

Не писать source-text тесты на отсутствие строк/файлов. Сохранить или адаптировать поведенческие доказательства, что:

1. правило сохраняется канонически без второго HTTP-вызова и без ложного warning;
2. scheduler видит каноническое правило;
3. signed materialize wake создаёт delivery intent в `public.outgoing_delivery_queue`;
4. общие health/TTL функции продолжают работать;
5. другие direct-public retry operations не изменились.

Запустить минимально достаточные targeted/phase проверки: затронутые Vitest/Node tests, typecheck обоих приложений, scoped lint, migration-order/lint, privilege declaration/generator `--check` и другие существующие генераторные проверки, которые затрагивает diff. Полный `pnpm run ci` не запускать: его даст integration leader после landing. DB/DEV/TEST tests не запускать.

## Запрещённое

- Не трогать, не переключать, не мёрджить и не удалять никакие ветки/worktree Therapysto/branding/night/reaudit/surface-map/flashcall и вообще никакие чужие ветки/worktree.
- Не трогать UI-ветки и несвязанный Track D scope.
- Не удалять branch/worktree текущего воркера.
- Не использовать `git add -A`; stage только точные пути своего diff.
- Не пушить, не deploy, не cronport, не PROD, не читать секреты.

## Отчёт

Назови:

- commit SHA и полный список изменённых путей;
- точный старый call graph и что именно исчезло;
- почему реальный scheduler/materialization/delivery path не затронут;
- точные команды и результаты проверок;
- migration rights analysis;
- что требует независимого аудита и rollback-only named DEV preflight перед landing.
