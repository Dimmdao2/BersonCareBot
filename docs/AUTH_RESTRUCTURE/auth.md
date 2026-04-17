# Публичный вход (web), PIN и архитектура auth

Каноническое описание модуля авторизации в коде: **`apps/webapp/src/modules/auth/auth.md`** (Telegram Login, OTP, OAuth в веб-UI, роли, API). Снимок экрана входа (2026-04): `docs/archive/2026-04-docs-cleanup/reports/LOGIN_WEBAPP_UX_SYNC_2026-04-13.md`.

## Текущий контракт (Stage 5+)

- В **публичном** потоке входа на `/app` (`AuthFlowV2`) шаги **ввода PIN** и **установки PIN после OTP** отключены: после успешного SMS/Telegram/OTP пользователь сразу попадает в приложение по `redirectTo`.
- **PIN** остаётся опциональной функцией: API `POST /api/auth/pin/login`, `POST /api/auth/pin/set`, `POST /api/auth/pin/verify` и сценарии в **профиле** / отдельных экранах не удалялись.
- **OAuth (Яндекс / Google / Apple / Max)** — см. канон `apps/webapp/src/modules/auth/auth.md`: публичные кнопки в `AuthFlowV2`, Apple только в режиме «только Apple» (без Яндекса и Google в провайдерах).
- **Email** — канал OTP и профиль; не единственный обязательный способ входа на первом экране.

См. реализацию UI: `apps/webapp/src/shared/ui/auth/AuthFlowV2.tsx`.

## Telegram Mini App и контакт в боте

**Два слоя:** (1) **бот (integrator)** — без привязанного номера в канале релевантные действия в чате не открывают полноценное меню/WebApp, а ведут в `request_contact` / сценарии `linkedPhone: false`; (2) **Mini App** — если WebApp уже открыт, а tier **patient** в webapp ещё нет, гейт в layout (`MiniAppShareContactGate`) и M2M `request-contact` подстраховывают до синхронизации. Подробно: `docs/AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md`.

Если пользователь в мессенджерном Mini App без tier **patient**, показывается гейт с опросом `/api/me`, кнопкой запроса контакта в чат и при необходимости ссылкой на бота. При 401 до гейта — восстановление сессии (`miniAppSessionRecovery`, `telegram-init` / `exchange` по `t`); при позднем `initData` во время интерактивного входа на `/app` см. **binding-candidate** в `apps/webapp/src/shared/lib/messengerBindingCandidate.ts` и раздел в `apps/webapp/src/modules/auth/auth.md`. Разбор `/api/me` — `patientMessengerContactGate.ts` (ошибка ответа не 401 — экран «сервис недоступен», гейт не снимается). Обязательный телефон / tier patient для разделов пациента — `patientRouteApiPolicy` (`platform-access`) + серверный layout и API **`requirePatientApiBusinessAccess`** (см. `app-layer/guards/guards.md`).

### Следующая фаза (отложено): явная state-модель для `AuthBootstrap`

Текущий bootstrap по-прежнему опирается на **смесь** `useState` / `useRef` / таймеров и guard-веток (без отдельного reducer / state machine). Это **намеренно не переписывалось** в цикле точечных доработок (ранний UI, epoch, prefetch, binding-candidate, observability), чтобы не рисковать регрессией в критическом входе.

**Зачем позже:** вынести слои «детект контекста / режим UI / первичная auth-попытка» в **явные состояния и переходы**, уменьшить скрытые гонки, упростить сопровождение и безопаснее наращивать сценарии (MAX/TG/token/OAuth). Цель будущего этапа — не смена продуктовых правил, а **упорядочивание кода** (явные состояния, явные переходы, единый источник правды по epoch/cancellation). Этот рефакторинг **не входит** в текущий объём работ; статус по исполнению жёсткого плана см. `/.cursor/plans/auth_flow_strict_hardening_8718651e.plan.md` (§13 аудит и обновления после 2026-04-17).

**Правки после внутреннего аудита (2026-04-17):** в `ensureMessengerMiniAppWebappSession` после неуспешного HTTP по binding-candidate выполнение **не обрывается** — сохраняется fallback на `exchange` по `?t=`; late initData в bootstrap **дедуплируется** по строке initData на эпоху; `loadMiniappAuthHelpLinks` передаёт `x-bc-auth-correlation-id`. Подробнее: `docs/archive/2026-04-docs-cleanup/reports/AGENT_LOG_2026-04-17-auth-bootstrap-audit-fixes.md`, `apps/webapp/src/modules/auth/auth.md`.
