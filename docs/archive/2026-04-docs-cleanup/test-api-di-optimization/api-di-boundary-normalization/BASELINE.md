# Baseline — API DI / import-boundary track

**Дата:** 2026-04-16.

## Масштаб (confirmed)

| Метрика | Значение |
|---------|----------|
| Всего `apps/webapp/src/app/api/**/route.ts` | **140** |
| `route.ts` с импортом `@/infra/*` (поиск `@/infra/` в файле) | **58** |
| `route.ts` с `buildAppDeps` | **73** |
| Пересечение: и `buildAppDeps`, и `@/infra/` в том же файле | **31** |
| Только `buildAppDeps` без `@/infra/` в файле | **42** |
| Без `@/infra/` в файле (нижняя оценка «уже чище») | **82** |

Воспроизведение списка infra-роутов:

```bash
cd /home/dev/dev-projects/BersonCareBot
rg -l '@/infra/' apps/webapp/src/app/api --glob '**/route.ts' | sort
```

## Типы прямых импортов (high-level, **confirmed** по grep)

- `@/infra/db/client` (`getPool`) — merge, audit, media multipart, integrator occurrences, `me`, и др.
- `@/infra/repos/*`, `@/infra/s3/*`, `@/infra/multipartSessionLock`, `@/infra/userLifecycleLock` — media pipeline.
- `@/infra/idempotency*` + `@/infra/webhooks/verifyIntegratorSignature` — integrator POST routes.
- `@/infra/adminAuditLog`, `@/infra/platformUserMerge*`, `@/infra/manualPlatformUserMerge`, `@/infra/integrations/*` — admin/doctor merge & Rubitime.
- `@/infra/repos/pgOAuthBindings`, `inMemoryOAuthBindings` — OAuth callbacks.
- `@/infra/logging/logger`, `serverRuntimeLog` — разбросано (возможное **accepted exception** для трека).
- `@/infra/health/proxyIntegratorProjectionHealth` — `health/projection`.

## Существующие артефакты композиции (**confirmed**)

- `apps/webapp/src/app-layer/di/buildAppDeps.ts` — основной factory; уже импортирует многие `@/infra/*` внутри себя (ожидаемо для composition root).
- Документ `apps/webapp/src/app/api/api.md` уже декларирует «тонкие роуты» и `buildAppDeps` — **частично расходится с кодом** для 58 infra-роутов.

## Самые рискованные зоны

1. `integrator/events`, `integrator/messenger-phone/bind`, `integrator/reminders/dispatch` — подпись, идемпотентность, канонический user id.
2. `media/multipart/*`, `media/presign`, `internal/media-*` — транзакции, locks, S3.
3. `doctor/clients/merge`, `integrator-merge`, `permanent-delete` — аудит, M2M, purge.
4. OAuth callbacks — выбор pg vs in-memory портов.

## Uncertain

- Желательный уровень «строгости» для **logger** в роуте vs обёртка в app-layer — продуктовое решение.
- Есть ли уже ESLint `no-restricted-imports` для `app/api` — **needs verification** (`eslint.config` / `apps/webapp/eslint`).
