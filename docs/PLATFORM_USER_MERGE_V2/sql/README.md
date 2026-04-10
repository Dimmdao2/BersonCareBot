# SQL — диагностика и gate-запросы (v2)

**Важно:** на production подключаться только с префиксом `set -a && source /opt/env/bersoncarebot/<api.prod|webapp.prod|cutover.prod> && set +a` — см. [`../CUTOVER_RUNBOOK.md`](../CUTOVER_RUNBOOK.md) и [`../../ARCHITECTURE/SERVER CONVENTIONS.md`](../../ARCHITECTURE/SERVER%20CONVENTIONS.md).

## Файлы

| Файл | БД | Назначение |
|------|-----|------------|
| [`diagnostics_integrator_users_merge.sql`](diagnostics_integrator_users_merge.sql) | integrator | alias-строки, циклы, сироты |
| [`diagnostics_webapp_integrator_user_id.sql`](diagnostics_webapp_integrator_user_id.sql) | webapp | поиск loser id в projection-таблицах (тело SELECT = `buildWebappLoserIntegratorUserIdGateUnionSql("psql")` в [`webappIntegratorUserProjectionRealignment.ts`](../../apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts); CI сверяет файл с билдером) |
| [`preview_webapp_realignment_collisions.sql`](preview_webapp_realignment_collisions.sql) | webapp | строки loser, которые будут удалены перед rekey (коллизии UNIQUE) |
| [`realign_webapp_integrator_user_id.sql`](realign_webapp_integrator_user_id.sql) | webapp | транзакция: dedup + `UPDATE integrator_user_id` loser→winner |

## Параметры

Замените плейсхолдеры:

- `:winner_id` / `:loser_id` — bigint integrator `users.id` (текстом в psql: `\set loser_id '12345'` и `\set winner_id '99999'` — тот же стиль, что в `diagnostics_webapp_integrator_user_id.sql`)

## Job-скрипт (webapp)

Из каталога `apps/webapp` при заданном `DATABASE_URL`:

- `pnpm realign-webapp-integrator-user -- --winner=<id> --loser=<id>` — dry-run (счётчики коллизий и строк с loser).
- то же с `--commit` — одна транзакция, эквивалент `realign_webapp_integrator_user_id.sql`.

## После realignment (gate evidence)

1. **До cutover (опционально):** `preview_webapp_realignment_collisions.sql` — зафиксировать, какие loser-строки дублируют winner по topic/mailing.
2. **После применения realignment:** `diagnostics_webapp_integrator_user_id.sql` с тем же `:loser_id` — ожидаемые `cnt` **0** по всем строкам результата. Сохранить вывод psql как evidence (тикет / runbook).
3. Повторный dry-run job-скрипта без `--commit` — все `[preview] rows still keyed by loser` должны быть `0`.

См. также [`STAGE_4_WEBAPP_REALIGNMENT.md`](../STAGE_4_WEBAPP_REALIGNMENT.md).
