# Этап 5: Система авторизации

> Приоритет: P2
> Зависимости: Этап 3 (профиль, deep-link привязка мессенджеров)
> Риск: средний (множество auth-методов, безопасность)

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

**Файлы:**
- Миграция: `apps/webapp/migrations/017_auth_methods.sql`
- Модуль: `apps/webapp/src/modules/auth/`

**Действия:**
1. Миграция:
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
   CREATE INDEX idx_oauth_user ON user_oauth_bindings(user_id);

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
   CREATE INDEX idx_login_tokens_status ON login_tokens(status, expires_at) WHERE status = 'pending';
   ```
2. API endpoints:
   - `POST /api/auth/check-phone` → возвращает `{ exists, methods: ['pin', 'telegram', 'max', 'google', 'sms'] }`.
   - `POST /api/auth/pin/login` → phone + PIN → сессия.
   - `POST /api/auth/messenger/start` → генерация login_token, возвращает deep-link URL.
   - `POST /api/auth/messenger/poll` → проверка статуса login_token (polling).
   - `POST /api/auth/oauth/start` → redirect URL для провайдера.
   - `GET /api/auth/oauth/callback` → обработка callback, создание сессии.
   - `POST /api/auth/phone/start` → SMS OTP (существующий, с rate-limit).
   - `POST /api/auth/phone/confirm` → подтверждение OTP (существующий).
3. Хэширование PIN: `argon2.hash(pin)`, `argon2.verify(hash, pin)`.
4. PIN: 4–6 цифр, блокировка после 5 неудачных попыток на 15 мин.

**Критерий:**
- API: check-phone, PIN login, messenger login, OAuth, SMS — все работают.
- Таблицы созданы.
- `pnpm run ci` проходит.

---

## Подэтап 5.2: UI — экран авторизации (переработка)

**Задача:** единый экран входа с выбором метода.

**Файлы:**
- `apps/webapp/src/shared/ui/AuthBootstrap.tsx` (переписать)
- Новые компоненты: `PhoneInput.tsx`, `MethodPicker.tsx`, `PinInput.tsx`, `MessengerLogin.tsx`

**Действия:**
1. **Шаг 1: ввод телефона.**
   - Поле ввода номера + кнопка «Продолжить».
   - При отправке: `POST /api/auth/check-phone`.
2. **Шаг 2: выбор метода (existing user).**
   - Показать доступные методы как кнопки/карточки:
     - 🔢 PIN-код (если задан) — наверху, как основной.
     - 📱 Войти через Telegram (если привязан).
     - 💬 Войти через Max (если привязан).
     - 🔗 Google / Apple / Яндекс (если привязан).
     - 📩 Получить SMS-код — внизу, как fallback.
   - При выборе → переход к соответствующей форме.
3. **Шаг 2 (new user):**
   - Отправка SMS-кода автоматически.
   - Или кнопка «Войти через Google/Apple/Яндекс».
4. Компонент `MethodPicker` — переиспользуемый, получает список методов.

**Критерий:**
- Existing user видит все доступные методы.
- New user получает SMS или OAuth.
- Переход между шагами плавный.

---

## Подэтап 5.3: Вход по PIN

**Задача:** форма ввода PIN-кода.

**Файлы:**
- Компонент `PinInput.tsx`

**Действия:**
1. 4–6 цифровых полей (auto-focus на следующее).
2. При заполнении: автоматическая отправка `POST /api/auth/pin/login`.
3. При ошибке: очистка полей, сообщение «Неверный PIN-код» + счётчик оставшихся попыток.
4. При блокировке: «Слишком много попыток. Попробуйте через 15 минут» + кнопка «Войти по SMS».
5. Ссылка «Забыли PIN?» → SMS fallback.

**Критерий:**
- Ввод PIN: auto-focus, auto-submit.
- Блокировка после 5 попыток.
- Fallback на SMS.

---

## Подэтап 5.4: Вход через мессенджер (Telegram / Max)

**Задача:** авторизация через deep-link в бота.

**Файлы:**
- Компонент `MessengerLogin.tsx`
- Integrator: сценарий `message.received` с match `/start login_*`

**Действия:**
1. UI: при выборе «Войти через Telegram»:
   - Вызов `POST /api/auth/messenger/start` → получение `{ token, deepLink }`.
   - Показать кнопку «Открыть Telegram» (ссылка на deep-link).
   - Начать polling: `POST /api/auth/messenger/poll` каждые 2 сек.
   - При подтверждении → создание сессии → redirect на главную.
   - Таймер: 5 мин. При истечении — «Время истекло» + кнопка «Попробовать снова».
2. Integrator: сценарий для `/start login_<token>`:
   - Извлечь token.
   - Проверить в webapp API: `POST /api/auth/messenger/confirm`.
   - Если валиден: пометить `login_tokens.status = 'confirmed'`.
   - Ответить в чат: «Вы успешно вошли в BersonCare!».
3. Аналогично для Max (если deep-link поддерживается; иначе — показать код для ввода в чат).

**Критерий:**
- Telegram: нажал «Открыть» → подтвердил в боте → сессия создана в браузере.
- Max: аналогично (или через код).
- Polling корректно завершается.

---

## Подэтап 5.5: OAuth (Google / Apple / Яндекс)

**Задача:** вход через внешних провайдеров.

**Файлы:**
- `apps/webapp/src/modules/auth/oauth.ts`
- API routes: `/api/auth/oauth/start`, `/api/auth/oauth/callback`

**Действия:**
1. Поддержка провайдеров (начать с Яндекс — российский, проще):
   - Яндекс ID: OAuth2, `https://oauth.yandex.ru/authorize`.
   - Google: OAuth2, `https://accounts.google.com/o/oauth2/v2/auth`.
   - Apple: Sign in with Apple (позже, сложнее).
2. Flow:
   - `POST /api/auth/oauth/start?provider=yandex` → redirect URL.
   - Браузер → провайдер → callback.
   - `GET /api/auth/oauth/callback?provider=yandex&code=...` → получение provider_user_id.
   - Поиск в `user_oauth_bindings`.
   - Если найден → создание сессии.
   - Если не найден (new user) → создать юзера, запросить телефон.
3. Привязка OAuth в профиле: кнопка «Привязать Google/Яндекс» → тот же OAuth flow, но привязка к существующему user.

**Критерий:**
- Яндекс OAuth работает.
- Привязка в профиле работает.
- Google OAuth работает (если ключи предоставлены).

---

## Подэтап 5.6: Создание PIN в профиле

**Задача:** пользователь может задать PIN-код после входа.

**Файлы:**
- `apps/webapp/src/app/app/patient/profile/` — компонент `PinSection.tsx`

**Действия:**
1. В профиле, блок «Безопасность»:
   - Если PIN не задан: кнопка «Задать PIN-код».
   - Если задан: кнопка «Изменить PIN-код».
2. Форма: ввод PIN (4–6 цифр) + подтверждение.
3. Вызов `POST /api/auth/pin/set` (требует сессию).
4. Toast: «PIN-код установлен».

**Критерий:**
- Создание и изменение PIN работает.
- Валидация: 4–6 цифр, совпадение полей.

---

## Подэтап 5.7: Длительная сессия

**Задача:** сессия живёт 90 дней в браузере.

**Файлы:**
- `apps/webapp/src/modules/auth/service.ts`

**Действия:**
1. TTL сессии: 90 дней (browser), session cookie (Mini App — удаляется при закрытии).
2. Продление: при активности, если до истечения < 30 дней.
3. `session_type` в cookie: `browser` vs `miniapp`.
4. Browser: `Expires` = 90 дней, `SameSite=Lax`, `HttpOnly`, `Secure`.
5. Mini App: session cookie без `Expires`.

**Критерий:**
- Browser: 90 дней при активности.
- Mini App: не переживает закрытие.

---

## Подэтап 5.8: Предложение настроить безопасность после входа

**Задача:** после первого входа предложить задать PIN / привязать мессенджер / OAuth.

**Файлы:**
- Компонент `PostLoginSuggestion.tsx`

**Действия:**
1. После успешного входа по SMS (первый раз или без PIN):
   - Показать карточку/модал: «Для быстрого входа в следующий раз:»
     - 🔢 Задать PIN-код (рекомендуется).
     - 📱 Привязать Telegram.
     - 💬 Привязать Max.
     - 🔗 Привязать Google / Яндекс.
   - Кнопка «Позже» — закрыть.
2. Показывать не чаще 1 раза в неделю (хранить в localStorage).

**Критерий:**
- Предложение появляется после SMS-входа.
- Не навязчивое, можно закрыть.
- Не показывается повторно в течение недели.

---

## Общий критерий завершения этапа 5

- [ ] Ввод телефона → определение методов → выбор → авторизация — весь flow работает.
- [ ] PIN: создание, вход, блокировка после 5 попыток, fallback на SMS.
- [ ] Telegram login: deep-link → подтверждение в боте → сессия в браузере.
- [ ] Max login: аналогично (или через код).
- [ ] OAuth: минимум Яндекс работает.
- [ ] SMS: существующий flow + двойной rate-limit (браузер + сервер).
- [ ] Длительная сессия (90 дней browser, session Mini App).
- [ ] Предложение настроить безопасность после входа.
- [ ] E2E-тесты на все auth-flow.
- [ ] `pnpm run ci` проходит.
