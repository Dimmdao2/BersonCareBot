# Stage 4 — Webapp projection realignment (часть Deploy 3)

**Цель:** после integrator merge все строки в webapp, ключируемые по **loser** `integrator_user_id`, указывают на **winner** (или удалены по политике), чтобы read-side и ingestion не «воскрешали» loser.

## Инвентаризация таблиц (минимум из документации и кода)

См. [`../ARCHITECTURE/DB_STRUCTURE.md`](../ARCHITECTURE/DB_STRUCTURE.md) и purge-путь [`apps/webapp/src/infra/platformUserFullPurge.ts`](../../apps/webapp/src/infra/platformUserFullPurge.ts):

| Таблица | Колонка | Примечание |
|---------|---------|------------|
| `reminder_rules` | `integrator_user_id` | upsert в [`pgReminderProjection.ts`](../../apps/webapp/src/infra/repos/pgReminderProjection.ts) |
| `reminder_occurrence_history` | `integrator_user_id` | append-only rows |
| `reminder_delivery_events` | `integrator_user_id` | append-only |
| `content_access_grants_webapp` | `integrator_user_id` | upsert |
| `support_conversations` | `integrator_user_id` | COALESCE при upsert — realignment должен быть согласован |
| `user_subscriptions_webapp` | `integrator_user_id` | |
| `mailing_logs_webapp` | `integrator_user_id` | |
| `support_question_messages` / `support_questions` | — | отдельного `integrator_user_id` нет; связь через `conversation_id` → `support_conversations` (достаточно rekey родительской строки) |

**Дополнительно:** `platform_users.integrator_user_id` на стороне duplicate/target — решается существующим webapp merge **после** integrator merge (Stage 5 flow).

## Стратегии на таблицу

- **Rekey:** `UPDATE ... SET integrator_user_id = $winner WHERE integrator_user_id = $loser` (проверить UNIQUE индексы на коллизии).
- **Replay:** удалить строки loser-области и дождаться новых событий из integrator (дороже, проще для append-only без уникальности по user).
- **No-op:** если таблица не используется для пары пользователей.

## Порядок выполнения

1. Завершён integrator merge (Stage 3).
2. Остановить ли worker временно — **решение по риску** (если worker гонит старые события с loser id, может перезаписать realignment; согласовать с политикой outbox rewrite).
3. Выполнить batch в транзакциях по таблицам (или один скрипт с SAVEPOINT).
4. Прогнать gate-SQL из [`sql/README.md`](sql/README.md).

## Реализация в репозитории

**SQL (webapp DB):**

- Транзакция rekey + dedup: [`sql/realign_webapp_integrator_user_id.sql`](sql/realign_webapp_integrator_user_id.sql).
- Превью коллизий UNIQUE (topic / mailing): [`sql/preview_webapp_realignment_collisions.sql`](sql/preview_webapp_realignment_collisions.sql).
- Gate (все `cnt` = 0 по `loser_id`): [`sql/diagnostics_webapp_integrator_user_id.sql`](sql/diagnostics_webapp_integrator_user_id.sql) — тело UNION строится из [`webappIntegratorUserProjectionRealignment.ts`](../../apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts) (CI сверяет файл с билдером).

**Job (опционально к `psql`):** из `apps/webapp` при заданном `DATABASE_URL`:

- `pnpm realign-webapp-integrator-user -- --winner=<id> --loser=<id>` — dry-run (счётчики);
- то же с `--commit` — одна транзакция, эквивалент SQL-файла.

Порядок env на production: [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md), [`../ARCHITECTURE/SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md).

**Дополнительно (не реализовано как отдельный хост-скрипт v2):** controlled cutover-обёртка под `cutover.prod` или internal ops-route — только при отдельном согласовании (аналог [`deploy/host/run-stage13-cutover.sh`](../../deploy/host/run-stage13-cutover.sh); см. HOST_DEPLOY_README для `/api/internal/`).

## Gate

- `diagnostics_webapp_integrator_user_id.sql` с `\set loser_id '…'` — все строки результата с `cnt = 0` (см. [`sql/README.md`](sql/README.md)).
- Повторная проекция из integrator не создаёт новые loser-rows (канонический user id в outbox — Stage 2; окно worker — см. порядок выполнения выше).

## Связь с todo «merge-outbox-realignment»

Вместе со [`STAGE_3`](STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md) закрывает cross-DB часть Deploy 3.
