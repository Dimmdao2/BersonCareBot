# auth

Авторизация и сессии вебаппа.

- Текущая сессия хранится в cookie; срок жизни задаётся константой.
- **getCurrentSession** — чтение сессии из cookie (проверка подписи, срока).
- **exchangeIntegratorToken** — обмен JWT-токена от бота (ссылка «войти в приложение») на сессию вебаппа; в payload токена: sub (userId), role, displayName, phone, bindings, purpose, exp.
- **exchangeTelegramInitData** — вход по данным Telegram Mini App (initData): проверка подписи и срока, создание/привязка пользователя и сессия.
- **clearSession** — выход (удаление cookie).

Используется на странице входа и в API auth/exchange, auth/telegram-init, auth/logout.
