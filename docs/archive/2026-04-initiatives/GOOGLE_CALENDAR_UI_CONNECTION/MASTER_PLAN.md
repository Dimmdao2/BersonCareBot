# Google Calendar: UI-подключение через Settings (admin-mode)

## Цель

Реализовать полный цикл подключения Google Calendar из UI Settings webapp:
1. Ввод OAuth credentials (Client ID, Client Secret, Redirect URI) из Google Cloud Console.
2. OAuth consent flow (кнопка «Подключить Google» → Google Account chooser → callback).
3. Выбор календаря из списка (calendarList.list).
4. Toggle включения синхронизации.

## Хранение

Все данные — в `system_settings` с `scope='admin'` (один доктор = админ). Ключи:
- `google_client_id`, `google_client_secret`, `google_redirect_uri` — ручной ввод
- `google_refresh_token` — автоматически после OAuth callback
- `google_calendar_id` — после выбора календаря
- `google_calendar_enabled` — toggle
- `google_connected_email` — email подключённого аккаунта (информативно)

## Архитектура

- **Webapp API routes** (admin-only):
  - `POST /api/admin/google-calendar/start` — генерация Google authUrl + state cookie
  - `GET /api/admin/google-calendar/callback` — обмен code→tokens, сохранение refresh_token
  - `GET /api/admin/google-calendar/calendars` — список календарей для UI-выбора
- **Webapp UI**: `GoogleCalendarSection` в Settings (admin-mode)
- **Integrator**: `runtimeConfig.ts` — по каждому полю: значение из DB integrator, если ключ синхронизирован; иначе env (не «всё из DB или всё из env» целиком)

## Требования к Google Cloud Console

1. Создать проект (или использовать существующий).
2. Включить Calendar API: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
3. Настроить OAuth consent screen (External или Internal).
4. Создать OAuth 2.0 Client ID (Web application).
5. Указать Authorized redirect URI: `https://<webapp-domain>/api/admin/google-calendar/callback`

## Связанные файлы

### Webapp
- `apps/webapp/src/modules/system-settings/types.ts` — ALLOWED_KEYS
- `apps/webapp/src/app/api/admin/settings/route.ts` — ADMIN_SCOPE_KEYS, SECRET_LIKE_KEYS
- `apps/webapp/src/modules/system-settings/integrationRuntime.ts` — getGoogle* getters
- `apps/webapp/src/modules/google-calendar/googleOAuthHelpers.ts` — pure HTTP helpers
- `apps/webapp/src/app/api/admin/google-calendar/start/route.ts`
- `apps/webapp/src/app/api/admin/google-calendar/callback/route.ts`
- `apps/webapp/src/app/api/admin/google-calendar/calendars/route.ts`
- `apps/webapp/src/app/app/settings/GoogleCalendarSection.tsx`
- `apps/webapp/src/app/app/settings/page.tsx`

### Integrator
- `apps/integrator/src/integrations/google-calendar/runtimeConfig.ts` — DB-backed + env fallback
- `apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts` — cache invalidation
- `apps/integrator/src/config/env.ts` — deprecated GOOGLE_* env vars

### Тесты
- `apps/webapp/src/modules/google-calendar/googleOAuthHelpers.test.ts`
- `apps/webapp/src/app/api/admin/google-calendar/start/route.test.ts`
- `apps/webapp/src/app/api/admin/google-calendar/callback/route.test.ts`
- `apps/webapp/src/app/api/admin/google-calendar/calendars/route.test.ts`
- `apps/integrator/src/integrations/google-calendar/runtimeConfig.test.ts`
