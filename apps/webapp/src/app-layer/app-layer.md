# app-layer

Слой приложения: склейка с фреймворком, проверки доступа и сборка зависимостей.

- **di/** — сборка зависимостей: `buildAppDeps()` возвращает объект со всеми сервисами (авторизация, меню, дневники, каталог, настройки каналов и т.д.). Выбор хранилищ (БД или память) по наличию `DATABASE_URL`.
- **guards/** — проверки доступа по роли и tier пациента: `requireSession`, `requirePatientAccess`, `requirePatientAccessWithPhone`, `requirePatientApiBusinessAccess`, **`patientRscPersonalDataGate`** (RSC перед чтением персональных данных из БД), `getOptionalPatientSession`. Подробнее — `guards/guards.md`. Используются в страницах, Route Handlers и server actions.
- **routes/** — при необходимости централизованные константы или хелперы маршрутизации.

Не содержит доменной логики; только подключение модулей и охрана маршрутов.
