# Auth bootstrap: исправления по внутреннему аудиту (2026-04-17)

Краткий журнал правок после повторного разбора реализации binding-candidate, prefetch и recovery.

## Что исправлено

### 1. `ensureMessengerMiniAppWebappSession` — fallback на `exchange`

**Проблема:** после ветки `readMessengerBindingCandidate()` выполнялся безусловный `return`, поэтому при неуспешном `telegram-init`/`max-init` по кандидату **не вызывался** `POST /api/auth/exchange` по `?t=`/`?token=`, хотя токен в URL мог быть.

**Решение:** флаг `sessionRecovered`: при `res.ok` — очистка кандидата, `router.refresh()`, **`return`**. При `!res.ok` — очистка кандидата, **без** `return`. При `catch` (сеть) — кандидат не трогаем, **без** `return`. Далее — прежняя логика `ctx=max` и `exchange`.

**Файл:** `apps/webapp/src/shared/lib/miniAppSessionRecovery.ts`.

### 2. `AuthBootstrap` — дедуп late initData

**Проблема:** при интерактивном входе и непустом initData каждый тик опроса (~100 ms) снова вызывали `persistMessengerBindingCandidate` и `emitAuthFlowEvent("late_initData_received", …)`.

**Решение:** `lateBindingDedupeKeyRef` (`telegram:${initData}` / `max:${initData}`), сброс при новой эпохе bootstrap; повтор для той же строки в рамках эпохи — ранний `return` без persist и без события.

**Файл:** `apps/webapp/src/shared/ui/AuthBootstrap.tsx`.

### 3. `loadMiniappAuthHelpLinks` — correlation

**Проблема:** публичные GET без `x-bc-auth-correlation-id`, в отличие от prefetch и `AuthFlowV2`.

**Решение:** второй аргумент `correlationId`; в `fetch` передаётся `headers` при непустом id. Вызов из ветки `access_denied` передаёт текущий `correlationId` bootstrap.

**Файл:** `apps/webapp/src/shared/ui/AuthBootstrap.tsx`.

## Документация

- `apps/webapp/src/modules/auth/auth.md` — recovery, дедуп, §6c (явно: вне `/app` отдельно не делалось), help links + correlation.
- `docs/AUTH_RESTRUCTURE/auth.md` — ссылка на этот отчёт и краткое резюме.
- `/.cursor/plans/auth_flow_strict_hardening_8718651e.plan.md` — §13.4.

## Проверки

Рекомендуется прогнать: `npx vitest run src/shared/ui/AuthBootstrap.test.tsx` (и при необходимости связанные auth-тесты) из `apps/webapp`.
