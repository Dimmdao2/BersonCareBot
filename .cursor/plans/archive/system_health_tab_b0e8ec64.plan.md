---
name: System Health Tab
overview: Auto-agent план для вкладки «Здоровье системы» (вариант 1) и мобильного фикса вкладок админки. Сначала аудит, затем фиксы; тесты и push вынесены в отдельные задачи.
status: completed
todos:
  - id: audit-current-state
    content: "Аудит текущих health-источников, ограничений варианта 1 и причины мобильного бага"
    status: completed
  - id: audit-contract
    content: "Зафиксировать API-контракт /api/admin/system-health и правила статусов в UI до начала фиксов"
    status: completed
  - id: fix-mobile-tabs
    content: "Исправить мобильную навигацию вкладок: dropdown на small экранах, tabs-list на sm+"
    status: completed
  - id: fix-system-health-api
    content: "Добавить admin API-агрегатор system-health с guard, таймаутами и нормализацией ошибок"
    status: completed
  - id: fix-system-health-ui
    content: "Добавить SystemHealthSection: сервисы/БД, воркеры (косвенно), backup journal placeholder"
    status: completed
  - id: fix-wire-tab
    content: "Подключить вкладку system-health в AdminSettingsTabsClient и settings/page.tsx"
    status: completed
  - id: docs-update
    content: "Обновить docs и execution log по новой вкладке, ограничениям и мобильному фиксу"
    status: completed
  - id: handoff-no-tests-no-push
    content: "Сформировать handoff с явной пометкой: тесты не запускались, push не выполнялся"
    status: completed
isProject: false
---

**Архив:** реализовано в webapp — `GET /api/admin/system-health`, `SystemHealthSection`, вкладка `adminTab=system-health`, тесты `SystemHealthSection*.test.tsx`. Расширения cron/HLS/reconcile — см. архивный план `cron_and_system_health.plan.md` в этом каталоге.

# Вкладка «Здоровье системы» + мобильный фикс (auto-agent ready)

## Жесткие ограничения

- Использовать только **вариант 1**: косвенные сигналы, без systemd/process-level API.
- **Тесты в этом плане не запускать** (отдельная задача).
- **Push в этом плане не делать** (отдельная задача по отдельному запросу).
- Не добавлять новые env-переменные для интеграционных ключей/URI.

## Этап 0 — Аудит (отдельные задачи)

### A. Аудит источников здоровья и ограничений

Проверить и зафиксировать в логе задачи:
- [`/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/api/health/route.ts`](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/api/health/route.ts)
- [`/home/dev/dev-projects/BersonCareBot/apps/webapp/src/infra/health/proxyIntegratorProjectionHealth.ts`](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/infra/health/proxyIntegratorProjectionHealth.ts)
- [`/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/api/health/projection/route.ts`](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/api/health/projection/route.ts)
- [`/home/dev/dev-projects/BersonCareBot/apps/integrator/src/infra/db/repos/projectionHealth.ts`](/home/dev/dev-projects/BersonCareBot/apps/integrator/src/infra/db/repos/projectionHealth.ts)

Критерий завершения:
- Явно зафиксированы ограничения: нет прямого runtime статуса systemd/cron, backup journal без подключенного источника.

### B. Аудит мобильного бага вкладок

Проверить и описать причину:
- [`/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/app/settings/AdminSettingsTabsClient.tsx`](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/app/settings/AdminSettingsTabsClient.tsx)
- [`/home/dev/dev-projects/BersonCareBot/apps/webapp/src/components/ui/tabs.tsx`](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/components/ui/tabs.tsx)

Критерий завершения:
- В execution log зафиксирована причина (конфликт мобильной раскладки) и выбранный способ исправления (mobile dropdown + desktop tabs).

## Этап 1 — Фиксы (отдельные задачи после аудита)

### 1) Мобильная навигация вкладок админки

Файл:
- [`/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/app/settings/AdminSettingsTabsClient.tsx`](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/app/settings/AdminSettingsTabsClient.tsx)

Сделать:
- Добавить `<select>` для мобильного (`sm:hidden`) на том же `value/setValue`.
- Скрыть `TabsList` на mobile и показать на `sm+`.
- Сохранить текущую desktop-механику вкладок.

DoD:
- На малом экране видно dropdown и контент выбранной вкладки.
- На `sm+` виден вертикальный список вкладок и контент не пропадает.

### 2) API `/api/admin/system-health`

Новый файл:
- [`/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/api/admin/system-health/route.ts`](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/api/admin/system-health/route.ts)

Сделать:
- Guard через `requireAdminModeSession()`.
- Сбор данных параллельно (`Promise.allSettled`):
  - webapp DB (`checkDbHealth`),
  - integrator `/health`,
  - projection health (через существующий proxy helper).
- Нормализовать ошибки к стабильному JSON контракту.

Минимальный контракт:
```ts
{
  webappDb: "up" | "down";
  integratorApi: { status: "ok" | "unreachable" | "error"; db?: "up" | "down" };
  projection: { status: "ok" | "degraded" | "unreachable" | "error"; snapshot?: unknown };
  fetchedAt: string;
}
```

### 3) UI `SystemHealthSection`

Новый файл:
- [`/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/app/settings/SystemHealthSection.tsx`](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/app/settings/SystemHealthSection.tsx)

Сделать:
- Client-component с загрузкой `GET /api/admin/system-health`.
- Кнопка `Обновить`.
- 3 блока:
  - сервисы и БД,
  - воркеры (косвенный статус),
  - журнал бэкапов (placeholder `источник не подключен`).

Матрица статусов воркеров:
- `bersoncarebot-api-prod`: из integrator `/health`.
- `bersoncarebot-worker-prod`: из `projection.lastSuccessAt` (активен/нет активности/нет сигнала).
- `bersoncarebot-webapp-prod`: `running`.
- media cron workers: `нет источника`.

### 4) Подключение вкладки

Файлы:
- [`/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/app/settings/AdminSettingsTabsClient.tsx`](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/app/settings/AdminSettingsTabsClient.tsx)
- [`/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/app/settings/page.tsx`](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/app/app/settings/page.tsx)

Сделать:
- Добавить `system-health` в `ADMIN_SECTIONS`.
- Расширить props `AdminSettingsTabsClient`.
- Пробросить `systemHealth={<SystemHealthSection />}`.

## Логи и документация

### Логирование (в рамках фиксов)

- Для нового route логировать только технические поля: `probe`, `status`, `durationMs`, `errorCode`.
- Не писать в логи секреты, токены, полный ответ внешних сервисов.

### Документация (обязательный шаг)

- Обновить [`/home/dev/dev-projects/BersonCareBot/docs/README.md`](/home/dev/dev-projects/BersonCareBot/docs/README.md) ссылкой на изменение админки/health-вкладки.
- Добавить execution log в профильный раздел docs с:
  - итоговым UI-поведением,
  - ограничениями варианта 1,
  - пояснением про backup journal placeholder.

## Проверка соответствия `.cursor/rules`

- `runtime-config-env-vs-db.mdc`: новых env-ключей для интеграций не добавлять.
- `000-critical-integration-config-in-db.mdc`: не переносить integration config в env.
- `system-settings-integrator-mirror.mdc`: не затрагивать path записи system settings в обход сервиса.
- `server-conventions-and-doc-onboarding.mdc`: при изменениях операционного поведения обновить docs.
- `pre-push-ci.mdc`: зафиксировать, что CI-прогон и push выполняются вне этого плана отдельной задачей.

## Финальный handoff этого плана

В финальном отчете к задаче обязательно указать отдельным блоком:
- что реализовано;
- что **не делалось по условиям**:
  - тесты не запускались;
  - push не выполнялся.
