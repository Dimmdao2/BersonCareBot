# SERVER CONVENTIONS

Этот документ хранит только подтвержденные данные по текущему состоянию `BersonCareBot`.

- Источник: audit хоста от `2026-03-19`.
- Scope: только `BersonCareBot`.
- Данные по другим проектам сюда не входят.
- Если хост поменялся, сначала снять новый audit, потом обновлять этот файл.

---

## Текущее состояние хоста

| Параметр | Значение |
|----------|----------|
| Хост | `localhost` |
| ОС | `Ubuntu 24.04.4 LTS` |
| Runtime model | Node.js напрямую на хосте через `systemd` |
| Reverse proxy | `nginx` |
| База данных | system PostgreSQL на `127.0.0.1:5432` |
| Deploy user | `deploy` |
| Backup root | `/opt/backups` |

---

## Production

### Пути

| Параметр | Значение |
|----------|----------|
| Project dir | `/opt/projects/bersoncarebot` |
| Env dir | `/opt/env/bersoncarebot` |
| API env | `/opt/env/bersoncarebot/api.prod` |
| Webapp env | `/opt/env/bersoncarebot/webapp.prod` |

### systemd units

На хосте установлены и активны:

- `bersoncarebot-api-prod.service`
- `bersoncarebot-worker-prod.service`
- `bersoncarebot-webapp-prod.service`

### Unit details

#### API

- Unit: `bersoncarebot-api-prod.service`
- WorkingDirectory: `/opt/projects/bersoncarebot/apps/integrator`
- EnvironmentFile: `/opt/env/bersoncarebot/api.prod`
- ExecStart: `/usr/bin/node dist/main.js`
- Port: `127.0.0.1:3200`

#### Worker

- Unit: `bersoncarebot-worker-prod.service`
- WorkingDirectory: `/opt/projects/bersoncarebot/apps/integrator`
- EnvironmentFile: `/opt/env/bersoncarebot/api.prod`
- ExecStart: `/usr/bin/node dist/infra/runtime/worker/main.js`
- Public port: нет

#### Webapp

- Unit: `bersoncarebot-webapp-prod.service`
- WorkingDirectory: `/opt/projects/bersoncarebot`
- EnvironmentFile: `/opt/env/bersoncarebot/webapp.prod`
- ExecStart: `/usr/bin/pnpm --dir /opt/projects/bersoncarebot/apps/webapp start`
- Port: `127.0.0.1:6200`

### Ports

| Сервис | Bind |
|--------|------|
| PostgreSQL | `127.0.0.1:5432` |
| Integrator API | `127.0.0.1:3200` |
| Webapp | `127.0.0.1:6200` |
| Worker | без порта |

### Public URLs / nginx

Подтвержденные BersonCareBot vhost'ы:

- `https://tgcarebot.bersonservices.ru` -> `http://127.0.0.1:3200`
- `https://webapp.bersonservices.ru` -> `http://127.0.0.1:6200`

Дополнительно в `tgcarebot` vhost есть legacy-path:

- `/admin/` -> `http://127.0.0.1:8080/`

Примечания:

- сайт `default` в nginx всё ещё включен;
- nginx слушает `80` и `443`;
- webapp использует отдельный vhost `bersoncarebot-webapp`.

### Production env: подтвержденные ключи

#### `/opt/env/bersoncarebot/api.prod`

Есть и используются:

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
- `SMSC_ENABLED=true`
- `SMSC_API_KEY=...`
- `SMSC_BASE_URL=https://smsc.ru/sys/send.php`

#### `/opt/env/bersoncarebot/webapp.prod`

Есть и используются:

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

---

## Development

### Пути

| Параметр | Значение |
|----------|----------|
| Dev workspace | `/home/dev/dev-projects/BersonCareBot` |
| Integrator env (факт на audit) | `/home/dev/dev-projects/BersonCareBot/.env` |
| Integrator `.env.dev` | отсутствует |
| Webapp env | `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` |
| Legacy `webapp/.env.dev` | отсутствует |

### systemd / processes

На audited host dev-юниты **не установлены**:

- `bersoncarebot-api-dev.service` — отсутствует
- `bersoncarebot-worker-dev.service` — отсутствует
- `bersoncarebot-webapp-dev.service` — отсутствует

При этом в репозитории есть такие dev unit templates:

- `deploy/systemd/bersoncarebot-api-dev.service`
- `deploy/systemd/bersoncarebot-worker-dev.service`
- `deploy/systemd/bersoncarebot-webapp-dev.service`

### Dev ports (по факту на audit)

| Сервис | Состояние |
|--------|-----------|
| `127.0.0.1:5200` | слушает dev webapp |
| `127.0.0.1:4200` | не слушает в момент audit |

Вывод:

- dev webapp запускался вручную или другим способом, не через systemd;
- dev integrator на `4200` в момент audit не был поднят.

### Webapp dev env: подтвержденные ключи

Файл: `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev`

- `NODE_ENV=development`
- `HOST=127.0.0.1`
- `PORT=5200`
- `APP_BASE_URL=http://127.0.0.1:5200`
- `DATABASE_URL=...`
- `SESSION_COOKIE_SECRET=...`
- `INTEGRATOR_SHARED_SECRET=...`
- `INTEGRATOR_API_URL=http://127.0.0.1:4200`
- `ALLOW_DEV_AUTH_BYPASS=...`

### Integrator dev env loading

По коду `apps/integrator/src/config/loadEnv.ts`:

- если `ENV_FILE` не задан, integrator грузит стандартный `.env`;
- на audited host файл `.env` есть;
- файла `.env.dev` на audited host нет.

Значит текущее dev-состояние для integrator — это root `.env`, а не `.env.dev`.

---

## Repo facts, влияющие на сервер

### Deploy scripts

Используются:

- `deploy/host/deploy-prod.sh`
- `deploy/host/bootstrap-systemd-prod.sh`

### systemd templates в репозитории

- `deploy/systemd/bersoncarebot-api-prod.service`
- `deploy/systemd/bersoncarebot-worker-prod.service`
- `deploy/systemd/bersoncarebot-webapp-prod.service`
- `deploy/systemd/bersoncarebot-api-dev.service`
- `deploy/systemd/bersoncarebot-worker-dev.service`
- `deploy/systemd/bersoncarebot-webapp-dev.service`

### Env templates в репозитории

Есть:

- `.env.example`
- `apps/webapp/.env.example`
- `deploy/env/.env.webapp.prod.example`
- `deploy/env/.env.webapp.dev.example`

Отсутствуют:

- `deploy/env/.env.prod.example`
- `deploy/env/.env.dev.example`

---

## Database / backup facts

- PostgreSQL слушает только `127.0.0.1:5432`.
- `/opt/backups` существует.
- `/opt/env/bersoncarebot` существует и принадлежит `deploy`.
- Команда со снимком `pg_database` в этом audit оборвалась по shell-ошибке, поэтому точные current DB owners в этот документ не включены.
- Для базы и владельцев пока опираться на `deploy/HOST_DEPLOY_README.md`, пока не будет отдельного успешного postgres snapshot.

---

## Важные текущие отклонения

- На прод-хосте в репозитории есть неотслеживаемый каталог `webapp/`, но production webapp unit запускает приложение из `apps/webapp`.
- `bersoncarebot-webapp-prod.service` сейчас запускает `next start`, и в логах есть предупреждение про `output: standalone`.
- На хосте есть активные nginx/vhost и процессы других проектов, но они не относятся к `BersonCareBot` и в этот документ не включаются.

---

## Что считать source of truth

Для BersonCareBot source of truth по серверной конфигурации:

1. Этот файл — для краткого текущего состояния.
2. `deploy/HOST_DEPLOY_README.md` — для пошагового bootstrap/deploy.
3. `deploy/systemd/*.service` — для unit templates.
4. Фактический `systemctl cat ...`, `nginx -T`, `ss -lntup`, env preview — для проверки реального хоста.

