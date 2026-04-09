# SQL — диагностика и gate-запросы (v2)

**Важно:** на production подключаться только с префиксом `set -a && source /opt/env/bersoncarebot/<api.prod|webapp.prod|cutover.prod> && set +a` — см. [`../CUTOVER_RUNBOOK.md`](../CUTOVER_RUNBOOK.md) и [`../../ARCHITECTURE/SERVER CONVENTIONS.md`](../../ARCHITECTURE/SERVER%20CONVENTIONS.md).

## Файлы

| Файл | БД | Назначение |
|------|-----|------------|
| [`diagnostics_integrator_users_merge.sql`](diagnostics_integrator_users_merge.sql) | integrator | alias-строки, циклы, сироты |
| [`diagnostics_webapp_integrator_user_id.sql`](diagnostics_webapp_integrator_user_id.sql) | webapp | поиск loser id в projection-таблицах |

## Параметры

Замените плейсхолдеры:

- `:winner_id` / `:loser_id` — bigint integrator `users.id` (текстом в psql: `\set loser_id 12345`)

## После realignment

Запустить gate-запросы из `diagnostics_webapp_integrator_user_id.sql` с `:loser_id` — ожидаемые counts **0** для всех перечисленных таблиц.
