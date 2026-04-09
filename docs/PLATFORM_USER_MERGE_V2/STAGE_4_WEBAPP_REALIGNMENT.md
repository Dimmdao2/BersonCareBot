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
| `support_question_messages` / `support_questions` | косвенно через conversation | уточнить при реализации |

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

Варианты:

- Отдельный скрипт под `cutover.prod` (аналог [`deploy/host/run-stage13-cutover.sh`](../../deploy/host/run-stage13-cutover.sh)).
- Internal admin/ops route с секретом — только если согласовано с security/nginx (см. HOST_DEPLOY_README для `/api/internal/`).

## Gate

- `SELECT COUNT(*) ... WHERE integrator_user_id = loser` = 0 для всех целевых таблиц.
- Повторная проекция событий не создаёт новые loser-rows.

## Связь с todo «merge-outbox-realignment»

Вместе со [`STAGE_3`](STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md) закрывает cross-DB часть Deploy 3.
