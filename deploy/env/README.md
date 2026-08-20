# Env-файлы для деплоя

Этот файл описывает только текущие env-файлы `BersonCareBot`.

> **HOST IDENTITY GATE:** `*.prod` ниже существуют только на PROD `135.106.162.170` (`adelaide`). Текущий
> `151.241.228.122` — DEV/RELAY/TEST: на нём нельзя читать/source-ить `*.prod`, устанавливать или перезапускать
> `bersoncarebot-*-prod.service`. Все production-команды требуют прямой команды владельца и подтверждения обоих
> признаков хоста: hostname `adelaide` и локальный IPv4 `135.106.162.170`.

---

## Production

### `api.prod` (integrator API + worker + scheduler)

**Путь на хосте:** `/opt/env/bersoncarebot/api.prod`

Этот файл используют production unit'ы integrator:

- `bersoncarebot-api-prod.service`
- `bersoncarebot-worker-prod.service`
- `bersoncarebot-scheduler-prod.service`

**PostgreSQL (unified):** `DATABASE_URL` в `api.prod` и в `webapp.prod` указывает на **одну** базу; подтверждённый production сейчас использует текущую runtime-роль PostgreSQL для webapp и integrator — доступ к схемам **`public` и `integrator`** у одного пользователя БД (`search_path`, при необходимости GRANT из миграций). См. [`docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`](../../docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md). Если миграции integrator выполнялись суперпользователем, те же `GRANT` на `public` (в т.ч. `USAGE` на схему и права на таблицы канона) должны быть у **роли из `DATABASE_URL`** — см. миграции `20260413_0002`, `20260413_0003` и [`docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/STAGE_01_BIND_TX_AND_GRANTS.md`](../../docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/STAGE_01_BIND_TX_AND_GRANTS.md). Будущий SAAS P0.5.1 role split (`migrator/owner` vs `NOBYPASSRLS` app role) пока является dormant-контрактом и не меняет эти env-файлы без отдельного host-confirmed этапа.

Обязательные ключи по текущему runtime:

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=3200`
- `DATABASE_URL='...'`
- `DATABASE_URL_DIAGNOSTIC='...'` — отдельный NOINHERIT/NOBYPASSRLS login только для read-only projection health
- `DATABASE_URL_DELIVERY_WORKER='...'` — отдельный login integrator worker; только claim/bookkeeping очередей
- `DATABASE_URL_SCHEDULER='...'` — отдельный login scheduler; advisory lock + idempotency bookkeeping
- `BOOKING_URL=https://...`
- `INTEGRATOR_SHARED_SECRET=...`
- глобальная DB-настройка `app_base_url` должна быть заполнена; integrator читает её через закрытый server-runtime accessor и не использует env fallback; TEST deploy нормализует точный API base-login и его PostgreSQL 16 membership edges в `NOINHERIT` / `INHERIT FALSE, SET TRUE`, оставляя classified `SET ROLE`, запрещая ambient table ACL и выдавая напрямую только закрытый config accessor плюс idempotent principal-context release для bootstrap/infra cleanup
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_ADMIN_ID=364943522`
- `TELEGRAM_SEND_MENU_ON_BUTTON_PRESS=true|false`
- `SMSC_ENABLED=true|false`
- `SMSC_API_KEY='...'`
- `SMSC_BASE_URL=https://smsc.ru/sys/send.php`

Опционально, если используется MAX:

- `MAX_ENABLED=true`
- `MAX_ADMIN_USER_ID=...`
- `MAX_ADMIN_CHAT_ID=...`
- `MAX_API_KEY=...`
- `MAX_WEBHOOK_SECRET=...`

Шаблоны integrator в репозитории:

- корень: `.env.example`
- `deploy/env/.env.prod.example`, `deploy/env/.env.dev.example`

Важно:

- если в значении есть `$`, строку в env брать в одинарные кавычки;
- этот файл `source`-ится bash-скриптами деплоя, поэтому синтаксис должен быть bash-compatible.

Проверка:

```bash
test "$(hostname -s)" = "adelaide" &&
  hostname -I | tr ' ' '\n' | grep -Fxq '135.106.162.170' ||
  { echo "STOP: not canonical PROD 135/adelaide" >&2; exit 1; }
systemctl show bersoncarebot-api-prod.service -p EnvironmentFiles
systemctl show bersoncarebot-worker-prod.service -p EnvironmentFiles
systemctl show bersoncarebot-scheduler-prod.service -p EnvironmentFiles
ls -la /opt/env/bersoncarebot/api.prod
sudo systemctl restart bersoncarebot-api-prod.service
sudo systemctl restart bersoncarebot-worker-prod.service
sudo systemctl restart bersoncarebot-scheduler-prod.service
curl -s http://127.0.0.1:3200/health
```

---

### `media-worker.prod`

**Путь на хосте:** `/opt/env/bersoncarebot/media-worker.prod`

Используется только `bersoncarebot-media-worker-prod.service`. В файле нет `DATABASE_URL`, PostgreSQL login,
TLS DB credential или principal context. Обязательны `MEDIA_WORKER_CONTROL_URL` и тот же
`INTERNAL_JOB_SECRET`, что у webapp: worker выполняет только authenticated HTTP control commands, а webapp
устанавливает `app_operational_media_worker` внутри своего typed DB chokepoint. Остальные media/S3/ffmpeg ключи
сохраняются по контракту `apps/media-worker/src/env.ts`; значения в репозиторий не записываются.

---

### `webapp.prod`

**Путь на хосте:** `/opt/env/bersoncarebot/webapp.prod`

Этот файл использует:

- `bersoncarebot-webapp-prod.service`

Обязательные ключи:

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=6200`
- `APP_BASE_URL=https://bersoncare.ru`
- `DATABASE_URL='...'`
- `SESSION_COOKIE_SECRET=...`
- `INTEGRATOR_SHARED_SECRET=...`
- `INTEGRATOR_API_URL=https://tgcarebot.bersonservices.ru`
- `ALLOW_DEV_AUTH_BYPASS=false`
- `ALLOWED_TELEGRAM_IDS=...`
- `ADMIN_TELEGRAM_ID=...`
- `TELEGRAM_BOT_TOKEN=...`

Шаблон:

- `deploy/env/.env.webapp.prod.example`

Важно:

- Telegram / SMSC runtime-переменные сюда не класть;
- `INTEGRATOR_SHARED_SECRET` должен совпадать с `api.prod`.

### Planned PostgreSQL mTLS port material (not a live-env instruction yet)

After the separately approved host boundary apply and role cutover, each runtime port will additionally receive only
its own `sslmode=verify-full` client certificate/key and public CA path: webapp owns the staff+patient client material;
integrator owns only its client material. PostgreSQL receives public CA/CRL verifier material and its server
certificate/key through `deploy/host/apply-postgres-mtls.sh`; it never receives a client private key. Do not add these
values to a shared env, media-worker env, database table, SQL artifact, or log. This repository stage has **not**
applied those keys or changed any DEV/TEST/PROD env file.

Проверка:

```bash
systemctl show bersoncarebot-webapp-prod.service -p EnvironmentFiles
ls -la /opt/env/bersoncarebot/webapp.prod
sudo systemctl restart bersoncarebot-webapp-prod.service
curl -s http://127.0.0.1:6200/api/health
```

---

### `cutover.prod`

**Путь на хосте:** `/opt/env/bersoncarebot/cutover.prod`

Этот файл используют operational-скрипты:

- `backfill-*`
- `reconcile-*`
- `stage*-gate`

Обязательные ключи:

- `DATABASE_URL='...'` — подключение к базе, в которой есть схема **`public`** (целевые таблицы webapp).
- `INTEGRATOR_DATABASE_URL='...'` или `SOURCE_DATABASE_URL='...'` — подключение к данным integrator (схема **`integrator`**). В **unified** production обычно **та же строка**, что и `DATABASE_URL` (та же роль БД, та же база).

Шаблон:

- `deploy/env/.env.cutover.prod.example`

Важно:

- это **не runtime env** для `bersoncarebot-webapp-prod.service`;
- после unification оба URL **совпадают**; в legacy cutover второй URL указывал на **отдельную** integrator-базу.

---

## Development

### Integrator dev

Фактическое состояние на текущем хосте:

- `/home/dev/dev-projects/BersonCareBot/.env.dev` — отсутствует
- `/home/dev/dev-projects/BersonCareBot/.env` — существует

По коду `apps/integrator/src/config/loadEnv.ts` integrator по умолчанию грузит `.env`, если `ENV_FILE` не задан.

Значит текущий dev source of truth для integrator:

- `/home/dev/dev-projects/BersonCareBot/.env`

### Webapp dev

Фактический файл:

- `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev`

Ключи:

- `NODE_ENV=development`
- `HOST=127.0.0.1`
- `PORT=5200`
- `APP_BASE_URL=http://127.0.0.1:5200`
- `DATABASE_URL=...`
- `SESSION_COOKIE_SECRET=...`
- `INTEGRATOR_SHARED_SECRET=...`
- `INTEGRATOR_API_URL=http://127.0.0.1:4200`
- `ALLOW_DEV_AUTH_BYPASS=true|false`

Шаблон:

- `deploy/env/.env.webapp.dev.example`

Примечание:

- старый путь `webapp/.env.dev` больше не актуален для текущей структуры `apps/webapp`.

### Dev cutover

Файл:

- `/home/dev/dev-projects/BersonCareBot/.env.cutover.dev`

Этот файл используют dev cutover/backfill/reconcile/gate-скрипты.

Обязательные ключи:

- `DATABASE_URL='...'` — база со схемой `public` (webapp).
- `INTEGRATOR_DATABASE_URL='...'` или `SOURCE_DATABASE_URL='...'` — база/схема integrator; при unified dev **часто та же строка**, что `DATABASE_URL`.

Шаблон:

- `deploy/env/.env.cutover.dev.example`

---

## Если env не подхватывается

Проверить effective unit:

```bash
systemctl cat bersoncarebot-api-prod.service
systemctl cat bersoncarebot-worker-prod.service
systemctl cat bersoncarebot-scheduler-prod.service
systemctl cat bersoncarebot-webapp-prod.service
```

Проверить, что `EnvironmentFile=` совпадает с фактическим путём.

Если исправили env-файл:

```bash
sudo systemctl daemon-reload
sudo systemctl restart bersoncarebot-api-prod.service
sudo systemctl restart bersoncarebot-worker-prod.service
sudo systemctl restart bersoncarebot-scheduler-prod.service
sudo systemctl restart bersoncarebot-webapp-prod.service
```

---

## Backup PostgreSQL (pre-migrations / hourly)

Скрипт `deploy/postgres/postgres-backup.sh` читает `DATABASE_URL` из **`api.prod`** и **`webapp.prod`** только через libpq env `PGDATABASE` (никогда argv). При **разных** URL — два зашифрованных прохода; при **unified** — один (см. `DATABASE_UNIFIED_POSTGRES.md`). Каждый проход пишет `<label>_<dbname>_<timestamp>.dump.age` (age-encrypted `pg_dump`, никогда plaintext `.dump`) + атомарный `<файл>.sha256`; требует `age` в `PATH` и non-secret recipients file на хосте (иначе fail closed до `pg_dump`). Установка и cron: [`deploy/postgres/README.md`](../postgres/README.md).

---

## Права

Если деплой падает с `Permission denied` на `/opt/env/bersoncarebot/*.prod`:

```bash
sudo chown -R deploy:deploy /opt/env/bersoncarebot
chmod 600 /opt/env/bersoncarebot/api.prod
chmod 600 /opt/env/bersoncarebot/webapp.prod
```

Проверка от пользователя `deploy`:

```bash
cat /opt/env/bersoncarebot/api.prod
cat /opt/env/bersoncarebot/webapp.prod
```
