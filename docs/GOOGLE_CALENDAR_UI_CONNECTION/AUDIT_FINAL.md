# Final Audit: Google Calendar UI Connection

## Checklist

- [x] Все google-ключи в `ALLOWED_KEYS` и `ADMIN_SCOPE_KEYS`
- [x] `SECRET_LIKE_KEYS` включает `google_client_secret` и `google_refresh_token`
- [x] `updateSetting` → `syncSettingToIntegrator` работает для всех 7 ключей
- [x] OAuth routes защищены `role === 'admin'` guard
- [x] CSRF state cookie для Google OAuth (`oauth_state_gcal`) отделён от Yandex (`oauth_state_yandex`)
- [x] Integrator runtimeConfig: пофилдовое слияние DB + env (частичная БД не затирает env пустыми строками)
- [x] UI Settings: редирект `?gcal=error&reason=` показывает расшифровку; сбой PATCH календаря/тоггла откатывает локальный state
- [x] Нет новых env-переменных для интеграции (правило `000-critical-integration-config-in-db`)
- [x] Env GOOGLE_* в integrator помечены `@deprecated`
- [x] Документация обновлена: `CONFIGURATION_ENV_VS_DATABASE.md`
- [x] `pnpm run ci` зелёный (lint, typecheck, test, test:webapp, webapp:typecheck, build, audit)

## Test Coverage

| Area | Tests | Status |
|------|-------|--------|
| googleOAuthHelpers | 11 | pass |
| /api/admin/google-calendar/start | 4 | pass |
| /api/admin/google-calendar/callback | 7 | pass |
| /api/admin/google-calendar/calendars | 6 | pass |
| integrator runtimeConfig | 6 | pass |
| **Total new** | **34** | **pass** |

## Files Changed/Created

### New files (11)
1. `apps/webapp/src/modules/google-calendar/googleOAuthHelpers.ts`
2. `apps/webapp/src/modules/google-calendar/googleOAuthHelpers.test.ts`
3. `apps/webapp/src/app/api/admin/google-calendar/start/route.ts`
4. `apps/webapp/src/app/api/admin/google-calendar/start/route.test.ts`
5. `apps/webapp/src/app/api/admin/google-calendar/callback/route.ts`
6. `apps/webapp/src/app/api/admin/google-calendar/callback/route.test.ts`
7. `apps/webapp/src/app/api/admin/google-calendar/calendars/route.ts`
8. `apps/webapp/src/app/api/admin/google-calendar/calendars/route.test.ts`
9. `apps/webapp/src/app/app/settings/GoogleCalendarSection.tsx`
10. `apps/integrator/src/integrations/google-calendar/runtimeConfig.test.ts`
11. `docs/GOOGLE_CALENDAR_UI_CONNECTION/` (3 docs)

### Modified files (7)
1. `apps/webapp/src/modules/system-settings/types.ts`
2. `apps/webapp/src/app/api/admin/settings/route.ts`
3. `apps/webapp/src/modules/system-settings/integrationRuntime.ts`
4. `apps/webapp/src/app/app/settings/page.tsx`
5. `apps/integrator/src/integrations/google-calendar/runtimeConfig.ts`
6. `apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts`
7. `apps/integrator/src/config/env.ts`
8. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`

## Production Deployment Notes

1. **Google Cloud Console** must have Calendar API enabled and OAuth Client ID created with redirect URI pointing to `https://bersoncare.ru/api/admin/google-calendar/callback`.
2. Admin enters credentials in Settings UI → Saves → Connects Google → Selects calendar → Enables sync.
3. No env changes required on host; integrator picks up config via DB sync from webapp.
4. Existing `GOOGLE_*` env vars in `api.prod` continue to work as fallback but are deprecated.
