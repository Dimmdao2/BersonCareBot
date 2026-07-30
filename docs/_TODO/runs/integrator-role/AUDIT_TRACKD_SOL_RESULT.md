# VERDICT: FAIL

Формулировки владельца перенесены почти дословно, но план пока нельзя безопасно исполнять: DAG противоречив, D15 не включает фактический перенос identity, D10 не закрывает живой outbox, а D17 формально может начаться до D18 и до устранения всех продуктовых записей integrator.

## Матрица девяти требований

| № | Статус | Проверка |
|---|---|---|
| 1 | **PRESENT** | Цель «приём вебхуков + доставка» записана дословно в [WORK_ORDER.md:236](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:236). |
| 2 | **PRESENT** | Полное удаление LFK/diary отражено как D11 и связано с выполненным прогоном. |
| 3 | **PRESENT** | D12 фиксирует десять недостижимых веток и ровно указанную владельцем реакцию при регрессии. |
| 4 | **PRESENT** | D13 называет обе существующие настройки, шаблоны и конкурирующие 24h/2h тексты. |
| 5 | **PRESENT** | Цепочка «событие → итоговые настройки → планировщик → воркер → integrator-отправитель» приведена дословно в [WORK_ORDER.md:257](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:257). |
| 6 | **PRESENT** | D15 прямо запрещает начинать identity-перенос до сильного исследования. |
| 7 | **PRESENT** | D16 сохраняет delivery queue, retry/backoff/dead shelf и запрещает отдельный worker-scheduler. |
| 8 | **PRESENT** | D18 фиксирует один Drizzle-путь, семифайловый `directPublic` workstream владельца и запрет сырого SQL. |
| 9 | **DISTORTED** | D17 назван последним, но его зависимость записана только как `после D11–D16`, хотя сам D18 говорит, что без него D17 непроверяем. Кроме того, D15 заканчивается исследованием, не переносом. |

## MUST FIX

1. **Собрать один непротиворечивый DAG.** Сейчас одновременно активны три несовместимых указания: D10 «always last», D16 выполняется после D10, D17 «последним»; при этом D17 не зависит от D18. Исполнитель может выдать узкую роль при оставшемся втором DB-пути или завершить Track D на D10. Это нарушает запрет несовместимых активных требований в [plan standard:26](/home/dev/dev-projects/bcb-wt-tariff/.cursor/rules/plan-authoring-execution-standard.mdc:26).

2. **Разделить D15 на research и обязательный identity cutover.** Сейчас D15 можно закрыть отчётом исследования, после чего план разрешает D17. Но integrator продолжит создавать/сливать `platform_users`, решать phone trust, enrollments и defaults. После отзыва прав новый webhook/merge упадёт; если права сохранить, узкой роли не получится. Нужны отдельные атомарные пункты: research → утверждённая схема → миграция/idempotency → переключение callers → live proof → удаление broad writes.

3. **Довести target shape до всех живых продуктовых путей.** D12 удаляет лишь десять недостижимых веток; D3/D4, наоборот, закрепляют прямые product-canon writes поддержки. Исследование относит support workflow и reachable scenario engine к leaked domain. При D17 support conversation/message/question либо перестанут записываться, либо integrator сохранит широкий DML. Нужен callgraph и перенос оставшихся живых product decisions, особенно support; внутреннее противоречие статусов D3/D4 также надо reconciliate, а не просто поставить галочки.

4. **Сделать D13+D14 replacement-first атомарным cutover.** Сейчас hardcoded booking reminders реально планируются отдельными `message_retry_jobs` в [bookingLifecycleRoute.ts:307](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:307). Если D13 удалить раньше нового webapp-пути — пациент перестанет получать напоминания; если сначала включить новый путь без отключения старого — получит дубли, а reschedule/cancel сможет оставить старые jobs. Нужны явные acceptance: per-org settings, templates, patient/channel resolution, cancel/reschedule, idempotency и доказательство ровно одной доставки.

5. **Вынести FK-cutover в обязательный текст D6.** Риск замечен в комментарии D5, но не превращён в acceptance D6. `user_reminder_occurrences.rule_id` имеет `ON DELETE CASCADE` к локальной таблице правил, а delivery logs каскадируются от occurrences в [migration:21](/home/dev/dev-projects/bcb-wt-[redacted-token]20260311_0002_create_user_reminders.sql:21). Удаление `integrator.user_reminder_rules` без re-key/backfill уничтожит историю occurrences и delivery logs. Нужны count/parity/FK proofs до drop.

6. **D10 должен требовать не только zero-producer census, но и drain/disposition.** Outbox — живой failure path: при неудачном sync emit событие кладётся в очередь в [projectionFanout.ts:12](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:12). Нулевое число новых producers не означает пустую очередь. Drop таблицы при pending/dead rows потеряет ещё не доставленные support/reminder projections. Обязательны backlog snapshot, drain/replay, решение по dead rows и нулевой остаток. Аналогичный gate нужен D16 для оставшихся `message_retry_jobs`: нельзя выключить loop при живых отложенных доставках.

7. **Сделать D17 реальным deployment gate, а не обещанием.** TEST действительно проверяет exact ACL: лишние и недостающие права фатальны. Но канон фиксирует, что production deploy пока не применяет grant closure вообще в [ROLE_GRANTS…:37](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md:37). D17 должен явно включать для TEST: новую роль, positive/negative ACL matrix, переключение runtime URL/role, ingress/delivery smoke и rollback. PROD должен остаться отдельным owner-gated этапом с собственной closure/assertions. Одновременно надо обновить архитектурный канон, который пока утверждает shared role и dormant split в [DATABASE_UNIFIED_POSTGRES.md:17](/home/dev/dev-projects/bcb-wt-tariff/docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md:17).

## Порядок и зависимости

- **D13/D14 против D5–D7:** жёсткой DB/FK-зависимости нет. Booking reminders сейчас используют `message_retry_jobs`, а D5–D7 — `user_reminder_rules`/occurrences. Поэтому D13+D14 могут быть выполнены раньше D5–D7 как отдельный атомарный booking cutover. Если планируется переиспользовать общий новый reminder scheduler, тогда они должны ждать D6/D7. План сейчас эту развилку не закрывает.

- **D10:** больше не может называться последним пунктом всего Track D. Он должен быть последним только для projection transport: после D3–D8, всех оставшихся producers, D14-зависимого HTTP и drain outbox. После него ещё закономерно идут D16, D18 и абсолютный последний D17.

- **D17 в текущем месте непроверяем.** D15 не переносит identity, D18 не входит в его dependency list, D3/D4 сохраняют product writes, а reachable scenario/support scope не закрыт.

Минимальный безопасный хвост DAG:

```text
D15-research → identity implementation/cutover
D5 → D6(FK migration) → D7
D13+D14 atomic booking cutover
remaining support/scenario transfer + D8
→ D10 zero producers + outbox drain
→ D16 delivery-loop consolidation + queue drain proof
→ D18 single Drizzle DB path
→ D17 narrow-role enforcement, last
```

## Invented scope / достаточность

Явно выдуманного scope в D11–D18 не нашёл. D16, D17 и exact privilege assertion — механически необходимы целевой границе; они не являются лишней архитектурой.

План необходим, но недостаточен. Самое вероятное переусложнение — переписать на Drizzle все семь `directPublic` файлов до удаления domain writers, которые после D14/identity/support cutover вообще не должны существовать. D18 следует применять к остаточному DB-доступу после domain cleanup.

## Чего я не смог проверить

- Фактические pending/dead rows в `projection_outbox`, `message_retry_jobs` и delivery queue: DB не читалась.
- Реальные ACL/role topology DEV, TEST и PROD.
- Фактическое live-использование каждого reachable scenario/action.
- Исследования расходятся в точном количестве `directPublic`: формулировку владельца «семь файлов» план сохранил, но статический отчёт насчитал шесть production writers плюс test-файлы.
- Реальную готовность D3/D4: сам план одновременно держит `[ ]` и утверждает, что они merged+audited.
- Тесты и live-прогоны не запускались — аудит был read-only и направлен на план, файлы не изменялись.