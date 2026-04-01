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
| Public webapp URL | `https://webapp.bersonservices.ru` |
| Backup script | `/opt/backups/scripts/postgres-backup.sh` |

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

Эффективная конфигурация:

- `WorkingDirectory=/opt/projects/bersoncarebot`
- `EnvironmentFile=/opt/env/bersoncarebot/webapp.prod`
- `ExecStart=/usr/bin/pnpm --dir /opt/projects/bersoncarebot/apps/webapp start`

---

## Backup contract (pre-migrations)

Скрипт `/opt/backups/scripts/postgres-backup.sh` вызывается с первым аргументом `pre-migrations` перед миграциями в deploy-prod и в deploy-webapp-prod.

**Ожидаемое поведение (оператор должен обеспечить на хосте):**

1. **Вызов:** `postgres-backup.sh pre-migrations`
2. **Назначение:** снимок БД перед применением миграций для возможности отката.
3. **Куда писать:** каталог `/opt/backups/postgres/pre-migrations/` (или эквивалент, зафиксированный на хосте). Имена файлов — на усмотрение оператора (например, по дате/времени и имени БД).
4. **Какие БД:**
   - **Full prod deploy (deploy-prod.sh):** должны быть включены все БД, используемые в этом деплое: минимум БД integrator (из api.prod) и при наличии webapp unit — БД webapp (из webapp.prod). Если на хосте один скрипт дампит одну БД — оператор обязан настроить вызов так, чтобы перед миграциями создавались снимки обеих БД (или зафиксировать иначе в runbook хоста).
   - **Webapp-only deploy (deploy-webapp-prod.sh):** должна быть включена БД webapp (DATABASE_URL из webapp.prod). Либо тот же скрипт с аргументом pre-migrations дампит только webapp, либо на хосте настроен отдельный регламент (например, отдельный скрипт или второй вызов с параметром).

**Проверка на хосте:** перед первым production data move оператор должен убедиться, что при запуске `postgres-backup.sh pre-migrations` в указанном каталоге появляются дампы нужных БД.

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

- host: `webapp.bersonservices.ru`
- upstream: `http://127.0.0.1:6200`

**Загрузка файлов (CMS / `POST /api/media/upload`):** в server-блоке vhost webapp задайте лимит тела запроса, иначе nginx ответит `413 Request Entity Too Large` до Next.js (дефолт nginx часто 1m). Рекомендация:

```nginx
client_max_body_size 55m;
```

(Чуть выше лимита приложения ~50 MiB на файл; фактическую строку смотрите в `sudo nginx -T`.)

**CMS медиа и S3 (MinIO):** основная загрузка идёт **напрямую в MinIO** (presigned PUT на `S3_ENDPOINT`), минуя nginx webapp. Для этого на бакете публичных файлов нужны **public-read** (скачивание) и **CORS** (браузерный PUT с `https://webapp.bersonservices.ru`). Без CORS presigned PUT из CMS упадёт с сетевой ошибкой.

Пример (MinIO Client `mc`; ключи — те же, что `S3_ACCESS_KEY` / `S3_SECRET_KEY` в env webapp):

```bash
mc alias set myminio https://fs.bersonservices.ru "<ACCESS_KEY>" "<SECRET_KEY>"
mc anonymous set download myminio/bersonservices-public
```

CORS (разрешить origin webapp, методы PUT/GET/HEAD): файл `cors.json` с правилом `CORSRules` (см. AWS-формат), затем:

```bash
mc cors set myminio/bersonservices-public /path/to/cors.json
```

Либо MinIO Console: Bucket → `bersonservices-public` → Access / CORS.

Проверка: `curl -I https://fs.bersonservices.ru/bersonservices-public/` — не `connection refused`. Env webapp: см. `S3_*` в `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.

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
- `APP_BASE_URL=https://webapp.bersonservices.ru`
- `TELEGRAM_SEND_MENU_ON_BUTTON_PRESS=true`
- `MAX_ENABLED=true`
- `MAX_ADMIN_USER_ID=89002800`
- `MAX_ADMIN_CHAT_ID=156854402`
- `MAX_API_KEY=...`
- `MAX_WEBHOOK_SECRET=...`
- `RUBITIME_WEBHOOK_TOKEN=...`
- `RUBITIME_API_KEY=...`
- `RUBITIME_SCHEDULE_MAPPING=...` — JSON-массив маппинга booking query → Rubitime schedule params. Формат: `[{"type":"online","category":"general","branchId":1,"cooperatorId":2,"serviceId":3,"durationMinutes":60}, ...]`. Обязателен для работы отображения слотов записи.
- `SMSC_ENABLED=true`
- `SMSC_API_KEY=...`
- `SMSC_BASE_URL=https://smsc.ru/sys/send.php`

### `/opt/env/bersoncarebot/webapp.prod`

Подтверждённые ключи:

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=6200`
- `APP_BASE_URL=https://webapp.bersonservices.ru`
- `DATABASE_URL=...`
- `SESSION_COOKIE_SECRET=...`
- `INTEGRATOR_SHARED_SECRET=...`
- `INTEGRATOR_API_URL=https://tgcarebot.bersonservices.ru`
- `ALLOW_DEV_AUTH_BYPASS=...`
- `ALLOWED_TELEGRAM_IDS=7924656602`
- `ADMIN_TELEGRAM_ID=364943522`
- `TELEGRAM_BOT_TOKEN=...`

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
- `pnpm --dir apps/webapp run seed:system-settings:from-env -- --webapp-env /opt/env/bersoncarebot/webapp.prod --api-env /opt/env/bersoncarebot/api.prod` (автосидинг integration keys/URI в `system_settings` scope=`admin`, режим fill-empty-only)
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

В логах `bersoncarebot-webapp-prod.service`:

- `next start does not work with output: standalone`

Это не ломает текущий runtime, но является техническим долгом.

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
