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

## 🌐 ТОПОЛОГИЯ СЕРВЕРОВ (обновлено 2026-06-25 — после миграции прода)

> **ВАЖНО:** исторически этот файл описывал ОДИН хост (`localhost` = `151.241.228.122`). После переезда 2026-06 прод-инфраструктура **разнесена на разные серверы**. Имена юнитов / порты / структура env в разделах ниже — по-прежнему верны для приложения, но **прод запускается на новом сервере** (`135.x`), а `151.x` стал dev + egress-релеем + боевым тестом.

### Боевые серверы

| Роль | IP / host | Что на нём | Домены |
|------|-----------|------------|--------|
| **PROD** (текущий боевой) | `135.106.162.170` (host `adelaide`, Selectel, Ubuntu 24.04) | Прод-приложение (api/worker/scheduler/webapp/media-worker), прод-БД `bersoncarebot` на PG16 `127.0.0.1:5432`, nginx, крон-слой, бэкапы | `bersoncare.ru`, `www.bersoncare.ru`, `tgcarebot.bersonservices.ru` → все `135.106.162.170` |
| **OLD / DEV / RELAY / TEST** | `151.241.228.122` (исходный хост = dev-box) | (1) **AmneziaWG egress-релей** Telegram для прод-бота — `awg-quick@awg0`, UDP `51822`, **НЕ ТРОГАТЬ** (прод-бот зависит); (2) dev-окружение (Next `:5200`); (3) старый прод **остановлен** (юниты `disabled`, cron.d в `/root/bcb-cron-disabled-*`); (4) **боевой ТЕСТ** `test.bersoncare.ru` (2026-06) | `test.bersoncare.ru` → `151.241.228.122`; почта (`mail/smtp/pop/ftp`) — на reg.ru (`31.31.197.72`), не на наших серверах |
| ~~`161.104.34.216`~~ | **DECOMMISSIONED** | Первый целевой прод-VDS — оказался **заблокирован из РФ** (РКН/ТСПУ, мёртв весь IP), удалён. Прод пересобран клоном на `135.x`. **Урок: новый IP всегда проверять `nc -vz <ip> 443` с РФ-бытового интернета ДО переезда.** | — |

### Telegram-туннель (прод ↔ релей `151.x`)
Telegram заблокирован из РФ на гос-уровне; прод-сервер `135.x` (Selectel) Telegram **напрямую не достаёт**. Прод-бот ходит в Telegram через **AmneziaWG split-tunnel** на старый сервер `151.x` (он Telegram достаёт), тот форвардит наружу. Поэтому `awg-quick@awg0` на `151.x` **критичен** — его остановка убивает прод-бота.

**Фактический конфиг релея (`awg0` на `151.x`, снято `awg show` 2026-06-25):**
- интерфейс `awg0`, адрес `10.9.0.1/24`, `ListenPort = 51822/udp`; конфиг `/etc/amnezia/amneziawg/awg0.conf`;
- **анти-DPI обфускация AmneziaWG** (параметры `Jc/Jmin/Jmax/S1/S2/H1..H4`) — должны **точно совпадать** на клиенте, иначе туннель не поднимется; именно они отличают его от обычного WireGuard (чтобы ТСПУ не фингерпринтил). Значения — в конфиге на боксе, в репозиторий **не выносим**;
- пиры:
  - **`10.9.0.5/32` → endpoint `135.106.162.170` = ПРОД** — прод-бот гонит Telegram-трафик (`AllowedIPs` = диапазоны Telegram: `149.154.160.0/20`, `91.108.4.0/22`) в этот туннель, `151.x` форвардит. **Это и есть «туннель до прода».**
  - `10.9.0.2/32`, `10.9.0.3/32` — роуминг-клиенты (iPhone владельца; split-tunnel только под Telegram);
  - ~~`10.9.0.4/32` → `161.104.34.216`~~ — **мёртвый пир** декоммишеннутого VDS (без хендшейка неделю) → удалить из конфига при случае.
- **Тест-бот на `151.x` Telegram достаёт напрямую** — туннель не нужен (`151.x` сам exit-точка).

### Доступы / VPN (как владелец заходит)
На `151.x` живут **ДВА разных** WireGuard-сервера — не путать:

| VPN | Назначение | Подсеть / порт | Клиенты |
|-----|-----------|----------------|---------|
| **AmneziaWG `awg0`** | (1) релей Telegram прод-бота; (2) split-tunnel iPhone владельца | `10.9.0.0/24`, UDP `51822` | прод `135.x` (`10.9.0.5`), iPhone (`10.9.0.2/.3`) |
| **wg-easy** (Docker `ghcr.io/wg-easy/wg-easy`) | full-tunnel VPN **ноута** владельца | внутр. `10.8.0.0/24`, UDP `51820`, web-UI `:51821`; контейнер на docker0 = `172.17.0.2` | ноут (`10.8.0.x`) |

**Тонкость IP-замка теста (важно при отладке `403`):** трафик к **собственным** сервисам бокса (`test.bersoncare.ru`) приходит с **внутренним** адресом туннеля/NAT, а **НЕ** с публичного `151.241.228.122` (NAT-маскарад работает только для исхода во внешний интернет, поэтому `2ip` показывает `151.x`, а nginx видит другое). Поэтому nginx-allowlist теста разрешает:
- `10.9.0.0/24` — заход с **iPhone** (AmneziaWG);
- `172.17.0.0/16` — заход с **ноута** (wg-easy NAT-ит трафик в контейнерный `172.17.0.2` на docker0);
- `127.0.0.1` — loopback / health;
- всё прочее → **`403`** (в т.ч. публичный IP при заходе мимо VPN, и сканеры).

Появился новый способ захода (другой VPN/девайс) — смотреть **реальный** source-IP в `/var/log/nginx/access.log` (поле 1) и добавлять его подсеть, **не гадать**.

**Пользователи ОС:** `deploy` запускает сервисы и **не имеет общего `sudo`** (см. блок в начале файла); рабочий пользователь — `dev`, его `$HOME` под `0700` → `postgres`/`deploy` файлы из `/home/dev/` **не читают** (для обмена — `/tmp`, world-readable).

### S3 (разделение прод/тест)
| Среда | S3 |
|-------|-----|
| **PROD** (`135.x`) | **Selectel** `https://s3.ru-7.storage.selcloud.ru`, регион `ru-7`, bucket `saas-s3`, `S3_FORCE_PATH_STYLE=true` |
| **OLD/TEST** (`151.x`) | старый **MinIO** `fs.bersonservices.ru` (buckets `bersonservices-private/public`) — оставлен под тесты, **read-write** (тестируем и работу с файлами) |

### M2M (integrator ↔ webapp)
На прод-сервере домены `bersoncare.ru` и `tgcarebot.bersonservices.ru` через **`/etc/hosts` → `127.0.0.1`** (loopback) — M2M-проекции остаются внутри сервера, реальный LE-серт валидируется по системным CA. На тесте — аналогично (loopback для тест-домена); отдельных публичных `test-integrator`/`test-tgcarebot` DNS-записей **не нужно**.

### Тест-окружение `test.bersoncare.ru` (на `151.x`, ставится 2026-06)
Боевой тест на **копии реальных прод-данных** — прогон большого merge / миграций / дедуп-скриптов **ДО прода**.
- **🔴 Изоляция отправок (данные настоящие!):** Layer-1 = integrator `applyPreForkDevRedirect` (`DEV_DELIVERY_REDIRECT=1`) переписывает **ВСЕ** исходящие на тест-юзера, по каналам (Telegram/MAX/SMS/email/web-push). **NEW (2026-06-25, commit `17729059`, пока UNPUSHED): passthrough-allowlist** — env `DEV_REDIRECT_PASSTHROUGH_{TELEGRAM,PHONES,MAX,EMAILS,WEB_PUSH}` в `api.test`: получатели-**тест-аккаунты** (админ tg`364943522`/`+79643805480`, юзер tg`7924656602`/`+79189000782`) доставляются на **свои** адреса (чтобы тестить переписку админ↔юзер вживую), все прочие — режутся/редиректятся. Пусто по умолчанию = безопасно (opt-in). Плюс webapp-guard (`dev_mode` + `test_account_identifiers`), **maintenance forced ON**, ключевые настройки залочены DB-триггером.
- **Входящие Telegram на тесте НЕ настроены:** приём только вебхуком `POST /webhook/telegram` (long-polling в коде нет), а вебхук не задан + IP-allowlist режет IP Telegram → `/start`/меню/кнопки не работают. **Только исходящие** (OTP/уведомления/чат) — этого достаточно для проверки send-safety. Web-push на тест-домен требует **свежей** PWA-подписки (восстановленная из дампа привязана к prod-origin/VAPID).
- Тест-БД `bersoncarebot_test` на том же PG16 (`:5432`); порты **`:3300`** (integrator) / **`:6300`** (webapp, чтобы не пересечься с dev `:5200` и прод-портами); **ТЕСТ-токен** бота (не прод); доступ к `test.bersoncare.ru` залочен по IP (см. «Доступы / VPN»).
- **Деплой (факт):** деплой-репо `/opt/projects/bersoncarebot-test` (ветка `feat/doctor-ui-rebuild`, владелец `deploy`), env `/opt/env/bersoncarebot/{api,webapp}.test`, юниты `bersoncarebot-{api,worker,scheduler,webapp,media-worker}-test`. Сейчас обновляется **вручную на боксе** (`git apply` патча → `pnpm build` интегратора → рестарт юнитов); автодеплоя `test`-ветка→CI пока нет.

### Источник истины по топологии
Эта секция — краткая карта. Полная история переезда и текущее состояние — в orchestration-памяти агента (`prod-server-migration-2026-06-18`). Разделы **Production / Development** ниже описывают структуру приложения (юниты, порты, env), общую для прод и теста.

---

## Модель PostgreSQL (обновление 2026-04)

**Актуально:** integrator и webapp используют **одну** базу данных: в `api.prod` и `webapp.prod` задаётся **один и тот же** `DATABASE_URL`. Данные разделены **схемами**: канон пациента и webapp-таблицы — в **`public`**, таблицы integrator — в **`integrator`**. Integrator читает и пишет в обе схемы **напрямую SQL** (роль с `search_path` и GRANT), без обязательного **HTTP** и **worker/ретраев** как основного пути для этих операций. Очередь (`projection_outbox` и т.п.) — **fallback** при временных сбоях и для ещё не переведённого legacy-потока.

Подробно: [`DATABASE_UNIFIED_POSTGRES.md`](./DATABASE_UNIFIED_POSTGRES.md).

---

## Текущее состояние хоста

| Параметр | Значение |
|----------|----------|
| Хост | `localhost` |
| ОС | `Ubuntu 24.04.4 LTS` |
| Runtime model | Node.js напрямую на хосте через `systemd` |
| Reverse proxy | `nginx` |
| База данных | system PostgreSQL на `127.0.0.1:5432`; **одна** runtime-БД для api+webapp, схемы `integrator` + `public` (см. раздел «Модель PostgreSQL») |
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

На хосте установлены и активны (канонические имена юнитов; шаблоны — `deploy/systemd/`):

- `bersoncarebot-api-prod.service`
- `bersoncarebot-worker-prod.service`
- `bersoncarebot-scheduler-prod.service` — integrator `schedule.tick` (напоминания `reminders.planDue` / `reminders.dispatchDue`)
- `bersoncarebot-webapp-prod.service`
- `bersoncarebot-media-worker-prod.service` — FFmpeg HLS transcode (`apps/media-worker`), очередь `public.media_transcode_jobs`; **не** путать с integrator `bersoncarebot-worker-prod`.

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

#### Scheduler

- Unit: **`bersoncarebot-scheduler-prod.service`** (шаблон `deploy/systemd/bersoncarebot-scheduler-prod.service`)
- WorkingDirectory: `/opt/projects/bersoncarebot/apps/integrator`
- EnvironmentFile: `/opt/env/bersoncarebot/api.prod`
- ExecStart: `/usr/bin/node dist/infra/runtime/scheduler/main.js`
- Публичный порт: нет
- Назначение: периодический **`schedule.tick`** → `reminders.planDue` / `reminders.dispatchDue` (см. `apps/integrator/src/content/scheduler/scripts.json`).
- Проверка журнала (пример): `journalctl -u bersoncarebot-scheduler-prod.service -n 80 --no-pager` — ожидается строка **`Scheduler lock acquired, starting scheduler loop`** на единственном лидере.

#### Webapp

- Unit: `bersoncarebot-webapp-prod.service`
- Process: `User=deploy`, `Group=deploy` (шаблон `deploy/systemd/bersoncarebot-webapp-prod.service`; не запускать webapp от root — иначе артефакты под `.next` становятся `root`-owned и деплой не может их удалить)
- WorkingDirectory: `/opt/projects/bersoncarebot/apps/webapp/.next/standalone/apps/webapp`
- EnvironmentFile: `/opt/env/bersoncarebot/webapp.prod`
- Environment: `PORT=6200`, `HOSTNAME=127.0.0.1`
- ExecStart: `/usr/bin/node /opt/projects/bersoncarebot/apps/webapp/.next/standalone/apps/webapp/server.js`
- Port: `127.0.0.1:6200`
- Режим: Next.js standalone (`output: "standalone"` в `next.config.ts`)
- **Mini App auth (логи pino / journal):** маршруты `POST` `auth/telegram-init` и `auth/max-init` пишут структурные поля `route`, `miniappAuthOutcome` (`session_ok` | `denied` | `invalid_body` для Telegram), заголовок **`x-bc-auth-correlation-id`** (клиент задаёт в `AuthBootstrap`). Удобный grep: `miniappAuthOutcome` или строки `Mini App: initData принят`. **Точки входа (2026-05):** канонические пути **`/app/tg`** и **`/app/max`** (RSC `AppEntryRsc`); классификация неавторизованного входа — на сервере в `classifyUnauthenticatedAppEntry` + cookie/`ctx` legacy в `handlePlatformContextRequest` (`apps/webapp/src/middleware/platformContext.ts`, вызывается из `apps/webapp/src/proxy.ts`). Вспомогательная **`classifyEntryHintFromRequest`** в том же модуле покрыта unit-тестами и **не** пробрасывается заголовком (избежание рассинхрона с RSC). Legacy: `?ctx=bot|max` на **`/app`**. Подробности и troubleshooting: [`MINIAPP_AUTH_FIX_EXECUTION_LOG.md`](./MINIAPP_AUTH_FIX_EXECUTION_LOG.md).

#### HLS media-worker (VIDEO_HLS_DELIVERY)

- Unit: `bersoncarebot-media-worker-prod.service`
- WorkingDirectory: `/opt/projects/bersoncarebot/apps/media-worker`
- EnvironmentFile: `/opt/env/bersoncarebot/webapp.prod`
- ExecStart: `/usr/bin/node dist/main.js` (после `pnpm --dir apps/media-worker build` на хосте)
- Public port: нет  
Шаблон юнита: `deploy/systemd/bersoncarebot-media-worker-prod.service`; установка и restart — `deploy/host/deploy-prod.sh`. Подробнее: [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md).

### Ports

| Сервис | Bind |
|--------|------|
| PostgreSQL | `127.0.0.1:5432` |
| Integrator API | `127.0.0.1:3200` |
| Webapp | `127.0.0.1:6200` |
| Integrator worker | без порта |
| Integrator scheduler | без порта |
| HLS media-worker (`apps/media-worker`) | без порта |

### Public URLs / nginx

Подтвержденные BersonCareBot vhost'ы:

- `https://tgcarebot.bersonservices.ru` -> `http://127.0.0.1:3200`
- `https://bersoncare.ru` -> `http://127.0.0.1:6200`

**Файлы конфигурации на production-хосте** (подтверждено 2026-06-08, `nginx -T` + `ls /etc/nginx/sites-available/`):

| Назначение | Файл на диске | `server_name` / примечание |
|------------|---------------|----------------------------|
| Webapp | `/etc/nginx/sites-available/bersoncarebot-webapp` | `bersoncare.ru`, `www.bersoncare.ru`; HTTP → HTTPS; `www` → канон `https://bersoncare.ru`; `proxy_pass http://127.0.0.1:6200` |
| Integrator API | `/etc/nginx/sites-available/tgcarebot.conf` | `tgcarebot.bersonservices.ru` → `127.0.0.1:3200` |
| TLS (webapp) | `/etc/letsencrypt/live/bersoncare.ru/fullchain.pem`, `.../privkey.pem` | Let's Encrypt |

Правки vhost webapp (`client_max_body_size`, `/api/internal/` loopback, maintenance page) — в **`/etc/nginx/sites-available/bersoncarebot-webapp`**, затем `sudo nginx -t && sudo systemctl reload nginx`.

**Страница «идёт обновление» при рестарте webapp** (подтверждено на production **2026-06-08**):

| Параметр | Значение |
|----------|----------|
| Когда показывается | Только при **502/503/504** от upstream `127.0.0.1:6200` (краткий простой на `systemctl restart bersoncarebot-webapp-prod.service`). **Не** на весь деплой: во время `pnpm build` старый процесс продолжает отвечать. |
| nginx | В HTTPS `server {}` для `bersoncare.ru`: `error_page 502 503 504 =200 /maintenance.html;` + `location = /maintenance.html` с `internal` (фрагмент: [`deploy/nginx/webapp-maintenance-pages.example.conf`](../../deploy/nginx/webapp-maintenance-pages.example.conf)) |
| Статика | `/opt/projects/bersoncarebot/apps/webapp/public/maintenance.html` (в репозитории: `apps/webapp/public/maintenance.html`; попадает на хост через `deploy-prod.sh`) |
| Флаг deploy | **Нет** — `/var/lib/bersoncarebot/deploy-maintenance.on` и скрипт `deploy-maintenance.sh` не используются |
| Проверка на хосте | `sudo systemctl stop bersoncarebot-webapp-prod.service` → `curl -s https://bersoncare.ru/app \| head -10` → HTML «BersonCare — обновление» → `sudo systemctl start bersoncarebot-webapp-prod.service` |

Отдельно: **режим техработ пациента** (`patient_app_maintenance_enabled` в admin Settings) — in-app экран при **работающем** webapp; не заменяет nginx-страницу на рестарте.

Журнал внедрения: [`deploy/LOG.md`](../../deploy/LOG.md).

Как найти активный include, если `grep sites-enabled` пустой:

```bash
sudo nginx -T 2>/dev/null | grep -n "bersoncare.ru\|127.0.0.1:6200"
sudo nginx -T 2>/dev/null | grep -n "configuration file.*bersoncarebot-webapp"
```

В `sites-available/` на том же хосте также лежат vhost **других** проектов (`storylama*`, `fs.bersonservices.ru`, `minio.bersonservices.ru`, …) — **не** путать с BersonCareBot.

**Projection health (`projection_outbox`, integrator DB):** канонически **`GET /health/projection`** на хосте integrator (публичный пример: `https://tgcarebot.bersonservices.ru/health/projection`). На webapp добавлены прокси с тем же JSON: **`GET /api/health/projection`**, **`GET /health/projection`**, **`GET /app/health/projection`** — серверный fetch на `{INTEGRATOR_API_URL}/health/projection`; при пустом `INTEGRATOR_API_URL` ответ **503** `integrator_url_not_configured`.

**Operator health probes (MVP, synthetic MAX + Rubitime):** integrator принимает **`POST /internal/operator-health-probe`** только с подписью **`x-bersoncare-timestamp`** + **`x-bersoncare-signature`** (HMAC-SHA256 от `timestamp + '.' + rawBody`, secret — **`INTEGRATOR_WEBHOOK_SECRET`** или **`INTEGRATOR_SHARED_SECRET`** из `api.prod`, длина ≥ 16). Публичного неподписанного доступа нет. Канонический вызов с хоста: скрипт репозитория [`deploy/host/operator-health-probe.sh`](../../deploy/host/operator-health-probe.sh) (по умолчанию `http://127.0.0.1:3200`, переопределение `INTEGRATOR_API_URL`). Периодический запуск — **cron** или **systemd timer** от пользователя с правом `curl` к loopback и чтением `api.prod` (частота: раз в час или реже; см. `deploy/HOST_DEPLOY_README.md`).

Дополнительно в `tgcarebot` vhost есть legacy-path:

- `/admin/` -> `http://127.0.0.1:8080/`

Примечания:

- сайт `default` в nginx всё ещё включен;
- nginx слушает `80` и `443`;
- webapp использует отдельный vhost `bersoncarebot-webapp`.

**OAuth rate limit (`POST /api/auth/oauth/start`):** ключ лимита — только **`X-Real-IP`**, выставляемый nginx (`proxy_set_header X-Real-IP $remote_addr;`). `X-Forwarded-For` для этого лимита приложением не используется. В **production** отсутствие `X-Real-IP` — ошибка конфигурации прокси (ответ **503** `proxy_configuration`), а не деградация с общим bucket. Требования и примеры: `deploy/HOST_DEPLOY_README.md` → Nginx → Webapp → «Client IP and Rate Limiting».

**Кэш HTML vs `/_next/static/` (webapp):** точные заголовки на production в audit не снимались; оператор проверяет `curl -I` и настройки CDN. Рекомендации (nginx без перекрытия `Cache-Control` от Next, политика CDN): `deploy/HOST_DEPLOY_README.md` → Nginx → Webapp → «Кэширование (Next.js, мини-приложение)».

**Загрузка файлов:** для vhost webapp при **прокси-загрузке** по `POST /api/media/upload` (fallback для небольших файлов / не-S3 путей) нужен `client_max_body_size` (рекомендация `55m` — см. `deploy/HOST_DEPLOY_README.md`). **Основной** поток библиотеки CMS — presigned PUT / multipart **напрямую в MinIO**; лимит nginx webapp на эти запросы не действует. В формах CMS и упражнений врач выбирает уже загруженные файлы из библиотеки (`docs/ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md`).

**S3 / MinIO (webapp):** для библиотеки CMS и `media_files` обязательны `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, **`S3_PRIVATE_BUCKET`** — объекты пишутся в **приватный** бакет; отдача через `GET /api/media/:id` (редирект на presigned GET) при **активной сессии** (без сессии — `401`). **`S3_PUBLIC_BUCKET`** опционален (легаси-URL в контенте, возможные будущие публичные ассеты). Ключи env (имена): `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PRIVATE_BUCKET`, `S3_PUBLIC_BUCKET`, `S3_REGION` (часто `us-east-1`), `S3_FORCE_PATH_STYLE` (`true` для MinIO). Опционально **`LOG_LEVEL`** — уровень логов pino в webapp. На **приватном** бакете для presigned PUT из браузера нужен **CORS** с origin `https://bersoncare.ru` и методами `PUT`, `GET`, `HEAD` (аналогично прежней настройке публичного бакета). **Внутренние джобы** (loopback + `Authorization: Bearer <INTERNAL_JOB_SECRET>` для HTTP-эндпоинтов): очередь удаления объектов **`media-pending-delete/purge`**, очистка незавершённых multipart **`media-multipart/cleanup`**, retention почасовой playback‑статистики **`media-playback-stats/retention`**, retention журнала ошибок HLS‑прокси **`media-hls-proxy-errors/retention`**, reconcile очереди HLS‑транскода **`media-transcode/reconcile`** (при включённых флагах в `system_settings`), опциональный тик health-guard для очереди **`integrator_push_outbox`** (**`system-health-guard/tick`** — relay в TG/Max по теме `system_health_db_guard` в `admin_incident_alert_config`, см. `deploy/HOST_DEPLOY_README.md`), **Web Push-only напоминания** (**`reminders/web-push-only/tick`** — host cron **`/etc/cron.d/bersoncarebot-webpush-reminders`**, обязателен после deploy, см. **`deploy/HOST_DEPLOY_README.md`** → «Проверки после deploy» → Host cron jobs). **Превью библиотеки:** предпочтительно отдельный процесс **`pnpm run media-preview:tick`** в каталоге webapp (тот же `webapp.prod`, без Bearer); опционально HTTP **`media-preview/process`** с Bearer — см. **`deploy/HOST_DEPLOY_README.md`**, **`docs/MEDIA_PREVIEW_PIPELINE.md`**. Имена ключей и cron‑примеры: **`deploy/HOST_DEPLOY_README.md`** (раздел Nginx → Webapp → CMS медиа и S3); приватный бакет и политика объектов: `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md`.

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
- опционально **`NEXT_PUBLIC_APP_BASE_URL=https://bersoncare.ru`** — совпадает с каноническим публичным URL приложения (распознавание абсолютных ссылок медиабиблиотеки в Markdown на клиенте; см. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`). Несекретно.
- `DATABASE_URL=...` (после unification — **та же** БД, что в `api.prod`; схема **`public`**)
- `SESSION_COOKIE_SECRET=...`
- `INTEGRATOR_SHARED_SECRET=...`
- `INTEGRATOR_API_URL=https://tgcarebot.bersonservices.ru`
- `ALLOW_DEV_AUTH_BYPASS=...`
- `ALLOWED_TELEGRAM_IDS=7924656602`
- `ADMIN_TELEGRAM_ID=364943522`
- `TELEGRAM_BOT_TOKEN=...`
- `S3_*` — см. блок «S3 / MinIO» выше (`S3_PRIVATE_BUCKET` и др.; приватный бакет для CMS-медиа).
- `INTERNAL_JOB_SECRET` — опционально; если задан, Bearer для внутренних POST **`/api/internal/*`**: purge удаления медиа (**`media-pending-delete/purge`**), multipart cleanup (**`media-multipart/cleanup`**), превью (**`media-preview/process`** — опционально, если не используется **`pnpm run media-preview:tick`** из каталога webapp), retention playback (**`media-playback-stats/retention`**), retention ошибок HLS‑прокси (**`media-hls-proxy-errors/retention`**), retention продуктовой аналитики (**`product-analytics/retention`**), reconcile транскода (**`media-transcode/reconcile`** — см. флаги в admin `system_settings`), тик health-guard очереди integrator (**`system-health-guard/tick`** — см. `deploy/HOST_DEPLOY_README.md`), Web Push-only напоминания (**`reminders/web-push-only/tick`** — обязательный host cron **`/etc/cron.d/bersoncarebot-webpush-reminders`** после deploy). Успешные/ошибочные прогоны internal jobs пишут best-effort tick в **`public.operator_job_status`**; сводка в **`GET /api/admin/system-health`** → **`cronJobs`** (канон ключей: **`apps/webapp/src/modules/operator-health/cronJobRegistry.ts`**). Backup-скрипт **`deploy/postgres/postgres-backup.sh`** пишет **`job_family=backup`**. Cron и nginx для loopback: **`deploy/HOST_DEPLOY_README.md`**.
- `LOG_LEVEL` — опционально (pino в webapp; по умолчанию в коде `info`). **Полнота** operational `info`-логов webapp+integrator в journalctl управляется **без рестарта** admin-флагом **`debug_forward_to_admin`** (`system_settings`, scope `admin`): `false` — только значимое (`warn`/`error`/DLQ/retry-fail/security), `true` — подробные operational `info`. `warn`/`error` пишутся всегда. См. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` и `docs/BACKLOG_TAILS.md`.
- `FFMPEG_PATH=/usr/bin/ffmpeg` — путь к системному ffmpeg (обязателен на prod для preview-воркера медиатеки; без этого используется бинарь из `@ffmpeg-installer`, который на хосте может завершаться `SIGSEGV`).

Для обычного runtime webapp **не нужен** отдельный URL «второй» БД в `webapp.prod` — он совпадает с integrator (`DATABASE_UNIFIED_POSTGRES.md`).

Для cutover/backfill/reconcile/gate-скриптов используется отдельный файл:

#### `/opt/env/bersoncarebot/cutover.prod`

Назначение:

- отдельный ops-only env для `backfill-*`, `reconcile-*`, `projection-health`, `stage*-gate`;
- не используется как runtime env для `bersoncarebot-webapp-prod.service`;
- при **legacy** двух БД позволял не дублировать integrator URL в `webapp.prod`; после unification переменные могут указывать на **одну** базу.

Ожидаемые ключи:

- `DATABASE_URL` — целевая БД webapp-миграций (схема **`public`**); после unification совпадает с `webapp.prod`;
- `INTEGRATOR_DATABASE_URL` или `SOURCE_DATABASE_URL` — источник integrator-данных; после unification часто **та же** строка, что `DATABASE_URL`, либо отдельная только в dev/миграционных сценариях.

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

### systemd / processes (dev)

Канон для **production** — только юниты `bersoncarebot-*-prod` (см. раздел Production). Шаблонов **`bersoncarebot-*-dev.service`** в репозитории **нет**; локальная разработка и dev на сервере — **процессы вручную** (`pnpm webapp:dev` и т.д.), не через установленные dev-юниты systemd. Если на хосте остались старые файлы `*-dev.service` в `/etc/systemd/system/`, их нужно **disable**, удалить и `daemon-reload` (см. [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md)).

### Dev ports (ручной запуск, не prod systemd)

| Сервис | Типично |
|--------|---------|
| Webapp dev | порт из `apps/webapp/.env.dev` (часто `127.0.0.1:5200`) при `pnpm webapp:dev` |
| Integrator dev | при необходимости отдельный процесс; URL в `INTEGRATOR_API_URL` в webapp dev |

### Webapp dev env: подтвержденные ключи

Файл: `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev`

- `NODE_ENV=development`
- `HOST=127.0.0.1`
- `PORT=5200`
- `APP_BASE_URL=http://127.0.0.1:5200`
- опционально **`NEXT_PUBLIC_APP_BASE_URL=http://127.0.0.1:5200`** — для тестов Markdown с абсолютными URL медиа (см. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`)
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

Подтвержденные **имена dev БД** (по env preview в workspace, без секретов; **2026-06-10** — unified dev на audited host):

| Назначение | Файл env | Переменная | Имя БД |
|------------|----------|------------|--------|
| Integrator dev | `/home/dev/dev-projects/BersonCareBot/.env` | `DATABASE_URL` | `bcb_webapp_dev` (та же БД, что webapp) |
| Webapp dev | `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` | `DATABASE_URL` | `bcb_webapp_dev` |
| Dev cutover/backfill/reconcile | `/home/dev/dev-projects/BersonCareBot/.env.cutover.dev` | `INTEGRATOR_DATABASE_URL` | при unified — **тот же** URL, что `DATABASE_URL`; отдельный URL — только legacy cutover |

**Целевая dev-модель:** один `DATABASE_URL` в `.env` и `apps/webapp/.env.dev`, обе схемы `public` + `integrator` в одной базе. Имя `bersoncarebot_dev` как отдельная integrator-only БД — **legacy** (см. [`DATABASE_UNIFIED_POSTGRES.md`](./DATABASE_UNIFIED_POSTGRES.md)).

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
- `deploy/systemd/bersoncarebot-scheduler-prod.service`
- `deploy/systemd/bersoncarebot-webapp-prod.service`
- `deploy/systemd/bersoncarebot-media-worker-prod.service`

### Env templates в репозитории

- `.env.example` (integrator / корень)
- `apps/webapp/.env.example`
- `deploy/env/.env.dev.example` — шаблон integrator dev (`DATABASE_URL`; при unified — та же база, что у webapp)
- `deploy/env/.env.prod.example` — шаблон integrator prod
- `deploy/env/.env.webapp.dev.example`, `deploy/env/.env.webapp.prod.example`
- `deploy/env/.env.cutover.dev.example`, `deploy/env/.env.cutover.prod.example` — backfill/reconcile (два ключа; при unified часто **одинаковая** строка)
- `deploy/env/webapp/.env.dev.example`, `deploy/env/webapp/.env.prod.example` — дубликаты путей для совместимости; канон списка env: [`deploy/env/README.md`](../../deploy/env/README.md)

---

## Database / backup facts

- PostgreSQL слушает только `127.0.0.1:5432`.
- `/opt/backups` существует.
- Каноническая версия скрипта бэкапа в репозитории: [`deploy/postgres/postgres-backup.sh`](../../deploy/postgres/postgres-backup.sh). После unification `DATABASE_URL` в `api.prod` и `webapp.prod` **совпадает** — скрипт по-прежнему читает оба env-файла и может создать **два идентичных дампа** одной БД; имеет смысл упростить до одного прохода. На хосте ожидается установка в `/opt/backups/scripts/postgres-backup.sh` (см. [`deploy/postgres/README.md`](../../deploy/postgres/README.md)). Режимы: `pre-migrations`, `hourly`, `daily`, `manual` — см. скрипт.
- `/opt/env/bersoncarebot` существует и принадлежит `deploy`.
- Команда со снимком `pg_database` в этом audit оборвалась по shell-ошибке, поэтому точные current DB owners в этот документ не включены.
- Для базы и владельцев пока опираться на `deploy/HOST_DEPLOY_README.md`, пока не будет отдельного успешного postgres snapshot.

### Data migration / доступ к БД (production)

**Текущий runtime:** одна БД; `DATABASE_URL` в `api.prod` и `webapp.prod` **одинаковый**. Для SQL в webapp-таблицах используйте схему **`public`**, для integrator — **`integrator`** (или `search_path`, заданный роли).

Файл **`cutover.prod`** и переменные `INTEGRATOR_DATABASE_URL` / `SOURCE_DATABASE_URL` остаются для **legacy** cutover/backfill-скриптов и dev-симметрии; на проде после unification они могут указывать на **ту же** строку, что и `DATABASE_URL` (или быть не нужны — см. конкретный скрипт).

### Миграции: webapp Drizzle (`public`) vs integrator

- **Симптом:** в логах webapp `column "…" does not exist` (например `publication_status` в `test_sets`) при открытии каталогов врача — **не накатили Drizzle-миграции webapp** на ту БД, что в `webapp.prod` (`DATABASE_URL`, схема **`public`**). Новый билд webapp без миграций оставляет схему старой.
- **`pnpm migrate` в корне репозитория** — по очереди: **integrator** (`pnpm --dir apps/integrator run migrate`), затем **webapp Drizzle** (`pnpm --dir apps/webapp run migrate`, каталог `apps/webapp/db/drizzle-migrations`). На production-host скрипт `scripts/migrate-all.sh` автоматически подгружает **`/opt/env/bersoncarebot/api.prod`** и **`/opt/env/bersoncarebot/webapp.prod`** (или пути из `API_ENV_FILE` / `WEBAPP_ENV_FILE`), поэтому достаточно одной команды `pnpm migrate`. Только webapp без integrator: **`pnpm migrate:webapp`**.
- **Пример на production-хосте** (из каталога проекта, пользователь **`deploy`**; затем при необходимости перезапуск webapp):

```bash
cd /opt/projects/bersoncarebot
pnpm migrate
# при необходимости:
# sudo systemctl restart bersoncarebot-webapp-prod.service
```

Канон и backup перед миграциями: [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) (pre-migrations, состав `deploy-prod`).

**Исторические имена БД** (до unification, для старых отчётов; не считать текущим обязательным состоянием):

| Назначение (legacy) | Было (пример) |
|---------------------|---------------|
| Отдельная БД integrator | `tgcarebot` |
| Отдельная БД webapp | `bcb_webapp_prod` |

Подключение к psql на проде (под пользователем, у которого есть доступ к БД):

```bash
# Загрузить env и подключиться (значения не коммитить).
# Обязательно сначала source — иначе DATABASE_URL пустой и psql уйдёт в локальный сокет
# от имени пользователя ОС (часто root) → FATAL: role "root" does not exist.
# После unification оба варианта попадают в одну и ту же БД; для явного search_path:
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SHOW search_path;"
set -a && source /opt/env/bersoncarebot/api.prod && set +a && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT current_schema();"
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
| `INTEGRATOR_DATABASE_URL` для cutover-скриптов | Скрипт требует `cutover.prod`, а файла нет | Для **legacy** двух-БД: создать `cutover.prod` с `DATABASE_URL` = webapp и `INTEGRATOR_DATABASE_URL` = старая integrator БД. После **unification** оба URL часто **совпадают** — см. `DATABASE_UNIFIED_POSTGRES.md`. |
| Имена баз для psql | Не знаете, к какой базе подключаться | `source` нужный env и смотреть имя в `DATABASE_URL` (после последнего `/`). Для схем: `SET search_path TO integrator, public` или префиксы `public.` / `integrator.`. |
| Backup перед миграциями | Не уверены, что дампы создаются | Канонический скрипт: репозиторий `deploy/postgres/postgres-backup.sh` → на хосте `/opt/backups/scripts/postgres-backup.sh`. Запуск: `sudo /opt/backups/scripts/postgres-backup.sh pre-migrations`. После unification возможны **два одинаковых** `*.dump` — нормально до упрощения скрипта. |

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

