# Host Deployment for BersonCareBot

Этот файл описывает только актуальную operational-модель `BersonCareBot` на хосте.

В scope входят:

- integrator API
- integrator worker
- webapp frontend

Отдельный `BersonAdmin`/второй frontend в текущем host deploy **не подтверждён** и в этот документ не включён.

Источник данных:

- audit хоста от `2026-03-19`
- текущие скрипты в `deploy/host/`
- текущие unit templates в `deploy/systemd/`

---

## Кратко

| Параметр | Значение |
|----------|----------|
| Deploy user | `deploy` |
| Prod project dir | `/opt/projects/bersoncarebot` |
| Prod env dir | `/opt/env/bersoncarebot` |
| PostgreSQL | `127.0.0.1:5432` |
| Integrator API (prod) | `127.0.0.1:3200` |
| Webapp (prod) | `127.0.0.1:6200` |
| Public integrator URL | `https://tgcarebot.bersonservices.ru` |
| Public webapp URL | `https://bersoncare.ru` |
| Backup script | `/opt/backups/scripts/postgres-backup.sh` (источник в репо: [`deploy/postgres/postgres-backup.sh`](../postgres/postgres-backup.sh)) |

### GitHub Actions (репозиторий)

В `.github/workflows/ci.yml` задано два job:

1. **Lint, typecheck & build** — на `push` (в т.ч. `main`) и на `pull_request`: `pnpm install --frozen-lockfile`, затем `pnpm run ci` (как в правилах репозитория: lint, typecheck, тесты integrator и webapp, сборки, audit).
2. **Deploy** — только после успешного первого job, только при `push` в `ref` `main`: по SSH на хост выполняется `bash <DEPLOY_PATH>/deploy/host/deploy-prod.sh` (секреты: `DEPLOY_SSH_KEY`, `DEPLOY_USER`, `DEPLOY_HOST`, `DEPLOY_PATH`).

Отдельный workflow `deploy-host.yml` в репозитории **нет** (ранее мог существовать; актуальный путь деплоя — job **Deploy** внутри `ci.yml`).

---

## Что реально работает на хосте

### Production services

Подтверждены и активны:

- `bersoncarebot-api-prod.service`
- `bersoncarebot-worker-prod.service`
- `bersoncarebot-webapp-prod.service`

### Dev services

На audited host dev unit'ы **не установлены**:

- `bersoncarebot-api-dev.service` — отсутствует
- `bersoncarebot-worker-dev.service` — отсутствует
- `bersoncarebot-webapp-dev.service` — отсутствует

Это значит:

- prod живёт через `systemd`;
- dev на этом хосте запускается вручную или не запущен;
- dev unit templates в репозитории не являются подтверждённым runtime-state хоста.

---

## Production layout

### Пути

| Что | Путь |
|-----|------|
| Project root | `/opt/projects/bersoncarebot` |
| Integrator app dir | `/opt/projects/bersoncarebot/apps/integrator` |
| Webapp app dir | `/opt/projects/bersoncarebot/apps/webapp` |
| Prod env dir | `/opt/env/bersoncarebot` |
| Integrator env | `/opt/env/bersoncarebot/api.prod` |
| Webapp env | `/opt/env/bersoncarebot/webapp.prod` |
| Cutover env | `/opt/env/bersoncarebot/cutover.prod` |

### systemd units

#### API

Файл юнита:

- `/etc/systemd/system/bersoncarebot-api-prod.service`

Эффективная конфигурация:

- `WorkingDirectory=/opt/projects/bersoncarebot/apps/integrator`
- `EnvironmentFile=/opt/env/bersoncarebot/api.prod`
- `ExecStart=/usr/bin/node dist/main.js`

#### Worker

Файл юнита:

- `/etc/systemd/system/bersoncarebot-worker-prod.service`

Эффективная конфигурация:

- `WorkingDirectory=/opt/projects/bersoncarebot/apps/integrator`
- `EnvironmentFile=/opt/env/bersoncarebot/api.prod`
- `ExecStart=/usr/bin/node dist/infra/runtime/worker/main.js`

#### Webapp

Файл юнита:

- `/etc/systemd/system/bersoncarebot-webapp-prod.service`

Эффективная конфигурация (канон — **Next.js standalone**, как в [`deploy/systemd/bersoncarebot-webapp-prod.service`](../systemd/bersoncarebot-webapp-prod.service) и [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md); не `pnpm start`):

- `WorkingDirectory=/opt/projects/bersoncarebot/apps/webapp/.next/standalone/apps/webapp`
- `EnvironmentFile=/opt/env/bersoncarebot/webapp.prod`
- `ExecStart=/usr/bin/node /opt/projects/bersoncarebot/apps/webapp/.next/standalone/apps/webapp/server.js`

---

## Backup contract (pre-migrations)

Скрипт `/opt/backups/scripts/postgres-backup.sh` вызывается с первым аргументом `pre-migrations` перед миграциями в deploy-prod и в deploy-webapp-prod.

**Каноническая реализация** живёт в репозитории: [`deploy/postgres/postgres-backup.sh`](../postgres/postgres-backup.sh). Установка на хост: см. [`deploy/postgres/README.md`](../postgres/README.md). Скрипт делает `pg_dump -Fc` **обеих** production-бД (integrator из `api.prod`, webapp из `webapp.prod`).

**Ожидаемое поведение (оператор должен обеспечить на хосте):**

1. **Вызов:** `postgres-backup.sh pre-migrations`
2. **Назначение:** снимок БД перед применением миграций для возможности отката.
3. **Куда писать:** каталог `/opt/backups/postgres/pre-migrations/`. Имена файлов: `integrator_<dbname>_<timestamp>.dump` и `webapp_<dbname>_<timestamp>.dump` (custom format).
4. **Какие БД:** всегда обе — integrator и webapp (см. выше). Отдельный регламент «только webapp» при webapp-only деплое не требуется: лишний дамп integrator безвреден.

Режим **`hourly`** (и при необходимости `daily` / `manual`) использует те же две БД и пишет в `/opt/backups/postgres/hourly/` и т.д. — см. скрипт.

**Проверка на хосте:** после установки скрипта из репо убедиться, что в `/opt/backups/postgres/pre-migrations/` появляются **два** `.dump` после `sudo /opt/backups/scripts/postgres-backup.sh pre-migrations`.

---

## Pre/post migrate checklist

**Перед миграциями (integrator и/или webapp):**

- [ ] Backup выполнен (pre-migrations) и файлы дампа присутствуют в целевом каталоге.
- [ ] Переменные окружения (api.prod / webapp.prod) указывают на нужные БД.
- [ ] Доступ к БД с хоста проверен (например, `psql` или приложение подключается).

**После миграций:**

- [ ] Миграции завершились без ошибок (код выхода 0).
- [ ] Сервисы перезапущены и в статусе active.
- [ ] Health check возвращает ok (API и webapp).
- [ ] При необходимости: запуск backfill/reconcile по [DATA_MIGRATION_CHECKLIST.md](DATA_MIGRATION_CHECKLIST.md) (при первом деплое или cutover).

---

## Порты

### Production

| Сервис | Порт |
|--------|------|
| PostgreSQL | `127.0.0.1:5432` |
| Integrator API | `127.0.0.1:3200` |
| Webapp | `127.0.0.1:6200` |
| Worker | нет публичного порта |

### Development

По фактическому audit:

- `127.0.0.1:5200` слушает dev webapp
- `127.0.0.1:4200` в момент audit **не слушал**

То есть webapp dev поднимался, а integrator dev в момент проверки — нет.

---

## Nginx

Подтверждённые BersonCareBot vhost'ы:

### Integrator

- host: `tgcarebot.bersonservices.ru`
- upstream: `http://127.0.0.1:3200`

Дополнительно в этом vhost есть legacy route:

- `/admin/` -> `http://127.0.0.1:8080/`

### Webapp

- host: `bersoncare.ru`
- upstream: `http://127.0.0.1:6200`

### Смена webapp-домена на production

Минимальный operational checklist для переноса webapp на новый домен (пример: `bersoncare.ru`):

1. DNS: A/AAAA нового домена указывает на production host.
2. TLS: выпущен и подключён сертификат для нового домена в nginx (`listen 443 ssl`, корректные `fullchain`/`privkey`).
3. Nginx vhost: в `server_name` указан новый домен; при необходимости старый домен оставлен как `301` redirect на новый.
4. Env: в `/opt/env/bersoncarebot/api.prod` и `/opt/env/bersoncarebot/webapp.prod` обновлён `APP_BASE_URL=https://bersoncare.ru`.
5. Перезапуск: `sudo systemctl restart bersoncarebot-api-prod.service bersoncarebot-worker-prod.service bersoncarebot-webapp-prod.service` и `sudo systemctl reload nginx`.
6. Внешние интеграции: обновлены allowlist/redirect/cors, где зашит origin webapp (Google OAuth redirect URI, MinIO CORS, CDN rules).

Проверка:

- `curl -sI https://bersoncare.ru/app | head -1` -> `200` или `302`.
- `curl -s http://127.0.0.1:6200/api/health` -> `{"ok":true}`.
- в логах webapp нет ошибок OAuth callback/CORS после переключения домена.

**Загрузка файлов (CMS / `POST /api/media/upload`):** в server-блоке vhost webapp задайте лимит тела запроса, иначе nginx ответит `413 Request Entity Too Large` до Next.js (дефолт nginx часто 1m). Рекомендация:

```nginx
client_max_body_size 55m;
```

(Чуть выше лимита приложения ~50 MiB на файл; фактическую строку смотрите в `sudo nginx -T`.)

**CMS медиа и S3 (MinIO):** основная загрузка идёт **напрямую в MinIO** (presigned PUT на `S3_ENDPOINT`), минуя nginx webapp. Объекты по умолчанию попадают в **приватный** бакет (`S3_PRIVATE_BUCKET` в env webapp). Для браузерного PUT с `https://bersoncare.ru` на этом бакете обязателен **CORS** (методы `PUT`, `GET`, `HEAD`, origin приложения). Без CORS presigned PUT из CMS упадёт с сетевой ошибкой. Публичный анонимный GET с MinIO для CMS **не требуется**: отдача идёт через webapp (`GET /api/media/:id` → presigned redirect).

Пример (MinIO Client `mc`; ключи — те же, что `S3_ACCESS_KEY` / `S3_SECRET_KEY` в env webapp):

```bash
mc alias set myminio https://fs.bersonservices.ru "<ACCESS_KEY>" "<SECRET_KEY>"
mc cors set myminio/<PRIVATE_BUCKET_NAME> /path/to/cors.json
```

`cors.json` — правило `CORSRules` в формате AWS (как раньше для публичного бакета). Либо MinIO Console: Bucket → приватный бакет → Access / CORS.

Опционально **`S3_PUBLIC_BUCKET`**: только если нужны прямые публичные URL или легаси; для него при необходимости отдельно `mc anonymous set download` и CORS.

**Очередь удаления медиа:** после удаления из библиотеки строки помечаются в БД; фоновый воркер — `POST /api/internal/media-pending-delete/purge` с заголовком `Authorization: Bearer <INTERNAL_JOB_SECRET>`. Задайте **`INTERNAL_JOB_SECRET`** в env webapp и вызывайте endpoint по cron (например раз в минуту) **с того же хоста**, что и приложение: предпочтительно `curl` на `http://127.0.0.1:6200/api/internal/media-pending-delete/purge` (не на публичный `https://bersoncare.ru/...`, если включена блокировка ниже).

**Рекомендация nginx:** ограничить префикс `/api/internal/` только loopback, чтобы endpoint не был доступен из интернета по Bearer (дополнительно к длинному секрету):

```nginx
location /api/internal/ {
    allow 127.0.0.1;
    deny all;
    proxy_pass http://127.0.0.1:6200;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

После такой настройки запрос к `/api/internal/` с внешнего IP даст **403 от nginx** — ожидаемо; cron должен ходить на `127.0.0.1:6200`.

**Проверка в production (зафиксировано 2026-04-09):**

- webapp сервис активен (`bersoncarebot-webapp-prod.service`) и `GET /api/health` отвечает `{"ok":true,...}`;
- в `webapp.prod` присутствуют `DATABASE_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PRIVATE_BUCKET`, `INTERNAL_JOB_SECRET`;
- миграция `060_media_files_status_retry.sql` применена (запись в `schema_migrations`), колонки/constraint/index присутствуют;
- ручной вызов purge c Bearer на loopback возвращает `{"ok":true,...}`;
- cron файл `/etc/cron.d/bersoncarebot-media-purge` установлен (каждую минуту, loopback URL).

Пример cron (актуальный формат):

```cron
* * * * * root bash -lc 'set -a && source /opt/env/bersoncarebot/webapp.prod && set +a; [ -n "$INTERNAL_JOB_SECRET" ] || exit 1; curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_JOB_SECRET" "http://127.0.0.1:6200/api/internal/media-pending-delete/purge?limit=25" >/dev/null'
```

Примечание по service control: на некоторых дистрибутивах `cron.service` не поддерживает `reload` (`Job type reload is not applicable`), используйте `systemctl restart cron`.

**Проверка MinIO (ops):** скрипт [`check-s3.ts`](../apps/integrator/src/infra/scripts/check-s3.ts) — из **корня репозитория** с `pnpm exec tsx ...`, переменные `S3_*` в корневом `.env` должны совпадать по смыслу с именами бакетов в `webapp.prod` (не обязателен для runtime webapp).

Проверка: `curl -I https://fs.bersonservices.ru/` — endpoint доступен. Имена бакетов и ключи env: `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.

**Кэширование (Next.js, мини-приложение):** после деплоя клиент должен получать **актуальный HTML** (со ссылками на новые hashed-чанки), а **`/_next/static/*`** — кэшироваться долго.

- **Upstream (Next.js production):** для `/_next/static/` обычно отдаётся `Cache-Control: public, max-age=31536000, immutable`; для динамических HTML-страниц приложения — ограничения кэша (`no-store` / `private, no-cache` и аналоги). Это не зафиксировано отдельным audit’ом заголовков на хосте — оператор проверяет фактические `curl -I` ниже.
- **nginx без `proxy_cache`:** достаточно проксировать на `127.0.0.1:6200` и **не** задавать на весь `location /` глобальные `expires …` или `add_header Cache-Control "public"` — иначе можно закэшировать HTML и получить рассинхрон «старый document → новые чанки» → ошибки загрузки чанков в WebView.
- **nginx с `proxy_cache`:** не кэшируйте HTML (`text/html`) и API так же, как статику; долгий кэш только для `/_next/static/` (или отключите кэш для путей `/app`, `/api`, корня документов — по фактической схеме vhost).
- **CDN перед `bersoncare.ru`:** для маршрутов документов (`/` и префиксы вроде `/app`) — **Bypass** / TTL ≈ 0 / строго **уважать `Cache-Control` origin** без принудительного длинного edge-cache; для `/_next/static/*` — длинный TTL и поддержка **`immutable`**, либо полное следование заголовкам от origin.

Проверка:

```bash
curl -sI "https://bersoncare.ru/app" | tr -d '\r' | grep -i cache
BASE="https://bersoncare.ru"
CHUNK=$(curl -sL "$BASE/app" | grep -oE '/_next/static/chunks/[A-Za-z0-9._-]+\.js' | head -1)
curl -sI "$BASE$CHUNK" | tr -d '\r' | grep -i cache
```

Ожидание: у ответа HTML — нет многодневного публичного `max-age` «для всего сайта»; у чанка — `immutable` (или эквивалентно долгий `max-age` вместе с `immutable`).

### Важно

- nginx слушает `80` и `443`;
- `default` site всё ещё включён;
- на том же хосте есть vhost'ы других проектов, но они не относятся к BersonCareBot.

---

## Env files

### `/opt/env/bersoncarebot/api.prod`

Подтверждённые ключи:

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=3200`
- `LOG_LEVEL=info`
- `DATABASE_URL=...`
- `BOOKING_URL=...`
- `INTEGRATOR_SHARED_SECRET=...`
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_ADMIN_ID=364943522`
- `APP_BASE_URL=https://bersoncare.ru`
- `TELEGRAM_SEND_MENU_ON_BUTTON_PRESS=true`
- `MAX_ENABLED=true`
- `MAX_ADMIN_USER_ID=89002800`
- `MAX_ADMIN_CHAT_ID=156854402`
- `MAX_API_KEY=...`
- `MAX_WEBHOOK_SECRET=...`
- `RUBITIME_WEBHOOK_TOKEN=...`
- `RUBITIME_API_KEY=...`
- ~~`RUBITIME_SCHEDULE_MAPPING`~~ — **УДАЛЕНА**. Маппинг booking query → Rubitime schedule params теперь хранится в DB (таблица `rubitime_booking_profiles`). Управляется через admin UI webapp (`/app/settings` → «Rubitime — профили записи»).
- `SMSC_ENABLED=true`
- `SMSC_API_KEY=...`
- `SMSC_BASE_URL=https://smsc.ru/sys/send.php`

### `/opt/env/bersoncarebot/webapp.prod`

Подтверждённые ключи:

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=6200`
- `APP_BASE_URL=https://bersoncare.ru`
- `DATABASE_URL=...`
- `SESSION_COOKIE_SECRET=...`
- `INTEGRATOR_SHARED_SECRET=...`
- `INTEGRATOR_API_URL=https://tgcarebot.bersonservices.ru`
- `ALLOW_DEV_AUTH_BYPASS=...`
- `ALLOWED_TELEGRAM_IDS=7924656602`
- `ADMIN_TELEGRAM_ID=364943522`
- `TELEGRAM_BOT_TOKEN=...`

**S3 / MinIO и фоновые джобы (webapp):** имена ключей (значения не в документ): `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, **`S3_PRIVATE_BUCKET`** (обязателен для CMS-медиа в private-режиме), опционально `S3_PUBLIC_BUCKET`, `S3_REGION`, `S3_FORCE_PATH_STYLE`; **`INTERNAL_JOB_SECRET`** — Bearer для `POST /api/internal/media-pending-delete/purge`; опционально **`LOG_LEVEL`** — уровень логов pino в webapp (`info`, `warn`, `error`; по умолчанию в приложении `info`). Подробности и CORS: раздел **Nginx → Webapp** выше («CMS медиа и S3», «Очередь удаления медиа»); канон env: `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.

**Auth (webapp):** Yandex OAuth и Telegram Login Widget **не** требуют новых ключей в `webapp.prod` — клиент OAuth и имя бота для виджета задаются в **`system_settings`** (admin scope) в БД webapp; см. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`. Секреты в env-файлы деплоя не добавлять.

### `/opt/env/bersoncarebot/cutover.prod`

Этот файл используют только operational-скрипты:

- `backfill-*`
- `reconcile-*`
- `projection-health`
- `stage*-gate`

Обязательные ключи:

- `DATABASE_URL=...` — webapp production DB
- `INTEGRATOR_DATABASE_URL=...` или `SOURCE_DATABASE_URL=...` — integrator production DB

Важно:

- это не runtime env для `bersoncarebot-webapp-prod.service`;
- `webapp.prod` не обязан содержать integrator DB URL;
- preferred схема для cutover/gate — отдельный `cutover.prod`.

### Dev env

Фактически на audited host:

- `/home/dev/dev-projects/BersonCareBot/.env.dev` — отсутствует
- `/home/dev/dev-projects/BersonCareBot/webapp/.env.dev` — отсутствует
- `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` — существует
- `/home/dev/dev-projects/BersonCareBot/.env.cutover.dev` — должен использоваться для dev cutover/backfill/reconcile/gate
- `/home/dev/dev-projects/BersonCareBot/.env` — существует

Вывод:

- webapp dev сейчас живёт на `apps/webapp/.env.dev`
- integrator dev по факту использует root `.env`, потому что `apps/integrator/src/config/loadEnv.ts` по умолчанию грузит `.env`, а не `.env.dev`
- dev cutover/backfill/reconcile/gate должен использовать отдельный `/home/dev/dev-projects/BersonCareBot/.env.cutover.dev`

---

## Deploy scripts

### Основной production deploy

```bash
cd /opt/projects/bersoncarebot
bash deploy/host/deploy-prod.sh
```

Скрипт делает:

- `git pull`
- `pnpm install --frozen-lockfile`
- `pnpm build`
- `pnpm --dir apps/webapp build`
- bootstrap/reinstall systemd units
- pre-migrations DB backup
- integrator migrations
- restart API / worker / webapp
- health check API

### Отдельный webapp deploy

```bash
cd /opt/projects/bersoncarebot
bash deploy/host/deploy-webapp-prod.sh
```

Скрипт делает:

- `git pull`
- reinstall webapp unit
- `pnpm install --frozen-lockfile`
- `pnpm --dir apps/webapp build`
- перед миграциями: вызов backup (`BACKUP_SCRIPT` pre-migrations). Требуется наличие скрипта и sudo-прав (см. Sudoers). Скрипт backup должен быть тем же, что в full prod deploy (`/opt/backups/scripts/postgres-backup.sh`), или эквивалентным; контракт аргумента и каталога см. в разделе «Backup contract (pre-migrations)» ниже.
- `pnpm --dir apps/webapp run migrate`
- restart webapp
- health check `http://127.0.0.1:6200/api/health`

### Перенос данных при первом деплое / cutover

Для first cutover есть отдельный скрипт:

```bash
cd /opt/projects/bersoncarebot
bash deploy/host/run-stage13-cutover.sh
```

Режим без записей (только проверки и dry-run):

```bash
bash deploy/host/run-stage13-cutover.sh --dry-run-only
```

Также cutover можно включить автоматически в full deploy через флаг:

```bash
RUN_STAGE13_CUTOVER=1 bash deploy/host/deploy-prod.sh
```

Только dry-run в рамках full deploy:

```bash
RUN_STAGE13_CUTOVER=1 RUN_STAGE13_CUTOVER_DRY_RUN_ONLY=1 bash deploy/host/deploy-prod.sh
```

По умолчанию full deploy не запускает cutover-скрипт (чтобы не делать тяжёлый backfill на каждом релизе). Для порядка и проверки целостности ориентир:

- **[DATA_MIGRATION_CHECKLIST.md](DATA_MIGRATION_CHECKLIST.md)** — порядок backfill (person, communication, reminders, appointments, subscription_mailing), reconcile и stage13-gate.

### Bootstrap systemd

```bash
cd /opt/projects/bersoncarebot
bash deploy/host/bootstrap-systemd-prod.sh
```

Скрипт:

- копирует unit templates в `/etc/systemd/system/`
- делает `systemctl daemon-reload`
- включает сервисы
- стартует их, если env и build artifacts уже есть

---

## Sudoers для deploy

Для production deploy нужны passwordless sudo rules минимум на:

- `/opt/backups/scripts/postgres-backup.sh pre-migrations`
- install unit files в `/etc/systemd/system/`
- `systemctl daemon-reload`
- `systemctl enable`
- `systemctl enable --now`
- `systemctl restart`
- `systemctl is-active --quiet`
- `journalctl -u ... --no-pager`

Актуальный пример:

- `deploy/sudoers-deploy.example`

---

## Первичная настройка production

### 1. Каталоги и env

```bash
sudo mkdir -p /opt/env/bersoncarebot
sudo chown deploy:deploy /opt/env/bersoncarebot
sudo chmod 700 /opt/env/bersoncarebot
```

### 2. Скопировать env

Integrator:

```bash
cp .env.example /opt/env/bersoncarebot/api.prod
```

Webapp:

```bash
cp deploy/env/.env.webapp.prod.example /opt/env/bersoncarebot/webapp.prod
```

Важно:

- в репозитории **нет** `deploy/env/.env.prod.example`
- для integrator production сейчас ориентир — root `.env.example`
- для webapp production ориентир — `deploy/env/.env.webapp.prod.example`

### 3. Установить systemd units

```bash
cd /opt/projects/bersoncarebot
bash deploy/host/bootstrap-systemd-prod.sh
```

### 4. Первый deploy

```bash
cd /opt/projects/bersoncarebot
bash deploy/host/deploy-prod.sh
```

После `webapp` миграций `deploy-prod.sh` автоматически запускает сидинг `system_settings` из `api.prod` + `webapp.prod` (ключи интеграций и webhook URI), чтобы не переносить значения руками при первичной установке.

---

## Проверки после deploy

### systemd

```bash
sudo systemctl status \
  bersoncarebot-api-prod.service \
  bersoncarebot-worker-prod.service \
  bersoncarebot-webapp-prod.service
```

### Health

```bash
curl -s http://127.0.0.1:3200/health
curl -s http://127.0.0.1:6200/api/health
```

### nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Database facts

Подтверждено audit'ом:

- PostgreSQL слушает только `127.0.0.1:5432`
- `psql` запускать под `postgres`: `sudo -u postgres psql`

Не подтверждено текущим audit'ом:

- точный актуальный список баз и owners

Причина:

- блок audit с `pg_database` оборвался из-за shell-ошибки, поэтому эти данные в документ не включены

Если нужно обновить именно раздел по БД, выполнить отдельно:

```bash
sudo -u postgres psql -At -F $'\t' -c "SELECT datname, pg_catalog.pg_get_userbyid(datdba) FROM pg_database WHERE datallowconn ORDER BY datname;"
sudo -u postgres psql -At -F $'\t' -c "SELECT rolname FROM pg_roles ORDER BY rolname;"
```

---

## Известные текущие проблемы / несоответствия

### 1. На prod host есть неотслеживаемый каталог `webapp/`

В production repo audit показал:

- `?? webapp/`

При этом webapp unit запускает приложение из `apps/webapp`.

### 2. Webapp стартует через `next start` с warning про standalone

На части хостов в логах раньше встречалось:

- `next start does not work with output: standalone`

Актуальный unit в репозитории запускает **`server.js` из standalone** (см. `deploy/systemd/bersoncarebot-webapp-prod.service`). Если на хосте всё ещё `pnpm next start` — привести unit к шаблону из репо.

### 3. 404 на `/_next/static/chunks/*.js` при живом `server.js`

**Симптом:** файл есть в `apps/webapp/.next/static/chunks/`, но **нет** в `apps/webapp/.next/standalone/apps/webapp/.next/static/chunks/`; `curl -sI http://127.0.0.1:6200/_next/static/chunks/….js` → `404`.

**Причина:** после `pnpm --dir apps/webapp build` не скопировали артефакты в дерево standalone. Скрипты **`deploy/host/deploy-webapp-prod.sh`** и **`deploy/host/deploy-prod.sh`** после сборки делают `cp -r` `.next/static` и `public` в `standalone` (и проверяют наличие `chunks/*.js`). Ручной build без этих шагов оставляет процесс без чанков → мини-приложение ловит `Failed to load chunk`.

**Разовое исправление от root** (пути как на prod из `SERVER CONVENTIONS.md`):

```bash
cd /opt/projects/bersoncarebot
mkdir -p apps/webapp/.next/standalone/apps/webapp/.next
rm -rf apps/webapp/.next/standalone/apps/webapp/.next/static apps/webapp/.next/standalone/apps/webapp/public
cp -r apps/webapp/.next/static apps/webapp/.next/standalone/apps/webapp/.next/static
cp -r apps/webapp/public apps/webapp/.next/standalone/apps/webapp/public
systemctl restart bersoncarebot-webapp-prod.service
```

Проверка (первый чанк из дерева + HEAD к backend):

```bash
CH=$(ls apps/webapp/.next/standalone/apps/webapp/.next/static/chunks/*.js | head -1)
echo "chunk=$(basename "$CH")"
curl -sI -H "Host: bersoncare.ru" "http://127.0.0.1:6200/_next/static/chunks/$(basename "$CH")" | head -1
```

Дальше: полный деплой через **`bash deploy/host/deploy-prod.sh`** (CI) или **`bash deploy/host/deploy-webapp-prod.sh`**; либо после каждого production build вручную повторять те же `rm -rf` + `cp` из блока выше.

---

## Source of truth

Для host deploy по BersonCareBot source of truth сейчас такой:

1. Этот файл — краткая operational-картина.
2. `docs/ARCHITECTURE/SERVER CONVENTIONS.md` — краткая сводка по серверной реальности.
3. `deploy/host/*.sh` — фактический deploy/bootstrap flow.
4. `deploy/systemd/*.service` — unit templates.
5. `systemctl cat`, `nginx -T`, `ss -lntup`, env preview — финальная проверка реального хоста.

---

## Быстрый PostgreSQL audit

Чтобы добить фактический список баз и владельцев без полного server audit, запускать отдельно:

```bash
sudo bash -lc '
set -euo pipefail

echo "=== DATABASES ==="
sudo -u postgres psql -At -F "$(printf "\t")" -c "SELECT datname, pg_catalog.pg_get_userbyid(datdba) FROM pg_database WHERE datallowconn ORDER BY datname;"
echo
echo "=== ROLES ==="
sudo -u postgres psql -At -F "$(printf "\t")" -c "SELECT rolname FROM pg_roles ORDER BY rolname;"
'
```
