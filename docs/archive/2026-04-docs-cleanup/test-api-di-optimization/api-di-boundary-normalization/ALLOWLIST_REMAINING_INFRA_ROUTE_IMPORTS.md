# API route import boundary — `@/infra/*` в `route.ts`

**Дата обновления:** 2026-04-17 (волна B — завершение нормализации boundary)

## Текущее правило

- Во **всех** файлах **`**/route.ts`** под `apps/webapp/src/` прямых импортов из **`@/infra/*` нет** (проверка:  
  `rg '@/infra/' apps/webapp/src --glob '**/route.ts'` → пусто).

Канонический объём инициативы по **MASTER_PLAN** — прежде всего `apps/webapp/src/app/api/**/route.ts`; дубликаты projection в `app/health/projection` и `app/app/health/projection` выровнены тем же фасадом `@/app-layer/health/proxyIntegratorProjectionHealth`.

## Где теперь живёт бывший infra-доступ для handlers

Имплементация по-прежнему в `@/infra/*`, но для Route Handlers используются **тонкие фасады в `@/app-layer/**`** (re-export или узкая обёртка), например:

| Область | Примеры модулей |
|---------|------------------|
| Логирование | `@/app-layer/logging/logger`, `@/app-layer/logging/serverRuntimeLog` |
| PG pool для route-only вызовов | `@/app-layer/db/client` (`getPool`) |
| Здоровье / projection proxy | `@/app-layer/health/proxyIntegratorProjectionHealth` |
| OAuth web login | `buildAppDeps().oauthBindings` вместо прямого выбора pg/in-memory портов |
| Integrator HMAC POST | `@/app-layer/integrator/verifyIntegratorSignature` |
| Doctor → integrator signed JSON | `@/app-layer/integrations/integratorSignedPost` |
| Merge / purge / audit | `@/app-layer/admin/auditLog`, `@/app-layer/merge/*`, `@/app-layer/platform-user/canonicalPlatformUser` |
| Idempotency | `@/app-layer/idempotency/*` |
| Media / S3 / multipart | `@/app-layer/media/*`, `@/app-layer/locks/*` |

**Composition root** по-прежнему: `buildAppDeps()` для сервисов, собранных из infra внутри `buildAppDeps.ts`.

## Enforcement

1. Регрессия: тот же `rg` по `route.ts`; появление нового `@/infra/` в handler — нарушение boundary (добавлять фасад в `app-layer` или метод на deps).
2. Тесты colocated с роутами должны мокать **модули, которые реально импортирует route** (часто `@/app-layer/...`, а не `@/infra/...`). Исключение: код **вне** route (например `@/modules/...`), который всё ещё импортирует `@/infra/db/client`, мокается по-прежнему через `@/infra/...`.

## Исторический снимок (до этой волны)

До нормализации в allowlist фиксировались `approved-exception` / `planned-cluster` по файлам — см. git history этого документа при необходимости.
