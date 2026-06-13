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

- На **production** bypass **отключён** жёстко (`NODE_ENV=production` или флаг не `true`).
- **Не** читайте `.env` ради паролей — для теста используйте готовые токены ниже.

Реализация: `GET /api/auth/dev-bypass`, пресеты в `apps/webapp/src/modules/auth/service.ts`.

### 4.2 Токены (фиксированные, не секреты)

| `token` | Роль в сессии | Admin mode | Типичное использование |
|---------|---------------|------------|------------------------|
| `dev:admin` | `admin` | **всегда включён** | Настройки `/app/doctor/admin/*`, audit-log, system-health, merge, опасные admin API |
| `dev:doctor` | `doctor` | нет | Кабинет специалиста без admin-only экранов |
| `dev:client` | `client` | — | Кабинет пациента |

Демо-пользователи имеют стабильные UUID (`00000000-0000-0000-0000-00000000000{1,2,3}`) и тестовые телефоны `+7999000000x`.

### 4.3 Способы входа

**A. Прямой URL (лучший для агента / curl / чистый браузер)**

```
http://127.0.0.1:5200/api/auth/dev-bypass?token=dev%3Aadmin
```

Параметры:

- `token` — один из `dev:client` | `dev:doctor` | `dev:admin` (URL-encode `:` → `%3A`).
- `next` — путь после входа. **Только для `dev:client`:** безопасные пути внутри `/app/patient/*` (кроме `bind-phone`). Для **`dev:doctor` и `dev:admin`** параметр `next` **игнорируется** — всегда редирект на `/app/doctor`; дальше переходите на нужный маршрут вручную или через browser automation.

Примеры:

```text
# Админ → /app/doctor (дефолт)
/api/auth/dev-bypass?token=dev%3Aadmin

# Врач → /app/doctor, затем в браузере /app/doctor/schedule
/api/auth/dev-bypass?token=dev%3Adoctor

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

При `ALLOW_DEV_AUTH_BYPASS=true` на странице входа блок «Режим разработки»: «Как пациент», «Как врач / админ», «Как специалист».

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

### 4.6 Browser / MCP (Cursor)

1. Запустить `pnpm run webapp:dev` (или `dev:turbo`).
2. `browser_navigate` на dev-bypass URL с нужным `token` и `next`.
3. Для doctor-страниц **не** ходить на `/app/doctor/...` без предварительной сессии — получите redirect на login.

Навигация кабинета врача: [`DOCTOR_CABINET_NAVIGATION.md`](./DOCTOR_CABINET_NAVIGATION.md).

---

## 5. `dev_mode` в БД — не путать с dev-bypass

| | `ALLOW_DEV_AUTH_BYPASS` | `system_settings.dev_mode` |
|--|-------------------------|----------------------------|
| Где | env `apps/webapp/.env.dev` | БД, UI `/app/doctor/admin/app-settings` |
| Зачем | Вход в UI без мессенджера | Включает **тестовые аккаунты** в аналитике; ограничивает relay в боты списком `test_account_identifiers` |
| Для агента | обязателен для bypass-входа | нужен только при проверке метрик с тестовыми пользователями |

`debug_forward_to_admin` — verbose-логи, **не** вход и **не** аналитика.

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
