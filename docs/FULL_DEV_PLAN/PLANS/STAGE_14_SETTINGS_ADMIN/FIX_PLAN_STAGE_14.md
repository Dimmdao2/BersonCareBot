# FIX_PLAN — этап 14 (Настройки и admin)

**Статус:** этап **не реализован**. Текущее поведение: `apps/webapp/src/app/app/settings/page.tsx` только редиректит (пациент → профиль, врач/админ → `/app/doctor`), без таблицы `system_settings` и без admin mode.

## Шаги (по `PLAN.md` этапа 14, по порядку)

1. **14.1:** выбрать следующий свободный номер миграции в `apps/webapp/migrations/`; создать `system_settings` с seed (`patient_label`, `sms_fallback_enabled`, `debug_forward_to_admin`, `dev_mode`) — как в плане 14.1.2.
2. **14.2:** модуль `apps/webapp/src/modules/system-settings/*`, `pgSystemSettings.ts`, whitelist ключей, `buildAppDeps.ts`, unit/integration тесты сервиса и репозитория.
3. **14.3:** `app/api/doctor/settings/route.ts`, `app/api/admin/settings/route.ts`, guards через `requireRole.ts`.
4. **14.4:** заменить редирект на полноценную страницу `settings/*` для doctor/admin; блоки `patient_label`, SMS fallback; обновить `menu/service.ts`, `paths.ts` при необходимости; `settings.md`.
5. **14.5:** поле `adminMode` в сессии/cookie, подтверждение в UI, `DoctorHeader` / `AppShell`, условный рендер опасных блоков.
6. **14.6:** UI для `dev_mode`, `integration_test_ids`, `debug_forward_to_admin`; функция `shouldDispatch` и точки вызова в модулях рассылок/integrator — по плану без дублирования секретов в UI.

---

Перед миграцией — обязательно `ls apps/webapp/migrations` и отсутствие коллизии с миграциями этапов 10–13.
