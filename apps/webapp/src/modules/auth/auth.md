# auth

Авторизация и сессии вебаппа.

- Текущая сессия хранится в cookie; срок жизни задаётся константой.
- **getCurrentSession** — чтение сессии из cookie (проверка подписи, срока).
- **exchangeIntegratorToken** — обмен JWT-токена от бота (ссылка «войти в приложение») на сессию вебаппа; в payload токена: sub (userId), role, displayName, phone, bindings, purpose, exp.
- **exchangeTelegramInitData** — вход по данным Telegram Mini App (initData): проверка подписи и срока, создание/привязка пользователя и сессия.
- **clearSession** — выход (удаление cookie).
- **setSessionFromUser** — установка сессии по пользователю (для входа по SMS и др.).
- **startPhoneAuth** / **confirmPhoneAuth** — вход по номеру телефона с подтверждением SMS: отправка кода через порт интегратора, проверка кода, поиск/создание пользователя по номеру и привязка канала (telegram/vk/max/web), создание сессии. Контекст канала передаётся с клиента (channel, chatId).

Порты: **SmsPort** (sendCode, verifyCode), **PhoneChallengeStore**, **UserByPhonePort** (findByPhone, createOrBind). Stub-адаптер SMS и in-memory хранилища — в infra.

Используется на странице входа и в API auth/exchange, auth/telegram-init, auth/phone/start, auth/phone/confirm, auth/logout.

**Роль из env:** `resolveRoleFromEnv` сверяет телефон (`ADMIN_PHONES` / `DOCTOR_PHONES`), Telegram id (`ADMIN_TELEGRAM_ID`, `DOCTOR_TELEGRAM_IDS`) и Max id (`ADMIN_MAX_IDS`, `DOCTOR_MAX_IDS`) — нужно для mini-app и обмена integrator token без телефона в payload.
