# Лог и отчёт: bot mode, PIN-профиль, канал OTP, меню записи

Дата: 2026-03-28

## Лог выполнения (кратко)

| STEP | FILES | RATIONALE | TESTS | STATUS |
|------|-------|-----------|-------|--------|
| A1 | `apps/integrator/src/content/telegram/user/scripts.json`, `max/user/scripts.json` | Кнопка ассистента как Mini App (`webAppUrlFact`) | `contentConfig.test.ts` | done |
| A2 | `apps/integrator/src/integrations/max/webhook.ts` | `ctx=bot` в ссылке входа для MAX | — | done |
| A4 | `apps/integrator/src/content/max/user/contentConfig.test.ts` | Регрессия JSON | vitest integrator | done |
| B | `PinSection.tsx`, `profile/page.tsx`, `PinInput.tsx`, `*.test.tsx` | PIN создан / сброс, подписи кнопок | vitest webapp | done |
| C | `migrations/040_*.sql`, `pgChannelPreferences.ts`, `inMemory*`, `service.ts`, `checkPhoneMethods.ts`, `check-phone/route.ts`, `AuthFlowV2.tsx`, `profile/*` | Предпочтение канала OTP | vitest webapp | done |
| D | `PatientHomeBrowserHero.tsx`, `PatientHeader.tsx`, `menu/service.ts` | Запись только из меню | vitest webapp | done |
| E | `docs/CONTENT_CMS_REPORT.md`, этот файл | Документация | `pnpm run ci` | done |

## Итоговый отчёт

### Scope delivered

1. Открытие webapp из бота в режиме Mini App + `ctx=bot` для MAX.
2. Профиль: PIN со статусом и сбросом; двойной ввод при установке/смене.
3. Профиль: выбор канала подтверждения входа с сохранением в БД и учётом в `AuthFlowV2`.
4. Кнопка «Записаться на приём» убрана с главной; добавлена в меню (sheet + `getMenuForRole`).

### Migrations

- `apps/webapp/migrations/040_auth_preferred_channel.sql`: колонка `is_preferred_for_auth`, частичный уникальный индекс на пользователя.

### Test evidence

- Integrator: `src/content/telegram/user/contentConfig.test.ts`, `src/content/max/user/contentConfig.test.ts`
- Webapp: `PinInput.test.tsx`, `PinSection.test.tsx`, `PatientHeader.test.tsx`, `channel-preferences/service.test.ts`, `otpChannelUi.test.ts`, `checkPhoneMethods.test.ts`, `check-phone/route.test.ts`, `menu/service.test.ts`, `buildAppDeps.test.ts`
- Полный прогон: `pnpm install --frozen-lockfile && pnpm run ci` — **пройден** на рабочей машине агента.

### Risks / follow-ups

- Если в БД ещё не применена миграция `040`, PG-запросы к `is_preferred_for_auth` упадут — нужен deploy migrate.
- `preferredOtpChannel` из `check-phone` не перепроверяется против «устаревшей» привязки; основная валидация — при сохранении в профиле.
