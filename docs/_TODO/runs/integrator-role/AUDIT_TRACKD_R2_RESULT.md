# VERDICT: FAIL

Заявленные исправления появились, но план всё ещё нельзя безопасно исполнять: старые D3–D8 противоречат новой границе, D10 допускает потерю живого outbox, D6 не превращает известный FK-риск в обязательный cutover, а D17/D19 образуют противоречивый финал.

## Матрица девяти требований

| № | Статус | Проверка |
|---|---|---|
| 1 | **DISTORTED** | Цель «вебхуки + доставка» записана в [WORK_ORDER.md:238](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:238), но D3–D8 по-прежнему велят integrator писать продуктовый канон напрямую, а для достижимой части scenario executor нет полного cutover. |
| 2 | **PRESENT** | D11 дословно фиксирует полное удаление LFK/diary и evidence выполненного прохода — [WORK_ORDER.md:246](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:246). |
| 3 | **PRESENT** | D12 передаёт решение «просто вырезать; если упадёт — перенести нужное в webapp» — [WORK_ORDER.md:249](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:249). Не хватает точного перечня веток. |
| 4 | **PRESENT, CORRECTED** | D13a честно фиксирует, что настройки существуют, но потребителя и события `reminder` пока нет; D13b режет 24h/2h только после замены и D14 — [WORK_ORDER.md:252](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:252). |
| 5 | **PRESENT** | Цепочка владельца приведена дословно в D14 — [WORK_ORDER.md:267](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:267). |
| 6 | **PRESENT** | D15a — отдельное сильное исследование до работы; D15b — обязательный поэтапный cutover с TEST-proof — [WORK_ORDER.md:271](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:271). |
| 7 | **PRESENT** | D16 сохраняет delivery queue, retries/backoff/dead shelf, запрещает отдельный worker-scheduler и требует поимённого пересчёта циклов — [WORK_ORDER.md:279](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:279). |
| 8 | **PRESENT** | D18 теперь явно охватывает весь `apps/integrator`, а не только `directPublic`, фиксирует один Drizzle-путь и отдельный owner-workstream семи файлов — [WORK_ORDER.md:282](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:282). |
| 9 | **DISTORTED** | D17 назван последним и перечисляет D3–D8/D18, но расположен после D19, а активный общий порядок всё ещё объявляет последним D10. Exact-ACL утверждение также не привязано к новой роли и среде — [WORK_ORDER.md:289](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:289). |

## MUST FIX

1. **Переписать D3–D8 под новую границу, а не просто добавить их в гейт D17.**

   Сейчас D3/D4 требуют прямых записей `public.support_*`, D5 делает `public.reminder_rules` прямым источником, D7 требует такой же direct-DB контракт. Это несовместимо с новой схемой, где webapp — единственный владелец канона, а integrator не имеет к нему доступа ([ARCHITECTURE.md:53](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/ARCHITECTURE.md:53)).

   Достижимый сценарий: после D3/D4 integrator продолжает создавать обращение поддержки; D10 удаляет fallback; D17 отзывает `public` DML. Первое сообщение пациента получает permission denied и не сохраняется. Если грант оставить, узкой роли нет.

   Старые direct-writer формулировки нужно пометить `SUPERSEDED` и заменить cutover’ом product ownership в webapp. Точно так же нужен census достижимых executor-сценариев: D12 удаляет только десять мёртвых веток, но не закрывает остальные продуктовые решения. Иначе headline-цель остаётся декларацией.

2. **Собрать один финальный DAG и физически поставить D19 последним.**

   Сейчас одновременно активны:

   - D10 — `always last` ([WORK_ORDER.md:304](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:304));
   - D16 — выполняется после D10;
   - D17 — «последним»;
   - D19 напечатан перед D17, хотя проверяет уже выданную роль.

   Достижимый сценарий: исполнитель закрывает D19 до D17 записью «расхождений нет», затем role cutover меняет фактическую архитектуру и остаётся неперепроверенным. Это прямо нарушает запрет двух несовместимых active-требований в [plan standard:26](/home/dev/dev-projects/bcb-wt-tariff/.cursor/rules/plan-authoring-execution-standard.mdc:26).

   Безопасный хвост:

   ```text
   domain cutovers / D3–D8 / D13–D15
   → D10 (последний только для projection transport)
   → D16
   → D18
   → D17
   → D19 (абсолютно последний)
   ```

3. **Добавить в D10 обязательный drain/disposition живого `projection_outbox`.**

   `zero-producer census` доказывает лишь отсутствие новых событий. Исследование установило, что outbox — живой failure path, а не dead code. В нём могут остаться `pending` и `dead` события.

   Достижимый сценарий: последняя временная ошибка direct-write оставляет support/reminder event в outbox; producers уже нулевые; D10 удаляет таблицу — событие теряется без восстановления.

   D10 должен требовать: snapshot по статусам, drain/replay, явное решение по dead rows, нулевой остаток, затем drop. Одновременно необходимо обновить шесть release-gate потребителей projection-health; иначе удаление tooling ломает CI несвязанных этапов.

4. **Превратить известный FK-риск в обязательный D6-cutover и определить, куда D13a ставит occurrences.**

   D5 правильно зафиксировал FK `user_reminder_occurrences.rule_id → integrator.user_reminder_rules ON DELETE CASCADE` ([WORK_ORDER.md:181](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:181)), но сам D6 говорит только о reconciliation и retiring projections.

   Достижимый сценарий: D6 удаляет локальные rules до re-key/backfill — каскад удаляет occurrences, затем delivery logs. История доставки повреждается, запланированные уведомления пропадают.

   D6 нужны обязательные count/parity proofs, новый FK/ключ, backfill без каскадной потери и сохранение delivery history. D13a также обязан назвать хранилище appointment occurrences:

   - если используется общий legacy reminder lifecycle — D5→D6→D7 становится зависимостью;
   - если создаётся отдельный webapp booking-occurrence path — D13/D14 могут идти раньше, но он обязан доводить intent до общего delivery worker.

   Текущий `webapp_reminder_occurrences` прямо описан как Web Push-only и использует `integratorRuleId` ([webappReminderOccurrences.ts:14](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:14)), поэтому одной фразы «постановка occurrences» недостаточно для цепочки с integrator-отправителем.

5. **Сделать D17 настоящим exact-privilege gate, согласованным с D10/D16.**

   Текущая точная сверка управляет только C4-ролями и всё ещё ожидает права на `projection_outbox` и `message_retry_jobs` ([c4-operational-runtime.sql:947](/home/dev/dev-projects/bcb-wt-tariff/deploy/postgres/c4-operational-runtime.sql:947), [c4-operational-runtime.sql:1020](/home/dev/dev-projects/bcb-wt-tariff/deploy/postgres/c4-operational-runtime.sql:1020)). Новая integrator role в `managed/expected` не описана.

   Достижимые сценарии:

   - D10/D16 удаляют таблицы, но assertion остаётся прежним — TEST deploy фатально падает на missing privileges;
   - новая роль не включена в exact census — деплой зелёный, хотя лишние гранты не проверяются;
   - формулировка трактуется как PROD-ready, хотя production deploy сейчас не применяет grant closure вообще ([ROLE_GRANTS…:37](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md:37)).

   D17 должен назвать точные assertion/overlay-файлы, добавить новую роль в `managed` и `expected`, потребовать positive/negative ingress+delivery smoke и rollback. Поскольку PROD в Track D вне scope, role enforcement следует явно ограничить TEST; production оставить отдельным owner-gated cutover, а не заявлять уже проверенным.

6. **Перечислить в D12 точные десять удаляемых веток.**

   Число без меток не является безопасным deletion scope. В том же `switch` есть внешне похожие, но живые ветки. Исполнитель может удалить, например, `message.compose`, после чего у бота исчезнет основная reply-клавиатура.

   В чекбоксе должны быть зафиксированы:

   `booking.event.insert`, `callback.answer`, `message.deliver`, `message.retry.enqueue`, `intent.enqueueDelivery`, `notifications.get`, `notifications.toggle`, `reminders.rules.get`, `reminders.rule.toggle`, `reminders.rule.cyclePreset`.

   Это не новый scope, а требуемая атомаризация уже принятого удаления.

## Анализ порядка

**D13/D14 против D5–D7.** D13a как неактивный consumer можно построить заранее. Безопасная независимая последовательность возможна только если план явно вводит отдельный canonical appointment-occurrence/outbox в webapp:

```text
D13a → D14 → D13b
```

Тогда D5–D7 могут идти параллельно. Если D13a переиспользует существующий reminder lifecycle, сначала обязателен D5→D6 с FK-cutover→D7. План сейчас не выбирает вариант, поэтому D14 нельзя считать независимо исполнимым.

**D10.** Он правильно последний внутри удаления projection transport, но не последний в Track D-полном. Перед ним нужны все replacement paths, нулевые producers и drain outbox. После него остаются consolidation, один DB-порт, role cutover и архитектурная перепроверка.

**D17.** В текущем месте он непроверяем: D3–D8 сохраняют canon writes, exact assertion ещё описывает удаляемые очереди, а D19 стоит раньше него. Перечисление зависимостей улучшено, но фактического достижимого гейта пока нет.

## Invented scope / necessary and sufficient

Выдуманных пунктов среди D11–D19 не нашёл: каждый следует из слов владельца либо механически необходим для узкой роли.

Лишняя machinery возникает из старых D3–D8: строить новые direct writers в `public`, чтобы затем запретить их D17, — работа против конечной цели. D18 также должен переписывать на единый порт только остаточные ingress/delivery DB-пути после domain cleanup, а не код, который всё равно удаляется.

## Чего я не смог проверить

- Фактические `pending/dead` строки в `projection_outbox`, reminder/message queues.
- Живые ACL и реальную role topology TEST/PROD.
- Runtime-использование каждого достижимого executor-сценария.
- Итоговую identity-схему: её должен дать ещё не выполненный D15a.
- Расхождение счёта `directPublic`: owner-workstream говорит о семи файлах, исследования различают шесть runtime writers и тестовые файлы.
- Тесты, миграции и deploy не запускались; аудит был строго read-only, файлы не изменялись.