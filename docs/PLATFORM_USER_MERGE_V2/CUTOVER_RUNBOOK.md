# Platform User Merge v2 — Cutover / production runbook

Операционные шаги для production. **Источник фактов:** [`../ARCHITECTURE/SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md), [`../../deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md).

## Перед любым деплоем v2

1. Убедиться, что merge в `main` прошёл `pnpm run ci` в CI.
2. Деплой на хост выполняется job **Deploy** в `.github/workflows/ci.yml` (SSH → `deploy/host/deploy-prod.sh`).
3. Скрипт сам вызывает `postgres-backup.sh pre-migrations` — в `/opt/backups/postgres/pre-migrations/` должны появиться **два** `.dump` (integrator + webapp).

## Подключение к БД (обязательный префикс)

**Integrator:**

```bash
set -a && source /opt/env/bersoncarebot/api.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT current_database();"
```

**Webapp:**

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT current_database();"
```

**Две БД (backfill / reconcile / диагностика):**

```bash
set -a && source /opt/env/bersoncarebot/cutover.prod && set +a
# DATABASE_URL → webapp; INTEGRATOR_DATABASE_URL → integrator
```

Не вызывать `psql "$DATABASE_URL"` без предварительного `source` нужного env-файла.

## После деплоя

| Проверка | Команда / место |
|----------|-----------------|
| API | `curl -sf http://127.0.0.1:3200/health` — `ok`, `db` up |
| Webapp | `curl -sf http://127.0.0.1:6200/api/health` — `ok` |
| Chunk static | см. логику в `deploy-prod.sh` (проверка `/_next/static/chunks/...`) |
| Outbox | `node apps/integrator/scripts/projection-health.mjs` (на хосте из актуального дерева после deploy) |

## Deploy 1 (schema)

- Применена только integrator-миграция; webapp код не зависит от новой колонки.
- Валидация: `\d users` в integrator DB — колонка `merged_into_user_id` существует.

## Deploy 2 (canonical path)

- Смотреть логи `bersoncarebot-api-prod`, `bersoncarebot-worker-prod` на ошибки identity/outbox.
- При необходимости выборочно сравнить counts в `projection_outbox` (pending/dead) до/после окна.

## Deploy 3 (merge + realignment)

- **Не включать** массовый merge без dry-run на копии или без пошагового пилота.
- Выполнить диагностические запросы из [`sql/README.md`](sql/README.md).
- Зафиксировать в `AGENT_EXECUTION_LOG.md` время merge, пары id, результат SQL gate-запросов.

## Deploy 4 (feature flag)

- Включить ключ в `system_settings` через админ Settings (не через новые env для интеграционной конфигурации — см. правила проекта).
- Пилот: один кейс с двумя integrator id под наблюдением.
- Rollback: выключить ключ; при необходимости откатить релиз через повторный deploy предыдущего коммита (операционно).

## Rollback (общие принципы)

- **Код:** redeploy предыдущего `main` (после согласования с миграциями — откат DDL вручную только если безопасен).
- **Данные:** восстановление из `pre-migrations` dump — процедура в `deploy/postgres/README.md` / HOST_DEPLOY_README.
- **Флаг:** предпочтительный быстрый путь — off в БД без redeploy.

## Связанные отчёты

- S3 / media не входят в v2 напрямую; purge/merge lock protocol — [`../REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md`](../REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md).
