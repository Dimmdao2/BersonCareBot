# Ф9 — удаление `integrator.telegram_state` на DEV

Дата живого прогона: 09.08.2026. Контур: только локальная DEV-БД `bcb_webapp_dev` на
`127.0.0.1:5432`. TEST и PROD не использовались. Канонический путь запуска —
`deploy/host/migrate-dev.sh`, который оборачивает `scripts/migrate-all.sh`.

## Идентичность контура

Команда:

```bash
set -a
source apps/webapp/.env.dev
set +a
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "SELECT current_database(), current_user, inet_server_addr(), inet_server_port();"
```

Результат:

```text
bcb_webapp_dev|bcb_webapp_dev_user|127.0.0.1|5432
```

Предварительный гейт:

```bash
bash deploy/host/migrate-dev.sh --preflight
```

Результат: `migrate-dev preflight: PASS (exact local DEV; no changes made)`.

## Что хранила таблица и какой сигнал живой

До миграции фактическое содержимое измерено только через `count(*)`:

```bash
set -a
source apps/webapp/.env.dev
set +a
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
SELECT count(*) AS total,
       count(*) FILTER (WHERE is_active) AS active,
       count(*) FILTER (WHERE NOT is_active) AS inactive,
       count(*) FILTER (WHERE last_start_at IS NOT NULL) AS with_last_start,
       count(*) FILTER (WHERE last_start_at IS NULL) AS without_last_start,
       count(*) FILTER (WHERE state IS NOT NULL) AS with_dialog_state,
       count(*) FILTER (WHERE last_update_id IS NOT NULL) AS with_last_update,
       count(*) FILTER (WHERE notify_spb OR notify_msk OR notify_online) AS with_any_notify_flag,
       min(last_start_at) AS earliest_last_start,
       max(last_start_at) AS latest_last_start
FROM integrator.telegram_state;

SELECT count(*) AS total_bindings,
       count(*) FILTER (WHERE channel_code = 'telegram') AS telegram_bindings,
       count(*) FILTER (
         WHERE channel_code = 'telegram' AND bot_blocked_at IS NULL
       ) AS telegram_unblocked,
       count(*) FILTER (
         WHERE channel_code = 'telegram' AND bot_blocked_at IS NOT NULL
       ) AS telegram_blocked
FROM public.user_channel_bindings;
SQL
```

Результат:

```text
total=115 active=115 inactive=0 with_last_start=67 without_last_start=48
with_dialog_state=113 with_last_update=2 with_any_notify_flag=2
earliest_last_start=2026-03-04 15:11:26.423601+03
latest_last_start=2026-07-25 14:21:41.062625+03

total_bindings=135 telegram_bindings=110 telegram_unblocked=100 telegram_blocked=10
```

Смысл полей проверен по коду:

```bash
rg -n "telegram_state" apps/integrator/src --glob '*.ts' | rg "is_active" || true
rg -n "tryConsumeStart|telegramStartDedup" \
  apps/integrator/src/infra/db/repos/channelUsers.ts \
  apps/integrator/src/app/di.ts \
  apps/integrator/src/kernel/eventGateway/incomingEventPipeline.ts
rg -n "TELEGRAM_START_DEBOUNCE_SECONDS" apps/integrator/src
rg -n "markBotBlocked|clearBotBlocked|bot_blocked_at" \
  apps/integrator/src/infra/db/repos/userChannelBotBlocked.ts
```

- Текущий runtime не читает и не пишет `telegram_state.is_active`; первый поиск не дал строк.
  Комментарий миграции `20260306_0008_worker_schema.sql` описывает его как старый признак
  unsubscribe/block. Он не авторитетен: все строки имели `is_active=true`, при этом актуальные
  bindings уже содержали заблокированные Telegram-каналы (точное количество — в результате
  `count(*)` выше).
- `last_start_at` используется только `channelUsers.tryConsumeStart` как трёхсекундный debounce
  голой команды `/start`. Это не долговечный пользовательский факт; универсальный durable dedup
  уже находится в `integrator.idempotency_keys`.
- Положительный факт «канал привязан и в него можно пытаться писать» — существование строки
  `public.user_channel_bindings`. Текущий отрицательный факт доставки —
  `bot_blocked_at`/`bot_blocked_reason`, которые обновляет delivery path.
- `state`, `last_update_id` и notification flags не переносятся: диалога больше нет, update dedup
  универсален, читателей флагов нет.

Связность старого состояния с текущими bindings проверена без вывода персональных идентификаторов.
Команда читала только COPY-блоки замороженных дампов и агрегировала совпадения по
`resource/channel_code + external_id`:

```bash
node /tmp/bcb-telegram-state-map.mjs
sha256sum \
  /tmp/bcb-telegram-state-map.mjs \
  /tmp/pub_dev_user_channel_bindings.sql \
  /home/dev/dev-projects/bcb-backups/integrator-cut-2026-08-08/bcb_webapp_dev.integrator.identities.sql
```

Результат первой команды:

```json
{
  "states": 115,
  "identities": 134,
  "bindings": 135,
  "stateIdentityMapped": 115,
  "bindingMatched": 112,
  "bindingMissing": 3,
  "withStart": 67,
  "startWithBinding": 66,
  "startWithoutBinding": 1,
  "activeWithUnblockedBinding": 102,
  "activeWithBlockedBinding": 10,
  "activeWithoutBinding": 3
}
```

Контрольные суммы входов и агрегатора из второй команды:

```text
f9f962ffc97760981bc6021b73c91812318c74b87bd20282660b775b4bceef02  /tmp/bcb-telegram-state-map.mjs
05330a5ee08f814e94e4cc6c079b82ea0ed7ac3f7a6dfd423869ca587305b52e  /tmp/pub_dev_user_channel_bindings.sql
d5d5e8f3abc751d45c9c0892d521b30049a7146c96c9b778e04e16dcea056655  /home/dev/dev-projects/bcb-backups/integrator-cut-2026-08-08/bcb_webapp_dev.integrator.identities.sql
```

Итог переноса: webapp-миграция
`0384_telegram_state_delivery_signal_local.sql` переносит только безопасный отрицательный сигнал
`is_active=false` в ещё не заблокированный binding. Она никогда не снимает более новый
`bot_blocked_at`. На DEV перенос не изменил строк: неактивных legacy-строк не было. Все legacy-запуски,
у которых уже есть реальный binding, представлены binding-строкой; единственный запуск без binding
относится к уже документированному no-account support chat, чей адрес канала сохраняется в
`public.support_conversations` (см. evidence 22). Возможность отправки не была молча выброшена.

Если `integrator.identities` уже нет, миграция разрешает no-op только при нулевом числе неактивных
строк. При любом непереносимом отрицательном сигнале она делает `RAISE NOTICE` и `RETURN` до записи.

## FREEZE

До запуска миграций снят дамп единственной ещё существовавшей таблицы из цепочки удаления:

```bash
backup_dir=/home/dev/dev-projects/bcb-backups/telegram-state-removal-2026-08-09
credential_dir="$(mktemp -d /tmp/bcb-tgstate-freeze.XXXXXX)"
trap 'rm -rf -- "$credential_dir"' EXIT
node deploy/host/parse-dev-database-url.mjs --write-pgpass \
  /home/dev/dev-projects/bcb-wt-tgstate/apps/webapp/.env.dev \
  "$credential_dir/pgpass"
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=bcb_webapp_dev_user \
PGDATABASE=bcb_webapp_dev PGPASSFILE="$credential_dir/pgpass" \
  pg_dump --no-owner --no-privileges \
  --table=integrator.telegram_state \
  --file="$backup_dir/bcb_webapp_dev.integrator.telegram_state.sql"
(cd "$backup_dir" && \
  sha256sum bcb_webapp_dev.integrator.telegram_state.sql > SHA256SUMS && \
  sha256sum -c SHA256SUMS)
```

Пути:

```text
/home/dev/dev-projects/bcb-backups/telegram-state-removal-2026-08-09/bcb_webapp_dev.integrator.telegram_state.sql
/home/dev/dev-projects/bcb-backups/telegram-state-removal-2026-08-09/SHA256SUMS
```

Проверка:

```bash
cd /home/dev/dev-projects/bcb-backups/telegram-state-removal-2026-08-09
sha256sum -c SHA256SUMS
stat -c '%a %U:%G %n' . bcb_webapp_dev.integrator.telegram_state.sql SHA256SUMS
```

Результат:

```text
bcb_webapp_dev.integrator.telegram_state.sql: OK
700 dev:dev .
600 dev:dev bcb_webapp_dev.integrator.telegram_state.sql
600 dev:dev SHA256SUMS
```

Содержимое `SHA256SUMS`:

```text
43efa098bef7205403b21d80077097314795ff44a33260ac210f4105fdb1cc3a  bcb_webapp_dev.integrator.telegram_state.sql
```

## Миграция и census DEV

До запуска:

```bash
set -a
source apps/webapp/.env.dev
set +a
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
SELECT schemaname, count(*) AS table_count
FROM pg_tables
WHERE schemaname IN ('public', 'integrator')
GROUP BY schemaname
ORDER BY schemaname;
SELECT 'integrator.schema_migrations' AS ledger, count(*) AS row_count
FROM integrator.schema_migrations
UNION ALL
SELECT 'drizzle.__drizzle_migrations', count(*)
FROM drizzle.__drizzle_migrations;
SQL
```

Результат до: `integrator=9`, `public=215`, integrator ledger `79`, drizzle ledger `383`.

Нормальный запуск:

```bash
bash deploy/host/migrate-dev.sh --execute
```

Результат: `migrate-dev: PASS`. Webapp-миграция сохранила нужный сигнал, затем integrator-миграция
`20260808_0012_drop_legacy_telegram_state.sql` проверила сохранность неактивных строк и неожиданные
внешние зависимости, после чего выполнила `DROP TABLE integrator.telegram_state` без `CASCADE`.
Необъявленные FK/view/policy/function/trigger заставляют её сделать `RAISE NOTICE` и `RETURN`, ничего
не удаляя.

После запуска:

```bash
set -a
source apps/webapp/.env.dev
set +a
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
SELECT schemaname, count(*) AS table_count
FROM pg_tables
WHERE schemaname IN ('public', 'integrator')
GROUP BY schemaname
ORDER BY schemaname;
WITH named(table_name) AS (VALUES
 ('telegram_users'), ('user_reminder_rules'), ('content_access_grants'),
 ('question_messages'), ('user_questions'), ('conversation_messages'),
 ('conversations'), ('contacts'), ('message_retry_jobs'), ('identities'),
 ('users'), ('telegram_state')
)
SELECT table_name, to_regclass('integrator.' || table_name) IS NOT NULL AS exists
FROM named ORDER BY table_name;
SELECT 'integrator.schema_migrations' AS ledger, count(*) AS row_count
FROM integrator.schema_migrations
UNION ALL
SELECT 'drizzle.__drizzle_migrations', count(*)
FROM drizzle.__drizzle_migrations;
SELECT count(*) FILTER (
         WHERE channel_code = 'telegram' AND bot_blocked_at IS NOT NULL
       ) AS telegram_blocked,
       count(*) FILTER (
         WHERE bot_blocked_reason = 'legacy_telegram_state_inactive'
       ) AS copied_legacy_inactive
FROM public.user_channel_bindings;
SELECT count(*) FROM integrator.schema_migrations
WHERE filename = '20260808_0012_drop_legacy_telegram_state.sql';
SELECT count(*) FROM drizzle.__drizzle_migrations
WHERE created_at = 1793539230127;
SQL
```

Результат после:

```text
integrator=8
public=215
все 12 имён legacy-таблиц: exists=false
integrator.schema_migrations=91
drizzle.__drizzle_migrations=387
telegram_blocked=10
copied_legacy_inactive=0
ledger row for 0012=1
ledger row for created_at 1793539230127=1
```

Итого census: `integrator 9 -> 8`, `public 215 -> 215`; ledger:
`integrator 79 -> 91`, `drizzle 383 -> 387`. Рост integrator ledger включает ранее физически
исполненную, но не записанную старую drop-chain: её идемпотентные миграции увидели отсутствие
объектов, self-disarm и были штатно записаны.

После wrapper временные права сняты. Команда:

```bash
sudo -n -u postgres psql -X -Atqc \
  "SELECT pg_has_role('bcb_webapp_dev_user', 'bcb_migrator', 'MEMBER'),
          rolbypassrls
     FROM pg_roles
    WHERE rolname = 'bcb_webapp_dev_user';" bcb_webapp_dev
```

Результат: `false|false`.

## Что упало после удаления

Сначала запускались обычные DEV-команды:

```bash
pnpm run dev
pnpm run worker:dev
pnpm run scheduler:dev
```

В текущем worktree обычный locked-mode integrator/API остановился до listen из-за отсутствующего
`DATABASE_URL_DIAGNOSTIC`, worker — из-за отсутствующего `DATABASE_URL_DELIVERY_WORKER`, scheduler —
из-за отсутствующего `DATABASE_URL_SCHEDULER`. SQLSTATE отсутствует: это application `Error` до SQL.
Точные guard-paths:

```bash
rg -n "DATABASE_URL_(DIAGNOSTIC|DELIVERY_WORKER|SCHEDULER) is required" \
  apps/integrator/src/infra/db/integratorPoolProvider.ts
```

Webapp в том же обычном запуске ответил `GET /api/me 200`; его существующие compile warnings в
`pgUserByPhone.ts` к удалению таблиц не относятся и SQLSTATE не имеют.

Чтобы именно прогнать SQL-callers на той же DEV-БД, без изменения кода, env-файла, ролей или БД,
процессы отдельно запущены с process-only совместимым routing mode:

```bash
DB_PRINCIPAL_CONTEXT_MODE=legacy-guc pnpm run dev:integrator
DB_PRINCIPAL_CONTEXT_MODE=legacy-guc pnpm --dir apps/integrator exec tsx -e \
  "void import('./src/config/loadEnv.ts').then(async () => { const readiness = await import('./src/infra/db/operationalPoolReadiness.ts'); try { await readiness.assertDeliveryWorkerPoolReady(); console.log('DELIVERY_WORKER_READINESS=PASS'); } catch (error) { const cause = error instanceof Error && 'cause' in error ? error.cause : error; console.log(JSON.stringify({ code: cause?.code, message: cause?.message })); } })"
DB_PRINCIPAL_CONTEXT_MODE=legacy-guc pnpm --dir apps/integrator exec tsx -e \
  "void import('./src/config/loadEnv.ts').then(async () => { const readiness = await import('./src/infra/db/operationalPoolReadiness.ts'); await readiness.assertSchedulerPoolReady(); console.log('SCHEDULER_READINESS=PASS'); })"
DB_PRINCIPAL_CONTEXT_MODE=legacy-guc pnpm --dir apps/integrator exec tsx -e \
  "void import('./src/config/loadEnv.ts').then(async () => { const repo = await import('./src/infra/db/repos/channelUsers.ts'); const client = await import('./src/infra/db/client.ts'); const result = await repo.tryConsumeStart(client.createDbPort(), 123456789); console.log(JSON.stringify({ codePath: 'channelUsers.tryConsumeStart', result })); await client.closeDb(); })"
```

Контроль API в процессе первого запуска:

```bash
curl -sS -o /tmp/bcb-tgstate-health.out -w '%{http_code}\n' \
  http://127.0.0.1:5200/health
```

Существенный диагностический вывод:

```text
{"code":"42P01","message":"relation \"integrator.message_retry_jobs\" does not exist"}
SCHEDULER_READINESS=PASS
queryFingerprint=5d3734431eabe2d8 pgCode=42P01 pgClass42; tryConsumeStart error
{"codePath":"channelUsers.tryConsumeStart","result":true}
200
```

Зафиксированы следующие результаты; вызывающий код намеренно не исправлялся:

| Компонент / code path | Результат | SQLSTATE | Связь с drop-chain |
|---|---|---:|---|
| `worker/main.ts -> assertDeliveryWorkerPoolReady -> operationalPoolReadiness.ts:30` | `relation "integrator.message_retry_jobs" does not exist` | `42P01` | Да, ранее удалённая таблица из той же legacy-chain. |
| `incomingEventPipeline.ts:136 -> telegramStartDedup -> channelUsers.tryConsumeStart` | запрос к `telegram_state ... FROM identities` упал; функция залогировала ошибку и вернула `true` | `42P01` | Да, прямой забытый caller удалённых `telegram_state` и `identities`; fail-open, `/start` не заблокирован. |
| scheduler `assertSchedulerPoolReady` | `SCHEDULER_READINESS=PASS` | — | Падения нет. |
| integrator API `/health` | HTTP `200` | — | Падения нет. |
| `publicSystemSettings.ts:87 -> app.read_integrator_provider_runtime_setting` | повторяемый permission denied при чтении provider runtime config; API продолжил запуск | `42501` | Нет, предсуществующая проблема DEV-прав/config; таблицу не упоминает. |

Пути двух SQL-падений подтверждены точным поиском:

```bash
rg -n "telegramStartDedup|tryConsumeStart|message_retry_jobs|read_integrator_provider_runtime_setting" \
  apps/integrator/src/app/di.ts \
  apps/integrator/src/kernel/eventGateway/incomingEventPipeline.ts \
  apps/integrator/src/infra/db/repos/channelUsers.ts \
  apps/integrator/src/infra/db/operationalPoolReadiness.ts \
  apps/integrator/src/infra/db/publicSystemSettings.ts
```

Исправление `message_retry_jobs` readiness и удаление/перевод `tryConsumeStart` на универсальный dedup —
отдельный этап; в Ф9 по этому brief они только зарегистрированы.

## Проверки изменения

```bash
bash apps/webapp/scripts/check-drizzle-journal-sync.sh
node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test
pnpm --dir apps/integrator typecheck
git diff --check
```

Все команды завершились с exit code `0`; journal sync, online-index layout и migrator diagnostic
self-test сообщили `OK`, TypeScript typecheck не выдал ошибок.
