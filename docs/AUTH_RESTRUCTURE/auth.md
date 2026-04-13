# Публичный вход (web), PIN и архитектура auth

Каноническое описание модуля авторизации в коде: **`apps/webapp/src/modules/auth/auth.md`** (Telegram Login, OTP, OAuth в веб-UI, роли, API). Краткий отчёт по актуальному экрану входа: `docs/REPORTS/LOGIN_WEBAPP_UX_SYNC_2026-04-13.md`.

## Текущий контракт (Stage 5+)

- В **публичном** потоке входа на `/app` (`AuthFlowV2`) шаги **ввода PIN** и **установки PIN после OTP** отключены: после успешного SMS/Telegram/OTP пользователь сразу попадает в приложение по `redirectTo`.
- **PIN** остаётся опциональной функцией: API `POST /api/auth/pin/login`, `POST /api/auth/pin/set`, `POST /api/auth/pin/verify` и сценарии в **профиле** / отдельных экранах не удалялись.
- **OAuth (Яндекс / Google / Apple / Max)** — см. канон `apps/webapp/src/modules/auth/auth.md`: публичные кнопки в `AuthFlowV2`, Apple только в режиме «только Apple» (без Яндекса и Google в провайдерах).
- **Email** — канал OTP и профиль; не единственный обязательный способ входа на первом экране.

См. реализацию UI: `apps/webapp/src/shared/ui/auth/AuthFlowV2.tsx`.

## Telegram Mini App и контакт в боте

**Два слоя:** (1) **бот (integrator)** — без привязанного номера в канале релевантные действия в чате не открывают полноценное меню/WebApp, а ведут в `request_contact` / сценарии `linkedPhone: false`; (2) **Mini App** — если WebApp уже открыт, а tier **patient** в webapp ещё нет, гейт в layout (`MiniAppShareContactGate`) и M2M `request-contact` подстраховывают до синхронизации. Подробно: `docs/AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md`.

Если пользователь в мессенджерном Mini App без tier **patient**, показывается гейт с опросом `/api/me`, кнопкой запроса контакта в чат и при необходимости ссылкой на бота. При 401 до гейта — восстановление сессии (`miniAppSessionRecovery`, `telegram-init` / `exchange` по `t`); разбор `/api/me` — `patientMessengerContactGate.ts` (ошибка ответа не 401 — экран «сервис недоступен», гейт не снимается). Обязательный телефон / tier patient для разделов пациента — `patientRouteApiPolicy` (`platform-access`) + серверный layout и API **`requirePatientApiBusinessAccess`** (см. `app-layer/guards/guards.md`).
