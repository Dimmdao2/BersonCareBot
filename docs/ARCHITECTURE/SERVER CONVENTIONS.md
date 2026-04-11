# SERVER CONVENTIONS

---

## ⛔ КРИТИЧНО: ПОЛЬЗОВАТЕЛЬ `deploy` НЕ ИМЕЕТ ОБЩЕГО `sudo` В SSH

**Никогда не давать агенту команды с `sudo` для выполнения от имени `deploy` в SSH-терминале.**

Пользователь `deploy` имеет `NOPASSWD sudo` **только** для строго перечисленных команд (systemctl restart/daemon-reload/is-active для bersoncarebot-сервисов, backup-скрипт, install для unit-файлов). Всё остальное — `sudo: permission denied`.

**Практические следствия:**
- `sudo rm`, `sudo chown`, `sudo tee`, `sudo cp` — **не работают** от `deploy`.
- Если нужно почистить root-owned артефакты (например, `.next/` после `cp` от root) — это должен делать **root** в отдельной сессии, или задача должна быть переформулирована так, чтобы deploy-пользователь не создавал root-owned файлы изначально.
- Не предлагать `sudo install` для произвольных файлов вне unit-файлов сервисов.
- Никаких `sudo chown`, `sudo mkdir`, `sudo rm` в инструкциях для деплоя.

Если требуется root-операция (очистка `/opt/`, смена владельца, ручная правка `/etc/`): явно сказать «выполнить от root», не от deploy.

---

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
| Cutover env | `/opt/env/bersoncarebot/cutover.prod` |

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
- WorkingDirectory: `/opt/projects/bersoncarebot/apps/webapp/.next/standalone/apps/webapp`
- EnvironmentFile: `/opt/env/bersoncarebot/webapp.prod`
- Environment: `PORT=6200`, `HOSTNAME=127.0.0.1`
- ExecStart: `/usr/bin/node /opt/projects/bersoncarebot/apps/webapp/.next/standalone/apps/webapp/server.js`
- Port: `127.0.0.1:6200`
- Режим: Next.js standalone (`output: "standalone"` в `next.config.ts`)

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
- `https://bersoncare.ru` -> `http://127.0.0.1:6200`

Дополнительно в `tgcarebot` vhost есть legacy-path:

- `/admin/` -> `http://127.0.0.1:8080/`

Примечания:

- сайт `default` в nginx всё ещё включен;
- nginx слушает `80` и `443`;
- webapp использует отдельный vhost `bersoncarebot-webapp`.

**OAuth rate limit (`POST /api/auth/oauth/start`):** ключ лимита — только **`X-Real-IP`**, выставляемый nginx (`proxy_set_header X-Real-IP $remote_addr;`). `X-Forwarded-For` для этого лимита приложением не используется. В **production** отсутствие `X-Real-IP` — ошибка конфигурации прокси (ответ **503** `proxy_configuration`), а не деградация с общим bucket. Требования и примеры: `deploy/HOST_DEPLOY_README.md` → Nginx → Webapp → «Client IP and Rate Limiting».

**Кэш HTML vs `/_next/static/` (webapp):** точные заголовки на production в audit не снимались; оператор проверяет `curl -I` и настройки CDN. Рекомендации (nginx без перекрытия `Cache-Control` от Next, политика CDN): `deploy/HOST_DEPLOY_README.md` → Nginx → Webapp → «Кэширование (Next.js, мини-приложение)».

**Загрузка файлов:** для vhost webapp при **прокси-загрузке** (`POST /api/media/upload`, например markdown-тулбар) нужен `client_max_body_size` (рекомендация `55m` — см. `deploy/HOST_DEPLOY_README.md`). Основная библиотека медиа грузит файлы **напрямую в MinIO** (presigned URL); лимит nginx webapp на эти запросы не действует.

**S3 / MinIO (webapp):** для библиотеки CMS и `media_files` обязательны `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, **`S3_PRIVATE_BUCKET`** — объекты пишутся в **приватный** бакет; отдача через `GET /api/media/:id` (редирект на presigned GET) при **активной сессии** (без сессии — `401`). **`S3_PUBLIC_BUCKET`** опционален (легаси-URL в контенте, возможные будущие публичные ассеты). Ключи env (имена): `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PRIVATE_BUCKET`, `S3_PUBLIC_BUCKET`, `S3_REGION` (часто `us-east-1`), `S3_FORCE_PATH_STYLE` (`true` для MinIO). Опционально **`LOG_LEVEL`** — уровень логов pino в webapp. На **приватном** бакете для presigned PUT из браузера нужен **CORS** с origin `https://bersoncare.ru` и методами `PUT`, `GET`, `HEAD` (аналогично прежней настройке публичного бакета). Фоновое удаление объектов: cron вызывает `POST /api/internal/media-pending-delete/purge` с `Authorization: Bearer <INTERNAL_JOB_SECRET>` — в `webapp.prod` задаётся имя ключа **`INTERNAL_JOB_SECRET`** (значение — секрет, в документ не вносить). Подробности: `deploy/HOST_DEPLOY_README.md` (MinIO), `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md`.

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
- `APP_BASE_URL=https://bersoncare.ru`
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
- `APP_BASE_URL=https://bersoncare.ru`
- `DATABASE_URL=...` (webapp БД)
- `SESSION_COOKIE_SECRET=...`
- `INTEGRATOR_SHARED_SECRET=...`
- `INTEGRATOR_API_URL=https://tgcarebot.bersonservices.ru`
- `ALLOW_DEV_AUTH_BYPASS=...`
- `ALLOWED_TELEGRAM_IDS=7924656602`
- `ADMIN_TELEGRAM_ID=364943522`
- `TELEGRAM_BOT_TOKEN=...`
- `S3_*` — см. блок «S3 / MinIO» выше (`S3_PRIVATE_BUCKET` и др.; приватный бакет для CMS-медиа).
- `INTERNAL_JOB_SECRET` — опционально; если задан, позволяет cron дергать purge очереди удаления медиа (см. отчёт S3 private media).
- `LOG_LEVEL` — опционально (pino в webapp; по умолчанию в коде `info`).

Для обычного runtime webapp **не нужно** хранить integrator DB в `webapp.prod`.

Для cutover/backfill/reconcile/gate-скриптов используется отдельный файл:

#### `/opt/env/bersoncarebot/cutover.prod`

Назначение:

- отдельный ops-only env для `backfill-*`, `reconcile-*`, `projection-health`, `stage*-gate`;
- не используется как runtime env для `bersoncarebot-webapp-prod.service`;
- позволяет не хранить integrator DB URL в `webapp.prod`.

Ожидаемые ключи:

- `DATABASE_URL` — **webapp** DB (`bcb_webapp_prod`);
- `INTEGRATOR_DATABASE_URL` или `SOURCE_DATABASE_URL` — **integrator** DB (`tgcarebot`).

Скрипты репозитория автоматически пытаются загрузить cutover env в таком порядке:

1. `CUTOVER_ENV_FILE`, если задан явно;
2. `/opt/env/bersoncarebot/cutover.prod` на production;
3. `/home/dev/dev-projects/BersonCareBot/.env.cutover.dev` в dev workspace;
4. `/home/dev/dev-projects/BersonCareBot/.env.cutover` как резервный локальный файл.

Шаблон в репозитории:

- `deploy/env/.env.cutover.prod.example`

---

## Development

### Пути

| Параметр | Значение |
|----------|----------|
| Dev workspace | `/home/dev/dev-projects/BersonCareBot` |
| Integrator env (факт на audit) | `/home/dev/dev-projects/BersonCareBot/.env` |
| Integrator `.env.dev` | отсутствует |
| Webapp env | `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` |
| Dev cutover env | `/home/dev/dev-projects/BersonCareBot/.env.cutover.dev` |
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

### Dev cutover env

Для симметрии с production dev-скрипты backfill/reconcile/gate используют отдельный файл:

- `/home/dev/dev-projects/BersonCareBot/.env.cutover.dev`

Назначение:

- отдельный ops/dev-only env для `backfill-*`, `reconcile-*`, `projection-health`, `stage*-gate`;
- не смешивает source и target DB URL в runtime env webapp;
- позволяет запускать dev cutover тем же способом, что и prod.

Ожидаемые ключи:

- `DATABASE_URL` — **webapp dev** DB;
- `INTEGRATOR_DATABASE_URL` или `SOURCE_DATABASE_URL` — **integrator dev** DB.

Подтвержденные **имена dev БД** (по env preview в workspace, без секретов):

| Назначение | Файл env | Переменная | Имя БД |
|------------|----------|------------|--------|
| Integrator dev | `/home/dev/dev-projects/BersonCareBot/.env` | `DATABASE_URL` | `bersoncarebot_dev` |
| Webapp dev | `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` | `DATABASE_URL` | `bcb_webapp_dev` |
| Integrator для dev cutover/backfill/reconcile | `/home/dev/dev-projects/BersonCareBot/.env.cutover.dev` | `INTEGRATOR_DATABASE_URL` | должно указывать на `bersoncarebot_dev` |

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
- Каноническая версия скрипта бэкапа в репозитории: [`deploy/postgres/postgres-backup.sh`](../../deploy/postgres/postgres-backup.sh) — **обе** production-бД: integrator (`DATABASE_URL` из `api.prod`, обычно `tgcarebot`) и webapp (`DATABASE_URL` из `webapp.prod`, обычно `bcb_webapp_prod`). На хосте ожидается установка в `/opt/backups/scripts/postgres-backup.sh` (см. [`deploy/postgres/README.md`](../../deploy/postgres/README.md)). Режимы: `pre-migrations`, `hourly`, `daily`, `manual` — см. скрипт.
- `/opt/env/bersoncarebot` существует и принадлежит `deploy`.
- Команда со снимком `pg_database` в этом audit оборвалась по shell-ошибке, поэтому точные current DB owners в этот документ не включены.
- Для базы и владельцев пока опираться на `deploy/HOST_DEPLOY_README.md`, пока не будет отдельного успешного postgres snapshot.

### Data migration / доступ к БД (production)

Для проверки переноса данных и backfill/reconcile нужны две БД: **integrator** (источник) и **webapp** (целевая).

| Назначение | Переменная | Где задана на проде |
|------------|------------|----------------------|
| Integrator (источник) | `DATABASE_URL` | `/opt/env/bersoncarebot/api.prod` |
| Webapp (целевая) | `DATABASE_URL` | `/opt/env/bersoncarebot/webapp.prod` |
| Integrator для webapp (backfill/reconcile) | `INTEGRATOR_DATABASE_URL` или `SOURCE_DATABASE_URL` | `/opt/env/bersoncarebot/cutover.prod` — preferred; значение = та же строка, что `DATABASE_URL` в `api.prod` |

Подтвержденные **имена production БД** (по env preview на `2026-03-21`, без секретов):

| Назначение | Файл env | Переменная | Имя БД |
|------------|----------|------------|--------|
| Integrator | `/opt/env/bersoncarebot/api.prod` | `DATABASE_URL` | `tgcarebot` |
| Webapp | `/opt/env/bersoncarebot/webapp.prod` | `DATABASE_URL` | `bcb_webapp_prod` |
| Integrator для webapp backfill/reconcile | `/opt/env/bersoncarebot/cutover.prod` | `INTEGRATOR_DATABASE_URL` | должно указывать на `tgcarebot` |

Подключение к psql на проде (под пользователем, у которого есть доступ к БД):

```bash
# Загрузить env и подключиться к нужной БД (значения не коммитить).
# Обязательно сначала source — иначе DATABASE_URL пустой и psql уйдёт в локальный сокет
# от имени пользователя ОС (часто root) → FATAL: role "root" does not exist.
set -a && source /opt/env/bersoncarebot/api.prod && set +a && psql "$DATABASE_URL"    # integrator
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a && psql "$DATABASE_URL" # webapp
```

Если на хосте psql запускают от имени `postgres`: `sudo -u postgres psql -d <имя_базы>`. Имена баз и пользователей берут из соответствующих env-файлов (см. примеры в `deploy/env/.env.webapp.prod.example`; для api — корневой `.env.example`).

### Как узнать, чего не хватает, и вписать на сервер

Выполнять на **production-хосте** (под пользователем с доступом к env и при необходимости `sudo -u postgres`).

**1. Снять снимок баз и ролей (обновить раздел Database / backup facts):**

```bash
sudo -u postgres psql -At -F $'\t' -c "SELECT datname, pg_catalog.pg_get_userbyid(datdba) FROM pg_database WHERE datallowconn ORDER BY datname;"
sudo -u postgres psql -At -F $'\t' -c "SELECT rolname FROM pg_roles ORDER BY rolname;"
```

Результат вписать в этот документ (раздел «Database / backup facts») или в `deploy/HOST_DEPLOY_README.md`, чтобы не терять актуальные имена баз и владельцев.

**2. Проверить, какие переменные заданы в env (без вывода секретов):**

```bash
echo "=== api.prod (integrator) ==="
grep -E '^[A-Za-z_][A-Za-z0-9_]*=' /opt/env/bersoncarebot/api.prod 2>/dev/null | cut -d= -f1 | sort
echo "=== webapp.prod ==="
grep -E '^[A-Za-z_][A-Za-z0-9_]*=' /opt/env/bersoncarebot/webapp.prod 2>/dev/null | cut -d= -f1 | sort
echo "=== cutover.prod ==="
grep -E '^[A-Za-z_][A-Za-z0-9_]*=' /opt/env/bersoncarebot/cutover.prod 2>/dev/null | cut -d= -f1 | sort
```

**3. Чего часто не хватает и как добавить:**

| Чего не хватает | Как проверить | Как вписать |
|-----------------|---------------|-------------|
| `INTEGRATOR_DATABASE_URL` для cutover-скриптов | В `/opt/env/bersoncarebot/cutover.prod` нет `INTEGRATOR_DATABASE_URL` (и нет `SOURCE_DATABASE_URL`) | Создать `/opt/env/bersoncarebot/cutover.prod`; взять значение `DATABASE_URL` из `/opt/env/bersoncarebot/api.prod` и записать как `INTEGRATOR_DATABASE_URL='...'`. `DATABASE_URL` в этом файле должен указывать на webapp DB из `webapp.prod`. |
| Имена баз для psql | Не знаете, к какой базе подключаться | Из `api.prod`: `source /opt/env/bersoncarebot/api.prod && echo "$DATABASE_URL"` — в URL будет имя базы (после последнего `/`). Аналогично для webapp из `webapp.prod`. Или после п.1 смотреть вывод списка баз. |
| Backup перед миграциями | Не уверены, что дампы создаются | Канонический скрипт: репозиторий `deploy/postgres/postgres-backup.sh` → на хосте `/opt/backups/scripts/postgres-backup.sh`. Запуск: `sudo /opt/backups/scripts/postgres-backup.sh pre-migrations`. В `/opt/backups/postgres/pre-migrations/` должны появиться **два** файла `*.dump` (integrator + webapp). |

**4. После добавления переменных:** backfill/reconcile запускать с хоста (или с машины, где доступны те же env), см. `deploy/DATA_MIGRATION_CHECKLIST.md`.

---

## Важные текущие отклонения

- На прод-хосте в репозитории есть неотслеживаемый каталог `webapp/`, но production webapp unit запускает приложение из `apps/webapp`.
- `bersoncarebot-webapp-prod.service` запускает Next.js standalone сервер напрямую через `node server.js`. Предупреждение про `output: standalone` устранено (подтверждено 2026-04-01).
- На хосте есть активные nginx/vhost и процессы других проектов, но они не относятся к `BersonCareBot` и в этот документ не включаются.

---

## Что считать source of truth

Для BersonCareBot source of truth по серверной конфигурации:

1. Этот файл — для краткого текущего состояния.
2. `deploy/HOST_DEPLOY_README.md` — для пошагового bootstrap/deploy.
3. `deploy/systemd/*.service` — для unit templates.
4. Фактический `systemctl cat ...`, `nginx -T`, `ss -lntup`, env preview — для проверки реального хоста.

