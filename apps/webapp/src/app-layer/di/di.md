# di

Сборка зависимостей приложения (dependency injection).

**buildAppDeps()** возвращает объект с сервисами: auth, users, menu, lessons, emergency, patientCabinet, doctorCabinet, purchases, diaries (symptom + LFK), health, channelPreferences, contentCatalog, media, integrator (события, напоминания). Хранилища дневников и настроек каналов подключаются из `infra/repos`; при отсутствии БД используются in-memory реализации. Используется на страницах и в API-обработчиках.

Guard для подписанных integrator **GET** маршрутов собран отдельно: `assertIntegratorGetRequest` в `@/app-layer/integrator/assertIntegratorGetRequest` (не часть объекта `buildAppDeps`; вызывается в `route.ts` до `buildAppDeps()`). См. `apps/webapp/src/app/api/api.md` § integrator.
