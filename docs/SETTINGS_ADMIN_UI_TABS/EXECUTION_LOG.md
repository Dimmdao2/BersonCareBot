# Execution Log: Admin settings tabs (webapp)

## Цель

Реорганизация админских вкладок на `/app/settings`: «Параметры приложения», «Авторизация», «Доступ и роли», интеграции и каталог; разнесение бывшего `RuntimeConfigSection`; документация по redirect URI Google OAuth; см. план Admin Settings Tabs Refactor.

## Записи

### 2026-04-16 — Вкладка «Здоровье системы» + мобильный фикс вкладок

- **Статус:** выполнено
- **Аудит health-источников (этап 0):**
  - webapp `GET /api/health` использует только `checkDbHealth` (`db: up|down`);
  - projection health в webapp проксируется через `proxyIntegratorProjectionHealth` -> `{INTEGRATOR_API_URL}/health/projection`;
  - integrator `/health/projection` отдаёт snapshot `projection_outbox` (pending/dead/cancelled/retries/lastSuccessAt) и при ошибке возвращает safe fallback;
  - ограничения variant 1 подтверждены: нет прямого runtime статуса systemd/cron и process-level API, backup journal без подключённого источника.
- **Аудит mobile бага (этап 0):**
  - прежний `TabsList` рендерился на mobile тем же вертикальным блоком, что и desktop sidebar, из-за чего в узкой вёрстке UX был конфликтный и плохо управляемый;
  - выбранное исправление: mobile dropdown (`sm:hidden`) + существующий вертикальный `TabsList` только на `sm+`.
- **Реализация (этап 1):**
  - `apps/webapp/src/app/api/admin/system-health/route.ts`: новый guard `requireAdminModeSession`, параллельные пробы (`Promise.allSettled`) webapp DB + integrator `/health` + projection; стабильный JSON-контракт `webappDb/integratorApi/projection/fetchedAt`; нормализация сбоев в `status: unreachable|error`; техническое логирование проб (`probe`, `status`, `durationMs`, `errorCode`).
  - `apps/webapp/src/app/app/settings/SystemHealthSection.tsx`: client UI с `GET /api/admin/system-health`, кнопкой «Обновить», блоками «Сервисы и БД», «Воркеры (косвенно)», «Журнал бэкапов» (placeholder `источник не подключен`).
  - `apps/webapp/src/app/app/settings/AdminSettingsTabsClient.tsx`: добавлена вкладка `system-health`; mobile `<select>` на общем `value/setValue`; `TabsList` скрыт на mobile и показан на `sm+`.
  - `apps/webapp/src/app/app/settings/page.tsx`: подключён `SystemHealthSection`.
- **Итоговое UI-поведение:**
  - mobile: выбор вкладки через dropdown, контент активной вкладки отображается стабильно;
  - `sm+`: сохранён desktop-режим с вертикальным списком вкладок;
  - вкладка «Здоровье системы» отображает косвенное состояние сервисов/БД и статусы воркеров по health-сигналам.
- **Документация:** обновлены `docs/README.md` и `apps/webapp/src/app/app/settings/settings.md`.

### 2026-04-08 — Реализация

- **Статус:** выполнено
- **UI:** добавлены `AppParametersSection.tsx`, `AuthProvidersSection.tsx`, `AccessListsSection.tsx`, `patchAdminSetting.ts`; удалён `RuntimeConfigSection.tsx`; обновлён `apps/webapp/src/app/app/settings/page.tsx` (6 вкладок, `TabsList` с `flex-wrap`).
- **Документация:** `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` (подраздел про redirect URI Google), `docs/README.md`, `apps/webapp/src/app/app/settings/settings.md`, правки в `docs/AUTH_RESTRUCTURE/AUDIT_STAGE_7.md`, `AUDIT_STAGE_8.md`; ссылки в `PLAN_BOOKING_TIMEZONE_TO_DB.md` обновлены на новый компонент таймзоны.
- **Проверки:** `pnpm install --frozen-lockfile && pnpm run ci` — exit 0 (2026-04-08).

### 2026-04-08 — Хвосты документации

- **Статус:** выполнено
- **`docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md`:** блок «Актуализация путей admin settings»; пометки у строк с `RuntimeConfigSection.tsx` в исторических записях; уточнён текст S3.T07.
- **`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`:** вайтлисты — явно указано, что в UI `/app/settings` только Telegram/Max, телефоны через API; формулировка про Google login; в «Связанные файлы» добавлены компоненты настроек.
- **`apps/webapp/src/app/app/settings/settings.md`:** примечание про phone whitelist и ссылка на архитектурный документ.
