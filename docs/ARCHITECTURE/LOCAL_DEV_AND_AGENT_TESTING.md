# Локальная разработка и тестирование (агенты / QA)

Канон для входа в кабинеты **без Telegram**, режимов запуска dev-серверов и живых проверок UI.  
Связанные документы: [`SERVER CONVENTIONS.md`](./SERVER%20CONVENTIONS.md), [`apps/webapp/README.md`](../../apps/webapp/README.md), [`apps/webapp/src/modules/auth/auth.md`](../../apps/webapp/src/modules/auth/auth.md).

---

## 1. Подготовка окружения

```bash
pnpm install
cp .env.example .env
cp apps/webapp/.env.example apps/webapp/.env.dev
# заполните INTEGRATOR_DB_URL, три DATABASE_URL_* webapp, SESSION_COOKIE_SECRET и bootstrap secrets
pnpm run migrate  # первичный bootstrap; существующая DEV — через migrate-dev.sh ниже
```

| Файл                   | Назначение                                         |
| ---------------------- | -------------------------------------------------- |
| `.env`                 | integrator: `INTEGRATOR_DB_URL`                    |
| `apps/webapp/.env.dev` | webapp: `DATABASE_URL_STAFF`, `DATABASE_URL_PATIENT`, `DATABASE_URL_GLOBAL_ADMIN` |
| `.env.cutover.dev`     | ops: backfill/reconcile (не для обычного UI-теста) |

**База физически одна:** PostgreSQL `bcb_webapp_dev` (схемы `public` + `integrator`). В runtime
port-context к ней ведут четыре URL с разными логинами: один integrator URL и три webapp URL выше.
Агрегатный `DATABASE_URL` относится только к отключённому legacy-контексту; обычный DEV runtime и
проверки не должны его требовать. Ops/migration URL живут отдельно в `.env.cutover.dev` — см.
[`DATABASE_UNIFIED_POSTGRES.md`](./DATABASE_UNIFIED_POSTGRES.md) и
[`SERVER CONVENTIONS.md`](./SERVER%20CONVENTIONS.md).

### 1.1 Где UX-агенту смотреть интерфейс

Агент выбирает среду по задаче:

| Нужно                                                                             | Среда                       | Почему                                                                             |
| --------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| Увидеть именно развёрнутый TEST-коммит и реальные tenant/RLS-gates | `https://test.bersoncare.ru` | Это deploy truth; вход — штатный owner email/password |
| Быстро менять код и повторять скриншоты                            | DEV `http://127.0.0.1:5200`  | Hot reload и уже зарегистрированные owner-учётки/клиники |

На именованной DEV нельзя создавать, сидировать, reconcile-ить или требовать persistent fixture-данные;
проверки используют уже зарегистрированные owner-учётки и клиники. Ограничение остаётся на внешние эффекты: из DEV нельзя отправлять
реальные сообщения/SMS, вызывать production endpoints или писать в production S3. PROD-БД wrapper не читает и
не открывает.

### Обычная работа и миграция схемы

| Ситуация                                                              | Действие                                                                                         | Что происходит с данными DEV                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Изменился только код/UI, схема уже актуальна                          | build/restart/dev server; DB-команда не нужна                                                    | Ничего                                                            |
| В текущей ветке есть pending migrations для уже подготовленной DEV-БД | `bash deploy/host/migrate-dev.sh --preflight`, затем `bash deploy/host/migrate-dev.sh --execute` | Существующие данные сохраняются; применяются pending migrations   |

`migrate-dev.sh` принимает только exact local post-cutover `bcb_webapp_dev`. `--preflight` исполняет pending webapp
DDL через NOLOGIN `bcb_dev_migrator` и объявленных владельцев в одной транзакции с обязательным `ROLLBACK`: так
PostgreSQL заранее компилирует тела функций и проверяет зависимости/права, но ledger, схема, роли и данные не
изменяются. Wrapper не читает `/opt/env`, TEST или PROD. `--execute` применяет integrator-миграции через локальный
PostgreSQL admin с `SET ROLE app_object_owner`, а webapp Drizzle — через тот же owner-aware путь. После миграций
wrapper обязательно выполняет declaration reconcile вместе с catalog audit и атомарно синхронизирует
declaration-owned capability JSON в `.env`/`apps/webapp/.env.dev`; deploy-only мигратор остаётся без LOGIN, пароля,
BYPASSRLS и постоянных membership. Wrapper не управляет процессами: перед `--execute` оператор отдельно
координирует единственный DEV server/writer и не поднимает второй Next server.

Обычная разработка не копирует TEST, не пересоздаёт DEV и не запускает полный аудит стен. Security/RLS и
DB-behavior проверяются живым проходом именованного DEV, затем release-gates именованного TEST; отдельной
временной PostgreSQL нет.

Отдельное owner-gated исключение — обновление DEV из **принятого** TEST после зелёной живой приёмки:
`bash deploy/host/refresh-dev-from-test.sh --check`, затем `--execute --confirm-refresh-dev-from-test`
(канон и таблица «что переносится / что остаётся» — [`DB_DUMPS/README.md`](./DB_DUMPS/README.md)). Entrypoint
работает только с двумя существующими именованными базами, не проигрывает историческую цепочку миграций, не
переносит TEST env/credentials/allowlists и не копирует TEST роли, ACL и владельцев. Он не управляет процессами:
единственный DEV writer оператор останавливает сам (`pnpm run dev:stop`), иначе wrapper громко отказывает.

**Node:** ≥22 (`nvm use` по `.nvmrc`).

---

## 2. Порты и URL (dev)

| Сервис                | URL по умолчанию                   | Env                                     |
| --------------------- | ---------------------------------- | --------------------------------------- |
| **Webapp**            | `http://127.0.0.1:5200`            | `apps/webapp/.env.dev` → `HOST`, `PORT` |
| **Integrator API**    | `http://127.0.0.1:4200`            | корневой `.env` → `PORT`                |
| **Prod (не трогать)** | webapp `:6200`, integrator `:3200` | только systemd на хосте                 |

Скрипт `dev:stop` / `kill-local-dev-ports.sh` освобождает **только** dev-порты (5200, 4200), **никогда** 6200/3200.

**Важно для сессий:** открывайте webapp по **`127.0.0.1`**, не `localhost` — cookie и выход (`/api/auth/logout`) ведут себя предсказуемо. Это зафиксировано в UI блока «Режим разработки» на `/app`.

### 2.1 Основной DEV-host и SSH port forwarding

На основном DEV-host webapp запускается обычной проектной командой из корня BersonCareBot:

```bash
pnpm dev:turbo
```

Команда освобождает и проверяет только webapp-порт `5200` и не останавливает integrator на `4200`. Stdout/stderr
самого Next всегда пишутся в обычный файл `apps/webapp/.next/dev-server-turbo.log`; терминал показывает `tail`
этого файла. Поэтому обрыв SSH, Remote Development или терминального viewer не оставляет Next с оборванным pipe
(`EPIPE`), а следующий `pnpm dev:turbo` штатно заменяет listener на `5200`.

Next dev запускается с `--disable-source-maps` и V8 old-space 6 GiB: штатные dev source maps на этом приложении
заполняют неограниченный Node `source_map_cache` несколькими гигабайтами после прохода по staff-разделам. Для
отдельной диагностики server stack trace их можно вернуть командой
`DEV_NEXT_SOURCE_MAPS=1 pnpm dev:turbo`. Встроенный guard останавливает процесс только после трёх
последовательных превышений 12 GiB RSS. Это аварийный потолок, а не резервирование памяти.

Глобальная диагностика horizontal overflow выключена в обычном dev, потому что MutationObserver и пересылка
browser-console в Next создают тяжёлый поток логов. Для отдельного визуального прохода включать явно:
`DEV_HORIZONTAL_OVERFLOW_PROBE=1 pnpm dev:turbo`.

Для входа с рабочей машины через SSH-туннель:

```bash
ssh -N -L 15200:127.0.0.1:5200 dev@151.241.228.122
```

В браузере открывать `http://127.0.0.1:15200`, не `localhost:15200`. Порт `15200` слушается на рабочей машине
SSH-клиентом; отсутствие слушателя `15200` на DEV-host нормально и не означает, что туннель не работает.

---

## 3. Режимы запуска (`pnpm`)

Команды из **корня** репозитория, если не указано иное.

### 3.1 Webapp (UI)

| Команда                                 | Что делает                                                               | Когда использовать                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `pnpm run dev`                          | **Параллельно** integrator + webapp (`tsx watch` + `next dev --webpack`) | Полный стек: бот-API, webhooks, SMS relay, сценарии с integrator    |
| `pnpm run webapp:dev`                   | Только webapp; перед стартом `kill-local-dev-ports`                      | UI врача/пациента, API routes webapp, **без** integrator            |
| `pnpm run dev:turbo`                    | Webapp на **Turbopack** (`next dev`, без `--webpack`)                    | Быстрый HMR при правках React/страниц                               |
| `pnpm --dir apps/webapp run dev:visual` | Webapp **webpack** + `WATCHPACK_POLLING` / `CHOKIDAR_USEPOLLING`         | Удалённая FS, Docker volume, VM — когда hot reload «не видит» файлы |
| `pnpm run dev:stop`                     | Остановить слушатели на dev-портах webapp + integrator                   | Перед повторным стартом, если порт занят                            |

Эквиваленты **внутри** `apps/webapp`:

```bash
pnpm dev          # webpack, 127.0.0.1:5200
pnpm dev:turbo    # turbopack
pnpm dev:visual   # webpack + polling
pnpm dev:stop
```

**Выбор по задаче:**

- Правки **только** doctor/patient страниц и webapp API → `webapp:dev` или `dev:turbo` достаточно.
- Тест **доставки**, projection, integrator webhooks, `POST /api/integrator/*` → `pnpm run dev` (оба процесса).
- Агент в headless/удалённой среде без нормального file watch → `dev:visual`.

### 3.2 Integrator (отдельно)

| Команда                   | Процесс                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm run dev:integrator` | API Fastify (`tsx watch src/main.ts`)                                                           |
| `pnpm run scheduler:dev`  | Резидентный scheduler+worker (D30 Ш9): `schedule.tick`/напоминания + outgoing delivery/direct-write retries |

Резидентный процесс — **второй терминал**, если нужны фоновые джобы без полного `pnpm run dev`.

### 3.3 Media-worker

```bash
pnpm --dir apps/media-worker run dev
```

Нужен для HLS-транскода медиатеки; для большинства UI-тестов кабинета **не обязателен**.

### 3.4 Production-сборка локально (редко)

```bash
pnpm run build:webapp
pnpm run webapp:start   # next start — порт из env, не hot reload
```

Для агентского UI-smoke обычно **не** требуется.

---

## 3a. Провизионинг dev-базы: чего dev не получает, а TEST получает

**Проблема, которая стоит за этим разделом (замер 01.08).** TEST при каждой выкатке прогоняет скрипты из
`deploy/postgres/`, которые выдают права и — что важнее — назначают ВЛАДЕЛЬЦА функциям схемы `app`
(`ALTER FUNCTION … OWNER TO app_owner`). У dev такой автоматики нет вовсе, и база уезжает. За одну ночь
это дало четыре разных молчаливых отказа подряд: вход персонала (`permission denied for schema app`),
пациентский путь (`permission denied for function is_staff` у владельца SECURITY DEFINER-функции),
пустой принципал пациента (наружу выглядел как «нет активной записи в клинику») и нулевое чтение настроек
приложения.

**Масштаб на 01.08:** в схеме `app` на dev **152 функции принадлежат `bcb_webapp_dev_user` и 39 —
`app_owner`**. Проверка:

```bash
sudo -u postgres psql -d bcb_webapp_dev -At -c "SELECT pg_get_userbyid(proowner), count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' GROUP BY 1"
```

Почему это ломает молча: такие функции — SECURITY DEFINER, а таблицы под FORCE RLS подчиняют политикам и
владельца тоже. `bcb_webapp_dev_user` не входит ни в одну из ролей, которым политики что-то разрешают, и
у `app_owner` (в отличие от него) стоит `BYPASSRLS`. Поэтому аксессор не падает, а возвращает **ноль
строк** — и код, который на неудачное чтение подставлял константу из исходника, годами работал на
константах вместо настроек админки. Отказ стал видимым только тогда, когда подстановку убрали.

**Что уже выдано dev-скриптами** (применять `sudo -u postgres psql -d bcb_webapp_dev -f <файл>`):
`dev-c0-runtime-logins.sql` — рантайм-логины; `dev-c1-bootstrap-schema-app-grants.sql` — доступ к схеме
`app`, установка и снятие принципала обоим пулам, право владельца definer-функции звать `app.is_staff()`.

**Что НЕ выровнено и ждёт работы:** владельцы остальных функций схемы `app`. Источник истины — сами
скрипты `deploy/postgres/*.sql`: в них перечислено поимённо, какая функция обязана принадлежать
`app_owner`. Всё, что не объявлено ни одним скриптом, — не догадка, а вопрос; такие функции перечислять,
а не переназначать наугад.

---

## 3b. Candidate сначала проверяется, затем приземляется (владелец, 21.08)

**ЗАМЕНЕНО 21.08.2026:** прежняя blanket-последовательность «сделал → приземлил → впервые проверил живьём»
не действует. Landing не используется как способ узнать, работает ли кандидат.

До landing ветка проходит затронутые тесты, независимый аудит и применимую живую проверку отдельным verifier:
UI/runtime — на изолированном candidate-порту, DB migration — owner-aware rollback-only preflight на именованной
DEV с реальными statement owners и `FORCE RLS`. Голый прогон SQL от `postgres` не подходит. Для миграции порядок:
candidate rollback-preflight → проверки → аудит → landing → повторный интеграционный preflight → `--execute`.
Post-landing общий сервер подтверждает уже проверенное интеграционное дерево, а не принимает непроверенную ветку.

**Если сервер уже занят кем-то:** сначала посмотреть, что там (`curl -s -o /dev/null -w '%{http_code}'
http://127.0.0.1:5200/api/me` — живой сервер отвечает, а не молчит), подождать, обновить страницу.
Перезапускать — только если правка требует перезапуска и на сервере никто не работает.

**Чего не делать никому:**

- ⛔ Не запускать `pnpm dev`, `pnpm dev:turbo`, `pnpm webapp:dev` ради своей проверки: они СНАЧАЛА убивают
  слушателей порта (`scripts/kill-local-dev-ports.sh`) и занимают 5200, роняя общий сервер и чужие идущие
  прогоны. 01.08 так дважды обрывалась проверка посреди работы.
- ⛔ Не возвращать работу со словами «среда не позволяет проверить». Инструменты есть: `pnpm migrate`,
  `pnpm migrate:legacy`, все режимы запуска. Проверка не сделана — назвать точную команду и её вывод.

**Candidate-прогон** использует свой порт из 5210–5219 и запуск мимо скриптов-убийц: `cd apps/webapp && pnpm migrate && npx next dev
-H 127.0.0.1 -p 5210`. Порты 4200 (интегратор), 3200 и 6200 (прод на этом же боксе) не трогать.

---

## 4. Обычный вход и dev-only clear-session helper

На DEV/TEST проверки ролей проходят только штатным email/password, OAuth или messenger-входом уже зарегистрированных owner-учёток и клиник. Не создавайте fixture-учётки, не используйте token/preset-вход и не читайте пароли из env. Постоянный контракт owner-входа записан только в `AGENTS.md` §1a.

`/api/auth/dev-public` сохранён только как dev-only helper для очистки текущей session-cookie и context-cookies перед обычным публичным входом или регистрацией. Он доступен только при `NODE_ENV=development` и `ALLOW_DEV_AUTH_BYPASS=true`; authenticated role или session он не создаёт.

- Чистый public/login: `http://127.0.0.1:5200/api/auth/dev-public`.
- Чистая регистрация специалиста и клиники: `http://127.0.0.1:5200/api/auth/dev-public?view=clinic-registration`.
- На TEST/production-like открывайте чистый/инкогнито-профиль на `/app`; helper туда не переносится.

---

## 5. DEV/TEST определяется env

`TEST=true` и `TEST_ACCOUNT_*` задаются deploy-окружением, а не `system_settings`. Подробные логи и диагностические поверхности включаются автоматически в DEV/TEST. Локальный DEV подавляет внешнюю доставку целиком; развернутый TEST пропускает через финальный integrator-gate только исходных получателей из `TEST_ACCOUNT_*`, без редиректа и без изменения preview.

---

## 5.1 Матрица скриншотов интерфейса по ролям

Для оценки состава экранов используйте отдельный browser profile/cookie jar на каждую уже зарегистрированную owner-роль и не переиспользуйте сессии. Public/registration можно очистить через `/api/auth/dev-public`; авторизованные срезы проходят штатным входом соответствующей owner-учётки. Не коммитьте runtime screenshots.

---

## 6. Типовые сценарии тестирования

### 6.1 UI кабинетов

Запустите нужный dev-режим только по правилам §3b, откройте `/app` и войдите штатным способом уже зарегистрированной owner-учётки. После сессии переходите на нужный кабинет или настройки по обычному URL.

### 6.4 Напоминания / scheduler / доставка в бот

```bash
pnpm run dev                    # API + webapp
# опционально в другом терминале:
pnpm run scheduler:dev
```

### 6.5 После правок схемы БД

```bash
bash deploy/host/migrate-dev.sh --preflight
bash deploy/host/migrate-dev.sh --execute
# при необходимости обновить docs/ARCHITECTURE/DB_STRUCTURE.md
```

Для канонической `bcb_webapp_dev` используйте wrapper выше: он проверяет точную локальную post-cutover БД,
запускает owner-ordered pending migrations и возвращает её к декларативному deny-by-default состоянию без
reset/restore.

### 6.6 SaaS diagnostics contour (System Health)

В target port-context отдельного `SAAS_ISOLATION_OPERATOR_DATABASE_URL` нет: защищённый System Health идёт
через штатный staff-порт и его декларативную capability `saas_telemetry_operator`. Права и membership приезжают
из общего privilege reconcile; DEV-скрипт не создаёт логины и не выдаёт ручные права.

После миграций и privilege reconcile обновить тело защищённого агрегата:

```bash
bash deploy/host/provision-dev-saas-diagnostics.sh
```

Скрипт берёт роль из `DATABASE_URL_STAFF`, применяет только System Health aggregate и проверяет связку
staff-порт → telemetry-role → protected functions. Перезапуск webapp для этого не нужен: URL не меняется.

---

## 7. Автотесты (не путать с живым UI)

| Команда                       | Область                                     |
| ------------------------------ | -------------------------------------------- |
| `pnpm test:webapp:fast`        | Vitest project `fast` (шардируется в CI)     |
| `pnpm test:webapp:behavior`    | Projects `unit` + `route` + `ui`             |
| `pnpm test:webapp`             | все четыре project сразу                     |
| `pnpm run ci`                  | полный барьер перед push                     |

Политика: [`.cursor/rules/test-execution-policy.md`](../../.cursor/rules/test-execution-policy.md), [`apps/webapp/e2e/README.md`](../../apps/webapp/e2e/README.md).

Opt-in тесты с реальной БД: `USE_REAL_DATABASE=1` + специфичные `RUN_*_DEV_DB=1` — см. комментарии в конкретных `*.integration.test.ts`.

---

## 8. Частые ошибки

| Симптом                             | Причина                                                  | Решение                                        |
| ----------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Редирект на `/app` без сессии       | Обычный вход не завершён                                 | Завершить штатный email/password, OAuth или messenger flow |
| Сессия «залипает» / logout странный | Открыли `localhost` вместо `127.0.0.1`                   | Использовать `127.0.0.1:5200`                  |
| Порт занят                          | Старый `next dev`                                        | `pnpm run dev:stop`, затем снова старт         |
| 401 на integrator-зависимых фичах   | Запущен только webapp                                    | `pnpm run dev` или отдельно `dev:integrator`   |
| Admin API 403                       | У owner-учётки нет global-admin роли                     | Войти зарегистрированной global-admin owner-учёткой |

---

## 9. Связанные маршруты входа

- `/app` — публичный OAuth / email / phone (нужны настроенные провайдеры в `system_settings`).
- `/app/tg`, `/app/max` — Mini App (нужен реальный initData мессенджера).
- `?t=<integrator-jwt>` — обмен токена из бота (`exchangeIntegratorToken`).

Подробно: [`auth.md`](../../apps/webapp/src/modules/auth/auth.md).

### 3в. Две ловушки, на которых агенты встают насмерть (01.08)

**Файлы `.env*.example` внутри песочницы выглядят как `/dev/null`.** Символьное устройство вместо
обычного файла, владелец `root` — это МАСКА ПЕСОЧНИЦЫ агента (порт закрывает файлы с учётными данными),
а не порча репозитория. В главном дереве это обычные файлы, `git status` чист. За одну ночь на этом
встали три прогона: двое пометили «character-device артефакт песочницы» в отчёте и пошли дальше, третий
остановился и попросил разрешения «починить» через `git checkout --`. Чинить нечего.

Практическое следствие: `deploy/host/migrate-dev.sh --preflight` внутри песочницы ОТКАЗЫВАЕТ — его
проверка канонического файла справедливо не признаёт `deploy/env/empty.local-migration.env` обычным
файлом. **Миграции на dev агент гоняет через `node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs`**,
и это работает.

**Мигратор решает по водяному знаку времени, а не по хешу файла.** Установленный drizzle применяет
запись журнала, только если её `when` СТРОГО БОЛЬШЕ максимального `created_at` в
`drizzle.__drizzle_migrations`. Отсюда неочевидное: **переномерация миграции ломает уже применённую
базу**. Живой случай 01.08 — две работы взяли номер 0289, лид отдал 0289 стартовому тарифу, а возвраты
переномеровал в 0290. Но dev успел применить возвраты, пока они были 0289, и водяной знак встал ровно на
отметке 0289. Итог: миграция стартового тарифа НИКОГДА бы не применилась на dev (её `when` не больше
знака), таблицы там не было вовсе, а 0290 падала с `42P07` — объект уже есть под другим именем.

Что это значит на практике: **переномеровал миграцию — проверь, не применена ли старая нумерация на
dev**. TEST и прод при этом в порядке, если они не успели применить ни ту, ни другую. Починка dev —
дописать в `drizzle.__drizzle_migrations` строки с `sha256` содержимого файла и нужным `created_at`
(хеш считается ровно так: `crypto.createHash('sha256').update(<весь текст файла>)`), после чего обычный
прогон мигратора доедет до конца.
