# Этап 5: Авторизация по паролю

> Приоритет: P2
> Зависимости: Этап 3 (профиль)
> Риск: средний (безопасность)

---

## Подэтап 5.1: Backend — пароль

**Задача:** таблица, хэширование, API.

**Файлы:**
- Миграция: `apps/webapp/migrations/017_user_passwords.sql`
- Новый: `apps/webapp/src/modules/auth/passwordAuth.ts`
- `apps/webapp/src/app/api/auth/password/`

**Действия:**
1. Установить `argon2`: `pnpm --filter webapp add argon2`.
2. Миграция:
   ```sql
   CREATE TABLE IF NOT EXISTS user_passwords (
     user_id UUID PRIMARY KEY REFERENCES platform_users(id) ON DELETE CASCADE,
     password_hash TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS password_reset_tokens (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
     token_hash TEXT NOT NULL,
     expires_at TIMESTAMPTZ NOT NULL,
     used_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_id);
   ```
3. API endpoints:
   - `POST /api/auth/password/set` — создание/обновление пароля (требует действующую сессию).
   - `POST /api/auth/password/login` — вход по phone/email + пароль.
   - `POST /api/auth/password/reset-request` — запрос сброса (отправка ссылки на email/SMS).
   - `POST /api/auth/password/reset-confirm` — подтверждение сброса (token + новый пароль).
4. Хэширование: `argon2.hash(password)`, `argon2.verify(hash, password)`.
5. Валидация пароля: минимум 8 символов, Zod schema.

**Критерий:**
- API: создание пароля, вход, сброс — работают.
- Пароль хранится как argon2 hash.
- `pnpm run ci` проходит.

---

## Подэтап 5.2: UI — создание пароля в профиле

**Задача:** форма в профиле для создания пароля.

**Файлы:**
- `apps/webapp/src/app/app/patient/profile/` — новый компонент `PasswordSection.tsx`

**Действия:**
1. В профиле, блок «Безопасность»:
   - Если пароль не установлен: кнопка «Создать пароль».
   - Если установлен: кнопка «Изменить пароль».
2. При нажатии: два поля (пароль + подтверждение), кнопка «Сохранить».
3. Вызов `POST /api/auth/password/set`.
4. Toast: «Пароль создан» / «Пароль изменён».

**Критерий:**
- Пользователь может создать пароль из профиля.
- Валидация: минимум 8 символов, совпадение полей.

---

## Подэтап 5.3: UI — вход по паролю

**Задача:** экран логина с вариантом «по паролю».

**Файлы:**
- `apps/webapp/src/shared/ui/AuthBootstrap.tsx` или аналог
- Новый: `PasswordLoginForm.tsx`

**Действия:**
1. На экране авторизации добавить вкладку/ссылку «Войти по паролю».
2. Форма: телефон или email + пароль.
3. Вызов `POST /api/auth/password/login`.
4. При успехе — redirect на главную.
5. При неудаче — сообщение об ошибке.

**Критерий:**
- Вход по паролю работает для пользователей, у которых он установлен.
- Ошибки отображаются.

---

## Подэтап 5.4: Сброс пароля

**Задача:** восстановление доступа через email/SMS.

**Файлы:**
- `apps/webapp/src/modules/auth/passwordAuth.ts`
- UI: `ForgotPasswordForm.tsx`

**Действия:**
1. На экране входа по паролю — ссылка «Забыли пароль?».
2. Форма: ввод телефона или email.
3. Backend: генерация токена, отправка ссылки/кода.
4. Экран ввода нового пароля (по ссылке или коду).
5. Rate-limit: не чаще 1 запроса в 5 мин.

**Критерий:**
- Пользователь может сбросить пароль.
- Старые сессии не инвалидируются (обсудить — возможно стоит).

---

## Подэтап 5.5: Длительная сессия

**Задача:** сессия живёт 90 дней при активности.

**Файлы:**
- `apps/webapp/src/modules/auth/service.ts`

**Действия:**
1. Увеличить TTL сессии: 90 дней (для browser), 12ч (для Mini App — не менять).
2. При каждом запросе: если до истечения < 30 дней — продлить.
3. Добавить `session_type` в cookie: `browser` vs `miniapp`.
4. Для `miniapp`: не сохранять session cookie с `Expires` (session cookie — удаляется при закрытии).
5. Для `browser`: `Expires` = 90 дней, `SameSite=Lax`, `HttpOnly`, `Secure`.

**Критерий:**
- В браузере: сессия живёт 90 дней при активности.
- В Mini App: сессия не переживает закрытие приложения.
- `channelContext` не утекает из Mini App в браузер.

---

## Общий критерий завершения этапа 5

- [ ] Пароль: создание, вход, сброс — все flow работают.
- [ ] Длительная сессия в браузере (90 дней).
- [ ] Mini App сессия не утекает в браузер.
- [ ] `pnpm run ci` проходит.
