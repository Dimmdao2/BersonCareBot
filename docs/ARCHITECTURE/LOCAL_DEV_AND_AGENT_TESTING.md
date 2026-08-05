# Локальная разработка и тестирование (агенты / QA)

Канон для входа в кабинеты **без Telegram**, режимов запуска dev-серверов и живых проверок UI.  
Связанные документы: [`SERVER CONVENTIONS.md`](./SERVER%20CONVENTIONS.md), [`apps/webapp/README.md`](../../apps/webapp/README.md), [`apps/webapp/src/modules/auth/auth.md`](../../apps/webapp/src/modules/auth/auth.md).

---

## 1. Подготовка окружения

```bash
pnpm install
cp .env.example .env
cp apps/webapp/.env.example apps/webapp/.env.dev
# заполните DATABASE_URL, SESSION_COOKIE_SECRET, INTEGRATOR_* — см. комментарии в файлах
pnpm run migrate  # первичный bootstrap; существующая DEV — через migrate-dev.sh ниже
```

| Файл                   | Назначение                                         |
| ---------------------- | -------------------------------------------------- |
| `.env`                 | integrator (API, worker при необходимости)         |
| `apps/webapp/.env.dev` | webapp Next.js                                     |
| `.env.cutover.dev`     | ops: backfill/reconcile (не для обычного UI-теста) |

**База:** одна PostgreSQL `bcb_webapp_dev` (схемы `public` + `integrator`), один `DATABASE_URL` в обоих env — см. [`DATABASE_UNIFIED_POSTGRES.md`](./DATABASE_UNIFIED_POSTGRES.md).

### 1.1 Где UX-агенту смотреть интерфейс

Агент выбирает среду по задаче:

| Нужно                                                                             | Среда                       | Почему                                                                             |
| --------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| Увидеть именно развёрнутый TEST-коммит, TEST-фикстуры и реальные tenant/RLS-gates | `https://test.bersoncare.ru` | Это deploy truth; вход — штатный email/password из защищённого TEST fixture packet |
| Быстро менять код и данные, делать повторные скриншоты                            | DEV `http://127.0.0.1:5200`  | Hot reload, dev-bypass и свободные изменения `bcb_webapp_dev`                      |

`bcb_webapp_dev` — рабочая песочница: её разрешено сидировать и менять для разработки/UX.
Ограничение остаётся на внешние эффекты: из DEV нельзя отправлять
реальные сообщения/SMS, вызывать production endpoints или писать в production S3. PROD-БД wrapper не читает и
не открывает.

### Обычная работа и миграция схемы

| Ситуация                                                              | Действие                                                                                         | Что происходит с данными DEV                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Изменился только код/UI, схема уже актуальна                          | build/restart/dev server; DB-команда не нужна                                                    | Ничего                                                            |
| В текущей ветке есть pending migrations для уже подготовленной DEV-БД | `bash deploy/host/migrate-dev.sh --preflight`, затем `bash deploy/host/migrate-dev.sh --execute` | Существующие данные сохраняются; применяются pending migrations   |

`migrate-dev.sh` принимает только exact local `bcb_webapp_dev`/`bcb_webapp_dev_user`, сначала выполняет read-only
preflight и не читает `/opt/env`, TEST или PROD. `--execute` запускает обычный общий `pnpm run migrate` без
изменения ролей/ACL, восстановления runtime overlays или специальных repair-шагов. Wrapper не управляет процессами:
перед `--execute` оператор отдельно координирует единственный DEV server/writer и не поднимает второй Next server.

TEST→DEV destructive refresh и DEV runtime-rehydrate удалены решением владельца 2026-07-30. Обычная разработка
не копирует TEST, не пересоздаёт DEV и не запускает полный аудит стен. Security/RLS acceptance остаётся в
disposable PostgreSQL tests и TEST release gates.

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

| Команда                   | Процесс                                 |
| ------------------------- | --------------------------------------- |
| `pnpm run dev:integrator` | API Fastify (`tsx watch src/main.ts`)   |
| `pnpm run worker:dev`     | Worker: projection, outgoing delivery   |
| `pnpm run scheduler:dev`  | Scheduler: `schedule.tick`, напоминания |

Worker и scheduler — **второй терминал**, если нужны фоновые джобы без полного `pnpm run dev`.

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
`app`, установка и снятие принципала обоим пулам, право владельца definer-функции звать `app.is_staff()`;
`dev-c2-dev-bypass-fixture.sql` — учётки всех четырёх пресетов дев-входа, членства и запись пациента в
клинику.

**Что НЕ выровнено и ждёт работы:** владельцы остальных функций схемы `app`. Источник истины — сами
скрипты `deploy/postgres/*.sql`: в них перечислено поимённо, какая функция обязана принадлежать
`app_owner`. Всё, что не объявлено ни одним скриптом, — не догадка, а вопрос; такие функции перечислять,
а не переназначать наугад.

---

## 3b. Один сервер на всех: сделал → приземлил → запустил (владелец, 01.08)

Владелец 01.08, дословно: «да просто надо поднимать сервер для всех сразу. Свести ветки и поднять. Если
прям надо поднять самому — то отдельно можно, но это бред» и «проверки на сервере идут когда всё уже
сделано в коде, верно? значит сделал — приземлил — запустил. Если кто-то уже на сервере — проверил,
подождал, обновил, перезапустил если надо».

**Порядок, обязательный для всех:**

1. **Сделал** — работа доведена в своём клоне, типы и затронутые тесты зелёные.
2. **Приземлил** — прошла независимая проверка, ветка сведена в общую (`tools/orch-launch.sh land`).
3. **Запустил** — общий dev на порту 5200 поднят на общей ветке и проверка идёт на нём.

Проверка живьём — это шаг ПОСЛЕ приземления, а не до. Отсюда правило для оркестратора: **не копить
приземления**. Ветка, прошедшая аудит и не сведённая, — это работа, которую физически негде посмотреть,
и исполнитель вернёт непроверенное. 01.08 так вышло дважды (возврат по К2, ответ провайдера по К4).

**Если сервер уже занят кем-то:** сначала посмотреть, что там (`curl -s -o /dev/null -w '%{http_code}'
http://127.0.0.1:5200/api/me` — живой сервер отвечает, а не молчит), подождать, обновить страницу.
Перезапускать — только если правка требует перезапуска и на сервере никто не работает.

**Чего не делать никому:**

- ⛔ Не запускать `pnpm dev`, `pnpm dev:turbo`, `pnpm webapp:dev` ради своей проверки: они СНАЧАЛА убивают
  слушателей порта (`scripts/kill-local-dev-ports.sh`) и занимают 5200, роняя общий сервер и чужие идущие
  прогоны. 01.08 так дважды обрывалась проверка посреди работы.
- ⛔ Не возвращать работу со словами «среда не позволяет проверить». Инструменты есть: `pnpm migrate`,
  `pnpm migrate:legacy`, все режимы запуска. Проверка не сделана — назвать точную команду и её вывод.

**Свой отдельный прогон — исключение**, и только когда проверять надо ДО приземления, а приземлить нельзя.
Тогда свой порт из 5210–5219 и запуск мимо скриптов-убийц: `cd apps/webapp && pnpm migrate && npx next dev
-H 127.0.0.1 -p 5210`. Порты 4200 (интегратор), 3200 и 6200 (прод на этом же боксе) не трогать.

---

## 4. Dev-bypass: вход без Telegram и без ручного OAuth

### 4.1 Условия

В `apps/webapp/.env.dev`:

```env
ALLOW_DEV_AUTH_BYPASS=true
NODE_ENV=development
```

- Bypass работает **только** при `NODE_ENV=development` и `ALLOW_DEV_AUTH_BYPASS=true`; `test` и `production` его не принимают.
- **Не** читайте `.env` ради паролей — для теста используйте готовые токены ниже.

Реализация: `GET /api/auth/dev-bypass`, пресеты в `apps/webapp/src/modules/auth/service.ts`.

### 4.2 Токены (фиксированные, не секреты)

| `token`            | Роль в сессии                               | Admin mode         | Типичное использование                                                              |
| ------------------ | ------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------- |
| `dev:admin`        | `admin` + membership `assistant`            | **всегда включён** | Настройки `/app/doctor/admin/*`, audit-log, system-health, merge, опасные admin API |
| `dev:clinic-admin` | `doctor` + membership `owner`               | нет                | Управление своей клиникой (`Врачи`, `Настройки клиники`) без global-admin экранов   |
| `dev:doctor`       | `doctor` + membership `doctor` + specialist | нет                | Кабинет специалиста без admin-only экранов                                          |
| `dev:client`       | `client`                                    | —                  | Кабинет пациента                                                                    |

Когда включён DB-backed identity port, каждый `dev:*` preset требует уже подготовленные synthetic
`platform_users` + точную messenger binding из preset. Dev bypass на входе делает только read-only lookup;
отсутствующая binding завершает вход fail-closed и не создаёт пользователя, не вставляет и не переназначает
`user_channel_bindings`. Поэтому эти четыре аккаунта должны быть подготовлены одноразовым DEV seed/setup до
проверки входа; это не runtime account-creation path и не основание расширять D3.4 SELECT-only grants.

В `legacy-guc`/`shadow` три staff-токена идемпотентно создают/чинят общую `DEV UX Clinic` и своё единственное
active membership, а все четыре токена синхронизируют preset phone. `dev:doctor` получает отдельного specialist,
`dev:clinic-admin` — owner-membership и отдельного specialist, `dev:admin` — минимальный `assistant` membership
без specialist (права global admin даёт platform-role + `adminMode`, а не ownership клиники).

В `locked` dev bypass полностью read-only: найденный по binding аккаунт обязан уже иметь точный preset phone;
отсутствующий или отличный phone завершает вход fail-closed. Phone, role, organization, membership и specialist
на входе не исправляются. Это сохраняет D3.4 bootstrap surface SELECT-only.

#### 4.2.1 Разовая подготовка dev-bypass после создания свежей DEV-БД

Это отдельный one-time setup **после** разрешённого restore/seed и migrations, но **до** финального переключения
этой DEV-БД в `locked`. Он не является deploy, reset или частью обычного перезапуска приложения.

1. Убедиться, что разрешённый DEV dump/seed уже содержит все четыре synthetic `platform_users` и их точные preset
   messenger bindings. Запустить webapp в `legacy-guc` (либо в уже настроенном write-capable dev mode) с DEV-only
   `DATABASE_URL`; production URL/secrets не использовать. Если binding отсутствует, остановиться: runtime её не
   создаёт, D3.4 grants не расширять, ручной ad hoc SQL не писать — сначала исправить утверждённый DEV seed/source.
2. Не поднимать второй Next server: сначала проверить владельца процесса через `pgrep -af next`. На единственном
   DEV server последовательно открыть каждый токен; это один раз синхронизирует phones и создаст/починит staff
   workspace:

   ```bash
   for token in client doctor clinic-admin admin; do
     curl -fsS -o /dev/null -c "/tmp/bcb-dev-${token}.cookies" -L \
       "http://127.0.0.1:5200/api/auth/dev-bypass?token=dev%3A${token}"
   done
   ```

3. Контролируемо остановить только этот DEV server, вернуть в `.env.dev`
   `DB_PRINCIPAL_CONTEXT_MODE=locked` и locked dual-pool URLs, не меняя signing secret. Проверить permission `0600`
   как в разделе 3, затем запустить ровно один DEV server заново.
4. Повторить четыре входа и для каждого cookie проверить `/api/me`; все четыре запроса должны вернуть успешную
   сессию. В этом проходе DB не меняется: любой fail означает drift/missing preparation, а не повод дать runtime
   `UPDATE`/`INSERT` права.

Cookie jars из `/tmp` после проверки удалить. Эту последовательность не повторяют при code-only deploy, build,
обычном restart или UI-разработке; она нужна только для новой/заново подготовленной DEV-БД.

### 4.3 Способы входа

**Public / registration без сессии**

Это не authenticated role и не `dev:*` token. Dev-only helper сначала очищает текущую session-cookie:

```text
# Чистый public/login
http://127.0.0.1:5200/api/auth/dev-public

# Чистая общая форма: специалист + создаваемая им клиника
http://127.0.0.1:5200/api/auth/dev-public?view=specialist-registration
http://127.0.0.1:5200/api/auth/dev-public?view=clinic-registration
```

Helper доступен только при тех же `NODE_ENV=development` + `ALLOW_DEV_AUTH_BYPASS=true`; он очищает session,
`bersoncare_platform` и `bersoncare_messenger_surface`, чтобы старый Mini App context не влиял на public screen.
Первый URL показывает обычный публичный вход; patient email-flow регистрирует нового пациента, если email ещё
не существует. Оба registration URL ведут в один канонический flow: специалист вводит `Email`, пароль, своё
имя и название организации; после подтверждения создаются клиника, её owner-membership и профиль специалиста. Отдельной
«регистрации клиники без специалиста» в продукте нет.

Эти helper-URL работают только в DEV. На TEST/production-like нужно открыть чистый/инкогнито-профиль на `/app`, а затем
выбрать `Я специалист`. TEST deploy детерминированно включает `specialist_signup_enabled`; production по-прежнему default-off.

**A. Прямой URL (лучший для агента / curl / чистый браузер)**

```
http://127.0.0.1:5200/api/auth/dev-bypass?token=dev%3Aadmin
```

Параметры:

- `token` — один из `dev:client` | `dev:doctor` | `dev:clinic-admin` | `dev:admin` (URL-encode `:` → `%3A`).
- `next` — путь после входа. **Только для `dev:client`:** безопасные пути внутри `/app/patient/*` (кроме `bind-phone`). Для staff-токенов параметр `next` **игнорируется** — всегда редирект на `/app/doctor`; дальше переходите на нужный маршрут вручную или через browser automation.

Примеры:

```text
# Админ → /app/doctor (дефолт)
/api/auth/dev-bypass?token=dev%3Aadmin

# Врач → /app/doctor, затем в браузере /app/doctor/schedule
/api/auth/dev-bypass?token=dev%3Adoctor

# Администратор клиники → /app/doctor с owner-доступом, но без global admin mode
/api/auth/dev-bypass?token=dev%3Aclinic-admin

# Пациент → конкретная страница (next работает)
/api/auth/dev-bypass?token=dev%3Aclient&next=/app/patient/home
```

**B. Через `/app?t=…`**

```
http://127.0.0.1:5200/app?t=dev:admin
```

RSC `AppEntryRsc` перенаправит на `/api/auth/dev-bypass?token=…`.

Алиас query: `token` вместо `t`.

**C. Кнопки на `/app`**

При включённом bypass на странице входа есть отдельные кнопки пациента, специалиста, администратора клиники и глобального администратора.

### 4.4 Проверка сессии без UI

```bash
# 1) установить cookie
curl -s -c /tmp/bcb-dev.cookies -b /tmp/bcb-dev.cookies -L \
  "http://127.0.0.1:5200/api/auth/dev-bypass?token=dev%3Aadmin&next=/app/doctor"

# 2) проверить роль
curl -s -b /tmp/bcb-dev.cookies "http://127.0.0.1:5200/api/me"
```

Ожидается JSON с `user.role` (`admin` | `doctor` | `client`).

### 4.5 Выход

```
http://127.0.0.1:5200/api/auth/logout
```

или кнопка выхода в shell. Снова зайти — новый dev-bypass URL (не нужен «очищенный кэш Chrome», достаточно logout или инкогнито).

### 4.5.1 Переключение ролей для UX-аудита

- В одном браузерном профиле: откройте нужный dev-bypass URL — новая session заменит старую.
- Вернуться к public/registration: `/api/auth/dev-public?view=login` или
  `/api/auth/dev-public?view=clinic-registration` — helper
  сначала очищает session.
- Для одновременных сравнений используйте отдельный profile/cookie jar на роль; не пытайтесь держать две роли в
  одной cookie jar.

### 4.6 Browser / MCP (Cursor)

1. Запустить `pnpm run webapp:dev` (или `dev:turbo`).
2. `browser_navigate` на dev-bypass URL с нужным `token` и `next`.
3. Для doctor-страниц **не** ходить на `/app/doctor/...` без предварительной сессии — получите redirect на login.

Навигация кабинета врача: [`DOCTOR_CABINET_NAVIGATION.md`](./DOCTOR_CABINET_NAVIGATION.md).

### 4.7 Headless-скриншоты без браузер-MCP (curl + chromium)

Когда браузер-MCP/расширение недоступны, а нужны **скриншоты авторизованных** doctor-страниц из CLI. Проверено на этой машине (`/usr/bin/chromium-browser`). Двухшаговая схема — иначе сессия не подхватится.

```bash
# 0) поднять webapp (грузит .env.dev: ALLOW_DEV_AUTH_BYPASS=true + DATABASE_URL)
( set -a && source apps/webapp/.env.dev && set +a && pnpm --dir apps/webapp dev ) &   # 127.0.0.1:5200

PROF="$PWD/.shots/prof"; B="http://127.0.0.1:5200"   # профиль и скриншоты — в персистентный путь (НЕ /tmp)

# ШАГ A — авторизовать профиль. КРИТИЧНО: БЕЗ --virtual-time-budget,
#         иначе chromium выходит до флаша cookie на диск и шаг B упрётся в login.
timeout 50 chromium-browser --headless --no-sandbox --disable-gpu \
  --user-data-dir="$PROF" --screenshot="$PWD/.shots/_auth.png" \
  "$B/api/auth/dev-bypass?token=dev%3Aadmin"
# проверка: в профиле появился session-cookie
find "$PROF" -name Cookies -exec sh -c 'strings "$1" | grep -c bersoncare_webapp_session' _ {} \;

# ШАГ B — целевая страница тем же профилем. Здесь virtual-time-budget нужен,
#         чтобы прогрузились клиентские чанки/данные (KPI, фид и т.п.).
timeout 60 chromium-browser --headless --no-sandbox --disable-gpu --hide-scrollbars \
  --window-size=1480,1024 --virtual-time-budget=13000 --user-data-dir="$PROF" \
  --screenshot="$PWD/.shots/page.png" \
  "$B/app/doctor/schedule?tab=cal"
```

Грабли (все встречены вживую):

- **`next` для `dev:doctor`/`dev:admin` игнорируется** (§4.3) → на целевой маршрут ведём в шаге B, а не через redirect bypass.
- **`--virtual-time-budget` на шаге A ломает персист cookie** (резкий выход до флаша) → на auth-шаге его НЕ ставить; повторное использование профиля без cookie = редирект на login.
- Только **`127.0.0.1`**, не `localhost`. Нужен **`--no-sandbox`**. Скриншоты писать в **персистентный** путь (project dir): файлы в `/tmp` между вызовами могут не сохраняться.
- Интерактив (клики по дню, drag-n-drop, выбор дней) одним `--screenshot` не снять — для этого нужен реальный браузер-MCP; deep-link-параметры (`?tab=`, `?view=`) частично заменяют клики.

Чистый бэкенд-чек без рендера — через cookie jar (см. §4.4):

```bash
J=/tmp/bcb.cookies
curl -s -c $J -b $J -L "$B/api/auth/dev-bypass?token=dev%3Aadmin&next=/app/doctor" >/dev/null
curl -s -b $J "$B/api/doctor/schedule-kpis?from=2026-06-13T00:00:00&to=2026-06-16T00:00:00"   # → {ok,kpis:{9 полей}}
```

---

## 5. `dev_mode` в БД — не путать с dev-bypass

|            | `ALLOW_DEV_AUTH_BYPASS`     | `system_settings.dev_mode`                                                                               |
| ---------- | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Где        | env `apps/webapp/.env.dev`  | БД, UI `/app/doctor/admin/app-settings`                                                                  |
| Зачем      | Вход в UI без мессенджера   | Включает **тестовые аккаунты** в аналитике; ограничивает relay в боты списком `test_account_identifiers` |
| Для агента | обязателен для bypass-входа | нужен только при проверке метрик с тестовыми пользователями                                              |

`debug_forward_to_admin` — verbose-логи, **не** вход и **не** аналитика.

---

## 5.1 Матрица скриншотов интерфейса по ролям

Для оценки состава экранов создавайте отдельный browser profile/cookie jar на каждую роль и не переиспользуйте
сессию между строками:

| Срез         | DEV-вход                                        | Что фиксировать минимум                                                                  |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Public       | `/api/auth/dev-public`                          | landing и clean login; session отсутствует                                               |
| Registration | `/api/auth/dev-public?view=clinic-registration` | единая форма создания специалиста + его клиники; session отсутствует                     |
| Patient      | `dev:client`                                    | home, appointments, treatment/program, profile/settings                                  |
| Doctor       | `dev:doctor`                                    | Today, patients, schedule, communications, content/LFK; отсутствие clinic/global пунктов |
| Clinic admin | `dev:clinic-admin`                              | doctor-набор + `Врачи` + `Настройки клиники`; отсутствие global-admin разделов           |
| Global admin | `dev:admin`                                     | полный doctor-набор + analytics, system-health, audit-log, global settings/integrations  |

Сначала снимайте desktop `1480×1024`, затем ключевые shell/navigation экраны mobile `390×844`. Имя каталога:
`.claude/screenshots/UX-ROLE-MATRIX/<UTC>/<role>/`; рядом держите короткий `manifest.md` с URL, ролью, размером
viewport и commit SHA. Не коммитьте runtime screenshots.

Уже собранный актуальный набор находится в
`.claude/screenshots/SAAS-S3-TEST-WALKTHROUGH/2026-07-15T13-50-53Z/`. В нём есть public и парные экраны
двух clinic-owner профилей A/B (Today, пациенты, расписание, коммуникации, CMS/LFK, управление клиникой).
Это **не** полная ролевая матрица: отдельных patient, regular doctor и global-admin срезов там нет.

---

## 6. Типовые сценарии тестирования

### 6.1 Только UI кабинета врача

```bash
pnpm run webapp:dev
# 1) вход
http://127.0.0.1:5200/api/auth/dev-bypass?token=dev%3Aadmin
# 2) переход на страницу, например /app/doctor/clients
```

Integrator не нужен, если не вызываются внешние интеграции.

### 6.2 Пациентский flow

```bash
pnpm run webapp:dev
http://127.0.0.1:5200/api/auth/dev-bypass?token=dev%3Aclient&next=/app/patient/home
```

### 6.3 Admin settings (БД-конфиг)

Нужен `dev:admin`:

```text
/app/doctor/admin/app-settings
/app/doctor/admin/integrations
/app/doctor/admin/auth
```

### 6.4 Напоминания / scheduler / доставка в бот

```bash
pnpm run dev                    # API + webapp
# опционально в другом терминале:
pnpm run worker:dev
pnpm run scheduler:dev
```

### 6.5 После правок схемы БД

```bash
bash deploy/host/migrate-dev.sh --preflight
bash deploy/host/migrate-dev.sh --execute
# при необходимости обновить docs/ARCHITECTURE/DB_STRUCTURE.md
```

Для канонической `bcb_webapp_dev` используйте wrapper выше: он проверяет точную локальную БД и запускает общие
pending migrations без reset/restore.

### 6.6 SaaS diagnostics contour (System Health / isolation telemetry)

`migrate-dev.sh` **не** ставит telemetry/health overlays и **не** перенакатывает d3-4 bootstrap grants.
Для карточек «Всё состояние» / `saasIsolation` и для phone-bind accessors после `0371` на DEV нужен
отдельный read-only operator login (как на TEST), не расширение обычного `DATABASE_URL`.

1. В `apps/webapp/.env.dev` задать `SAAS_ISOLATION_OPERATOR_DATABASE_URL` на `bcb_webapp_dev` с отдельным login
   (имя содержит `operator`, пример закомментирован в `apps/webapp/.env.example`; пароль ≥ 32 байт; **не коммитить**).
2. После миграций и при смене operator URL:

```bash
bash deploy/host/provision-dev-saas-diagnostics.sh
```

Скрипт: provisioning operator LOGIN + `CONNECT`, telemetry/health overlays, `GRANT EXECUTE` bootstrap-логину на
`app.auth_phone_bind_*` (иначе `createOrBind` под bare NOINHERIT nonstaff получает `42501` на функции).

3. Перезапустить webapp, чтобы pool подхватил env.

---

## 7. Автотесты (не путать с живым UI)

| Команда                      | Область                  |
| ---------------------------- | ------------------------ |
| `pnpm test:webapp:fast`      | Быстрые unit/contract    |
| `pnpm test:webapp:inprocess` | Тяжёлые in-process       |
| `pnpm test:webapp`           | оба набора               |
| `pnpm run ci`                | полный барьер перед push |

Политика: [`.cursor/rules/test-execution-policy.md`](../../.cursor/rules/test-execution-policy.md), [`apps/webapp/e2e/README.md`](../../apps/webapp/e2e/README.md).

Opt-in тесты с реальной БД: `USE_REAL_DATABASE=1` + специфичные `RUN_*_DEV_DB=1` — см. комментарии в конкретных `*.integration.test.ts`.

---

## 8. Частые ошибки

| Симптом                             | Причина                                                  | Решение                                        |
| ----------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Редирект на `/app` без сессии       | `ALLOW_DEV_AUTH_BYPASS` не `true` или опечатка в `token` | Проверить `.env.dev`, перезапустить dev-сервер |
| Bypass «не работает» на prod        | Задумано                                                 | Только dev + non-production                    |
| Сессия «залипает» / logout странный | Открыли `localhost` вместо `127.0.0.1`                   | Использовать `127.0.0.1:5200`                  |
| Порт занят                          | Старый `next dev`                                        | `pnpm run dev:stop`, затем снова старт         |
| 401 на integrator-зависимых фичах   | Запущен только webapp                                    | `pnpm run dev` или отдельно `dev:integrator`   |
| Admin API 403                       | Вошли как `dev:doctor`                                   | Использовать `dev:admin`                       |

---

## 9. Связанные маршруты входа (не bypass)

Для полноты — **не** замена dev-bypass:

- `/app` — публичный OAuth / email / phone (нужны настроенные провайдеры в `system_settings`).
- `/app/tg`, `/app/max` — Mini App (нужен реальный initData мессенджера).
- `?t=<integrator-jwt>` — обмен токена из бота (`exchangeIntegratorToken`), не dev-токены.

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
