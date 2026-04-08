# Публичный вход (web), PIN и архитектура auth

Каноническое описание модуля авторизации в коде: **`apps/webapp/src/modules/auth/auth.md`** (Telegram Login primary, OTP, OAuth backend-only, роли, API).

## Текущий контракт (Stage 5+)

- В **публичном** потоке входа на `/app` (`AuthFlowV2`) шаги **ввода PIN** и **установки PIN после OTP** отключены: после успешного SMS/Telegram/OTP пользователь сразу попадает в приложение по `redirectTo`.
- **PIN** остаётся опциональной функцией: API `POST /api/auth/pin/login`, `POST /api/auth/pin/set`, `POST /api/auth/pin/verify` и сценарии в **профиле** / отдельных экранах не удалялись.
- **Yandex OAuth** — только backend (`/api/auth/oauth/*`), ключи в `system_settings`; в публичном UI кнопки нет.
- **Email** — канал OTP и профиль; не единственный обязательный способ входа на первом экране.

См. реализацию UI: `apps/webapp/src/shared/ui/auth/AuthFlowV2.tsx`.

## Telegram Mini App и контакт в боте

Если пользователь открыл Mini App до привязки номера в чате, показывается гейт с инструкцией и опросом `/api/me` (см. `docs/AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md`, `MiniAppShareContactGate`, layout `app/app/patient/layout.tsx`).
