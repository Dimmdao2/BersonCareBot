# Host Deployment for BersonCareBot

## Инструкция: настройка сервера с нуля

Ниже — пошаговая настройка сервера для запуска интегратора (tgcarebot) и webapp.

### Структура баз данных (план)

На сервере один экземпляр PostgreSQL (порт 5432, только localhost). Внутри него — отдельные **базы данных** и **пользователи** по правилам из SERVER CONVENTIONS.md.

Проект BersonCareBot разделён на две службы с **разными БД** (как ты и просил):

| Служба | Назначение | Prod-база | Prod-пользователь | Dev-база | Dev-пользователь |
|--------|------------|-----------|-------------------|----------|------------------|
| **Интегратор (tgcarebot)** | API, воркер, каналы, сценарии Telegram | `bersoncarebot_prod` | `bersoncarebot_user` | `bersoncarebot_dev` | `bersoncarebot_dev_user` |
| **Webapp** | Next.js: кабинеты, уроки, напоминания, записи | `bcb_webapp_prod` | `bcb_webapp_user` | `bcb_webapp_dev` | `bcb_webapp_dev_user` |

- Интегратор и webapp **не делят одну БД**: у каждой службы своя база. Прямого доступа из кода интегратора к БД webapp (и наоборот) нет — только контракт через подписанные ссылки и webhooks.
- **Пользователь** (`bersoncarebot_user`, `bcb_webapp_user` и т.д.) — это роль PostgreSQL (логин для подключения). У каждого пользователя своя база: он указан как `OWNER` при `CREATE DATABASE`, в `DATABASE_URL` приложение подключается именно под этим пользователем к своей базе.

Команды из п.2 ниже выполняются **не «в какой-то базе», а на уровне кластера PostgreSQL**: под суперпользователем (обычно `postgres`), например `psql -U postgres` или `psql -U postgres -d postgres`. `CREATE USER` и `CREATE DATABASE` — это операции кластера, а не внутри конкретной БД.

### 1. Требования на хосте

- Linux с systemd, nginx, Node.js (>=20), pnpm, PostgreSQL (слушает только `127.0.0.1:5432`).
- Пользователь для деплоя (например `deployuser`) с доступом к репозиторию и правом безпарольного sudo для указанных ниже команд.

### 2. PostgreSQL: пользователи и базы

Выполнить команды **на уровне кластера** — под суперпользователем PostgreSQL (например `postgres`), не внутри какой-то базы. Пример подключения: `psql -U postgres` или `sudo -u postgres psql`.

```sql
-- Интегратор (tgcarebot): своя БД и свой пользователь
CREATE USER bersoncarebot_user WITH PASSWORD 'ваш_пароль';
CREATE DATABASE bersoncarebot_prod OWNER bersoncarebot_user;

CREATE USER bersoncarebot_dev_user WITH PASSWORD 'ваш_пароль_dev';
CREATE DATABASE bersoncarebot_dev OWNER bersoncarebot_dev_user;

-- Webapp: отдельная БД и отдельный пользователь (без доступа интегратора к этой БД)
CREATE USER bcb_webapp_user WITH PASSWORD 'ваш_пароль_webapp';
CREATE DATABASE bcb_webapp_prod OWNER bcb_webapp_user;

CREATE USER bcb_webapp_dev_user WITH PASSWORD 'ваш_пароль_webapp_dev';
CREATE DATABASE bcb_webapp_dev OWNER bcb_webapp_dev_user;
```

### 3. Клонирование проекта и каталоги

- **Продакшен:** `/opt/projects/bersoncarebot` (владелец — пользователь деплоя).
- Клонировать репозиторий в `/opt/projects/bersoncarebot`, перейти в каталог.

### 4. Файлы окружения (каталог /opt/env/)

Env на проде хранятся в **/opt/env/bersoncarebot/** (вне дерева проекта). Права: владелец — пользователь деплоя, чтение только для нужных пользователей.

**Интегратор (API + worker):**

```bash
sudo mkdir -p /opt/env/bersoncarebot
sudo chown deployuser:deployuser /opt/env/bersoncarebot
cp deploy/env/.env.prod.example /opt/env/bersoncarebot/api.prod
# Отредактировать: DATABASE_URL, при необходимости HOST, PORT (3200)
```

**Webapp:**

```bash
cp deploy/env/.env.webapp.prod.example /opt/env/bersoncarebot/webapp.prod
# Обязательно задать:
#   DATABASE_URL — для bcb_webapp_prod (postgres://bcb_webapp_user:...@127.0.0.1:5432/bcb_webapp_prod)
#   SESSION_COOKIE_SECRET — длинная случайная строка (минимум 32 символа)
#   INTEGRATOR_SHARED_SECRET — один и тот же секрет в tgcarebot и webapp для подписи ссылок/webhooks
#   APP_BASE_URL — публичный URL webapp (например https://webapp.bersonservices.ru)
# PORT=6200, HOST=127.0.0.1 уже заданы в шаблоне
```

Юниты systemd подхватывают: API и worker — `/opt/env/bersoncarebot/api.prod`, webapp — `/opt/env/bersoncarebot/webapp.prod`.

Для dev-окружения env остаётся в дереве проекта: интегратор — `.env.dev` в корне, webapp — `webapp/.env.dev`. Шаблоны: `deploy/env/.env.dev.example` → `.env.dev`, `deploy/env/.env.webapp.dev.example` → `webapp/.env.dev`.

### 5. Установка systemd-юнитов (один раз)

Выполнить на хосте из корня проекта:

```bash
cd /opt/projects/bersoncarebot
bash deploy/host/bootstrap-systemd-prod.sh
```

Скрипт копирует в `/etc/systemd/system/`:

- `bersoncarebot-api-prod.service`
- `bersoncarebot-worker-prod.service`
- `bersoncarebot-webapp-prod.service` (если файл есть в `deploy/systemd/`)

Если уже есть `/opt/env/bersoncarebot/api.prod`, собранный `dist/` и для webapp — `/opt/env/bersoncarebot/webapp.prod` и `webapp/.next`, сервисы будут включены и запущены. Иначе они только включатся (enable), и старт произойдёт при первом деплое.

### 6. Sudoers для пользователя деплоя

Чтобы CI или ручной деплой мог перезапускать сервисы и делать бэкап без пароля, добавить (подставить имя пользователя вместо `deployuser`):

```bash
sudo visudo
# Добавить строки:
deployuser ALL=(root) NOPASSWD: /opt/backups/scripts/postgres-backup.sh pre-migrations
deployuser ALL=(root) NOPASSWD: /bin/systemctl restart bersoncarebot-api-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl restart bersoncarebot-worker-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl restart bersoncarebot-webapp-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl is-active --quiet bersoncarebot-api-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl is-active --quiet bersoncarebot-worker-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl is-active --quiet bersoncarebot-webapp-prod.service
```

Скрипт `postgres-backup.sh` должен существовать и поддерживать аргумент `pre-migrations` (запись в `/opt/backups/postgres/pre-migrations/`). Если бэкапов нет — в `deploy-prod.sh` эту проверку нужно закомментировать или адаптировать.

### 7. Nginx

Настроить виртуальные хосты:

- **Интегратор:** `tgcarebot.<ваш-домен>` → proxy на `http://127.0.0.1:3200`.
- **Webapp:** `webapp.<ваш-домен>` → proxy на `http://127.0.0.1:6200`.

Для dev: `dev-tgcarebot.<домен>` → 4200, `dev-webapp.<домен>` → 5200 (см. SERVER CONVENTIONS.md).

### 8. Первый деплой (сборка и запуск)

На хосте от пользователя деплоя:

```bash
cd /opt/projects/bersoncarebot
git pull origin main
pnpm install --frozen-lockfile
pnpm build
pnpm build:webapp
```

Миграции интегратора:

```bash
set -a && source /opt/env/bersoncarebot/api.prod && set +a
node dist/infra/db/migrate.js
```

При необходимости выполнить миграции webapp (если в проекте есть скрипты миграций для webapp БД).

Запуск сервисов:

```bash
sudo systemctl start bersoncarebot-api-prod.service
sudo systemctl start bersoncarebot-worker-prod.service
sudo systemctl start bersoncarebot-webapp-prod.service
# Проверка:
sudo systemctl status bersoncarebot-api-prod.service bersoncarebot-worker-prod.service bersoncarebot-webapp-prod.service
```

Проверка здоровья API интегратора: `curl -s http://127.0.0.1:3200/health` (ожидается JSON с `"ok":true`, `"db":"up"`). Webapp: открыть в браузере `APP_BASE_URL` или `curl -s http://127.0.0.1:6200/api/health`.

### 9. Дальнейшие деплои (CI или вручную)

Автоматический деплой через CI вызывает на хосте:

```bash
cd /opt/projects/bersoncarebot
bash deploy/host/deploy-prod.sh
```

Скрипт делает: `git pull`, `pnpm install`, `pnpm build`, `pnpm build:webapp`, бэкап БД (pre-migrations), миграции интегратора, перезапуск API, worker и webapp, проверку здоровья API. Для работы ему нужны уже установленные systemd-юниты и правила sudoers (шаги 5 и 6).

Ручной деплой: те же команды из шага 8 плюс перезапуск сервисов через `sudo systemctl restart ...`.

---

## Current deployment model
- Host runtime (Node.js runs directly on server)
- System PostgreSQL
- systemd for process management
- nginx as reverse proxy
- `tgcarebot` and `webapp` are deployed as separate host services

GitHub Actions runs the regular host deploy only. It does not install or update `systemd` units during each deploy.

## Ports
- Production integrator API: 3200
- Development integrator API: 4200
- Production webapp: 6200
- Development webapp: 5200

## Database names
- Integrator production: bersoncarebot_prod
- Integrator development: bersoncarebot_dev
- Webapp production: bcb_webapp_prod
- Webapp development: bcb_webapp_dev

## Environment templates
See these templates:
- `deploy/env/.env.prod.example`
- `deploy/env/.env.dev.example`
- `deploy/env/.env.webapp.prod.example`
- `deploy/env/.env.webapp.dev.example`

## Systemd templates
See `deploy/systemd/` for ready-to-use service files (not installed automatically):
- `bersoncarebot-api-prod.service`
- `bersoncarebot-worker-prod.service`
- `bersoncarebot-webapp-prod.service`

## One-time host bootstrap
Install or refresh the production `systemd` units on the host before running CI deploys:

```bash
cd /opt/projects/bersoncarebot
bash deploy/host/bootstrap-systemd-prod.sh
```

The bootstrap script copies these templates into `/etc/systemd/system/`, reloads `systemd`, and enables:
- `bersoncarebot-api-prod.service`
- `bersoncarebot-worker-prod.service`
- `bersoncarebot-webapp-prod.service` (if the template exists)

If `/opt/env/bersoncarebot/api.prod`, `/opt/env/bersoncarebot/webapp.prod`, and build artifacts exist, the script also starts the services. Otherwise it enables them and leaves startup to the next `deploy/host/deploy-prod.sh` run.

## CI deploy requirements
`deploy/host/deploy-prod.sh` uses `sudo -n` and fails fast if the deploy user is missing the required `NOPASSWD` rules.

Example sudoers entry for the deploy user:

```sudoers
deployuser ALL=(root) NOPASSWD: /opt/backups/scripts/postgres-backup.sh pre-migrations
deployuser ALL=(root) NOPASSWD: /bin/systemctl restart bersoncarebot-api-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl restart bersoncarebot-worker-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl restart bersoncarebot-webapp-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl is-active --quiet bersoncarebot-api-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl is-active --quiet bersoncarebot-worker-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl is-active --quiet bersoncarebot-webapp-prod.service
```

Without those permissions, CI deploy will exit before `pnpm install` or `pnpm build`.

## Перенос env в /opt/env/bersoncarebot (один раз на сервере)

Если раньше env лежал в проекте (`.env.prod`, `webapp/.env.prod`) или в `/opt/env/` без подкаталога, выполнить на **рабочем сервере** под пользователем деплоя:

```bash
# 1. Каталог и права
sudo mkdir -p /opt/env/bersoncarebot
sudo chown "$(whoami):$(whoami)" /opt/env/bersoncarebot

# 2. Перенос env интегратора (API + worker)
cp /opt/projects/bersoncarebot/.env.prod /opt/env/bersoncarebot/api.prod

# 3. Перенос env webapp (если уже был)
cp /opt/projects/bersoncarebot/webapp/.env.prod /opt/env/bersoncarebot/webapp.prod
# Если webapp env ещё не существовал — скопировать из примера и заполнить:
# cp deploy/env/.env.webapp.prod.example /opt/env/bersoncarebot/webapp.prod

# 4. Обновить юниты systemd из репозитория (после git pull) и перезагрузить конфиг
cd /opt/projects/bersoncarebot
git pull origin main
sudo cp deploy/systemd/bersoncarebot-api-prod.service deploy/systemd/bersoncarebot-worker-prod.service deploy/systemd/bersoncarebot-webapp-prod.service /etc/systemd/system/
sudo systemctl daemon-reload

# 5. Перезапустить сервисы (подхватят новые EnvironmentFile)
sudo systemctl restart bersoncarebot-api-prod.service bersoncarebot-worker-prod.service bersoncarebot-webapp-prod.service

# 6. Проверка
sudo systemctl status bersoncarebot-api-prod.service bersoncarebot-worker-prod.service bersoncarebot-webapp-prod.service
curl -s http://127.0.0.1:3200/health
curl -s http://127.0.0.1:6200/api/health
```

Старые файлы `.env.prod` и `webapp/.env.prod` в проекте можно удалить после проверки или оставить как бэкап (юниты их больше не читают).

## Host scripts
See `deploy/host/` for build, migrate, start, and deploy scripts.

## Scheduler
`src/infra/runtime/scheduler/main.ts` exists but is not run as a separate service in the current host deploy (no systemd unit). For the new split model, product-level reminders/scheduler responsibilities move to `webapp`; the integrator keeps API and worker processes.

## DB backup scripts
See `deploy/db/` for backup scripts using pg_dump.

## Creating webapp databases
Before running the webapp in production or development, create the database and user (see section "Структура баз данных" and step 2 for full SQL):

```sql
-- Production
CREATE USER bcb_webapp_user WITH PASSWORD 'password';
CREATE DATABASE bcb_webapp_prod OWNER bcb_webapp_user;

-- Development
CREATE USER bcb_webapp_dev_user WITH PASSWORD 'password';
CREATE DATABASE bcb_webapp_dev OWNER bcb_webapp_dev_user;
```

Copy `deploy/env/.env.webapp.prod.example` to `/opt/env/bersoncarebot/webapp.prod` and set the correct `DATABASE_URL` (e.g. `postgres://bcb_webapp_user:...@127.0.0.1:5432/bcb_webapp_prod`) and secrets. For dev, copy `deploy/env/.env.webapp.dev.example` to `webapp/.env.dev`.
