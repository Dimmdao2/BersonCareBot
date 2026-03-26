# Этап 5: Система авторизации

> Приоритет: P2
> Зависимости: Этап 3 (профиль, deep-link привязка мессенджеров)
> Риск: средний (множество auth-методов, безопасность)

---

## Достаточность декомпозиции (режим «авто»)

Исходный текст этапа 5 описывает **целевую систему** (много методов, OAuth, PIN, login tokens), но **не разбит** на атомарные шаги с явными границами ответственности, тестами и критериями «готово». Для младшего агента это приводит к половинчатым PR, дублированию существующего phone/email/channel-link и рискам безопасности.

Ниже добавлены: **жёсткие ограничения**, **микро-шаги с ID**, **обязательные проверки**, **требования к тестам** (unit + in-process e2e по паттерну репозитория).

---

## Важно (ограничения без исключений)

- **Не ломать** существующие потоки без явной миграции/фичефлага: `POST /api/auth/phone/start|confirm`, email OTP, `channel-link`, `exchange`, сессия в `modules/auth/service.ts` и cookie.
- **Не править старые миграции** — только новые файлы `NNN_description.sql` с `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` где уместно. Номер **`NNN` взять из списка в `apps/webapp/migrations/`** (черновик в тексте ниже упоминал `017_` — это **устаревший пример**, фактический номер может быть **020+**).
- **Секреты** (OAuth client_secret, HMAC, session secret): только `process.env` / `config/env.ts` + `.env.example` (**имена ключей**, не значения). Не коммитить ключи.
- **PIN и пароли**: только хэш в БД (`argon2` или принятый в репо аналог); никогда не логировать сырое значение.
- **API**: Zod на всех входах; ответы без внутренних stack trace; коды ошибок стабильны для UI.
- **Стили**: Tailwind + shadcn + `cn()`; не плодить глобальные классы в `globals.css` без необходимости.
- **Тексты UI** — на русском.
- Перед пушем: **`pnpm run ci`**. Для e2e webapp: **`pnpm --dir apps/webapp run test:e2e`** (входит в отдельный скрипт, **не** в корневой `ci` — см. раздел «Проверки»).

---

## Контекст: что прочитать перед работой

| Документ / зона | Зачем |
|-----------------|--------|
| `README.md`, `docs/FULL_DEV_PLAN/README.md` | CI, правила репо |
| Этап 3 `STAGE_03_PROFILE/PLAN.md` | Уже сделанные OTP, email, channel-link |
| `apps/webapp/src/modules/auth/` | Текущая сессия, phone auth |
| `apps/webapp/src/app/api/auth/` | Существующие маршруты |
| `apps/webapp/e2e/*.test.ts` | Паттерн **in-process** e2e (импорт `GET`/`POST` из `route.ts`) и опционально `WEBAPP_E2E_BASE_URL` |
| `apps/integrator/` | Сценарии бота для `/start login_*` (5.4) |

---

## Жёсткие ограничения для агента (что делать нельзя)

| Запрет | Почему |
|--------|--------|
| Удалять или переименовывать публичные API этапа 3 без совместимости | Регресс клиентов / интегратора |
| Внедрять **все** провайдеры OAuth в одном PR | Неподтверждаемые ключи, раздувание PR |
| Писать `017_auth_methods.sql`, если номер занят | Конфликт миграций |
| Смешивать в одном коммите БД + UI + integrator + OAuth | Невозможно ревью и откат |
| Добавлять Playwright в репо без решения мейнтейнера | В проекте e2e webapp = **vitest** (`apps/webapp/e2e/`) |

---

## План ↔ текущий код (явные расхождения)

| Тема | В черновике плана | В репозитории сейчас |
|------|-------------------|----------------------|
| Имя миграции `017_auth_methods.sql` | Упоминается | Уже есть миграции **016–019+** — использовать **следующий свободный номер** |
| `POST /api/auth/check-phone` и др. | Новые | Часть может пересекаться с логикой **поиска пользователя по телефону** — переиспользовать порты, не дублировать SQL |
| SMS | «существующий» | Реализовано в `phone/start` + rate-limit — **расширять**, не копировать |

---

## Рекомендуемый порядок подэтапов (зависимости)

| Порядок | Подэтап | Зависит от | Примечание |
|---------|---------|------------|------------|
| 1 | **5.1** (часть: PIN + таблицы + check-phone) | Этап 3 | Сначала модель + read-only/check API |
| 2 | **5.3** + **5.6** | 5.1 (PIN) | Вход по PIN + установка PIN в профиле — тесно связаны |
| 3 | **5.2** (UI) | 5.1 минимум (check-phone) | UI без бэкенда — только заглушки |
| 4 | **5.4** (мессенджер login) | 5.1 (`login_tokens`), integrator | Отдельный PR после стабильного API |
| 5 | **5.5** (OAuth) | 5.1 (`user_oauth_bindings`), env | **Яндекс первым** отдельным PR; Google/Apple — следующими |
| 6 | **5.7** (сессия 90д) | Текущий `auth/service` | Может затронуть все cookie — осторожно, отдельный PR |
| 7 | **5.8** | 5.2, 5.5/5.6 по данным | После того как есть «первый вход» |

---

## Тестовая стратегия (обязательно)

| Уровень | Где | Что покрывать |
|---------|-----|----------------|
| **Unit** | `apps/webapp/src/modules/auth/**/*.test.ts` | Zod-схемы, хэш PIN, логика блокировок, маппинг `check-phone` → методы |
| **Route / integration** | `*.test.ts` рядом с route или `src/modules/...` | Handler с моками `buildAppDeps` / in-memory repos |
| **E2E in-process** | `apps/webapp/e2e/*-inprocess.test.ts` | `import { POST } from "@/app/api/auth/.../route"` → `POST()` с `NextRequest`/`Request` моками по существующим примерам |
| **E2E против dev-сервера** (опционально) | `WEBAPP_E2E_BASE_URL` | Только если поднят webapp; в CI обычно **skip** |

**Минимум для каждого нового публичного API:** unit или route-тест **+** запись в `e2e/*.test.ts` (in-process), проверяющая **4xx на невалидном теле** и **успех на happy-path** с тестовыми фикстурами.

---

## Проверки в конце каждого шага (общий шаблон)

Выполнить локально:

```bash
pnpm install --frozen-lockfile
pnpm run ci
pnpm --dir apps/webapp run test:e2e
```

**Критерий успеха шага:** все три проходят; **нет** новых ошибок ESLint; для миграций — при необходимости `pnpm --dir apps/webapp run migrate` на чистой dev-БД (или документировать ручной прогон).

---

## Когда остановиться и запросить человека

| Ситуация | Действие |
|----------|----------|
| Нет OAuth client_id / redirect URI для стенда | Зафиксировать в `.env.example` имена переменных; реализовать **stub** с `501` или `feature disabled` + тест на отключённый режим |
| Apple Sign In — сертификаты | Не начинать в этапе 5 без явного запроса; оставить TODO |
| CSP блокирует OAuth redirect | Согласовать с deploy/nginx; не хакать в коде без ревью |
| Конфликт с существующим `channel-link` | Документировать единый формат токена `login_*` vs `link_*` |

---

## Схема авторизации

```
0. Старт
   ├─ есть валидная сессия → доступ
   └─ нет сессии → ввод телефона

1. Ввод телефона
   └─ пользователь вводит номер

2. Проверка пользователя
   ├─ найден в БД → existing user → шаг 3A
   └─ не найден → new user → шаг 3B

3A. Выбор метода входа (existing user)
   ├─ PIN (если задан) ← предпочтительный
   ├─ Telegram (если привязан)
   ├─ Max (если привязан)
   ├─ OAuth: Google / Apple / Яндекс (если привязан)
   └─ SMS fallback (всегда доступен)

3B. Вход нового пользователя
   ├─ SMS (основной)
   └─ OAuth → потом запрос телефона

4. Авторизация по выбранному методу
   → создание сессии (cookie)

5. После входа — предложение:
   ├─ задать PIN
   ├─ привязать Telegram / Max
   └─ привязать OAuth

6. Fallback: если метод не сработал → SMS
```

---

## Подэтап 5.1: Backend — модель авторизации

**Задача:** таблицы и API для всех методов.

**Файлы (ориентир):**
- Миграция: **`apps/webapp/migrations/NNN_auth_methods.sql`** (подставить **следующий** `NNN` из папки миграций).
- Модуль: `apps/webapp/src/modules/auth/`

**Действия (содержание — без изменений по смыслу):**
1. Миграция — таблицы `user_pins`, `user_oauth_bindings`, `login_tokens` (см. SQL в истории коммита или восстановить из черновика ниже; индексы и `UNIQUE` не ослаблять).
2. API endpoints (см. микро-шаги — **не обязательно в одном PR**).
3. Хэширование PIN: `argon2` (или пакет, уже согласованный в репо).
4. PIN: 4–6 цифр, блокировка после 5 неудачных попыток на 15 мин.

**Критерий (подэтап считается закрытым только после выполнения микро-шагов и проверок):**
- Таблицы созданы миграцией `NNN`.
- Каждый новый route покрыт тестами + in-process e2e.
- `pnpm run ci` и `pnpm --dir apps/webapp run test:e2e` проходят.

**Микро-шаги (выполнять по порядку; один логический блок ≈ один PR):**

| ID | Задача | Запрещено | Тесты (минимум) | Проверки в конце шага |
|----|--------|-----------|-----------------|------------------------|
| **5.1a** | Только миграция `NNN_*.sql` + прогон migrate на dev | Добавлять API в том же коммите | Smoke: миграция применяется без ошибки (скрипт или CI job) | `pnpm run ci`; таблицы видны в БД |
| **5.1b** | Порт/репозиторий `user_pins` (CRUD hash, attempts, lock) | SQL из route напрямую | Unit: блокировка после 5 попыток; verify pin | `pnpm run ci` |
| **5.1c** | `POST /api/auth/check-phone` — Zod body, ответ `{ exists, methods }` без утечки PII | Возвращать полный профиль | Unit + `e2e` in-process: 200/400 | `pnpm run ci` + `test:e2e` |
| **5.1d** | `POST /api/auth/pin/login` — сессия при верном PIN | Хранить PIN в логах | Unit: неверный PIN; locked | тесты + `ci` |
| **5.1e** | `login_tokens` репозиторий + `POST .../messenger/start` + `POST .../poll` | Подтверждение без integrator в 5.1e — только статус в БД | Unit + e2e in-process | `ci` + `test:e2e` |
| **5.1f** | OAuth: `POST .../oauth/start` + `GET .../oauth/callback` **только Яндекс** или заглушка `disabled` при отсутствии env | Google/Apple в одном PR | Тест: при пустых env — предсказуемый ответ | `ci` + `test:e2e` |
| **5.1g** | Интеграция с существующими `phone/start|confirm` — не ломать контракт | Дублировать rate-limit | Регресс: существующие тесты phone auth | `pnpm run ci` |
| **5.1h** | Документация: `docs/` или комментарий в `PLAN` — список env для OAuth | — | — | Ревью |

**Повторяемый SQL-черновик (проверить типы и номер миграции перед применением):**

```sql
-- PIN-коды
CREATE TABLE IF NOT EXISTS user_pins (
  user_id UUID PRIMARY KEY REFERENCES platform_users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  attempts_failed SMALLINT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OAuth-привязки
CREATE TABLE IF NOT EXISTS user_oauth_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'yandex')),
  provider_user_id TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON user_oauth_bindings(user_id);

-- Login tokens (для Telegram/Max авторизации)
CREATE TABLE IF NOT EXISTS login_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('telegram', 'max')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired')),
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_tokens_status ON login_tokens(status, expires_at) WHERE status = 'pending';
```

---

## Подэтап 5.2: UI — экран авторизации (переработка)

**Задача:** единый экран входа с выбором метода.

**Файлы:**
- `apps/webapp/src/shared/ui/AuthBootstrap.tsx` (переписать)
- Новые компоненты: `PhoneInput.tsx`, `MethodPicker.tsx`, (остальные по подэтапам 5.3–5.4)

**Ограничения:** не ломать текущие точки входа (`/app`, bind-phone), пока фича не зафичефлажена; при необходимости **`NEXT_PUBLIC_AUTH_V2=1`** только для dev.

**Микро-шаги:**

| ID | Задача | Тесты | Проверки в конце шага |
|----|--------|-------|------------------------|
| **5.2a** | Состояние шага (phone → methods) в `AuthBootstrap` или отдельном контейнере | Component test или RTL (если есть) + storybook опционально | Линт, `ci` |
| **5.2b** | `PhoneInput`: маска/нормализация телефона, disabled при запросе | Unit: валид/невалид | `ci` |
| **5.2c** | Вызов `check-phone` + обработка ошибок сети | MSW или mock fetch в test | `ci` |
| **5.2d** | `MethodPicker`: только props `methods[]`, без бизнес-логики OAuth внутри | Snapshot или RTL | `ci` |
| **5.2e** | New user: автозапуск SMS **только после** явного согласия в UI (если требуется юр. текст) — уточнить продукт; иначе кнопка «Получить код» | E2E in-process с моком API | `ci` + `test:e2e` |

**Критерий успеха 5.2:** маршрут входа открывается; existing/new ветки различаются; **a11y**: фокус и `aria-label` на кнопках методов.

---

## Подэтап 5.3: Вход по PIN

**Задача:** форма ввода PIN-кода.

**Файлы:** `PinInput.tsx` (+ по необходимости обёртка для 5.2).

**Ограничения:** не хранить PIN в `sessionStorage`; не логировать ввод.

**Микро-шаги:**

| ID | Задача | Тесты | Проверки |
|----|--------|-------|----------|
| **5.3a** | Одно поле type=password с maxlength 6 **или** OTP-стиль — единый паттерн в репо | Unit: onComplete вызывает callback 1 раз | `ci` |
| **5.3b** | Обработка ответов API: `401`, `423` (locked), тело с `attemptsLeft` если есть | Mock fetch | `ci` |
| **5.3c** | «Забыли PIN?» ведёт на шаг SMS без утечки номера в URL (POST/state) | E2e in-process flow опционально | `ci` + `test:e2e` |

**Критерий успеха 5.3:** после 5 неудач — блокировка до истечения `locked_until`; смена метода на SMS работает.

---

## Подэтап 5.4: Вход через мессенджер (Telegram / Max)

**Задача:** авторизация через deep-link в бота.

**Файлы:** `MessengerLogin.tsx`, `apps/integrator` (сценарий `/start login_*`).

**Ограничения:** не смешивать токены **login** с **channel-link** (разные секреты TTL); webhook HMAC как в существующем integrator.

**Микро-шаги:**

| ID | Задача | Тесты | Проверки |
|----|--------|-------|----------|
| **5.4a** | UI: polling с `AbortController`, очистка интервала при unmount | Unit: таймер | `ci` |
| **5.4b** | `POST /api/auth/messenger/confirm` — idempotent confirm | Unit + integrator test | `ci` |
| **5.4c** | Integrator: сценарий `login_<token>` → вызов webapp | Integrator test | `pnpm --dir apps/integrator test` |
| **5.4d** | Max: отдельный под-шаг или явный **TODO** в UI «скоро» | — | Документ |

**Критерий успеха 5.4:** Telegram-поток end-to-end на dev-стенде; polling не утекает после ухода со страницы.

---

## Подэтап 5.5: OAuth (Google / Apple / Яндекс)

**Задача:** вход через внешних провайдеров.

**Файлы:** `modules/auth/oauth.ts`, routes `/api/auth/oauth/start`, `/api/auth/oauth/callback`.

**Ограничения:** **один провайдер за PR** (рекомендуется Яндекс); `state` + `nonce` против CSRF; `openid` scope по необходимости.

**Микро-шаги:**

| ID | Задача | Тесты | Проверки |
|----|--------|-------|----------|
| **5.5a** | Яндекс: обмен `code` на токен на сервере (client_secret не в браузере) | Mock HTTP + unit | `ci` |
| **5.5b** | Callback: валидация state, привязка к сессии или создание «пользователь без телефона» по правилам продукта | Integration | `ci` |
| **5.5c** | Google — **отдельный PR** после Яндекса | — | — |
| **5.5d** | Apple — только после явного запроса и ключей | — | — |

**Критерий успеха 5.5:** Яндекс login + привязка в профиле на стенде с реальными ключами; без ключей — отключённый режим с тестом.

---

## Подэтап 5.6: Создание PIN в профиле

**Задача:** пользователь может задать PIN-код после входа.

**Файлы:** `apps/webapp/src/app/app/patient/profile/` — `PinSection.tsx`, `POST /api/auth/pin/set`.

**Ограничения:** смена PIN требует **повторной аутентификации** (текущий SMS/пароль сессии) — уточнить у продукт-оунера; минимум — сессия + rate-limit на set.

**Микро-шаги:**

| ID | Задача | Тесты | Проверки |
|----|--------|-------|----------|
| **5.6a** | API `pin/set` + Zod | Unit + route test | `ci` |
| **5.6b** | UI: два поля + совпадение | RTL опционально | `ci` |

**Критерий успеха 5.6:** после установки PIN в `check-phone` появляется метод `pin`.

---

## Подэтап 5.7: Длительная сессия

**Задача:** сессия живёт 90 дней в браузере.

**Файлы:** `apps/webapp/src/modules/auth/service.ts`, места установки cookie.

**Ограничения:** изменение cookie затрагивает **все** роли; обязательны регресс-тесты exchange/telegram-init; **отдельный PR** после стабилизации 5.1–5.6.

**Микро-шаги:**

| ID | Задача | Тесты | Проверки |
|----|--------|-------|----------|
| **5.7a** | Константы TTL / sliding window в одном модуле | Unit | `ci` |
| **5.7b** | Различие miniapp vs browser по заголовку/параметру (как сейчас в репо) | Интеграционные | `ci` |
| **5.7c** | Документировать в `docs/ARCHITECTURE` или SERVER CONVENTIONS (без секретов) | — | Ревью |

**Критерий успеха 5.7:** ручная проверка: cookie `Expires` в браузере; мини-апп — session.

---

## Подэтап 5.8: Предложение настроить безопасность после входа

**Задача:** после первого входа предложить задать PIN / привязать мессенджер / OAuth.

**Файлы:** `PostLoginSuggestion.tsx` (client).

**Ограничения:** не блокировать навигацию; `localStorage` ключ с версией схемы (`bc_post_login_nudge_v1`); учитывать гостевой режим — не показывать на публичных страницах без сессии.

**Микро-шаги:**

| ID | Задача | Тесты | Проверки |
|----|--------|-------|----------|
| **5.8a** | Условие показа: флаг в сессии «first login» или отсутствие PIN | Unit | `ci` |
| **5.8b** | Логика «раз в 7 дней» — детерминированная дата в localStorage | Unit | `ci` |
| **5.8c** | Кнопки ведут на существующие экраны профиля / bind-phone | E2E in-process опционально | `ci` + `test:e2e` |

**Критерий успеха 5.8:** после закрытия не показывается 7 дней; не ломает SSR (только client component).

---

## Общий критерий завершения этапа 5

- [ ] Ввод телефона → определение методов → выбор → авторизация — весь flow работает.
- [ ] PIN: создание, вход, блокировка после 5 попыток, fallback на SMS.
- [ ] Telegram login: deep-link → подтверждение в боте → сессия в браузере.
- [ ] Max login: аналогично (или через код) / явный TODO не в проде без флага.
- [ ] OAuth: минимум Яндекс работает (или задокументированный disabled).
- [ ] SMS: существующий flow + rate-limit **сохранены**.
- [ ] Длительная сессия (90 дней browser, session Mini App) — если включено в релиз.
- [ ] Предложение настроить безопасность после входа.
- [ ] **Unit + in-process e2e** на каждый новый публичный API и критичный UI-поток; при необходимости live e2e с `WEBAPP_E2E_BASE_URL`.
- [ ] `pnpm run ci` проходит.
- [ ] `pnpm --dir apps/webapp run test:e2e` проходит.

---

## Чеклист режима «авто» (кратко)

1. Прочитать **Важно**, **Ограничения**, **План ↔ репо**.
2. Выбрать **один** микро-шаг (5.1a … 5.8c); не смешивать OAuth + миграции + integrator в одном PR.
3. После шага: **`pnpm run ci`** и **`pnpm --dir apps/webapp run test:e2e`**.
4. Любая неопределённость с ключами OAuth / Apple — **остановиться** (таблица «Когда остановиться»).
5. Обновить **номер миграции** и **env-пример** в репозитории при добавлении конфигурации.

---

## Документы репозитория (этап 5)

| Файл | Содержание |
|------|------------|
| [`OAUTH_ENV.md`](./OAUTH_ENV.md) | Переменные Яндекс OAuth и `NEXT_PUBLIC_AUTH_V2` |
| [`TOKEN_FORMAT.md`](./TOKEN_FORMAT.md) | Разделение `login_*` vs `link_*` для интегратора |
| [`SECURITY.md`](./SECURITY.md) | Угрозы, rate limits, PIN/OAuth |

**Ревью (готовность к следующему этапу плана):** миграции `020`–`021`, идемпотентный `messenger/poll` (`session_issued_at`), лимит `messenger/start`, UI v2 на shadcn/Tailwind, тесты route + e2e; интегратор `/start login_*` (5.4), полный OAuth callback Яндекса (5.5) и сессия 90д (5.7) — по отдельным шагам общего плана.
