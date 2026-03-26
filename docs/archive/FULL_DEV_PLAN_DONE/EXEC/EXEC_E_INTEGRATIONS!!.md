# PACK E — Integrations (Stage 13) !!

> Сложность: **очень высокий** — внешние API, OAuth, M2M контракты, 2 приложения  
> Агент: Auto (пул) для шагов E.1–E.4; шаги E.5–E.6 → **API-модель** (gpt5.3 или opus4.6)  
> Зависимости: Pack B (dev_mode, settings), Pack C (relay outbound для email)  
> Миграции: нет в webapp; возможны в integrator DB  
> Source of truth: `USER_TODO_STAGE.md` секция 1, `PLAN.md` Stage 13, `INTEGRATOR_CONTRACT.md`

---

## Обязательные правила

### Проверки
- **После каждого шага** — только targeted-проверки затронутых файлов:
  ```bash
  # integrator
  pnpm --dir apps/integrator exec tsc --noEmit
  pnpm --dir apps/integrator exec vitest run <файлы>
  pnpm --dir apps/integrator exec eslint <файлы>
  # webapp (для E.2–E.6)
  pnpm --dir apps/webapp exec tsc --noEmit
  pnpm --dir apps/webapp exec vitest run <файлы>
  ```
- **Полный `pnpm run ci`** — только в конце пака (все шаги E.1–E.7 готовы) и перед push.
- При FAIL: починить → повторить (до 3 попыток). После 3 → СТОП.

### Прочее
- **Не коммитить секреты** (API keys, tokens, passwords).
- Обновлять `INTEGRATOR_CONTRACT.md` при каждом новом/изменённом M2M endpoint.
- Отчёт: `docs/FULL_DEV_PLAN/finsl_fix_report.md`.

---

## Шаг E.1 — `POST /api/bersoncare/send-email` в integrator

**Файлы:**
- `apps/integrator/src/integrations/bersoncare/sendEmailRoute.ts` (новый)
- `apps/integrator/src/integrations/bersoncare/sendEmailRoute.test.ts` (новый)
- Bootstrap integrator (найти по `registerBersoncareSendSmsRoute` в `apps/integrator/src/`)

**Действия:**
1. Скопировать HMAC-валидацию из `sendSmsRoute.ts` (timestamp window, signature check).
2. Payload (Zod):
   ```ts
   { to: z.string().email(), subject: z.string().optional(), code: z.string(), templateId: z.string().optional() }
   ```
3. Вызвать `sendMail` из `apps/integrator/src/integrations/email/mailer.ts`.
4. При `EMAIL_ENABLED=false` / mailer не настроен → `503 { ok: false, error: "email_not_configured" }`.
5. Ответы: `200 { ok: true }`, `400`, `401`, `503`.
6. Зарегистрировать route в bootstrap.

**Тесты (fastify.inject):**
- Валидная подпись → 200.
- Невалидная подпись → 401.
- Отключённый mailer → 503.
- Невалидный email → 400.
- Мок `sendMail` — проверить вызов с правильными аргументами.

**DoD:** Endpoint отправки email работает по образцу send-sms. CI зелёный.

**Документация:** Обновить `INTEGRATOR_CONTRACT.md` — новый раздел "Flow 5: send-email".

---

## Шаг E.2 — Webapp email OTP через integrator

**Файлы:**
- `apps/webapp/src/modules/auth/emailAuth.ts` (обновить)
- `apps/webapp/src/infra/integrations/email/integratorEmailAdapter.ts` (новый)
- `apps/webapp/src/app/api/auth/email/start/route.ts` (обновить если нужно)
- Тесты

**Действия:**
1. Создать adapter (по образцу `integratorSmsAdapter.ts`):
   - `sendEmailCode(to, code)` → HTTP POST к integrator `send-email` с HMAC-подписью.
2. В `emailAuth.ts` (`startEmailChallenge`):
   - Заменить прямой SMTP (если есть) на вызов adapter.
   - При ошибке adapter → вернуть `{ ok: false, error: "email_send_failed" }`.
3. Сохранить текущий `confirm` flow без изменений.

**Тесты:**
- Unit: adapter с мок fetch → success/failure.
- Unit: `startEmailChallenge` → adapter вызывается с правильным кодом.
- Route test `/api/auth/email/start` → challenge created + adapter called.

**DoD:** Email OTP идёт через integrator, а не прямой SMTP из webapp. CI зелёный.

---

## Шаг E.3 — Telegram deep-link hardening

**Файлы:**
- `apps/webapp/src/modules/auth/channelLink.ts` (проверить/обновить)
- `apps/integrator/src/integrations/telegram/webhook.ts` (проверить regex)
- `apps/integrator/src/content/telegram/user/scripts.json` (проверить action)
- `apps/webapp/src/app/api/integrator/channel-link/complete/route.ts` (проверить)
- Тесты

**Действия:**
1. Сверить `SECRET_TTL_MIN` в `channelLink.ts` с текстами в UI (если расхождение → исправить).
2. Проверить regex `/start link_*` в `webhook.ts` — должен матчить формат из `startChannelLink`.
3. Проверить что `complete` route:
   - Принимает только подписанные integrator-запросы.
   - Проверяет TTL токена.
   - Помечает токен как использованный (one-time use).
   - Идемпотентно обрабатывает повторный complete.
4. Исправить найденные расхождения.

**Тесты:**
- Unit: `channelLink` — expired token → rejected.
- Unit: `channelLink` — used token → rejected.
- Integration: webhook fixture `/start link_xxx` → action `start.link`.
- Integration: route complete с валидной/невалидной подписью.

**DoD:** Telegram deep-link flow безопасен и однозначен. CI зелёный.

---

## Шаг E.4 — Max channel-link

**Файлы:**
- `apps/integrator/src/integrations/max/webhook.ts` (обновить)
- `apps/integrator/src/integrations/max/mapIn.ts` (обновить)
- `apps/integrator/src/content/max/` — scripts (создать если нет)
- `apps/webapp/src/modules/auth/channelLink.ts` (расширить `channelCode` union)
- `apps/webapp/src/app/api/auth/channel-link/start/route.ts` (если нужны изменения для max)

**Действия:**
1. Изучить `max/webhook.ts` и `max/mapIn.ts` — определить как Max передаёт payload при `/start link_xxx`.
2. Если Max поддерживает аналог start payload:
   - Добавить парсинг `link_*` в mapIn.
   - Создать/обновить scripts max для `max.start.link` → `webapp.channelLink.complete` с `channelCode: "max"`.
3. Если Max НЕ поддерживает — реализовать альтернативу (ручной ввод кода) и задокументировать.
4. В `channelLink.ts` расширить тип `channelCode` на `"telegram" | "max"`.
5. В `start` route — поддержка `channel: "max"` → генерация корректного deeplink/инструкции.

**Тесты:**
- Integration: max webhook fixture с link payload → correct action.
- Unit: `channelLink.start` с `channel: "max"` → valid data.
- Integration: `complete` route с `channelCode: "max"`.

**DoD:** Max привязка работает end-to-end (или задокументирован блокер). CI зелёный.

---

## Шаг E.5 — Google Calendar sync (API-модель рекомендуется)

**Файлы:**
- `apps/integrator/src/integrations/google-calendar/` (новая папка)
  - `config.ts`, `client.ts`, `sync.ts`, `sync.test.ts`
- `apps/integrator/src/config/env.ts` (добавить Google env)
- `apps/integrator/src/integrations/rubitime/connector.ts` (добавить вызов sync)

**Действия:**
1. Добавить env: `GOOGLE_CALENDAR_ENABLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CALENDAR_ID`, `GOOGLE_REFRESH_TOKEN`.
2. При `GOOGLE_CALENDAR_ENABLED=false` → модуль не инициализируется, connector не вызывает sync.
3. `client.ts`: OAuth2 refresh → access token → Calendar API v3.
4. `sync.ts`:
   - `syncAppointmentToCalendar(event)` — create/update/delete Google Calendar event.
   - Маппинг: Rubitime `record_at` → start, `record_at + duration` → end, `client_name` + `service_title` → summary.
   - Idempotency: хранить `googleEventId` по `rubRecordId` (in-memory map или отдельная таблица integrator DB).
5. В `rubitime/connector.ts`:
   - После обработки `event-create-record` / `event-update-record` / `event-remove-record` → вызвать sync.
6. Зависимость: `googleapis` (добавить в `apps/integrator/package.json`).

**Тесты:**
- Unit: маппинг Rubitime event → Google Calendar event fields.
- Integration: nock `https://www.googleapis.com/calendar/v3/` → mock responses.
- Тест: disabled flag → no Google calls.

**DoD:** Google Calendar обновляется при Rubitime webhook (при включённом feature flag). CI зелёный.

---

## Шаг E.6 — Rubitime reverse API + auto-email bind

**Файлы:**
- `apps/integrator/src/integrations/rubitime/client.ts` (расширить)
- `apps/integrator/src/integrations/rubitime/connector.ts` (расширить)
- `apps/webapp/src/modules/integrator/events.ts` (проверить/расширить)
- `apps/webapp/src/app/api/doctor/appointments/` (новый route для reverse операций)

**Действия:**
1. **Reverse API** (если доступен у Rubitime):
   - В `client.ts` добавить `updateRecord(id, data)` и `cancelRecord(id)`.
   - Прокинуть через M2M endpoint: webapp → integrator → Rubitime.
   - Doctor UI: кнопки "Перенести" / "Отменить" в карточке записи.
2. Если Rubitime API не поддерживает reverse → зафиксировать в документации как "blocked external".
3. **Auto-email bind:**
   - В `connector.ts` при обработке `event-create-record`: извлечь email из payload.
   - Передать в webapp через `POST /api/integrator/events` с типом `user.email.autobind`.
   - В `events.ts` обработать:
     - Если email невалидный → skip.
     - Если у пользователя уже verified email → skip (не перезаписывать).
     - Если конфликт (email другого пользователя) → log warning, уведомить админа.
     - Иначе → сохранить как `unverified`, предложить подтвердить в профиле.

**Тесты:**
- Unit: `connector` с email в payload → correct event emitted.
- Unit: `events.ts` email autobind → правила приоритета соблюдены.
- Integration: Rubitime client mock → update/cancel (если API доступен).

**DoD:** Двусторонняя синхронизация Rubitime работает (или блокер задокументирован). Email bind по правилам. CI зелёный.

---

## Шаг E.7 — Стандартизация тестовой инфраструктуры

**Файлы:**
- `apps/integrator/src/integrations/**/*.test.ts` (обновить/добавить)
- `apps/integrator/package.json` (devDependency `nock` если нет)
- `apps/integrator/e2e/README.md` (новый)

**Действия:**
1. Для каждого внешнего домена (`api.telegram.org`, Max API, `googleapis.com`, SMSC, Rubitime):
   - Хотя бы один nock-тест критического исходящего вызова.
   - Нет реальных сетевых запросов в CI.
2. Для webhook routes (`/webhook/telegram`, `/webhook/max`, `/webhook/rubitime/*`):
   - `fastify.inject` тест с fixture payload → 200 + правильный event в gateway mock.
3. Manual smoke README:
   - Пошаговые команды для ручной проверки ботов на staging.
   - Какое сообщение отправить, что ожидать, что проверить в БД.

**Тесты:** По описанию выше.

**DoD:** Все integration тесты стабильны без сети. CI зелёный. Smoke README написан.

---

## Финальный критерий Pack E

- [ ] `send-email` в integrator по образцу `send-sms`.
- [ ] Webapp email OTP через integrator.
- [ ] Telegram channel-link проверен и hardened.
- [ ] Max channel-link реализован или задокументирован блокер.
- [ ] Google Calendar sync (feature flag).
- [ ] Rubitime reverse + email autobind.
- [ ] Test infra: nock + inject для всех внешних доменов.
- [ ] `INTEGRATOR_CONTRACT.md` обновлён.
- [ ] `pnpm run ci` зелёный.
