# di

Сборка зависимостей приложения (dependency injection).

**buildAppDeps()** возвращает объект с сервисами: auth, users, menu, lessons, emergency, patientCabinet, doctorCabinet, purchases, diaries (symptom + LFK), health, channelPreferences, contentCatalog, media, integrator (события, напоминания). Хранилища дневников и настроек каналов подключаются из `infra/repos`; при отсутствии БД используются in-memory реализации. Используется на страницах и в API-обработчиках.

Guard для подписанных integrator **GET** маршрутов собран отдельно: `assertIntegratorGetRequest` в `@/app-layer/integrator/assertIntegratorGetRequest` (не часть объекта `buildAppDeps`; вызывается в `route.ts` до `buildAppDeps()`). См. `apps/webapp/src/app/api/api.md` § integrator.

**Import boundary для Route Handlers:** `route.ts` под `app/api` не импортирует `@/infra/*` напрямую — для доступа к бывшим infra-модулям используются фасады в `@/app-layer/**` (логирование, `getPool`, verify подписи, merge/media helpers и т.д.) либо поля объекта `buildAppDeps()`. Перечень и политика: `docs/archive/2026-04-docs-cleanup/test-api-di-optimization/api-di-boundary-normalization/ALLOWLIST_REMAINING_INFRA_ROUTE_IMPORTS.md` и § «API route import-policy» в `docs/ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md`.
