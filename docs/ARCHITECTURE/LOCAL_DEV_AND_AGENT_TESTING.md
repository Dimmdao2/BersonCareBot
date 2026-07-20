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
pnpm run migrate
```

| Файл | Назначение |
|------|------------|
| `.env` | integrator (API, worker при необходимости) |
| `apps/webapp/.env.dev` | webapp Next.js |
| `.env.cutover.dev` | ops: backfill/reconcile (не для обычного UI-теста) |

**База:** одна PostgreSQL `bcb_webapp_dev` (схемы `public` + `integrator`), один `DATABASE_URL` в обоих env — см. [`DATABASE_UNIFIED_POSTGRES.md`](./DATABASE_UNIFIED_POSTGRES.md).

### 1.1 Где UX-агенту смотреть интерфейс

Агент выбирает среду по задаче:

| Нужно | Среда | Почему |
|---|---|---|
| Увидеть именно развёрнутый TEST-коммит, TEST-фикстуры и реальные tenant/RLS-gates | `https://test.bersoncare.ru` | Это deploy truth; вход — штатный email/password из защищённого TEST fixture packet |
| Быстро менять код, данные и роли, делать повторные скриншоты | DEV `http://127.0.0.1:5200` | Hot reload, dev-bypass и свободные изменения `bcb_webapp_dev` |
| Получить в DEV тот же состав данных, что сейчас на TEST | Сначала `bash deploy/host/refresh-dev-from-test.sh --execute` | Wrapper пересоздаёт **только** `bcb_webapp_dev` из **только** `bersoncarebot_test`, накатывает миграции текущей ветки, восстанавливает runtime grants/helpers после `--no-acl` restore и удаляет скопированные TEST-only locks настроек |

`bcb_webapp_dev` — рабочая песочница: её разрешено пересоздавать, сидировать и менять для разработки/UX.
Копирование TEST→DEV также разрешено. Ограничение остаётся на внешние эффекты: из DEV нельзя отправлять
реальные сообщения/SMS, вызывать production endpoints или писать в production S3. PROD-БД wrapper не читает и
не открывает.

Перед TEST→DEV refresh остановите локальный webapp/integrator (`pnpm run dev:stop`): target DEV-БД будет удалена.
TEST при этом только читается через `pg_dump`, TEST-сервисы не перезапускаются.

Если DEV уже был обновлён старой версией wrapper и настройки остались заблокированы, не пересоздавайте базу снова:
`bash deploy/host/dev-post-refresh-unlock.sh --execute`. Команда fail-closed принимает только канонический локальный
`DATABASE_URL` для `bcb_webapp_dev` и удаляет только две TEST-only пары trigger/function в `public` и `integrator`.
Значения TEST-настроек она не меняет; после разблокировки DEV их можно менять штатным API/admin UI.

Если после уже выполненного refresh журнал миграций актуален, но P2-B owner/context или runtime-функции/ACL
разошлись (например, после `pg_restore --no-owner --no-acl` или повторного `CREATE OR REPLACE FUNCTION`), DEV
пересоздавать не нужно. Используйте отдельную идемпотентную closure-команду:

```bash
bash deploy/host/dev-runtime-overlay-rehydrate.sh --execute
```

Она принимает только два локальных exact `bcb_webapp_dev` URL из канонического `.env.dev`: owner/migrator
`DATABASE_URL` под `bcb_webapp_dev_user` и отдельный `DATABASE_URL_NONSTAFF` под каноническим C0-login
`bcb_dev_runtime_nonstaff_login`. Это DEV-only identity: она не может совпадать с TEST runtime на общем PostgreSQL-
кластере. Owner и runtime не могут совпадать. Команда не читает `/opt/env`, TEST или PROD,
не делает dump/reset и не меняет прикладные данные. Команда проверяет существующие глобальные роли, переустанавливает
канонический P2-B protected context и только затем переиспользует тот же упорядоченный runtime-overlay closure, что
TEST wrapper. Она завершается только после точных owner/ACL-проверок и фактических runtime-проверок public settings
и patient booking capability. Глобальные роли в DEV не создаются и не перенастраиваются:
они общие для PostgreSQL-кластера, поэтому отсутствие/небезопасное состояние роли является fail-closed ошибкой.
До TEST→DEV dump/reset refresh отдельно запускает `--preflight`; отсутствие `DATABASE_URL_NONSTAFF`, alias с owner,
опасные атрибуты роли или membership в owner/`app_owner` останавливают refresh до разрушения текущей DEV-БД.
Provisioning/credential для C0 runtime-login выполняются отдельным C0/C2 ops-проходом, не этим repair wrapper.

### Одноразовая подготовка C0 runtime-login в DEV

Это отдельная DB-admin операция для уже существующей `bcb_webapp_dev`, а не часть deploy, миграции, refresh или
rehydrate. Роли PostgreSQL глобальны для локального кластера и переживают замену DEV-БД из dump, поэтому обычные
скрипты **никогда** не должны повторно создавать роли, менять их пароль или переписывать `.env.dev`.

1. Из канонического checkout создать/нормализовать только две namespaced DEV-роли. SQL password-free, принимает
   только точную БД `bcb_webapp_dev` и точного оператора `postgres`-superuser, проверяет канонические
   `app_staff`/`app_patient` и оставляет каждому login ровно одно SET-only membership:

   ```bash
   cd /home/dev/dev-projects/BersonCareBot
   sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d bcb_webapp_dev \
     < deploy/postgres/dev-c0-runtime-logins.sql
   ```

2. В интерактивном `psql` установить два разных высокоэнтропийных URL-safe пароля из password manager. Команда
   `\password` не показывает ввод, не кладёт пароль в shell history/argv и передаёт PostgreSQL уже зашифрованный
   verifier. Не заменять её `ALTER ROLE ... PASSWORD` через `-c`, pipe, heredoc или переменную shell.

   ```bash
   sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d bcb_webapp_dev
   ```

   Затем выполнить внутри `psql` (каждая команда запросит пароль дважды) и выйти:

   ```text
   \password bcb_dev_runtime_staff_login
   \password bcb_dev_runtime_nonstaff_login
   \q
   ```

3. До изменения env проверить оба пароля отдельными loopback-подключениями. `-W` принимает пароль без echo;
   `PGPASSFILE=/dev/null` не позволяет незаметно взять другой пароль из локального файла. Обе команды должны
   вывести только `1`:

   ```bash
   PGPASSFILE=/dev/null PGCONNECT_TIMEOUT=10 psql -X -W -h 127.0.0.1 -p 5432 \
     -U bcb_dev_runtime_staff_login -d bcb_webapp_dev -v ON_ERROR_STOP=1 -Atc \
     "SELECT (current_user = 'bcb_dev_runtime_staff_login' AND current_database() = 'bcb_webapp_dev')::int;"
   PGPASSFILE=/dev/null PGCONNECT_TIMEOUT=10 psql -X -W -h 127.0.0.1 -p 5432 \
     -U bcb_dev_runtime_nonstaff_login -d bcb_webapp_dev -v ON_ERROR_STOP=1 -Atc \
     "SELECT (current_user = 'bcb_dev_runtime_nonstaff_login' AND current_database() = 'bcb_webapp_dev')::int;"
   ```

4. До открытия игнорируемого `apps/webapp/.env.dev` подтвердить, что это обычный файл, а не symlink, установить
   `0600` и проверить фактический mode, не печатая содержимое:

   ```bash
   test -f apps/webapp/.env.dev && test ! -L apps/webapp/.env.dev
   chmod 0600 apps/webapp/.env.dev
   test -f apps/webapp/.env.dev && test ! -L apps/webapp/.env.dev
   test "$(stat -c '%a' apps/webapp/.env.dev)" = 600
   ```

   Только после PASS открыть файл вручную в редакторе и сохранить точные локальные URL. Редактор должен сохранять
   файл без replacement, теряющего `0600`. Пароли должны быть URL-safe; реальные значения не копировать в чат,
   taskdb, планы или логи:

   ```dotenv
   DATABASE_URL_STAFF=postgresql://bcb_dev_runtime_staff_login:<staff-password>@127.0.0.1:5432/bcb_webapp_dev
   DATABASE_URL_NONSTAFF=postgresql://bcb_dev_runtime_nonstaff_login:<nonstaff-password>@127.0.0.1:5432/bcb_webapp_dev
   ```

   Сразу после сохранения, до любого следующего шага, повторить проверку и при необходимости восстановить `0600`.
   Не использовать `cat`/`grep`/`source`:

   ```bash
   test -f apps/webapp/.env.dev && test ! -L apps/webapp/.env.dev
   chmod 0600 apps/webapp/.env.dev
   test -f apps/webapp/.env.dev && test ! -L apps/webapp/.env.dev
   test "$(stat -c '%a' apps/webapp/.env.dev)" = 600
   ```

5. Прогнать статический C2-контракт, затем read-only DEV preflight и только после PASS — существующий #920 closure.
   Полный C2 env-preflight выполняется отдельно, когда подготовлены все три process env; не подставлять фиктивные
   operational URL ради зелёного результата.

   ```bash
   pnpm run check:saas-c2-secrets-deployment-plumbing
   bash deploy/host/dev-runtime-overlay-rehydrate.sh --preflight
   bash deploy/host/dev-runtime-overlay-rehydrate.sh --execute
   ```

До записи URL безопасное восстановление — повторно запустить password-free SQL или исправить пароль через
интерактивный `\password`. После записи URL сначала вернуть корректный пароль/URL и снова пройти preflight; не
удалять существующие роли и не выполнять `DROP ROLE`. Если роли уже существовали с неожиданными ownership или
транзитивными привилегиями, #920 preflight обязан остановить продолжение — это отдельное расследование, не повод
расширять этот одноразовый bootstrap.

### Обязательный разовый P2-B owner/context handoff после `--no-owner` restore

Это **per-database** шаг, не cluster-global подготовка C0-login выше. Dump может сохранить актуальный migration
ledger, но потерять owner/ACL-состояние конкретной базы: migration-created объекты `app` становятся объектами
`bcb_webapp_dev_user`, после `--no-acl` отсутствуют grants глобальным `app_staff`/`app_patient`, а protected principal
context нужно заново связать с тем же signing secret, который использует DEV runtime.

После каждого явно разрешённого `refresh-dev-from-test.sh --execute` порядок фиксирован:

1. restore только `bcb_webapp_dev` с `--no-owner --no-acl`;
2. current-branch migrations под `bcb_webapp_dev_user`;
3. `dev-runtime-overlay-rehydrate.sh --execute`: exact DB/owner/runtime roles,
   `DB_PRINCIPAL_CONTEXT_MODE=shadow|locked` и безопасный `DB_PRINCIPAL_SIGNING_SECRET` читаются одним
   descriptor-pinned snapshot канонического `.env.dev` без `source`; wrapper требует exact безопасные атрибуты
   и отсутствие исходящих membership у `app_owner`/`app_staff`/`app_patient`; входящих membership у `app_owner`
   быть не может вообще, а входящие `app_staff`/`app_patient` сверяются с полным allowlist текущей общей
   DEV+TEST topology и точными PostgreSQL 16 options. Проверяется также транзитивная достижимость: неизвестная роль
   не может получить `app_owner`, `app_staff` или `app_patient` через разрешённый промежуточный login. Неизвестный
   login, косвенная цепочка или отличный `ADMIN/INHERIT/SET` останавливает repair; wrapper ничего не отзывает и не
   перенастраивает в cluster-global ролях;
4. wrapper проверяет `app`, exact existing P2-B tables/functions, migration-created `app.is_staff()` и pgcrypto
   move precondition; выдаёт `app_owner` только `USAGE` на `app_ext`, передаёт owner только для exact P2-B
   tables/functions (если они уже существуют), а schema `app` — через канонический P2-B artifact, затем
   переустанавливает `deploy/postgres/p2-b-protected-principal-context.sql`;
5. actual signing secret передаётся отдельным stdin `COPY`-потоком внутри одной транзакции и не становится SQL
   literal/psql variable; до commit доказывается, что `pgcrypto` находится в `app_ext`, exact P2-B
   schema/tables/functions принадлежат `app_owner`, три protected tables не имеют ACL-grantees кроме owner, восемь
   protected functions имеют только exact owner/staff/patient ACL и сохранённый secret равен stdin-значению;
   затем применяются P0.5b, единая shared runtime-overlay chain и nonstaff runtime capability checks;
6. только после PASS вызывается `dev-post-refresh-unlock.sh --execute` для снятия скопированных TEST-only locks.

Signing secret парсится как данные из единственного атомарно открытого non-symlink `.env.dev` snapshot,
принимается только в ограниченной whitespace/backslash-free форме длиной не менее 32 bytes и выпускается parser-ом
только после read-only guards. Shell его не присваивает и не подставляет в SQL; actual value идёт только в данные
`COPY FROM STDIN`. Wrapper принудительно выключает даже унаследованный `xtrace`. Secret не должен попадать в SQL
statement/error/audit logs, argv, shell history, чат, taskdb, документацию или commit.

Handoff запускается только сразу после explicit TEST→DEV refresh или как targeted repair уже существующей DEV-БД с
актуальным migration ledger и owner/ACL drift. Это **никогда** не часть ordinary code-only deploy, build, restart,
`pnpm migrate` или UI-правки. Не повторяйте destructive refresh ради repair. Запрещены `REASSIGN OWNED`,
`DROP OWNED`, P2-B down mode, broad ownership rewrites и hand-written replacement SQL. При FAIL исправляется
repo-wrapper/canonical artifact, после чего closure повторяется на той же DEV-БД.

**Node:** ≥22 (`nvm use` по `.nvmrc`).

---

## 2. Порты и URL (dev)

| Сервис | URL по умолчанию | Env |
|--------|------------------|-----|
| **Webapp** | `http://127.0.0.1:5200` | `apps/webapp/.env.dev` → `HOST`, `PORT` |
| **Integrator API** | `http://127.0.0.1:4200` | корневой `.env` → `PORT` |
| **Prod (не трогать)** | webapp `:6200`, integrator `:3200` | только systemd на хосте |

Скрипт `dev:stop` / `kill-local-dev-ports.sh` освобождает **только** dev-порты (5200, 4200), **никогда** 6200/3200.

**Важно для сессий:** открывайте webapp по **`127.0.0.1`**, не `localhost` — cookie и выход (`/api/auth/logout`) ведут себя предсказуемо. Это зафиксировано в UI блока «Режим разработки» на `/app`.

---

## 3. Режимы запуска (`pnpm`)

Команды из **корня** репозитория, если не указано иное.

### 3.1 Webapp (UI)

| Команда | Что делает | Когда использовать |
|---------|------------|-------------------|
| `pnpm run dev` | **Параллельно** integrator + webapp (`tsx watch` + `next dev --webpack`) | Полный стек: бот-API, webhooks, SMS relay, сценарии с integrator |
| `pnpm run webapp:dev` | Только webapp; перед стартом `kill-local-dev-ports` | UI врача/пациента, API routes webapp, **без** integrator |
| `pnpm run dev:turbo` | Webapp на **Turbopack** (`next dev`, без `--webpack`) | Быстрый HMR при правках React/страниц |
| `pnpm --dir apps/webapp run dev:visual` | Webapp **webpack** + `WATCHPACK_POLLING` / `CHOKIDAR_USEPOLLING` | Удалённая FS, Docker volume, VM — когда hot reload «не видит» файлы |
| `pnpm run dev:stop` | Остановить слушатели на dev-портах webapp + integrator | Перед повторным стартом, если порт занят |

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

| Команда | Процесс |
|---------|---------|
| `pnpm run dev:integrator` | API Fastify (`tsx watch src/main.ts`) |
| `pnpm run worker:dev` | Worker: projection, outgoing delivery |
| `pnpm run scheduler:dev` | Scheduler: `schedule.tick`, напоминания |

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

| `token` | Роль в сессии | Admin mode | Типичное использование |
|---------|---------------|------------|------------------------|
| `dev:admin` | `admin` + membership `assistant` | **всегда включён** | Настройки `/app/doctor/admin/*`, audit-log, system-health, merge, опасные admin API |
| `dev:clinic-admin` | `doctor` + membership `owner` | нет | Управление своей клиникой (`Врачи`, `Настройки клиники`) без global-admin экранов |
| `dev:doctor` | `doctor` + membership `doctor` + specialist | нет | Кабинет специалиста без admin-only экранов |
| `dev:client` | `client` | — | Кабинет пациента |

Все три staff-токена идемпотентно создают/чинят общую `DEV UX Clinic` и своё единственное active membership.
`dev:doctor` получает отдельного specialist, `dev:clinic-admin` — owner-membership и отдельного specialist,
`dev:admin` — минимальный `assistant` membership без specialist (права global admin даёт platform-role +
`adminMode`, а не ownership клиники). Поэтому токены продолжают работать после TEST→DEV refresh и после
произвольных экспериментов с DEV-данными, сохраняя разные меню и полномочия.

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

| | `ALLOW_DEV_AUTH_BYPASS` | `system_settings.dev_mode` |
|--|-------------------------|----------------------------|
| Где | env `apps/webapp/.env.dev` | БД, UI `/app/doctor/admin/app-settings` |
| Зачем | Вход в UI без мессенджера | Включает **тестовые аккаунты** в аналитике; ограничивает relay в боты списком `test_account_identifiers` |
| Для агента | обязателен для bypass-входа | нужен только при проверке метрик с тестовыми пользователями |

`debug_forward_to_admin` — verbose-логи, **не** вход и **не** аналитика.

---

## 5.1 Матрица скриншотов интерфейса по ролям

Для оценки состава экранов создавайте отдельный browser profile/cookie jar на каждую роль и не переиспользуйте
сессию между строками:

| Срез | DEV-вход | Что фиксировать минимум |
|---|---|---|
| Public | `/api/auth/dev-public` | landing и clean login; session отсутствует |
| Registration | `/api/auth/dev-public?view=clinic-registration` | единая форма создания специалиста + его клиники; session отсутствует |
| Patient | `dev:client` | home, appointments, treatment/program, profile/settings |
| Doctor | `dev:doctor` | Today, patients, schedule, communications, content/LFK; отсутствие clinic/global пунктов |
| Clinic admin | `dev:clinic-admin` | doctor-набор + `Врачи` + `Настройки клиники`; отсутствие global-admin разделов |
| Global admin | `dev:admin` | полный doctor-набор + analytics, system-health, audit-log, global settings/integrations |

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
pnpm run migrate
# при необходимости обновить docs/ARCHITECTURE/DB_STRUCTURE.md
```

---

## 7. Автотесты (не путать с живым UI)

| Команда | Область |
|---------|---------|
| `pnpm test:webapp:fast` | Быстрые unit/contract |
| `pnpm test:webapp:inprocess` | Тяжёлые in-process |
| `pnpm test:webapp` | оба набора |
| `pnpm run ci` | полный барьер перед push |

Политика: [`.cursor/rules/test-execution-policy.md`](../../.cursor/rules/test-execution-policy.md), [`apps/webapp/e2e/README.md`](../../apps/webapp/e2e/README.md).

Opt-in тесты с реальной БД: `USE_REAL_DATABASE=1` + специфичные `RUN_*_DEV_DB=1` — см. комментарии в конкретных `*.integration.test.ts`.

---

## 8. Частые ошибки

| Симптом | Причина | Решение |
|---------|---------|---------|
| Редирект на `/app` без сессии | `ALLOW_DEV_AUTH_BYPASS` не `true` или опечатка в `token` | Проверить `.env.dev`, перезапустить dev-сервер |
| Bypass «не работает» на prod | Задумано | Только dev + non-production |
| Сессия «залипает» / logout странный | Открыли `localhost` вместо `127.0.0.1` | Использовать `127.0.0.1:5200` |
| Порт занят | Старый `next dev` | `pnpm run dev:stop`, затем снова старт |
| 401 на integrator-зависимых фичах | Запущен только webapp | `pnpm run dev` или отдельно `dev:integrator` |
| Admin API 403 | Вошли как `dev:doctor` | Использовать `dev:admin` |

---

## 9. Связанные маршруты входа (не bypass)

Для полноты — **не** замена dev-bypass:

- `/app` — публичный OAuth / email / phone (нужны настроенные провайдеры в `system_settings`).
- `/app/tg`, `/app/max` — Mini App (нужен реальный initData мессенджера).
- `?t=<integrator-jwt>` — обмен токена из бота (`exchangeIntegratorToken`), не dev-токены.

Подробно: [`auth.md`](../../apps/webapp/src/modules/auth/auth.md).
