# Лог и отчёт: bot mode, PIN-профиль, канал OTP, меню записи

Дата: 2026-03-28

## Лог выполнения (кратко)

| STEP | FILES | RATIONALE | TESTS | STATUS |
|------|-------|-----------|-------|--------|
| A1 | `apps/integrator/src/content/telegram/user/scripts.json`, `max/user/scripts.json` | Кнопка ассистента как Mini App (`webAppUrlFact`) | `contentConfig.test.ts` | done |
| A2 | `apps/integrator/src/integrations/max/webhook.ts` | (история) `ctx=bot` в ссылке входа для MAX; **актуализация 2026-05:** канон **`/app/max`** + `?t=` без `ctx` (`buildWebappEntryUrlFromSource`) | — | done |
| A4 | `apps/integrator/src/content/max/user/contentConfig.test.ts` | Регрессия JSON | vitest integrator | done |
| B | `PinSection.tsx`, `profile/page.tsx`, `PinInput.tsx`, `*.test.tsx` | PIN создан / сброс, подписи кнопок | vitest webapp | done |
| C | `migrations/040_*.sql`, `pgChannelPreferences.ts`, `inMemory*`, `service.ts`, `checkPhoneMethods.ts`, `check-phone/route.ts`, `AuthFlowV2.tsx`, `profile/*` | Предпочтение канала OTP | vitest webapp | done |
| D | `PatientHomeBrowserHero.tsx`, `PatientHeader.tsx`, `menu/service.ts` | Запись только из меню | vitest webapp | done |
| E | `docs/CONTENT_CMS_REPORT.md`, этот файл | Документация | `pnpm run ci` | done |

## Итоговый отчёт

### Scope delivered

1. Открытие webapp из бота в режиме Mini App; для MAX с **2026-05** канонический путь **`/app/max`** (ранее — query `ctx=bot` на `/app`, см. `MINIAPP_AUTH_FIX_EXECUTION_LOG.md`).
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

---

Дата: 2026-03-31

## Лог выполнения (дневники и безопасность)

| STEP | FILES | RATIONALE | TESTS | STATUS |
|------|-------|-----------|-------|--------|
| F1 | `app/patient/diary/symptoms/SymptomTrackingRow.tsx` | Добавление записи по кнопке `+` в строке симптома (без отдельной формы на странице) | vitest webapp + ci | done |
| F2 | `app/patient/diary/page.tsx`, удалён `AddEntryForm.tsx` | Убран дублирующий блок «Добавить запись» на общей странице дневника | vitest webapp + ci | done |
| F3 | `modules/diaries/stats/aggregation.ts`, `api/patient/diary/symptom-stats/*`, `SymptomChart*.tsx` | Статистика симптома: две линии разного цвета («в моменте»/«за день») | unit + route tests + ci | done |
| F4 | `api/auth/pin/verify/*`, `api/patient/diary/purge*/*`, `infra/repos/pgDiaryPurge.ts`, `profile/DiaryDataPurgeSection.tsx` | Безопасное удаление только дневниковых данных (PIN + SMS + транзакция) | route tests + ci | done |

## Итоговый отчёт (2026-03-31)

1. Единая страница дневника больше не показывает общий блок «Добавить запись».
2. Добавление симптома выполняется из строки трекинга и обновляет статистику/журнал по клиентскому событию.
3. График симптома показывает две отдельные серии (`instant`, `daily`) с легендой и разными цветами.
4. В профиле добавлен destructive-flow удаления дневниковых данных с двумя факторами подтверждения (PIN и SMS OTP), без удаления профиля пользователя.

---

Дата: 2026-04-15

## Mini App auth: канон `/app/tg` | `/app/max`, без авто-телефона

| Изменение | Суть |
|-----------|------|
| Канон URL (2026-05+) | Первый заход из бота: **`/app/tg`** (Telegram) и **`/app/max`** (MAX); integrator **не** добавляет `ctx`. Legacy: **`?ctx=bot|max` на `/app`** — middleware (`platformContext`) ставит cookie `bersoncare_platform=bot` (+ surface); при **`ctx=max` на `/app`** — редирект на **`/app/max`**. |
| Query JWT | В messenger/miniapp-контексте (cookie/hint/`ctx` legacy) токен `?t=` **не** подставляется в сессию как основной вход — сначала `initData` → `telegram-init` / `max-init`; при cap — резервный `exchange` если есть `t`. |
| Ошибка initData | Экран с **«Повторить»**, без автоматического показа телефонного флоу в miniapp-контексте. |
| Сессия TG | После успешного `POST /api/auth/telegram-init` выставляется platform-cookie `bot` (как у `max-init`). |
| Аудит 2026-04-15 + 2026-05 | `AuthBootstrap`: контекст miniapp по **`useSearchParams` + cookie** + server `entryClassification` (`AppEntryRsc`); **`PlatformProvider`**: при `serverHint=bot` не сбрасывать bot-режим при гонке детектора; integrator — `webhook.links.test.ts` (подписанные URL на `/app/tg` / `/app/max`); grep по логам — **`SERVER CONVENTIONS.md`**, **`MINIAPP_AUTH_FIX_EXECUTION_LOG.md`**. |

Журнал правок и CI: `docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md`.
