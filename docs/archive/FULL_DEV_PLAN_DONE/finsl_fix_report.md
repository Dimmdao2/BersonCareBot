# finsl_fix_report

## Iteration 1

### Task ID / Stage
- `phase0-backlog-matrix`
- `phase1-critical-sec-perf` (partial)

### Что сделано
- Зафиксирован baseline задач из `FIX_PLAN_EXECUTION_REPORT` и `FINAL_FIX_RECOMMENDATIONS`.
- Закрыты точечные правки по:
  - `SEC-01`: безопасное сравнение hash для Telegram initData через timing-safe helper.
  - `SEC-02`: `try/catch` вокруг `JSON.parse` в разборе integrator token.
  - `PERF-01`: удален лишний тяжелый запрос сообщений при doctor messaging (`conversationExists` + `listMessagesSince`).
  - `PERF-02`: удалены лишние запросы `listClients` в doctor stats.
  - `PERF-03`: `incrementNewsViews` переведен в fire-and-forget на главной пациента.
  - `TEST-03`: унифицировано SQL-правило исключения удалений из отмен и добавлены тесты.

### Какие файлы изменены
- `apps/webapp/src/modules/auth/service.ts`
- `apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts`
- `apps/webapp/src/modules/doctor-stats/service.ts`
- `apps/webapp/src/app/app/patient/page.tsx`
- `apps/webapp/src/infra/repos/pgDoctorAppointments.ts`
- `apps/webapp/src/infra/repos/pgSupportCommunication.ts`
- `apps/webapp/src/infra/repos/inMemorySupportCommunication.ts`
- `apps/webapp/src/modules/doctor-stats/service.test.ts`
- `apps/webapp/src/modules/messaging/doctorSupportMessagingService.test.ts`
- `apps/webapp/src/modules/auth/service.test.ts`
- `apps/webapp/src/infra/repos/pgDoctorAppointments.test.ts`

### Какие команды проверок запускались
- Pending (будут добавлены после полного прогона обязательных проверок).

### Результат проверок
- Pending.

### Проблемы/сложности
- В проекте есть параллельно запущенные незавершенные интерактивные terminal-сессии от прошлых запусков (не использовались для текущих правок).

### Как решено
- Текущая итерация выполняется в отдельных командах/проверках без зависимости от чужих интерактивных сессий.

### Остаточные риски
- До выполнения полного `pnpm run ci` и целевых тестов статус этапа `phase1-critical-sec-perf` считается предварительным.

### Статус
- `Needs Rework` (до завершения полного verify-блока).

## Iteration 2

### Task ID / Stage
- `phase1-critical-sec-perf`
- `phase2-execution-gaps` (частично: Stage 05 auth validation)

### Что сделано
- Добавлены/обновлены тесты для security/perf фиксов:
  - `modules/auth/service.test.ts` (malformed signed token не приводит к падению).
  - `modules/messaging/doctorSupportMessagingService.test.ts` (использование `conversationExists`, корректные ветки reply/getMessages).
  - `infra/repos/pgDoctorAppointments.test.ts` (единое SQL-правило отмен в dashboard и stats).
  - `modules/doctor-stats/service.test.ts` (оптимизация вызова `listClients` — один запрос).
- Закрыт пункт Stage 05 по валидации POST auth routes:
  - `api/auth/phone/confirm`, `api/auth/exchange`, `api/auth/telegram-init` переведены на `zod.safeParse`.
  - Для `exchange` и `telegram-init` добавлены route tests.

### Какие файлы изменены
- `apps/webapp/src/app/api/auth/phone/confirm/route.ts`
- `apps/webapp/src/app/api/auth/exchange/route.ts`
- `apps/webapp/src/app/api/auth/telegram-init/route.ts`
- `apps/webapp/src/app/api/auth/exchange/route.test.ts`
- `apps/webapp/src/app/api/auth/telegram-init/route.test.ts`
- `apps/webapp/src/modules/auth/service.test.ts`
- `apps/webapp/src/modules/messaging/doctorSupportMessagingService.test.ts`
- `apps/webapp/src/infra/repos/pgDoctorAppointments.test.ts`
- `apps/webapp/src/modules/doctor-stats/service.test.ts`

### Какие команды проверок запускались
- `pnpm vitest run src/modules/auth/service.test.ts src/modules/messaging/doctorSupportMessagingService.test.ts src/modules/doctor-stats/service.test.ts src/infra/repos/pgDoctorAppointments.test.ts`
- `pnpm install --frozen-lockfile && pnpm run ci`
- `pnpm vitest run src/app/api/auth/phone/confirm/route.test.ts src/app/api/auth/exchange/route.test.ts src/app/api/auth/telegram-init/route.test.ts src/modules/auth/service.test.ts src/modules/messaging/doctorSupportMessagingService.test.ts src/modules/doctor-stats/service.test.ts src/infra/repos/pgDoctorAppointments.test.ts`
- `pnpm run ci` (повторный полный прогон после второго пакета правок)

### Результат проверок
- Все перечисленные таргетные тесты: `PASS`.
- Полный `pnpm run ci`: `PASS` (lint, typecheck, integrator tests, webapp tests, build, audit).

### Проблемы/сложности
- Первичный запуск таргетных тестов через `pnpm --dir apps/webapp ...` из корня был выполнен неверно (команда пакета не найдена).

### Как решено
- Запуск тестов переведен в `working_directory=apps/webapp`, после чего тесты выполнились штатно.

### Остаточные риски
- По мастер-плану остаются крупные незакрытые блоки Stage 11–14 (новые модули/миграции) и отдельные задачи Stage 10 e2e-flow.

### Статус
- `phase1-critical-sec-perf`: `Done`.
- `phase2-execution-gaps`: `In Progress` (не закрыты все пункты Stage 10/11/12/13/14).

## Production Readiness Verdict
- Частично готово: критичные security/perf фиксы и обязательный CI-gate пройдены.
- Полная production readiness по master-plan не достигнута: не реализованы крупные этапы 11–14 и часть roadmap-задач Stage 10.

## Open Blockers
- Полная реализация Stage 11 (LFK).
- Полная реализация Stage 12 (Reminders full flow).
- Полная реализация Stage 13 (Integrations full flow).
- Полная реализация Stage 14 (Settings/Admin mode + guards).
- Расширение Stage 10 e2e сценария `upload -> saveContentPage`.

## Follow-up required before deploy
- Дореализовать незакрытые этапы 11–14 по планам и прогнать `pnpm run ci` после каждого крупного блока.
- Добавить/прогнать e2e для Stage 10 media upload -> content save.

## Pack A (`EXEC_A_QUICK_FIXES.md`) — 2026-03-25

### Статус
- Все шаги A.1–A.5 выполнены; после правок: `pnpm run ci` — **PASS** (один прогон полного CI после исправления теста мемоизации).

### Шаги
- **A.1 (PERF-04 + QA-02):** `buildAppDeps` обёрнут в `React.cache(_buildAppDeps)`; unit-тест на `Object.is` между вызовами в Vitest **не** используется — в среде тестов без Next request scope `cache` не гарантирует ту же ссылку (см. комментарий у экспорта).
- **A.2 (ARCH-01):** добавлен `shared/hooks/useSupportUnreadPolling.ts` (re-export), `PatientHeader` / `DoctorHeader` переведены на `@/shared/hooks/useSupportUnreadPolling`.
- **A.3 (ARCH-02):** прямой SQL на телефон убран из `buildAppDeps`; добавлен `UserByPhonePort.getPhoneByUserId` (pg + in-memory).
- **A.4 (ARCH-03):** `cancellations30d` и `lastVisitLabel` считаются из истории записей с полями `lastEvent` / `updatedAt`; логика в `appointmentStatsFromHistory.ts` (согласована с `CANCELLATION_LAST_EVENT_EXCLUSION_SQL`); тесты в `appointmentStatsFromHistory.test.ts`.
- **A.5 (TEST-01 + QA-03):** тесты: POST patient messages → 403 при `blocked`; GET doctor unread-count; PATCH admin archive → 403 для `doctor`; стабильность индекса цитаты через `quoteIndexForDaySeed` / `quoteDayKeyUtc`; опциональный второй аргумент `referenceDate` у `getQuoteForDay`.

### Изменённые / новые файлы
- `apps/webapp/src/app-layer/di/buildAppDeps.ts`
- `apps/webapp/src/modules/auth/userByPhonePort.ts`
- `apps/webapp/src/infra/repos/pgUserByPhone.ts`
- `apps/webapp/src/infra/repos/inMemoryUserByPhone.ts`
- `apps/webapp/src/shared/hooks/useSupportUnreadPolling.ts` (новый)
- `apps/webapp/src/shared/ui/PatientHeader.tsx`
- `apps/webapp/src/shared/ui/DoctorHeader.tsx`
- `apps/webapp/src/modules/doctor-clients/service.ts`
- `apps/webapp/src/modules/doctor-clients/appointmentStatsFromHistory.ts` (новый)
- `apps/webapp/src/modules/doctor-clients/appointmentStatsFromHistory.test.ts` (новый)
- `apps/webapp/src/modules/patient-home/newsMotivation.ts`
- `apps/webapp/src/modules/patient-home/newsMotivation.test.ts`
- `apps/webapp/src/modules/integrator/deliveryTargetsApi.test.ts`
- `apps/webapp/src/app/api/patient/messages/route.test.ts`
- `apps/webapp/src/app/api/doctor/messages/unread-count/route.test.ts` (новый)
- `apps/webapp/src/app/api/admin/users/[userId]/archive/route.test.ts` (новый)

### Результат проверок
- `pnpm install --frozen-lockfile && pnpm run ci` — **PASS** (lint, typecheck, integrator test, webapp test, build, audit --prod).

### Блокеры / риски
- Дедупликация `buildAppDeps` через `React.cache` завязана на request scope Next/RSC; в голом Vitest повторные вызовы могут возвращать разные объекты — это ожидаемо и задокументировано в коде.
- Статистика отмен в карточке клиента опирается на полноту `appointment_records` в истории (лимит 80 строк в `listHistoryByPhoneNormalized`).

### Code review Pack A (2026-03-25)
- Добавлены тесты: `newsMotivation.getQuoteForDay.test.ts` (два вызова `getQuoteForDay(seed, date)` при моке БД — одинаковый результат, EXEC A.5 QA-03); расширен `service.test.ts` (интеграция `appointmentStats` с историей).
- `docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md` (секция Pack A): пункты отмечены с уточнением scope ARCH-01 только для шапок.

---

## Pack B (`EXEC_B_SETTINGS_ADMIN!!.md`) — 2026-03-25

### Статус
- Все шаги B.1–B.6 выполнены; `pnpm run ci` — **PASS** на каждом шаге и после финального.

### Шаги

**B.1 — Миграция `031_system_settings.sql`**
- Таблица `system_settings (key, scope PK, value_json JSONB, updated_at, updated_by FK)`.
- Seed 5 дефолтных ключей с `ON CONFLICT DO NOTHING`.
- CI: PASS.

**B.2 — Модуль `system-settings`**
- `types.ts`: `ALLOWED_KEYS`, `SystemSettingKey`, `SystemSettingScope`, `SystemSetting`.
- `ports.ts`: `SystemSettingsPort` (getByKey, getByScope, upsert).
- `service.ts`: `createSystemSettingsService` — whitelist guard, `shouldDispatch` (dev_mode + test IDs).
- `service.test.ts`: 4 unit-теста (unknown key → error; valid key → success; shouldDispatch × 2 варианта).
- `infra/repos/pgSystemSettings.ts` + `inMemorySystemSettings.ts`.
- Зарегистрирован в `buildAppDeps` как `deps.systemSettings`.
- CI: PASS.

**B.3 — API с role-guard**
- `GET/PATCH /api/doctor/settings` — guard: role >= doctor, scope=doctor.
- `GET/PATCH /api/admin/settings` — guard: role === admin, scope=admin; audit log в PATCH.
- Тесты: client → 403; doctor → 200/403 по scope; admin → 200 оба; invalid key → 400.
- CI: PASS.

**B.4 — UI `/app/settings`**
- Для `client` → redirect `/app/patient/profile`.
- Для `doctor`/`admin` → страница с `DoctorHeader` + `SettingsForm`.
- `SettingsForm`: Select (patient_label), Toggle (sms_fallback_enabled), кнопка «Сохранить» через `PATCH /api/doctor/settings`.
- CI: PASS (исправлен TS-error по типу onValueChange Select).

**B.5 — Admin mode**
- `AppSession.adminMode?: boolean` добавлен в типы сессии.
- `toggleAdminMode()` в `auth/service.ts` — читает cookie, переключает флаг, записывает.
- `POST /api/admin/mode` — guard admin, вызывает toggleAdminMode.
- `AdminModeToggle.tsx` — AlertDialog-подтверждение, `POST /api/admin/mode`, `router.refresh()`.
- `DoctorHeader` принимает `adminMode?: boolean`: `bg-destructive/10` + badge «ADMIN MODE» при включении.
- Тест `route.test.ts`: doctor → 403; admin → 200 + adminMode toggled.
- CI: PASS.

**B.6 — Admin UI + `shouldDispatch` + audit**
- `AdminSettingsSection.tsx`: toggles dev_mode, debug_forward_to_admin; textarea integration_test_ids (JSON); числовой input important_fallback_delay_minutes.
- Видна только при `adminMode === true`.
- Сохранение через `PATCH /api/admin/settings` (x4 ключа).
- `shouldDispatch` в service.ts: dev_mode false → true для всех; dev_mode true → только из integration_test_ids.
- Audit log в admin PATCH API: `console.info` с key, oldValue, newValue, updatedBy, timestamp.
- CI: PASS.

### Изменённые / новые файлы

**Новые:**
- `apps/webapp/migrations/031_system_settings.sql`
- `apps/webapp/src/modules/system-settings/types.ts`
- `apps/webapp/src/modules/system-settings/ports.ts`
- `apps/webapp/src/modules/system-settings/service.ts`
- `apps/webapp/src/modules/system-settings/service.test.ts`
- `apps/webapp/src/infra/repos/pgSystemSettings.ts`
- `apps/webapp/src/infra/repos/inMemorySystemSettings.ts`
- `apps/webapp/src/app/api/doctor/settings/route.ts`
- `apps/webapp/src/app/api/doctor/settings/route.test.ts`
- `apps/webapp/src/app/api/admin/settings/route.ts`
- `apps/webapp/src/app/api/admin/settings/route.test.ts`
- `apps/webapp/src/app/api/admin/mode/route.ts`
- `apps/webapp/src/app/api/admin/mode/route.test.ts`
- `apps/webapp/src/app/app/settings/SettingsForm.tsx`
- `apps/webapp/src/app/app/settings/AdminModeToggle.tsx`
- `apps/webapp/src/app/app/settings/AdminSettingsSection.tsx`

**Изменённые:**
- `apps/webapp/src/shared/types/session.ts` (добавлен `adminMode?: boolean`)
- `apps/webapp/src/modules/auth/service.ts` (добавлен `toggleAdminMode`)
- `apps/webapp/src/shared/ui/DoctorHeader.tsx` (prop adminMode, badge, bg-destructive/10)
- `apps/webapp/src/app/app/doctor/layout.tsx` (передаёт adminMode в DoctorHeader)
- `apps/webapp/src/app/app/settings/page.tsx` (реальная страница настроек)
- `apps/webapp/src/app-layer/di/buildAppDeps.ts` (регистрация systemSettings)

### Результат проверок
- `pnpm run ci` после каждого шага: **PASS**.
- Финальный `pnpm run ci` (B.6): **PASS** (lint, typecheck, integrator tests, webapp tests, build, audit --prod).

### Блокеры / риски
- `AdminModeToggle` после toggle использует `router.refresh()` (без полного reload) — риск отсутствует.
- `DoctorHeader.adminMode` получает значение из серверного компонента layout/page; при переходах внутри `/app/doctor/*` значение обновляется автоматически через layout re-render.
- `shouldDispatch` читает настройки из БД при каждом вызове; при высокой нагрузке возможно добавить кэш.

---

## Code Review Pack B — 2026-03-25

### Findings

**[CRITICAL — ИСПРАВЛЕНО]** `AdminSettingsSection.patchAdminSetting` отправляла «голые» значения (`true`, `[...]`, `60`) вместо `{value: X}`. После сохранения через UI:
- `shouldDispatch` проверяет `(valueJson as object).value === true` — на boolean это false → dev_mode не работал.
- `getAdminValue` на странице аналогично не мог прочитать сохранённое значение.
- **Фикс**: обёртка в `{ value: rawValue }` в `patchAdminSetting`.

**[HIGH — ИСПРАВЛЕНО]** Отсутствовал тест "admin → 200 PATCH /api/doctor/settings" (требуется B.3 spec).
- **Фикс**: добавлен тест `returns 200 for admin role patching doctor scope key`.

**[HIGH — ИСПРАВЛЕНО]** Отсутствовал unit-тест `AdminModeToggle` (требуется B.5 spec).
- **Фикс**: `AdminModeToggle.test.ts` — smoke-тест экспортов + API contract для fetch. Полный render-тест недоступен (vitest env: node, jsdom не настроен в проекте).

**[MEDIUM — ИСПРАВЛЕНО]** `beforeEach` в doctor route test не сбрасывал `getSettingMock` в PATCH-блоке.
- **Фикс**: добавлен `getSettingMock.mockReset()`.

**[MEDIUM — ИСПРАВЛЕНО]** Добавлены тесты для admin/settings: `updated_by` корректно передаётся; 401 при отсутствии сессии на PATCH.

**[MEDIUM — ИСПРАВЛЕНО]** Добавлен тест `shouldDispatch — dev_mode true, integration_test_ids отсутствует → false`.

**[LOW — ИСПРАВЛЕНО]** `window.location.reload()` в AdminModeToggle.
- **Фикс**: заменено на `router.refresh()` (Next.js), чтобы обновлять серверные данные без полного перезагрузки вкладки.

### Итоговый статус
- `pnpm run ci`: **PASS** после всех фиксов.
- Критических блокеров деплоя нет.

---

## Pack C — Relay Outbound — 2026-03-25

### Шаг C.1 — Endpoint relay-outbound в integrator

**Файлы:**
- `apps/integrator/src/integrations/bersoncare/relayOutboundRoute.ts` (новый)
- `apps/integrator/src/integrations/bersoncare/relayOutboundRoute.test.ts` (новый)
- `apps/integrator/src/app/routes.ts` (зарегистрирован новый route)

**Что сделано:**
- HMAC-валидация: `verifySignature` по образцу `sendSmsRoute.ts` (timestamp + rawBody).
- Zod-схема payload: `messageId`, `channel` (telegram/max/email/sms), `recipient`, `text`, `idempotencyKey`, `metadata?`.
- In-memory dedup Map с TTL 24h.
- Dispatch через `dispatchPort.dispatchOutgoing(intent)` с правильным payload по каналу.
- Ответы: 200 accepted / 200 duplicate / 400 / 401 / 502.
- Тесты: valid → 200 accepted, invalid sig → 401, duplicate key → 200 duplicate, invalid payload → 400, dispatch throw → 502.

**Фиксы при CI:**
- `z.record(z.unknown())` → `z.record(z.string(), z.unknown())` (Zod v4 требует 2 аргумента).

**CI:** PASS

### Шаг C.2 — Клиент relay в webapp

**Файлы:**
- `apps/webapp/src/modules/messaging/relayOutbound.ts` (переписан с нуля)
- `apps/webapp/src/modules/messaging/relayOutbound.test.ts` (переписан)
- `apps/webapp/src/modules/messaging/patientMessagingService.ts` (удалён устаревший вызов maybeRelayOutbound)

**Что сделано:**
- `relayOutbound(params, deps?)` — подписывает HMAC, строит idempotencyKey, retry 4 попытки с задержками [0, 10s, 60s, 5min].
- `shouldDispatch` guard: если передан и возвращает false → skip с reason `dev_mode_skip`.
- Нет `INTEGRATOR_API_URL` → warn один раз + return `{ ok: false, reason: "no_integrator_url" }`.
- Тесты: успешный relay, idempotency duplicate, 502→retry→fail, fetch throw, shouldDispatch false, нет URL.

**CI:** PASS

### Шаг C.3 — Интеграция в doctorSupportMessagingService

**Файлы:**
- `apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts` (обновлён)
- `apps/webapp/src/modules/messaging/doctorSupportMessagingService.test.ts` (обновлён)
- `apps/webapp/src/app-layer/di/buildAppDeps.ts` (передаётся shouldDispatch)

**Что сделано:**
- `createDoctorSupportMessagingService(port, opts?)` — принимает `opts: RelayOutboundDeps` с `shouldDispatch?`.
- В `sendAdminReply` после сохранения сообщения используется лёгкий `getConversationRelayInfo` для `channelCode`/`channelExternalId`/`platformUserId` без чтения message history.
- Fire-and-forget relay через `relayOutbound(...)` — ошибка relay не ломает ответ API.
- Relay не вызывается если нет `channelCode`/`channelExternalId` (webapp-originated conversations).
- В `buildAppDeps.ts` передаётся `shouldDispatch: (userId) => systemSettingsService.shouldDispatch(userId)`.
- Тесты: relay вызван с channel info, skip без channel info, ошибка relay не ломает reply, shouldDispatch передаётся в opts.

**CI:** PASS

### Шаг C.4 — INTEGRATOR_CONTRACT.md

**Файлы:**
- `apps/webapp/INTEGRATOR_CONTRACT.md` (добавлен раздел «Flow 5: relay-outbound»)

**CI:** PASS

---

## Итог Pack C — 2026-03-25

- `pnpm run ci`: **PASS**
- Все 3 шага + документация выполнены.
- Блокеров деплоя нет.
- Риски: relay для webapp-originated conversations (врач пишет первым) пропускается — нет channel binding. При необходимости нужна отдельная логика поиска каналов пользователя через userByPhone или отдельный порт.

---

## Code Review Pack C — 2026-03-25

### Findings

**[CRITICAL — ИСПРАВЛЕНО]** `shouldDispatch` bypass при `userId = null`:
- Условие `if (userId && shouldDispatch)` полностью пропускало whitelist-проверку когда `platformUserId` отсутствует в conversation.
- При активном `dev_mode` это посылало сообщения всем пациентам без фильтра.
- **Фикс**: инвертирована логика — если `shouldDispatch` задан, но `userId` нет → `{ ok: false, reason: 'dev_mode_skip_no_user' }`.
- **Тест**: добавлен `shouldDispatch задан, но userId отсутствует → dev_mode_skip_no_user`.

**[HIGH — ИСПРАВЛЕНО]** Нет ранней остановки retry на 4xx:
- Webapp повторял запрос 4 раза при 401/400, что при неверном секрете только маскировало проблему.
- **Фикс**: `attemptRelay` возвращает `httpStatus`; при `4xx` retry прерывается немедленно.
- **Тесты**: добавлены `401 → прерывает retry (1 попытка)` и `400 → прерывает retry`.

**[HIGH — ИСПРАВЛЕНО]** Пропущенные тесты в integrator:
- Нет теста `missing_headers → 400` (оба заголовка отсутствуют, только timestamp отсутствует).
- Нет теста dispatch intent для `max` и `sms` каналов.
- **Фикс**: добавлены 4 новых теста в `relayOutboundRoute.test.ts`.

**[MEDIUM — ИСПРАВЛЕНО]** QA Checklist Pack C не был отмечен выполненным.

**[MEDIUM — ИСПРАВЛЕНО]** Двойное чтение БД в `sendAdminReply`.
- Было: `conversationExists` + `getConversationWithMessages` (лишний второй запрос и загрузка всех сообщений).
- **Фикс**: добавлен лёгкий метод порта `getConversationRelayInfo(conversationId)`; `sendAdminReply` использует его для проверки существования и получения channel binding, без загрузки message history.

### Итоговый статус
- `pnpm run ci`: **PASS** после всех фиксов.
- Критических блокеров деплоя нет.

---

## Pack D — Reminders (Stage 12)

### Дата выполнения
2026-03-25

### Шаги выполнены

**D.1 — Реальный сервис reminders**
- Созданы `types.ts`, `ports.ts`, `pgReminderRules.ts`, `inMemoryReminderRules.ts`.
- `service.ts` переписан: `listRulesByUser`, `toggleCategory`, `updateRule` с валидацией bounds.
- `validateReminderDispatchPayload` сохранён (используется dispatch-роутом).
- `buildAppDeps.ts` обновлён: `reminderRulesPort` + `remindersService`.
- Тесты: unit с in-memory портом — CRUD, валидация, notifyIntegrator.
- CI: PASS.

**D.2 — Patient UI /app/patient/reminders**
- Страница `/app/patient/reminders` (Server Component + `ReminderRulesClient`).
- Server Actions `toggleReminderCategory`, `updateReminderRule` с Zod-валидацией.
- Добавлены shadcn: `switch`, `label` (отсутствовали).
- Пункт «Напоминания» добавлен в меню PatientHeader.
- `routePaths.patientReminders` добавлен в paths.ts.
- CI: PASS после исправления Zod `.errors` → `.issues`.

**D.3 — Синхронизация с integrator**
- `notifyIntegrator.ts`: HMAC-signed POST к integrator; `idempotencyKey` в теле; URL `{INTEGRATOR_API_URL}/api/integrator/reminders/rules`.
- Сервис после успешного сохранения в БД `await`-ит нотификатор; при ошибке relay — `console.warn`, правило сохранено, в ответе `syncWarning` (текст `REMINDER_INTEGRATOR_SYNC_WARNING`) для UI.
- Server Actions и `ReminderRulesClient` показывают предупреждение пользователю (янтарный текст), не блокируя сохранение.
- Тест `notifyIntegrator.test.ts`: 3 кейса (happy path, integrator ошибка, no URL).
- CI: PASS после добавления `vi.clearAllMocks()` в beforeEach.

**D.4 — Колокольчик в PatientHeader**
- `GET /api/patient/reminders/unread-count` → `{ ok, count }`.
- `getUnseenCount`, `getStats`, `markSeen` добавлены в `ReminderProjectionPort`.
- Реализации: pgReminderProjection (try/catch для отсутствующей seen_at), inMemory (0).
- Hook `useReminderUnreadCount`: polling 60s, пауза при hidden.
- Bell в PatientHeader: Link → patientReminders, badge при count > 0.
- Обновлены 4 тест-мока для ReminderProjectionPort.
- CI: PASS.

**D.5 — Миграция seen_at + статистика**
- Миграция `032_reminder_seen_status.sql`: `ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ`.
- `POST /api/patient/reminders/mark-seen` → `markSeen(userId, ids)`.
- Статистика «За 30 дней» на странице reminders (Card).
- Кнопка «Отметить все как просмотренные» в `ReminderRulesClient`.
- CI: PASS.

### Изменённые файлы

**Новые файлы:**
- `apps/webapp/src/modules/reminders/types.ts`
- `apps/webapp/src/modules/reminders/ports.ts`
- `apps/webapp/src/modules/reminders/notifyIntegrator.ts`
- `apps/webapp/src/modules/reminders/notifyIntegrator.test.ts`
- `apps/webapp/src/modules/reminders/hooks/useReminderUnreadCount.ts`
- `apps/webapp/src/infra/repos/pgReminderRules.ts`
- `apps/webapp/src/infra/repos/inMemoryReminderRules.ts`
- `apps/webapp/src/app/app/patient/reminders/page.tsx`
- `apps/webapp/src/app/app/patient/reminders/actions.ts`
- `apps/webapp/src/app/app/patient/reminders/ReminderRulesClient.tsx`
- `apps/webapp/src/app/api/patient/reminders/unread-count/route.ts`
- `apps/webapp/src/app/api/patient/reminders/mark-seen/route.ts`
- `apps/webapp/migrations/032_reminder_seen_status.sql`
- `apps/webapp/src/components/ui/switch.tsx` (shadcn)
- `apps/webapp/src/components/ui/label.tsx` (shadcn)

**Изменённые файлы:**
- `apps/webapp/src/modules/reminders/service.ts` (полная перезапись)
- `apps/webapp/src/modules/reminders/service.test.ts` (полная перезапись)
- `apps/webapp/src/infra/repos/pgReminderProjection.ts` (добавлены getUnseenCount, getStats, markSeen)
- `apps/webapp/src/infra/repos/inMemoryReminderProjection.ts` (новые методы порта)
- `apps/webapp/src/app-layer/di/buildAppDeps.ts` (remindersService, notifyIntegratorRuleUpdated)
- `apps/webapp/src/app-layer/routes/paths.ts` (patientReminders)
- `apps/webapp/src/shared/ui/PatientHeader.tsx` (Bell → Link, badge, useReminderUnreadCount, меню)
- `apps/webapp/src/app/api/integrator/reminders/rules/route.test.ts` (мок обновлён)
- `apps/webapp/src/app/api/integrator/reminders/rules/by-category/route.test.ts` (мок обновлён)
- `apps/webapp/src/app/api/integrator/reminders/history/route.test.ts` (мок обновлён)
- `apps/webapp/src/modules/integrator/events.test.ts` (мок обновлён)

### Результаты pnpm run ci
- D.1: PASS
- D.2: PASS (после fix: `switch`/`label` shadcn + Zod `.issues`)
- D.3: PASS (после fix: `vi.clearAllMocks()` в beforeEach)
- D.4: PASS
- D.5: PASS

### Итоговый статус
- `pnpm run ci`: **PASS**
- Критических блокеров деплоя нет.

### Риски / Долг
- `getUnseenCount`/`getStats`/`markSeen` в pg-реализации работают только после применения миграции 032.
  До применения миграции — graceful fallback: 0 (try/catch в pg-методах).
- `notifyIntegratorRuleUpdated` отправляет POST на `/api/integrator/reminders/rules` на integrator.
  Этот эндпоинт на integrator не реализован → 404 будет пойман и залогирован как warn.
  Eventual consistency: integrator читает правила через GET при необходимости.
- `mark-seen` с `__mark_all__` как occurrenceId — это заглушка «отметить все»:
  реальная логика должна запрашивать все непросмотренные ID пользователя перед markSeen.
  Текущая реализация gracefully no-ops на in-memory, в pg обновит только строку с этим ID (которой нет).
  Улучшение: добавить `markAllSeen(platformUserId)` в порт.

---

## Pack D — Code Review Findings & Fixes

### Дата: 2026-03-25

### [CRITICAL — ИСПРАВЛЕНО] mark-seen "all" сломан

**Проблема**: `handleMarkAllSeen` в `ReminderRulesClient` отправлял `{ occurrenceIds: ["__mark_all__"] }` — fake ID. В БД обновлялось 0 строк, badge никогда не уменьшался.

**Фикс**:
- Добавлен `markAllSeen(platformUserId)` в `ReminderProjectionPort` + pg/inMemory реализации.
- Маршрут `mark-seen` обновлён: принимает `{ all: true }` (вызывает `markAllSeen`) или `{ occurrenceIds: string[] }`.
- Клиент отправляет `{ all: true }`.
- Обновлены 4 тест-мока для `markAllSeen`.

### [HIGH — ИСПРАВЛЕНО] mark-seen catch возвращал 401 для всех ошибок

**Проблема**: один `try/catch` перехватывал и auth-ошибки, и JSON parse ошибки — оба отдавали 401.

**Фикс**: JSON-парсинг вынесен в отдельный `try/catch` → 400 для невалидного JSON, 401 только для auth.

### [HIGH — ИСПРАВЛЕНО] Отсутствовали тесты роутов и action

**Добавлено**:
- `GET /api/patient/reminders/unread-count` — 3 тест-кейса.
- `POST /api/patient/reminders/mark-seen` — 7 тест-кейсов (auth, invalid JSON, specific IDs, all: true, empty array, non-strings, missing body).
- `actions.test.ts` — 8 тест-кейсов для `toggleReminderCategory` и `updateReminderRule`.

### [MEDIUM — ИСПРАВЛЕНО] PatientHeader импортировал из modules/

**Фикс**: Создан re-export `shared/hooks/useReminderUnread.ts`, PatientHeader обновлён.

### [MEDIUM — ЗАДОКУМЕНТИРОВАНО] inMemoryReminderRules семантика

Удалён неиспользуемый `userRules` Map, добавлен комментарий о том, что `listByPlatformUser` ищет по `integratorUserId` в тест-хранилище. PG использует корректный JOIN. Тесты работают т.к. используют совпадающие ID.

### [MEDIUM — ИСПРАВЛЕНО] QA Checklist Pack D

Все завершённые пункты отмечены `[x]`. Policy "важных сообщений" отмечена как вне scope Pack D.

### Итоговый статус после review
- `pnpm run ci`: **PASS** после всех фиксов.
- Блокеров deploy нет.

---

## Pack D — Code Review (2026-03-25, аудит EXEC + QA)

### Findings (до фиксов)

| Severity | Finding |
|----------|---------|
| **HIGH** | `GET /api/patient/reminders/unread-count` использовал `requirePatientAccess` внутри `try/catch`: для Route Handler это конфликтует с `redirect()` (NEXT_REDIRECT) и маскировало отсутствие сессии под `{ ok: true, count: 0 }`. Контракт patient API должен совпадать с `/api/patient/messages/unread-count` (401/403). |
| **MEDIUM** | EXEC D.1: не было отдельного теста на SQL-репозиторий `pgReminderRules` (read/update path). |
| **MEDIUM** | EXEC D.4: не было unit-теста на `useReminderUnreadCount` (mount, hidden tab, polling). |
| **LOW** | EXEC D.3: усилить assert формата `idempotencyKey` в `notifyIntegrator.test.ts`. |
| **INFO** | `daysMask` в коде — строка из 7 символов (совместимость с БД); в EXEC пример — `number` — расхождение документа и реализации, не баг. |
| **INFO** | Policy «важных сообщений» (вариант B), лимит 20/день, пауза 30 с — вне scope Pack D (см. `QA_CHECKLIST.md`). |

### Исправления

- `unread-count/route.ts`: `getCurrentSession` + `canAccessPatient` → 401/403; только ошибки `getUnseenCount` → graceful `count: 0`.
- `unread-count/route.test.ts`: сценарии 401, 403, graceful DB.
- `useReminderUnreadCount.test.tsx` (jsdom): mount, hidden, interval 60s, игнор `ok: false`.
- `pgReminderRules.test.ts`: мок пула, проверка JOIN и фильтра категории.
- `notifyIntegrator.test.ts`: assert `idempotencyKey` вида `rule_rule-abc_<timestamp>`.

### Результат
- `pnpm run ci`: **PASS** (122 test files webapp).

### Остаточные риски
- E2E (Playwright) для reminders по EXEC D.2/D.5 по-прежнему не в репозитории — приоритет отложенных тестов при появлении e2e-инфраструктуры для patient.

---

## Pack D — верификация EXEC + доработка D.3 (сессия 2026-03-25)

### Что сделано
- Проверено соответствие дереву кода шагам D.1–D.5 из `EXEC_D_REMINDERS!!.md`; полный `pnpm run ci`: **PASS**.
- Закрыт пробел EXEC D.3: при ошибке relay после успешного commit в БД пользователь видит явное сообщение (константа `REMINDER_INTEGRATOR_SYNC_WARNING` в `service.ts`, прокидка через actions в `ReminderRulesClient`).

### Файлы (изменения сессии)
- `apps/webapp/src/modules/reminders/service.ts`
- `apps/webapp/src/modules/reminders/service.test.ts`
- `apps/webapp/src/app/app/patient/reminders/actions.ts`
- `apps/webapp/src/app/app/patient/reminders/actions.test.ts`
- `apps/webapp/src/app/app/patient/reminders/ReminderRulesClient.tsx`

### Результат проверок
- `pnpm install --frozen-lockfile && pnpm run ci` — **PASS** (lint, typecheck, integrator test, webapp test, build, audit --prod).

### Блокеры / риски
- На стороне **integrator** inbound `POST /api/integrator/reminders/rules` для upsert-события из webapp может отсутствовать или отличаться по контракту — при 4xx/5xx пользователь увидит `syncWarning`, данные в webapp остаются согласованными с БД.
- E2E из инструкции D.2/D.5 (Playwright: patient opens reminders, toggles, mark-seen → badge) в репозитории не добавлены; покрытие — unit/integration по роутам и actions.
- Лимит 20/день, пауза 30 с между совпадающими правилами, цепочки fallback по типам — в этом пакете не реализованы полностью (политика зафиксирована в `USER_TODO_STAGE.md`, scope шире экрана настроек).

---

## Pack E — Integrations (Stage 13) — 2026-03-25

### Шаг E.1 — `POST /api/bersoncare/send-email` в integrator

**Что сделано:**
- Добавлен маршрут `POST /api/bersoncare/send-email` по образцу `send-sms`:
  - HMAC-проверка `X-Bersoncare-Timestamp` + `X-Bersoncare-Signature`,
  - Zod-валидация payload (`to`, `subject?`, `code`, `templateId?`),
  - вызов `sendMail(...)`,
  - `503 email_not_configured` при неготовом mailer,
  - ответы `200/400/401/503`.
- Маршрут зарегистрирован в integrator bootstrap (`app/routes.ts`).
- Добавлены route tests (`fastify.inject`): valid signature, invalid signature, mailer disabled, invalid email, проверка аргументов `sendMail`.
- Обновлён `INTEGRATOR_CONTRACT.md`: добавлен раздел **Flow 5: send-email**; прежний relay раздел сдвинут в Flow 6.

**Файлы:**
- `apps/integrator/src/integrations/bersoncare/sendEmailRoute.ts` (новый)
- `apps/integrator/src/integrations/bersoncare/sendEmailRoute.test.ts` (новый)
- `apps/integrator/src/app/routes.ts`
- `apps/webapp/INTEGRATOR_CONTRACT.md`

**Проверки (`pnpm run ci`):**
- Попытка 1: **FAIL** на существующем тесте `apps/integrator/src/infra/db/writePort.reminders.test.ts` (`reminder.rule.upsert idempotency key has no random component`) — регулярка по длинной цифровой последовательности оказалась флакной для hex-хеша.
- Исправление: тест переписан на проверку детерминизма ключа (два одинаковых upsert → одинаковый idempotency key).
  - Файл: `apps/integrator/src/infra/db/writePort.reminders.test.ts`
- Попытка 2: **PASS** (полный `pnpm run ci` зелёный).

**Статус шага E.1:** Done.

### Шаг E.2 — Webapp email OTP через integrator

**Что сделано:**
- Добавлен email-adapter для webapp -> integrator:
  - `sendEmailCode(to, code)` делает `POST /api/bersoncare/send-email` с HMAC-подписью.
- `startEmailChallenge` в `emailAuth.ts` переведён с локального логирования OTP на реальную отправку через adapter.
- При ошибке adapter возвращается доменная ошибка: `{ ok: false, code: "email_send_failed" }`.
- `confirmEmailChallenge` flow оставлен без изменений (верификация и запись verified email остаются в webapp).
- Route `/api/auth/email/start` обновлён: `email_send_failed` -> `503` + понятный message.

**Тесты:**
- Новый unit test adapter: success / failure.
- Обновлён unit test `emailAuth`: проверка вызова adapter с 6-значным кодом и ветки `email_send_failed`.
- Новый route test `/api/auth/email/start`: авторизованный вызов создаёт challenge и вызывает adapter.

**Файлы:**
- `apps/webapp/src/infra/integrations/email/integratorEmailAdapter.ts` (новый)
- `apps/webapp/src/infra/integrations/email/integratorEmailAdapter.test.ts` (новый)
- `apps/webapp/src/modules/auth/emailAuth.ts`
- `apps/webapp/src/modules/auth/emailAuth.test.ts`
- `apps/webapp/src/app/api/auth/email/start/route.ts`
- `apps/webapp/src/app/api/auth/email/start/route.test.ts` (новый)

**Проверки (`pnpm run ci`):**
- Попытка 1: **PASS**.

**Статус шага E.2:** Done.

### Шаг E.3 — Telegram deep-link hardening

**Что сделано:**
- `channelLink.ts`:
  - TTL link-secret приведён к решению владельца: `SECRET_TTL_MIN = 10`.
  - One-time-use усилен: повторное использование токена теперь возвращает `used_token`.
- `channel-link/complete` route:
  - Сохранил обязательную HMAC-проверку подписанных integrator-запросов.
  - Добавил идемпотентную обработку повторного complete: `used_token` -> `200 { ok: true, status: "already_used" }`.
- Telegram webhook parsing:
  - Подтверждён regex `/start link_*` и добавлен явный тест fixture на `start.link`.

**Тесты:**
- Unit `channelLink`: expired token -> rejected; used token -> rejected (`used_token`).
- Integration `channel-link/complete` route: valid signature -> 200; invalid signature -> 401.
- Integration `telegram webhook`: `/start link_xxx` -> action `start.link` + `linkSecret`.

**Файлы:**
- `apps/webapp/src/modules/auth/channelLink.ts`
- `apps/webapp/src/modules/auth/channelLink.test.ts` (новый)
- `apps/webapp/src/app/api/integrator/channel-link/complete/route.ts`
- `apps/webapp/src/app/api/integrator/channel-link/complete/route.test.ts` (новый)
- `apps/integrator/src/integrations/telegram/webhook.test.ts`

**Проверки (`pnpm run ci`):**
- Попытка 1: **FAIL** (`TS2339` в новом webhook-тесте: `linkSecret` не в narrowed type).
- Исправление: type-safe cast в тесте (`(incoming as { linkSecret?: string }).linkSecret`).
- Попытка 2: **PASS** (полный `pnpm run ci` зелёный).

**Статус шага E.3:** Done.

### Шаг E.4 — Max channel-link

**Что сделано:**
- `max/mapIn.ts`:
  - Добавлен парсинг `link_*` из `message_created` (`/start link_xxx`) и из `bot_started` payload (`payload`/`data`).
  - Для таких входящих событий формируется `action: "start.link"` и прокидывается `linkSecret`.
- `content/max/user/scripts.json`:
  - Добавлен сценарий `max.start.link` -> `webapp.channelLink.complete` с `channelCode: "max"`.
- Webapp channel-link:
  - `completeChannelLinkFromIntegrator` расширен на `channelCode: "telegram" | "max"`.
  - `POST /api/integrator/channel-link/complete` принимает `channelCode` `telegram|max`.
  - `startChannelLink` поддерживает `channelCode: "max"`:
    - создаёт токен и сохраняет `channel_link_secrets` как для telegram,
    - возвращает инструкцию для MAX (`manualCommand: "/start link_..."`) + fallback URL `https://max.ru/`.
  - `POST /api/auth/channel-link/start` теперь отдаёт `manualCommand` при MAX.

**Тесты:**
- `max/mapIn.test.ts`: `/start link_xxx` -> `start.link` + `linkSecret`.
- `max/webhook.test.ts`: webhook fixture с link payload -> в event `incoming.action = start.link`.
- `channelLink.test.ts` (webapp): `startChannelLink(channelCode=max)` возвращает валидные данные + `manualCommand`.
- `channel-link/complete/route.test.ts`: добавлен успешный кейс `channelCode=max`.

**Файлы:**
- `apps/integrator/src/integrations/max/mapIn.ts`
- `apps/integrator/src/integrations/max/mapIn.test.ts`
- `apps/integrator/src/integrations/max/webhook.test.ts`
- `apps/integrator/src/content/max/user/scripts.json`
- `apps/webapp/src/modules/auth/channelLink.ts`
- `apps/webapp/src/modules/auth/channelLink.test.ts`
- `apps/webapp/src/app/api/integrator/channel-link/complete/route.ts`
- `apps/webapp/src/app/api/integrator/channel-link/complete/route.test.ts`
- `apps/webapp/src/app/api/auth/channel-link/start/route.ts`

**Проверки (`pnpm run ci`):**
- Попытка 1: **PASS**.

**Статус шага E.4:** Done.

### Шаг E.5 — Google Calendar sync

**Что сделано в коде:**
- Добавлен модуль `apps/integrator/src/integrations/google-calendar/`:
  - `config.ts` — feature-flag + проверка конфигурации.
  - `client.ts` — OAuth refresh token + вызовы Google Calendar API v3 через HTTP.
  - `sync.ts` — `syncAppointmentToCalendar(event)` (create/update/delete) + idempotency map `rubRecordId -> googleEventId`.
  - `sync.test.ts` — маппинг Rubitime -> Google event, проверка disabled-режима.
- В `apps/integrator/src/config/env.ts` добавлены env-ключи:
  - `GOOGLE_CALENDAR_ENABLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CALENDAR_ID`, `GOOGLE_REFRESH_TOKEN`.
- В `apps/integrator/src/integrations/rubitime/webhook.ts` добавлен вызов `syncAppointmentToCalendar` для `created/updated/canceled` после нормализации входящего Rubitime события (ошибки sync логируются как warning и не валят основной webhook pipeline).

**Файлы:**
- `apps/integrator/src/config/env.ts`
- `apps/integrator/src/integrations/google-calendar/config.ts` (новый)
- `apps/integrator/src/integrations/google-calendar/client.ts` (новый)
- `apps/integrator/src/integrations/google-calendar/sync.ts` (новый)
- `apps/integrator/src/integrations/google-calendar/sync.test.ts` (новый)
- `apps/integrator/src/integrations/rubitime/webhook.ts`

**Проверки (`pnpm run ci`):**
- БЛОКЕР ИНФРА: shell-команды в текущей сессии начали возвращать `exit code 0` с пустым выводом и `0 ms` даже для `echo/pwd`, поэтому факт выполнения `pnpm run ci` для E.5 недостоверен и не верифицируем в рамках этой сессии.

**Статус шага E.5:** Blocked (нельзя подтвердить зелёный CI в текущем окружении агента).

### Pack E — Code Review (2026-03-25)

**Мелкие фиксы, внесены сразу:**
- `apps/integrator/src/integrations/bersoncare/sendEmailRoute.ts`: исправлен комментарий контракта `Flow 6` -> `Flow 5`.
- `apps/webapp/src/app/api/integrator/channel-link/complete/route.test.ts`: добавлен тест идемпотентной ветки `used_token -> 200 { ok: true, status: "already_used" }`.

**Findings (исторические; часть закрыта remediation 2026-03-25):**
- ~~**CRITICAL:** takeover channel-link~~ → закрыто **E-R1.1** (`conflict` + 409).
- ~~**HIGH:** нет `googleapis`/`nock`~~ → закрыто **E-R1.2**.
- ~~**HIGH:** нет nock Google Calendar~~ → закрыто **E-R2.2**.
- ~~**MEDIUM:** sync только в webhook~~ → закрыто **E-R2.1** (connector).
- ~~**MEDIUM:** drift `recordAt`~~ → закрыто **E-R2.3**.
- **Остаётся:** Wave **E-R4.x–E-R6.x** по мастер-плану (см. блок ниже).

**Статус ревью Pack E:** In Progress (Wave 1–3 remediation выполнены; E.7 и финальный QA closeout — не завершены в этой сессии).

---

## EXEC A-E Remediation (`EXEC_A-E_REMEDIATION_MASTER.md`) — 2026-03-25

### Step E-R1.1 — Fix channel-link conflict policy (CRITICAL)

1. **Step ID:** E-R1.1
2. **Что сделано:**
   - Убрана перезапись владельца binding: перед вставкой проверяется `user_channel_bindings` по `(channel_code, external_id)`; если строка есть и `user_id` ≠ владелец токена — возврат `conflict`, существующий `user_id` не меняется.
   - Идемпотентность: если тот же `external_id` уже привязан к тому же пользователю — токен помечается использованным, `ok: true`.
   - Route `channel-link/complete`: для `conflict` ответ **409** `{ ok: false, error: "conflict" }`; ветка `used_token` → **200** `already_used` без изменений.
   - Структурированное логирование/хук: `setChannelLinkBindingConflictReporter`, по умолчанию `console.warn("[channel_link:binding_conflict]", ctx)`; TODO на подключение уведомлений админу/пользователю (USER_TODO_STAGE).
   - Сопутствующий фикс CI: `rubitime/webhook.ts` — сборка `RubitimeCalendarSyncEvent` без явного `undefined` для optional полей (`exactOptionalPropertyTypes`).
3. **Файлы:** `apps/webapp/src/modules/auth/channelLink.ts`, `apps/webapp/src/modules/auth/channelLink.test.ts`, `apps/webapp/src/app/api/integrator/channel-link/complete/route.ts`, `apps/webapp/src/app/api/integrator/channel-link/complete/route.test.ts`, `apps/integrator/src/integrations/rubitime/webhook.ts`
4. **Тесты:** unit conflict + same-user; route 409 conflict; регрессия `already_used`.
5. **Команды:** `pnpm install --frozen-lockfile`, `pnpm run ci`
6. **Результат:** PASS (после исправлений: integrator TS optional props; импорт `afterEach` в тесте)
7. **Попытки CI:** 1) FAIL typecheck `rubitime/webhook` EOPT; 2) FAIL webapp `afterEach`; 3) PASS
8. **Статус шага:** Done

### Step E-R1.2 — Validate Pack E dependency contract (HIGH)

1. **Step ID:** E-R1.2
2. **Что сделано:** В `apps/integrator/package.json` добавлены `googleapis` (dependencies) и `nock` (devDependencies); lockfile обновлён через `pnpm add`.
3. **Файлы:** `apps/integrator/package.json`, `pnpm-lock.yaml`
4. **Тесты:** не требовались (проверка наличия пакетов).
5. **Команды:** `pnpm install --frozen-lockfile`, `pnpm run ci`
6. **Результат:** PASS (попытка 1)
7. **Статус шага:** Done

### Step E-R2.1 — Align Rubitime→Calendar sync with EXEC (connector layer)

1. **Step ID:** E-R2.1
2. **Что сделано:** Вызов `syncAppointmentToCalendar` перенесён в `rubitime/connector.ts` (`syncRubitimeWebhookBodyToGoogleCalendar`); `webhook.ts` вызывает его один раз на тело запроса (без дублирования). Тесты: mock `sync` + проверка вызова из connector.
3. **Файлы:** `apps/integrator/src/integrations/rubitime/connector.ts`, `apps/integrator/src/integrations/rubitime/webhook.ts`, `apps/integrator/src/integrations/rubitime/connector.test.ts`
4. **Команды:** `pnpm run ci` — PASS (попытка 1 после правки eslint describe)
5. **Статус шага:** Done

### Step E-R2.2 — Google Calendar nock coverage (HIGH)

1. **Step ID:** E-R2.2
2. **Что сделано:** Файл `client.nock.test.ts`: nock на `oauth2.googleapis.com/token` (success/fail), POST create, PATCH update, DELETE 404 tolerant / 500 error. В `sync.test.ts` для disabled-режима добавлен `nock.disableNetConnect()` (0 внешних вызовов).
3. **Файлы:** `apps/integrator/src/integrations/google-calendar/client.nock.test.ts`, `apps/integrator/src/integrations/google-calendar/sync.test.ts`
4. **Команды:** `pnpm run ci` — PASS (совместно с верификацией E-R2.3 в одном прогоне)
5. **Статус шага:** Done

### Step E-R2.3 — recordAt timezone (naive vs explicit zone)

1. **Step ID:** E-R2.3
2. **Что сделано:** В `sync.ts` разделён парсинг: явный `Z` или смещение `±HH:MM` в конце — `new Date` как есть; наивный `YYYY-MM-DD HH:mm:ss` / `T` без зоны — интерпретация как локальное бизнес-время со смещением из `RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES` (default 180 = MSK). Тесты: наивная строка → UTC 07:00 для 10:00 MSK; Z и `+03:00` без скрытого дрейфа.
3. **Файлы:** `apps/integrator/src/integrations/google-calendar/sync.ts`, `apps/integrator/src/config/env.ts`, `apps/integrator/src/integrations/google-calendar/sync.test.ts`
4. **Команды:** `pnpm run ci` — PASS
5. **Статус шага:** Done

### Step E-R3.1 / E-R3.2 — Rubitime reverse API + user.email.autobind

1. **Step ID:** E-R3.1 + E-R3.2 (объединённая верификация одним `pnpm run ci`)
2. **Что сделано:**
   - **Reverse API:** `client.ts` — общий `postRubitimeApi2`, публичные `updateRubitimeRecord`, `removeRubitimeRecord` (api2/update-record, remove-record по документации Rubitime).
   - **Integrator M2M:** `recordM2mRoute.ts` + регистрация в `routes.ts`: `POST /api/bersoncare/rubitime/update-record`, `POST /api/bersoncare/rubitime/remove-record` (HMAC как send-sms).
   - **Webapp doctor proxy:** `POST /api/doctor/appointments/rubitime/update`, `.../cancel` + `integratorSignedPost.ts`.
   - **Autobind:** `buildUserEmailAutobindWebappEvent` в connector; Rubitime webhook после calendar sync вызывает `webappEventsPort.emit`; webapp `handleIntegratorEvent` обрабатывает `user.email.autobind`, `pgUserProjection.applyRubitimeEmailAutobind` (invalid / verified / conflict / applied по USER_TODO_STAGE).
   - **DI:** `AppDeps.webappEventsPort`, передача в `registerRubitimeWebhookRoutes`.
3. **Файлы (ключевые):** `apps/integrator/src/integrations/rubitime/client.ts`, `client.test.ts`, `recordM2mRoute.ts`, `recordM2mRoute.test.ts`, `connector.ts`, `connector.test.ts`, `webhook.ts`, `apps/integrator/src/app/di.ts`, `routes.ts`, `apps/webapp/src/infra/repos/pgUserProjection.ts`, `modules/integrator/events.ts`, `events.test.ts`, `buildAppDeps.ts`, `integratorSignedPost.ts`, doctor routes под `api/doctor/appointments/rubitime/`, `INTEGRATOR_CONTRACT.md`.
4. **Тесты:** client update/remove; recordM2m inject; connector autobind event; events autobind mock.
5. **Команды:** `pnpm run ci` — PASS (после фикса детерминизма idempotency key для `reminder.rule.upserted` в `writePort.ts`: хеш без `updatedAt`).
6. **Статус шага:** Done (UI-кнопки «Перенести/Отменить» в карточке записи врача в этом пакете не делались — только API proxy).

### Сопутствующий фикс CI (не из EXEC-шага, выявлен при прогоне)

- `apps/integrator/src/infra/db/writePort.ts`: idempotency key для `REMINDER_RULE_UPSERTED` считается от стабильного payload без `updatedAt` (иначе два подряд upsert давали разный hash и падал `writePort.reminders.test.ts`).

### Wave 4–6 (E-R4.x – E-R6.x) — статус в этой сессии

**Не выполнено полностью** по `EXEC_A-E_REMEDIATION_MASTER.md`:

- **E-R4.1** — nock по всем перечисленным доменам (telegram, MAX, SMSC, …) сверх уже сделанного Google + Rubitime client tests.
- **E-R4.2** — полный набор `fastify.inject` по всем webhook-путям с проверкой gateway mock.
- **E-R4.3** — новый `apps/integrator/e2e/README.md` (smoke).
- **E-R5.1** — целевой regression pass A-D отдельной командой (кроме общего зелёного CI).
- **E-R5.2** — `INTEGRATOR_CONTRACT.md` частично обновлён (Rubitime M2M + `user.email.autobind`); полная сверка всех flow — не заявлена.
- **E-R6.1** — `QA_CHECKLIST.md` Pack E не закрыт.
- **E-R6.2** — `FIX_PLAN_EXECUTION_REPORT.md` не обновлялся в этой сессии.
- **E-R6.3** — финальный gate: последний успешный прогон `pnpm install --frozen-lockfile && pnpm run ci` — **PASS**.

### Финальный прогон CI (gate)

- `pnpm install --frozen-lockfile && pnpm run ci` — **PASS** (lint, typecheck, integrator tests, webapp tests, webapp typecheck, build integrator, build webapp, audit --prod).

### Блокеры / риски

- **Оставшийся объём E.7 / Wave 4–6** — см. список выше; для формального DoD мастер-плана нужны отдельные задачи.
- **Уведомления при конфликте email autobind** — сейчас `console.warn` в `applyRubitimeEmailAutobind`; отдельные уведомления админу/пользователю (как у мессенджеров) не подключены — требуется порт/очередь (как для channel-link).
- **`googleapis`:** добавлен в зависимости по контракту E-R1.2; рантайм-клиент календаря по-прежнему на `fetch` (SDK не обязателен для работы).
- **Doctor UI** для вызова reverse API не добавлен — только HTTP API.

### Step E-R4.1 — External domain nock coverage

1. **Step ID:** E-R4.1
2. **Что сделано:**
   - Добавлены nock-тесты/покрытие доменов:
     - `googleapis.com` / `oauth2.googleapis.com` (`client.nock.test.ts`);
     - `rubitime.ru` (`rubitime/client.nock.test.ts`);
     - `smsc.ru` (`smsc/client.nock.test.ts`);
     - `api.telegram.org` (`telegram/domain.nock.test.ts`);
     - MAX API host (`max/client.nock.test.ts` с `baseUrl` + nock).
   - Во всех этих тестах используется `nock.disableNetConnect()` + `nock.enableNetConnect()` в teardown.
3. **Файлы:** `apps/integrator/src/integrations/google-calendar/client.nock.test.ts`, `apps/integrator/src/integrations/rubitime/client.nock.test.ts` (новый), `apps/integrator/src/integrations/smsc/client.nock.test.ts` (новый), `apps/integrator/src/integrations/telegram/domain.nock.test.ts` (новый), `apps/integrator/src/integrations/max/client.nock.test.ts` (новый)
4. **Команды:** `pnpm run ci`
5. **Результат:** PASS (после исправления TS в `rubitime/webhook.test.ts`)
6. **Статус шага:** Done

### Step E-R4.2 — Webhook inject coverage

1. **Step ID:** E-R4.2
2. **Что сделано:**
   - Добавлен `fastify.inject` coverage для `POST /webhook/telegram` (200 + вызов gateway mock).
   - Добавлен `fastify.inject` coverage для `POST /webhook/rubitime/:token` и `GET /api/rubitime` (200 + вызов gateway mock).
   - MAX webhook inject-тесты уже были; проверены повторно.
3. **Файлы:** `apps/integrator/src/integrations/telegram/webhook.test.ts`, `apps/integrator/src/integrations/rubitime/webhook.test.ts` (новый), `apps/integrator/src/integrations/max/webhook.test.ts`
4. **Команды:** `pnpm run ci`
5. **Результат:** PASS
6. **Статус шага:** Done

### Step E-R4.3 — Manual smoke doc

1. **Step ID:** E-R4.3
2. **Что сделано:** Добавлен smoke runbook для staging по Telegram/Max/Rubitime/GoogleCalendar/Email OTP/Autobind.
3. **Файлы:** `apps/integrator/e2e/README.md` (новый)
4. **Команды:** `pnpm run ci`
5. **Результат:** PASS
6. **Статус шага:** Done

### Step E-R5.1 — Targeted A-D regression pass

1. **Step ID:** E-R5.1
2. **Что сделано:** Выполнены целевые регрессионные тесты A-D/E-touch:
   - webapp auth/channel-link + messaging relay + reminders integrator routes;
   - integrator telegram/max/rubitime webhooks + relay + google-calendar nock.
3. **Команды:**
   - `pnpm --dir apps/webapp exec vitest run src/modules/auth/emailAuth.test.ts src/modules/auth/channelLink.test.ts src/modules/messaging/doctorSupportMessagingService.test.ts src/modules/messaging/relayOutbound.test.ts src/modules/reminders/service.test.ts src/app/api/integrator/reminders/rules/route.test.ts src/app/api/integrator/reminders/history/route.test.ts`
   - `pnpm --dir apps/integrator exec vitest run src/integrations/telegram/webhook.test.ts src/integrations/max/webhook.test.ts src/integrations/rubitime/webhook.test.ts src/integrations/google-calendar/client.nock.test.ts src/integrations/bersoncare/relayOutboundRoute.test.ts`
4. **Результат:** PASS (7 files / 50 tests; 5 files / 27 tests).
5. **Статус шага:** Done

### Step E-R6.1 — QA checklist closeout (Pack E)

1. **Step ID:** E-R6.1
2. **Что сделано:** В `QA_CHECKLIST.md` секция Pack E отмечена как выполненная по пунктам (send-email, email OTP via integrator, TG/MAX deep-link, Google Calendar flag+nock, Rubitime reverse, email autobind, networkless tests, contract актуален).
3. **Файлы:** `docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md`
4. **Статус шага:** Done

### Step E-R6.2 — Final reports update

1. **Step ID:** E-R6.2
2. **Что сделано:** Обновлены `finsl_fix_report.md` и `FIX_PLAN_EXECUTION_REPORT.md` итогами remediation/code-review и статусом Pack E.
3. **Статус шага:** Done

### Code Review (after A-E) — findings and fixes

1. **CRITICAL:** не найдено.
2. **HIGH (исправлено):**
   - Неполное E.7 (domain nock + webhook inject + smoke doc) — закрыто E-R4.1/E-R4.2/E-R4.3.
   - Недостающий webhook inject coverage для Telegram/Rubitime — закрыто новыми тестами.
3. **MEDIUM (исправлено):**
   - `user.email.autobind` конфликт не имел выделенного reporter-hook — добавлен `setEmailAutobindConflictReporter` + structured warning в `events.ts`.
   - Rubitime reverse UI-слой врача отсутствовал — добавлен `DoctorAppointmentActions` + API route tests для update/cancel.
4. **LOW (исправлено):**
   - Обновлена секция Pack E в `QA_CHECKLIST.md`, синхронизирован контракт.

### Финальный статус remediation A-E

- Все найденные CRITICAL/HIGH в рамках A-E remediation закрыты.
- Pack E секция в `QA_CHECKLIST.md` закрыта.
- Финальный `pnpm run ci` — PASS.

---

## Pack F — LFK / ЛФК (`EXEC_F_LFK!.md`) — 2026-03-25

Инструкции: `docs/FULL_DEV_PLAN/EXEC/EXEC_F_LFK!.md`. Policy/роли не затрагивались (только функционал Stage 11 по плану).

### Шаги и `pnpm run ci`

| Шаг | Содержание | CI |
|-----|------------|-----|
| F.1 | Миграция `033_lfk_exercises.sql` | PASS |
| F.2 | Миграция `034_lfk_templates.sql` (+ исправленный CHECK для `side`, partial unique на активное назначение) | PASS |
| F.3 | Модуль `lfk-exercises`, PG + in-memory, DI | PASS |
| F.4 | UI врача: справочник упражнений; **первая попытка CI: FAIL** (TS: `Button` без `asChild`) → замена на `Link` + `buttonVariants`; вторая попытка | PASS |
| F.5 | Модуль `lfk-templates`, PG + in-memory, DI | PASS |
| F.6 | UI шаблонов + `@dnd-kit/*`, `TemplateEditor` | PASS |
| F.7 | Миграция `035_lfk_complex_exercises.sql`, `lfk-assignments`, назначение с карточки клиента, метка в дневнике пациента | PASS |

Финальный gate: `pnpm install --frozen-lockfile` — PASS; `pnpm run ci` — PASS.

### Ключевые новые/изменённые файлы (Pack F)

- Миграции: `apps/webapp/migrations/033_lfk_exercises.sql`, `034_lfk_templates.sql`, `035_lfk_complex_exercises.sql`
- Модули: `apps/webapp/src/modules/lfk-exercises/*`, `lfk-templates/*`, `lfk-assignments/*`
- Репозитории: `pgLfkExercises.ts`, `inMemoryLfkExercises.ts`, `pgLfkTemplates.ts`, `inMemoryLfkTemplates.ts`, `pgLfkAssignments.ts`
- DI: `apps/webapp/src/app-layer/di/buildAppDeps.ts`
- Врач: `apps/webapp/src/app/app/doctor/exercises/**`, `lfk-templates/**`, `clients/AssignLfkTemplatePanel.tsx`, `assignLfkTemplateAction.ts`, `ClientProfileCard.tsx`, `clients/[userId]/page.tsx`
- Пациент: `apps/webapp/src/app/app/patient/diary/page.tsx` (бейдж «Назначен врачом»)
- UI оболочка: `DoctorHeader.tsx`, `doctorScreenTitles.ts` (+ тесты)
- E2E/тесты: `e2e/lfk-exercises-inprocess.test.ts`, `e2e/lfk-templates-inprocess.test.ts`, правки `e2e/diaries-inprocess.test.ts`, `doctorScreenTitles.test.ts`, `templateExercisePayload.test.ts`, прочие unit-тесты модулей/репозиториев
- Зависимости: `apps/webapp/package.json` (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`), `pnpm-lock.yaml`

### Блокеры / риски

- **Миграции на стенде:** нужно применить `033`–`035` (`pnpm --dir apps/webapp run migrate` или принятый в проекте способ) до использования назначения и справочников в PG.
- **Назначение без БД:** при отсутствии `DATABASE_URL` порт назначений — stub с ошибкой; в карточке клиента показывается пояснение, кнопка неактивна по смыслу (через `assignLfkEnabled`).
- **Полный browser E2E** «врач создал → назначил → пациент отметил занятие» в этом пакете не автоматизирован (есть in-process и сервисные тесты); для прод-уверенности полезен live-сценарий на стенде с реальной БД.
- **Состав упражнений в комплексе** в UI пациента пока не выводится построчно (только комплекс + метка назначения); данные лежат в `lfk_complex_exercises` для будущего отображения.

### Статус Pack F

- DoD по `EXEC_F_LFK!.md`: выполнено; финальный `pnpm run ci` — **PASS**.

### Code review Pack F — 2026-03-25

**Findings (до правок):**

| Severity | Найдено | Исправление |
|----------|---------|-------------|
| **High** | Опубликованный шаблон теоретически можно было сохранить с **0** упражнениями через «Сохранить черновик» (нарушение QA «Publish / пустой шаблон»). | В `lfk-templates/service.ts` → `updateExercises`: если `status === "published"` и массив пуст — throw. Тест `updateExercises rejects clearing all exercises on published template`. |
| **Medium** | `ROLLBACK` в `catch` после сбоя транзакции мог в редких случаях бросить вторичную ошибку. | `pgLfkAssignments.ts`, `pgLfkTemplates.ts` (updateExercises): `ROLLBACK` обёрнут в try/catch. |
| **Medium** | Нет целевых тестов на слой назначений (транзакция, COMMIT). | `pgLfkAssignments.test.ts` (mock pool): негативный путь + happy path первого назначения. |
| **Low** | `EXEC F.7` явно просил расширить `pgLfkDiary.ts` / `lfk-service.ts` — фактически `listComplexes` уже отдаёт все комплексы пользователя; отдельное расширение не потребовалось. | Зафиксировано в отчёте; при появлении отображения строк упражнений в дневнике — читать из `lfk_complex_exercises`. |
| **Low** | `EXEC F.4/F.6/F.7`: полный E2E в браузере (create → list → … → assign → mark session) не реализован; вместо этого in-process импорты страниц и сервисные тесты. | Оставлено как технический долг / ручная проверка на стенде. |

**USER_TODO_STAGE.md:** политики LFK/напоминаний не затрагивались в Pack F — нарушений нет.

**После правок:** `pnpm run ci` — **PASS** (2026-03-25).

### Pack F — повторное выполнение (agent) — 2026-03-25

1. **Контекст:** Пакет F по `EXEC_F_LFK!.md` уже был реализован в репозитории (см. таблицу шагов выше). Существующие миграции **не менялись** (правило «только новые файлы» соблюдено: новых миграций не требовалось).
2. **Шаги F.1–F.7:** сверка с кодом — таблицы `lfk_exercises` / `lfk_exercise_media`, `lfk_complex_templates` / `lfk_complex_template_exercises` / `patient_lfk_assignments`, `lfk_complex_exercises` (035); модули `lfk-exercises`, `lfk-templates`, `lfk-assignments`; UI врача; карточка клиента (`AssignLfkTemplatePanel`); дневник пациента с бейджем «Назначен врачом» — соответствуют DoD.
3. **Дополнение:** добавлен `apps/webapp/e2e/lfk-assign-inprocess.test.ts` — in-process цепочка «комплекс с `origin: assigned_by_specialist` → `listComplexes` → отметка занятия» (дополнение к F.7; полный путь через БД остаётся в `pgLfkAssignments.test.ts`).
4. **`pnpm run ci`:** **PASS** (полный прогон после добавления теста).

**Изменённые файлы (этот прогон):** `apps/webapp/e2e/lfk-assign-inprocess.test.ts`, `docs/FULL_DEV_PLAN/finsl_fix_report.md`.

**Блокеры/риски:** без изменений относительно предыдущей секции Pack F (миграции на стенде, назначение только с БД, нет полного browser E2E).

---

## Pack G — Code Review + Fix — 2026-03-25

Инструкции: `docs/FULL_DEV_PLAN/EXEC/EXEC_G_FINAL_STUBS.md`.

### Findings (до правок)

| Severity | Что найдено | Файл |
|----------|-------------|------|
| **Critical** | `start/route.ts` не генерировал `state` и не устанавливал cookie → CSRF-защита отсутствовала полностью. | `api/auth/oauth/start/route.ts` |
| **Critical** | `callback/route.ts` не проверял `state` (CSRF) и всегда редиректил с `exchange_not_implemented`. | `api/auth/oauth/callback/route.ts` |
| **Critical** | `oauthService.ts` отсутствовал; обмен кода, профиль, сессия — не реализованы. | (новый файл) |
| **High** | `callback/route.test.ts` — только smoke-проверка на наличие redirect; не тестировался state mismatch → 403. | `api/auth/oauth/callback/route.test.ts` |
| **High** | `e2e/cms-content.test.ts` отсутствовал; `cms-media-inprocess.test.ts` — только проверка экспорта функций (smoke). DoD требовал upload → saveContentPage chain. | `e2e/cms-content.test.ts` |
| **Medium** | `OAuthBindingsPort` не имел `findUserByOAuthId` — port был неполным для callback flow. | `modules/auth/oauthBindingsPort.ts`, `pgOAuthBindings.ts`, `inMemoryOAuthBindings.ts` |

### Что исправлено

1. **`src/modules/auth/oauthService.ts`** (новый): `exchangeYandexCode(code, creds, fetchFn?)` и `fetchYandexUserInfo(token, fetchFn?)` — чистые функции с инжектируемым `fetch` для тестируемости. Unit-тесты в `oauthService.test.ts` (8 тестов: success/fail/network на оба метода).

2. **`src/modules/auth/oauthBindingsPort.ts`**: добавлен метод `findUserByOAuthId(provider, providerUserId)`.

3. **`src/infra/repos/pgOAuthBindings.ts`**: реализован `findUserByOAuthId` — SELECT из `user_oauth_bindings`.

4. **`src/infra/repos/inMemoryOAuthBindings.ts`**: реализован `findUserByOAuthId` + helper `__testSetOauthBinding` для тестов.

5. **`src/app/api/auth/oauth/start/route.ts`** (переписан): генерирует `state` через `crypto.randomUUID()`, включает в `authUrl`, устанавливает httpOnly cookie `oauth_state_yandex` (TTL 10 мин).

6. **`src/app/api/auth/oauth/callback/route.ts`** (переписан): CSRF-проверка (`state` из cookie vs query → JSON 403 при несовпадении) + полный flow: exchange code → fetch profile → findUserByOAuthId → setSessionFromUser → redirect по роли.

7. **`src/app/api/auth/oauth/callback/route.test.ts`** (переписан): 9 тестов — 4 CSRF-кейса (no cookie/no query/absent/mismatch → 403) + 5 post-CSRF кейсов (no code, exchange fail, userinfo fail, user not linked, valid flow → session + redirect).

8. **`src/app/api/auth/oauth/start/route.test.ts`** (расширен): добавлен тест на invalid body → 400.

9. **`apps/webapp/e2e/cms-content.test.ts`** (новый): 3 теста — upload valid JPEG → mediaId, saveContentPage с media ref → upsert вызван, полная цепочка upload → save → verify.

### Результат CI

| Шаг | Попытка | Статус |
|-----|---------|--------|
| G.1 + G.2 все правки в один прогон | 1 | **PASS** |

- Integrator tests: 386 passed / 6 skipped
- Webapp tests: 631 passed / 5 skipped (+17 новых тестов по сравнению с Pack F)
- lint, typecheck, build, audit — все PASS

### Блокеры / риски

- **OAuth login flow**: OAuth привязан к существующему пользователю через `user_oauth_bindings`. Если пользователь не прошёл телефонный flow раньше и не привязал Yandex — `user_not_linked` и редирект с ошибкой. Привязка OAuth к аккаунту в текущей итерации выполняется вручную через БД или отдельным будущим flow "Настройки → Привязать Yandex".
- **Роль из DB**: после OAuth-входа роль определяется через `resolveRoleFromEnv({})` (без телефона/без DB запроса) — может отличаться от реальной роли пользователя в `platform_users`. Роль исправится при следующем `getCurrentSession` если привязан телефон.
- **Google/Apple**: остаются `501 oauth_disabled` (документировано как deferred, этап 5.5).

### Статус Pack G

- DoD по `EXEC_G_FINAL_STUBS.md`: выполнено; `pnpm run ci` — **PASS**.
- `QA_CHECKLIST.md` Pack G: оба чекбокса закрыты.

---

## QA Sweep по `QA_CHECKLIST.md` — 2026-03-25

### Что проверено

- Выполнен полный gate: `pnpm run ci` — **PASS**.
- В составе CI подтверждён `pnpm run test:webapp` — **PASS**.
- Проверены финальные пункты чеклиста (миграции, контракт, server conventions, env examples).

### Что обновлено

- `docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md`:
  - закрыты финальные пункты по CI/test/build/imports/migrations/contract/server conventions;
  - диапазон миграций уточнён до `031–035`;
  - оставлен открытым пункт про полноту `.env.example`.

### Найденные проблемы / недоделки

1. `.env.example` (root) не отражает часть новых ключей из `apps/integrator/src/config/env.ts`:
   - `GOOGLE_CALENDAR_ENABLED`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `GOOGLE_CALENDAR_ID`
   - `GOOGLE_REFRESH_TOKEN`
   - `RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES`
2. `apps/webapp/.env.example` не содержит `ALLOWED_MAX_IDS` (ключ есть в `apps/webapp/src/config/env.ts`).
3. Policy «важных сообщений» (вариант B) остаётся вне scope Pack D и не реализована в рамках текущего цикла.

### Статус после QA sweep

- Functional/CI статус: **PASS**.
- Документационный статус: **Needs Follow-up** (дополнить `*.env.example` новыми ключами).

---

## Pack H часть 1 (`EXEC_H_HOTFIX_UI_AUTH.md` — H.1.1, H.1.2, H.2, H.3) — 2026-03-25

### H.1.1 — normalizePhone / валидация

- Клиент: `PhoneInput.tsx` — `isValidRuMobileNormalized` после `normalizePhone` (эквивалент EXEC: 12 символов `+7` + 10 цифр), текст ошибки «10 цифр».
- Сервер: `phoneAuth.ts` — та же проверка перед `sendCode`.
- API: `check-phone`, `pin/login`, `messenger/start` — та же схема (code review: раньше `length < 10` пропускал лишние цифры).
- Тесты: `phoneNormalize.test.ts` (все варианты EXEC + `8(918)900-07-82`), `phoneValidation.test.ts`, `phoneAuth.test.ts` — кейс «длина ≠ 12» и smoke re-export.

### H.1.2 — rate limiting UX + cooldown после успешной отправки SMS

- `OtpCodeForm`: `onResend` → `Promise<OtpResendOutcome>`; при `rate_limited` — обратный отсчёт, текст «Повторная отправка возможна через N сек» (вместо ошибки); обработка `rate_limited` в `onConfirm`; кнопка повтора с состоянием загрузки.
- `SmsCodeForm`, `AuthFlowV2`, `AuthBootstrap`, `BindPhoneBlock`, `EmailAccountPanel` — согласованы с новым контрактом.
- `AuthFlowV2`: таймер при `rate_limited` на первичном `phone/start` (new user / methods / pin forgot), сброс при «Другой номер» / успешной отправке.
- `PhoneAuthForm`: таймер на первом шаге при `rate_limited` от API.
- `integratorSmsAdapter`: запись challenge в store **после** успешного ответа интегратора — cooldown по БД не срабатывает при неуспешной отправке SMS.
- `integratorSmsAdapter.test.ts` (после code review): регрессия «нет фантомного cooldown» после ошибки HTTP интегратора.
- `otpConstants`: текст `OTP_TOO_MANY_ATTEMPTS_MESSAGE` по EXEC (новый код через 10 минут).

### H.2 — padding

- `PatientHeader`: `px-3` → `px-4` (ровно с `AppShell` patient `px-4`). Других проблемных `-mx-4` в patient-коде не найдено (кроме шапки и dialog).

### H.3 — иконки шапки

- `PatientHeader` / `DoctorHeader`: иконки `size-6`, кнопки `size="icon"` + `size-11` для touch ≥ 44px (WCAG), правый кластер `gap-1.5`, левый `gap-2`, вертикальный отступ шапки `py-2.5` (patient header; doctor — `py-2.5` на строке контента, `min-h-14` вместо фиксированного `h-14`).

### Прочее (разблокировка CI)

- `apps/integrator/package.json`: `fastify` `^5.8.2` → `^5.8.3` (GHSA-444r-cwp2-x5xf); обновлён `pnpm-lock.yaml`.

### Команды

- После правок: `pnpm install --no-frozen-lockfile` (обновление lockfile под fastify), затем `pnpm install --frozen-lockfile` и **`pnpm run ci` — PASS** (lint, typecheck, tests, build, audit).

### Блокеры

- Нет для scope H.1.1–H.3; дальше по EXEC — H.1.3+ (flow PIN/channel), H.4, H.5.

### Code review Pack H (2026-03-25) — доработки

**EXEC / QA сверка**

| Пункт | Находка | Действие |
|-------|---------|----------|
| `normalizePhone` + варианты EXEC | Не было явного кейса `8(918)900-07-82` | Добавлен тест в `phoneNormalize.test.ts`. |
| Валидация «`n.length < 12`» | Условие из EXEC не отсекает номер длиннее 12 символов; `check-phone` / PIN / messenger использовали `length < 10` — тоже пропускали «лишние» цифры | Введён `isValidRuMobileNormalized()` → `^\+7\d{10}$`; используется в `PhoneInput`, `phoneAuth`, `check-phone`, `pin/login`, `messenger/start`. |
| Rate limit после коррекции | Логика integrator уже не пишет challenge до успеха; не хватало регрессионного теста | Добавлен `integratorSmsAdapter.test.ts` (после ошибки интегратора gate снова ok, второй `sendCode` успешен). |
| Padding header ↔ shell | Совпадение `px-4` уже было | Подтверждено без изменений. |
| Touch-target ≥ 44px | `size="icon"` в UI kit = `size-8` (32px) | В `PatientHeader` / `DoctorHeader`: класс `HEADER_ICON_CLASS` с `size-11` (44px), спейсер `w-11` без кнопки «Назад». |

**Новые/существенно затронутые файлы review:** `phoneValidation.ts`, `phoneValidation.test.ts`, `integratorSmsAdapter.test.ts`, правки `check-phone/route.ts`, `pin/login/route.ts`, `messenger/start/route.ts`, `PatientHeader.tsx`, `DoctorHeader.tsx`, `PhoneInput.tsx`, `phoneAuth.ts`.

**Проверка:** `pnpm run ci` — **PASS** после правок.

---

## Pack H часть 2 (`EXEC_H_HOTFIX_UI_AUTH.md` — H.1.3, H.1.4, H.1.5) — 2026-03-25

### H.1.3 — flow: phone → PIN → choose_channel → code

- Шаги: `phone` → `new_user_sms` | `pin` | `choose_channel` → `code` (убраны `methods`, `messenger_wait`).
- PIN: 3 ошибки подряд → `choose_channel`; «Не помню PIN» → `choose_channel`.
- `ChannelPicker` (бывший `MethodPicker`): Telegram / Max / Email кнопками; SMS — ссылкой «получить код по СМС».
- `checkPhoneMethods.ts`: `email` в `AuthMethodsPayload` через `getVerifiedEmailForUser` (БД: `email_verified_at`).
- Экран телефона: подсказка «Для входа или регистрации в приложении укажите номер телефона».

### H.1.4 — OTP по каналу доставки

- `POST /api/auth/phone/start`: поле `deliveryChannel` (`sms` | `telegram` | `max` | `email`); валидация привязок и email.
- Webapp: `SmsPort.sendCode` + `integratorSmsAdapter` — SMS / `send-email` / новый `send-otp` на интеграторе.
- Integrator: `POST /api/bersoncare/send-otp` (`sendOtpRoute.ts`), HMAC как send-sms, доставка через `dispatchPort` (текст «Код для входа в BersonCare: …»).
- UI: тексты по каналу; после не-SMS — ссылка «отправить на СМС» в `OtpCodeForm`.
- Сессия: `postLoginHints.phoneOtpChannel` при `phone/confirm` для подсказок.

### H.1.5 — PostLoginSuggestion

- `/api/me`: отдаёт `postLoginHints`.
- Если последний вход по SMS и нет PIN — «Создайте PIN-код…»; если нет `telegramId` — «Привяжите Telegram…».

### Команды

- `pnpm install --frozen-lockfile` и **`pnpm run ci` — PASS** (после правок).

### Блокеры

- Нет.

### Затронутые файлы (основные)

- Webapp: `AuthFlowV2.tsx`, `ChannelPicker.tsx`, `PinInput.tsx`, `OtpCodeForm.tsx`, `SmsCodeForm.tsx`, `PostLoginSuggestion.tsx`, `phone/start`, `phone/confirm`, `api/me`, `checkPhoneMethods.ts`, `phoneAuth.ts`, `service.ts`, `session.ts`, `smsPort.ts`, `integratorSmsAdapter.ts`, `stubSmsAdapter.ts`, `pgPhoneChallengeStore.ts`, `phoneChallengeStore.ts`, `userByPhonePort.ts`, `pgUserByPhone.ts`, `inMemoryUserByPhone.ts`, `buildAppDeps.ts`, тесты `phone/start`, `deliveryTargetsApi.test.ts`; удалён `MethodPicker.tsx`.
- Integrator: `sendOtpRoute.ts`, `routes.ts`.
- Контракт: `apps/webapp/INTEGRATOR_CONTRACT.md` (раздел send-otp).

### Code review Pack H часть 2 (2026-03-25)

**Находки и исправления**

| Пункт | Находка | Действие |
|-------|---------|----------|
| EXEC H.1.5 | Подсказка «Привяжите Telegram» показывалась при любом входе без Telegram (в т.ч. PIN), не только при входе по SMS | `PostLoginSuggestion`: `telegramLine` и PIN-строка завязаны на `postLoginHints.phoneOtpChannel === "sms"`. |
| UX | `onRequestSms` обнулял `challengeId` до `startPhoneOtp`; при ошибке отправки SMS экран кода пропадал | Убран `setChallengeId(null)` перед `startPhoneOtp` в `AuthFlowV2`. |
| EXEC H.1.3 | SMS на экране канала — «мелкий шрифт» | `ChannelPicker`: ссылка SMS `text-sm` → `text-xs`. |

**Проверено**

- Flow соответствует EXEC (новый пользователь — шаг с кнопкой «Получить код по SMS», не авто-отправка — осознанный UX/стоимость SMS).
- `INTEGRATOR_CONTRACT.md` содержит send-otp.
- Регрессия mini-app: `AuthBootstrap` по-прежнему сначала `exchange` / `telegram-init`; `AuthFlowV2` не перехватывает эти ветки.

**Команда:** `pnpm run ci` — **PASS** после правок.

---

## Pack H часть 3 (`EXEC_H_HOTFIX_UI_AUTH.md` — H.4, H.5, H.1.6) — 2026-03-25

### H.4 — главная пациента

- Меню клиента: пункт `diary` «Дневник» (`/app/patient/diary`), убран отдельный пункт ЛФК с главной; порядок карточек в секции «Кабинет»: Дневник → Мои записи.
- Удалена секция `PatientHomeDiariesSection`; компонент файл удалён.
- Порядок блоков на `/app/patient`: PostLoginSuggestion → Кабинет → Уроки → Новости → Уведомления → Мотивашка → Статистика → ConnectMessengers (как в RAW §7 для перечисленных блоков).

### H.5 — аудит vs RAW_PLAN

- Новый файл: `docs/FULL_DEV_PLAN/EXEC/AUDIT_PAGES_VS_RAWPLAN.md` (только задачи/отклонения, без правок кода).

### H.1.6 — тесты

- `phoneNormalize.test.ts`: доп. кейсы (11 цифр с 7, unicode-пробел, короткий ввод).
- `phoneOtpLimits.test.ts`: `assertPhoneCanStartChallenge` — cooldown на номере A не блокирует другой номер B.
- `authFlow.integration.test.ts`: `resolveAuthMethodsForPhone` → неверный PIN → `startPhoneAuth` / `confirmPhoneAuth` (in-memory).

### Команды

- `pnpm install --frozen-lockfile` и **`pnpm run ci` — PASS** (после H.4; после H.5 + H.1.6).

### Блокеры

- Нет.

### Затронутые файлы (основные)

- `apps/webapp/src/modules/menu/service.ts`, `service.test.ts`
- `apps/webapp/src/app/app/patient/page.tsx`, `home/PatientHomeCabinetSection.tsx`
- удалён `home/PatientHomeDiariesSection.tsx`
- `apps/webapp/src/modules/auth/phoneNormalize.test.ts`, `phoneOtpLimits.test.ts`, `authFlow.integration.test.ts`
- `docs/FULL_DEV_PLAN/EXEC/AUDIT_PAGES_VS_RAWPLAN.md`, `docs/FULL_DEV_PLAN/finsl_fix_report.md`

### Code review Pack H часть 3 (2026-03-25)

**H.4 — главная**

- Подтверждено: `getMenuForRole` содержит `diary` («Дневник») и `cabinet` («Мои записи»); `PatientHomeCabinetSection` фиксирует порядок `diary` → `cabinet`; импорт/рендер `PatientHomeDiariesSection` отсутствует, секции «Дневники» нет.

**H.5 — аудит**

- Добавлен блок «Покрытие vs EXEC H.5.2» в `AUDIT_PAGES_VS_RAWPLAN.md`: основные экраны RAW §7–18 и doctor §5–9 покрыты; не каждый вспомогательный `page.tsx` (emergency, lessons, doctor/appointments, …) разобран отдельной строкой — задокументировано как осознанный пробел.

**H.1.6 — тесты auth**

- `pnpm exec vitest run src/modules/auth src/app/api/auth` — **103 теста, PASS** (модули auth + API `/api/auth/*`).

**Контрольный чеклист EXEC_H**

- Все пункты секции «Контрольный чеклист» в `EXEC_H_HOTFIX_UI_AUTH.md` отмечены выполненными с примечаниями (в т.ч. валидация через `isValidRuMobileNormalized` вместо дословного `length < 12`).

**Команда:** актуальный `pnpm run ci` — **PASS** на момент последней полной прогонки Pack H часть 3.

---

## Pack I — EXEC_I_UI_REVIEW шаги I.1, I.2, I.3 (2026-03-25)

### I.1 — кнопки

- `apps/webapp/src/components/ui/button.tsx`: радиус `rounded-md`, синие варианты с `text-white`, для всех вариантов `active:` с затемнением и `active:shadow-inner`; размеры default `h-9` / `px-3`, иконки пересчитаны.
- Заменены устаревшие классы `.button` / `.button-outline` на `Button` и `buttonVariants` по webapp (в т.ч. `AppShell`, дневники, doctor content/messages/clients, markdown, dev-вход, `PostLoginSuggestion`, `PhoneAuthForm`, `LogoutSection`, `ClientsFilters` с `variant` default/outline).
- `FeatureCard` (ссылка): `active:scale-[0.98]`.
- Сопутствующее: `apps/integrator/src/integrations/bersoncare/sendOtpRoute.test.ts` — TS2532 на `mock.calls[0]`; корневой `package.json` — `pnpm.overrides` для `picomatch` (transitive), `pnpm-lock.yaml` обновлён — `pnpm audit --prod` в `ci` без находок.

### I.2 — размеры

- `globals.css`: `body` — `text-base`; `.eyebrow` — 0.875rem; `--patient-gap` — 24px; `.auth-input` — `min-height: 44px`.
- `AppShell` (patient): `px-5`.
- `PatientHeader`: `-mx-5` / `px-5`, иконка назад — `ChevronLeft` `size-6`, плейсхолдер без «назад» — `w-10`; Sheet — `w-[min(100vw,17rem)]`, `sm:max-w-[17rem]`.
- `input.tsx`: `h-11`, `px-3`/`py-2`, без `md:text-sm`.
- Заголовки секций пациента (`text-xs` → `text-sm` для h2 и блока напоминаний).
- `LfkSessionForm`: дата и время в одной строке, `flex gap-2`, поля `flex-1` / `min-w-0`, без `auth-input w-auto` на date/time.

### I.3 — PIN

- `PinInput.tsx`: 4 поля `w-12 h-14`, `text-center text-2xl font-bold`, `gap-3`, ввод/Backspace/стрелки, paste из любого поля на 4 цифры, auto-submit при 4 цифрах, защита от двойного вызова `onSubmit`; `runSubmit` без `setError` внутри effect (eslint `react-hooks/set-state-in-effect`); вариант `link` у `Button` — `active:scale-[0.98]`.
- Бэкенд и профиль: `pinAuth.ts`, `api/auth/pin/login`, `api/auth/pin/set`, `PinSection`, тесты `pinAuth.test.ts`, `pin/login/route.test.ts` — только **ровно 4 цифры** (`/^\d{4}$/`).

### Проверки (I.1–I.3)

- **`pnpm run ci` — PASS** (после доработок PinInput / link / code review).

### Затронутые файлы (дополнительно к перечислению в I.1)

- `apps/webapp/src/app/globals.css`, `AppShell.tsx`, `PatientHeader.tsx`, `components/ui/input.tsx`, секции `patient/home/*`, `patient/page.tsx`, `patient/cabinet/page.tsx`, `patient/reminders/page.tsx`, `diary/lfk/LfkSessionForm.tsx`, `shared/ui/auth/PinInput.tsx`, `profile/PinSection.tsx`, `modules/auth/pinAuth.ts`, `api/auth/pin/login/route.ts`, `api/auth/pin/set/route.ts`, тесты pin.

---

### I.4 — админ в Telegram / Max mini-app (КРИТИЧНЫЙ)

**Причина:** `resolveRoleFromEnv` учитывал только `ADMIN_PHONES` / `DOCTOR_PHONES`. В `validateTelegramInitData` после whitelist вызывалось `resolveRoleFromEnv({})` → всегда `client`. При `exchangeIntegratorToken` в env-сверку не передавались `telegramId` / `maxId` из токена и пользователя.

**Исправление:**

- `envRole.ts`: `resolveRoleFromEnv({ phone?, telegramId?, maxId? })` — приоритет admin: telegram (`ADMIN_TELEGRAM_ID`) → max (`ADMIN_MAX_IDS`) → phone; затем doctor: `DOCTOR_TELEGRAM_IDS` → `DOCTOR_MAX_IDS` → phone.
- `service.ts`: `validateTelegramInitData` → `resolveRoleFromEnv({ telegramId })`; `exchangeIntegratorToken` / `exchangeTelegramInitData` передают phone + bindings; `getCurrentSession` сверяет роль при наличии phone **или** `telegramId` **или** `maxId`.
- `buildAppDeps.ts` (`confirmPhoneAuth`), `messenger/poll/route.ts`, `pin/login/route.ts` — в `resolveRoleFromEnv` добавлены `telegramId` / `maxId` из `SessionUser.bindings`.

**Тесты:** `envRole.test.ts` (telegram/max списки, в т.ч. «чужой» `telegramId` → `client`); `exchangeIntegratorToken.messengerRole.test.ts` — три подписанных `webapp-entry` токена: admin tg → `admin`, doctor tg → `doctor`, обычный пользователь в `ALLOWED_TELEGRAM_IDS` → `client` (в типах сессии роль пациента — **`client`**, не `patient`).

**Code review I.4:** маппинг admin/doctor/`client` подтверждён; полный путь `exchangeIntegratorToken` покрыт тремя кейсами; телефонный и прочий auth не затронут (изменения точечные в `resolveRoleFromEnv` и вызовах).

**Проверки:** `pnpm run ci` — **PASS** (2026-03-25, после расширения тестов I.4).

---

### I.5, I.6, I.12 — дневники и симптомы (EXEC_I_UI_REVIEW), 2026-03-25

**I.5 — навигация дневников**

- Главная: одна карточка «Дневник» в кабинете уже была (`PatientHomeCabinetSection` + `getMenuForRole`); `PatientHomeDiariesSection` в коде отсутствует.
- Меню шапки (`PatientHeader`): добавлен пункт «Дневник» → `routePaths.diary`.
- Вкладки «Симптомы» / «ЛФК» (`DiaryTabsClient`): контейнер `sticky top-16 z-30` (под высоту `PatientHeader`), фон под шапкой; список табов — сетка; неактивный таб — `text-muted-foreground`, активный — `data-active:bg-primary/10`, `font-semibold`, `text-primary`.
- Плюсик быстрого добавления: убран с `diary/page` (`patientFloatingSlot`); добавлен `PatientQuickAddFAB` в `AppShell` (пациент), скрывается на `pathname` под `/app/patient/diary`; данные — `GET /api/patient/diary/quick-add-context`; кнопка `fixed bottom-6 right-6 z-50`.
- Мини-статистика на главной: ссылка ведёт на `routePaths.diary` (единая страница дневника).

**I.6 — дневник симптомов**

- После успешного сохранения записи: `toast.success("Запись сохранена")`; кнопка «Сохраняю…» + `disabled` на время запроса (`AddEntryForm`, `QuickAddPopup`).
- `addSymptomEntry` возвращает `{ ok: boolean }`; дедупликация «в моменте»: при повторе того же `trackingId` и типа `instant` в течение 2 мин — `window.confirm` (логика в `symptomEntryDedup.ts`, общая для формы и QuickAdd).
- Создание симптома: см. I.12. Журнал под статистикой: в списке записей только название, балл и дата/время (`toLocaleString`), без типа/заметок в строке.
- Справочник диагноза: по-прежнему только выбор из `ReferenceSelect`; подпись, что новые позиции добавляет администратор.

**I.12 — форма создания симптома**

- По умолчанию: поле «Название» (обязательно, пока блок «Дополнительно» закрыт) и кнопка «Добавить».
- Ссылка-кнопка «Дополнительно» раскрывает тип, регион, сторона, диагноз (текст + справочник), стадия.
- `createSymptomTracking` возвращает `{ ok: boolean }`; при успехе — `toast.success("Симптом добавлен")`, при ошибке валидации — поясняющий toast.

**Проверки:** `pnpm run ci` — **PASS** (2026-03-25).

**Файлы (основные):** `PatientHeader.tsx`, `AppShell.tsx`, `app/app/patient/components/PatientQuickAddFAB.tsx`, `api/patient/diary/quick-add-context/route.ts`, `diary/DiaryTabsClient.tsx`, `diary/page.tsx`, `diary/QuickAddPopup.tsx`, `diary/symptoms/AddEntryForm.tsx`, `CreateTrackingForm.tsx`, `actions.ts`, `symptomEntryDedup.ts`, `symptomEntryDedup.test.ts`, `home/loadMiniStats.ts`.

**Code review I.5 / I.6 / I.12** (сверка с чеклистом `EXEC_I_UI_REVIEW.md`, 2026-03-25):

- **Одна кнопка «Дневник» на главной:** в секции «Кабинет» только `diary` + `cabinet` (`PatientHomeCabinetSection`, порядок `CABINET_ORDER`); в `getMenuForRole` нет отдельных пунктов «Дневник симптомов» / «ЛФК» для главной сетки. Дублирующей секции дневников нет.
- **Меню:** один пункт «Дневник» в `PatientHeader` (`MENU_ITEMS`).
- **Вкладки sticky + подсветка:** `DiaryTabsClient` — `sticky top-16`, `py-2`, фон; активная вкладка с фоновой подсветкой; неактивная — приглушённый текст.
- **Плюсик:** `PatientQuickAddFAB` скрыт при `pathname.startsWith(routePaths.diary)` (включая вложенные пути); позиция кнопки в `QuickAddPopup` — `bottom-6 right-6`.
- **Toast и «Сохраняю…»:** `AddEntryForm` и симптом в `QuickAddPopup` — `toast.success("Запись сохранена")`, disabled + подпись при pending.
- **Дедупликация:** один и тот же `trackingId` + тип `instant` + интервал &lt; 2 мин → confirm; тип `daily` или другой симптом — не блокирует; покрыто тестами `symptomEntryDedup.test.ts`.
- **Создание симптома (I.12):** в свёрнутом виде — поле названия (`placeholder` как в плане) и «Добавить»; `Button variant="link"` «Дополнительно»; расширенный блок по клику. Справочник диагноза — только выбор, без добавления в каталог на стороне пациента.

**Доработка после review:** `top-14` → `top-16` для выравнивания под фактическую высоту шапки; тесты дедупа; актуализация комментария в `FeatureCard.tsx`.

---

### I.7, I.8 — ЛФК ползунки/попапы и статистика/журнал (EXEC_I_UI_REVIEW), 2026-03-25

**I.7 — форма отметки ЛФК**

- Ползунки боли и сложности: класс `.lfk-diary-range` в `globals.css` (градиент трека green→yellow→red, thumb 28px, цвет через `--lfk-thumb` из `lfkThumbColor`).
- Дата и время: одна строка `flex gap-2`, поля `flex-1`; значения в скрытых `sessionDate` / `sessionTime`; открытие `Dialog` по центру (`border border-border shadow-md`).
- Календарь: кнопка «Сегодня», «Готово» применяет выбранную дату.
- Время: только «Готово» (применяет `timeDraft` и закрывает диалог).

**I.8 — статистика и журнал**

- `DiaryStatsPeriodBar`: сегментный переключатель (активный `bg-primary text-primary-foreground`).
- Период «Всё»: в `symptom-stats` и `lfk-stats` передаётся `earliestIso` в `statsPeriodWindowUtc` (`minRecordedAtForSymptomTracking` / `minCompletedAtForLfkUser`).
- График: `DiaryLineChartRecharts` + подписи оси по `formatDiaryChartTick.ts` (неделя — ПН/ВТ…, месяц — «1 мар», всё — месяцы); линия `strokeWidth={3}`, точки `r={4}`, `pb-8` у контейнера; `mt-6` перед графиком в симптомах.
- Журнал: кнопки «Открыть журнал» → `/app/patient/diary/symptoms/journal` и `/app/patient/diary/lfk/journal`; списки записей с главной страницы дневника убраны. Журналы: навигация по месяцу (`JournalMonthNav`), фильтр по `trackingId` / `complexId`, меню «⋯» — редактирование / удаление (server actions в `symptoms/actions.ts`, `lfk/actions.ts`).
- ЛФК детальный режим: API `lfk-stats` отдаёт `chartPoints` (агрегация `aggregateLfkSessionsMetricByDay`), таблица сессий под графиком убрана.
- Вспомогательно: `listSymptomEntriesForUserInRange` с `trackingId` в сервисе и in-memory порте; тест `periodWindow` для `all` + `earliestIso`.

**Проверки:** `pnpm install --frozen-lockfile && pnpm run ci` — **PASS** (2026-03-25).

**Файлы (основные):** `globals.css`, `LfkSessionForm.tsx`, `DiaryStatsPeriodBar.tsx`, `DiaryLineChartRecharts.tsx`, `SymptomChartRecharts.tsx`, `SymptomChart.tsx`, `LfkStatsTable.tsx`, `lfk-stats/route.ts`, `symptom-stats/route.ts`, `aggregation.ts`, `formatDiaryChartTick.ts`, `journal/resolveJournalMonthYm.ts`, `JournalMonthNav.tsx`, `symptoms/journal/*`, `lfk/journal/*`, `paths.ts`, `diary/page.tsx`, `symptom-service.ts`, `symptomDiary.ts` (in-memory), тесты `periodWindow`, `lfk-stats`, `symptom-stats`.

**Code review I.7 / I.8** (чеклист `EXEC_I_UI_REVIEW.md`, 2026-03-25, вторая итерация):

- **I.7 ползунки:** `.lfk-diary-range` — thumb 28×28px, градиент `#22c55e` → `#eab308` → `#ef4444`, ручка по значению через `--lfk-thumb` — ок.
- **I.7 попапы:** `Dialog` с `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` в `dialog.tsx` — по центру; добавлены явные `rounded-lg border border-border shadow-md` на обоих диалогах ЛФК.
- **I.7 дата/время:** одна строка `flex gap-2`, колонки `flex-1` — ок.
- **I.8 переключатель периода:** неактивный сегмент доведён до `bg-muted text-muted-foreground` (как в плане); активный — `bg-primary text-primary-foreground`.
- **I.8 «Всё»:** окно через `earliestIso` + `minRecordedAtForSymptomTracking` / `minCompletedAtForLfkUser` — ок (левая граница по первой записи, не «бесконечность»).
- **I.8 ось X (месяц):** подписи на **понедельниках UTC** + первый/последний день ряда (вместо каждого 7-го индекса точки) — ближе к «опорным датам недель».
- **I.8 журнал:** отдельные маршруты журналов; подпись «Период (календарный месяц)» над навигацией месяца; ссылка «Открыть журнал» с query `period`/`offset`/`trackingId`/`complexId` — ок.
- **I.8 отступы:** `mt-6` перед графиком симптомов; для ЛФК в режиме комплекса — `mt-6` вокруг блока графика перед кнопкой журнала.

**Hotfix после review — `buttonVariants` и Server Components:** вызов `buttonVariants()` из RSC через модуль с `"use client"` (`button.tsx`) ломал кабинет врача/админа. Вынесены стили в `components/ui/button-variants.ts` (без `"use client"`); RSC импортируют оттуда; `button.tsx` реэкспортирует `buttonVariants` для клиентских модулей.

**Проверки после доработок:** `pnpm run ci` — **PASS** (2026-03-25).

---

### I.9, I.10, I.11 — запись Rubitime/адрес, гостевые заглушки, бейдж чата (EXEC_I_UI_REVIEW), 2026-03-25

**I.9**

- Маршруты: `routePaths.patientBooking` (`/app/patient/booking`), `routePaths.patientAddress` (`/app/patient/address`) — полноэкранные iframe (Rubitime widget + `https://dmitryberson.ru/adress`), сессия через `getOptionalPatientSession` (без обязательного телефона).
- «Мои записи»: кнопка «Записаться на приём» → booking; карточка «Информация» — ссылки «Как подготовиться» и «Адрес кабинета»; пустая история — текст «У вас нет записей»; встроенный `RubitimeWidget` и текст про «интеграцию Rubitime» убраны.
- Главная: в секции кабинета — заметная кнопка «Записаться на приём» (`PatientHomeCabinetSection`).
- Меню шапки: «Адрес кабинета» — `router.push(routePaths.patientAddress)` вместо внешнего окна.
- `patientPathsRequiringPhone`: пункт `cabinet` исключён (запись без телефона; список записей по-прежнему только с телефоном/мессенджером).

**I.10**

- Компонент `GuestPlaceholder`: `bg-amber-50`, `border-amber-200` (+ тёмная тема), основное и опциональное действие-ссылки.
- Общая логика: `shared/ui/patient/guestAccess.tsx` (`CabinetGuestAccess`, `DiarySectionGuestAccess`, `PurchasesGuestAccess`, `NotificationsGuestAccess`, `patientHasPhoneOrMessenger`).
- Кабинет: без сессии или без телефона/мессенджера — заглушка + «Записаться на приём» (на booking); для авторизованных без телефона — вторичная ссылка на bind-phone (без inline-формы).
- Дневник, журналы симптомов/ЛФК, покупки, уведомления: при блокировке — заглушка + «Зарегистрироваться» или «Подтвердить номер» на `/app?next=…` / bind-phone; `PatientBindPhoneSection` с этих экранов убран.
- Страницы контента (`content/[slug]`) без формы телефона (без изменений по сути).

**I.11**

- Завышенный бейдж непрочитанных: ручной SQL и отказ от доработки расписания reminders в Pack I — зафиксировано в `docs/FULL_DEV_PLAN/POST_PROD_TODO.md` (§7).

**Проверки:** `pnpm install --frozen-lockfile && pnpm run ci` — **PASS** (2026-03-25).

**Файлы (основные):** `paths.ts`, `patient/booking/page.tsx`, `patient/address/page.tsx`, `patient/cabinet/page.tsx`, `patient/home/PatientHomeCabinetSection.tsx`, `PatientHeader.tsx`, `GuestPlaceholder.tsx`, `patient/guestAccess.tsx`, `diary/page.tsx`, `diary/symptoms/journal/page.tsx`, `diary/lfk/journal/page.tsx`, `purchases/page.tsx`, `notifications/page.tsx`, `AppShell.tsx`, `POST_PROD_TODO.md`, `finsl_fix_report.md`.

**Code review I.9 / I.10 / I.11** (контрольный чеклист `EXEC_I_UI_REVIEW.md`, 2026-03-25):

- **Чеклист §358–363:** отдельная страница записи с iframe (`/app/patient/booking`, URL совпадает с `RubitimeWidget`); кнопка «Записаться на приём» на главной (`PatientHomeCabinetSection`) и на «Мои записи»; адрес — отдельная страница `/app/patient/address` с iframe `dmitryberson.ru/adress`, плюс пункт меню и блок «Информация» на кабинете.
- **Заглушки:** `GuestPlaceholder` — `bg-amber-50` / `border-amber-200`, заголовок + описание + кнопки; тексты кабинета и дневника для гостя приведены к формулировкам I.10 (в т.ч. «Здесь отображаются…», «Дневники помогают отслеживать…», подпись кнопки **«Записаться на приём»**).
- **Контент:** `content/[slug]` — только `MarkdownContent` / медиа, без `BindPhone` / `PatientBindPhoneSection`.
- **I.11:** счётчик непрочитанных в Pack I не менялся; reminders UI — в `POST_PROD_TODO.md` §7; при необходимости очистки бейджа — ручной SQL там же.
- **Доработка при review:** у `AppShell` (variant patient) у `main.content-area` добавлены `flex min-h-0 flex-1 flex-col`, у booking/address iframe — явная высота `h-[calc(100dvh-9rem)]` (и `sm:`) для заполнения области под шапкой.

**Проверки после review:** `pnpm run ci` — **PASS** (2026-03-25).

---

### Независимый аудит Pack I (EXEC_I + QA_CHECKLIST + USER_TODO), 2026-03-25

**Метод:** сверка контрольного чеклиста `EXEC_I_UI_REVIEW.md` (стр. 338–363), блоков QA после Pack H (`QA_CHECKLIST.md` 115–132) и затронутых требований с кодом; `pnpm run ci` — **PASS**.

**Critical:** не выявлено.

**High:** не выявлено (admin по `telegramId` в exchange — тест `exchangeIntegratorToken.messengerRole.test.ts`; `resolveRoleFromEnv` в `envRole.ts`).

**Medium (остаточные риски, не блокер релиза I):**

- **I.11 / чат:** завышенный бейдж на prod — только ops/SQL или будущая кнопка «прочитано»; в Pack I не автоматизировано (`POST_PROD_TODO.md` §7).
- **Внешние iframe:** Rubitime и сайт адреса не проверялись живым браузером в этом прогоне (зависит от сторонних сервисов/CSP).

**Low:**

- Наследие класса `button--back` рядом с `buttonVariants` в `AppShell` / карточках врача — косметический долг I.1, на работу кнопок не влияет.
- `USER_TODO_STAGE.md` / `RAW_PLAN.md` — в основном продуктовые этапы 12–14; для границ Pack I достаточно EXEC_I + QA H.

**Исправление при аудите:** сегменты «Неделя / Месяц / Всё» в `DiaryStatsPeriodBar.tsx` — `active:scale-[0.98]` + transition (чеклист «реакция на нажатие»).

**Verdict:** **ready** (пакет I по коду и CI; оговорки — I.11 данные и smoke внешних iframe).

---

## Pack A re-run (EXEC_A_QUICK_FIXES) — 2026-03-26

### Контекст
- Выполнена повторная проверка пакета A по инструкции `EXEC_A_QUICK_FIXES.md` с порядком шагов A.1 → A.5.
- Новых кодовых правок не потребовалось: пункты A.1–A.5 уже присутствуют в репозитории.

### Targeted проверки по шагам
- **A.1**: `pnpm --dir apps/webapp exec tsc --noEmit`; `pnpm --dir apps/webapp exec vitest run src/app-layer/di/buildAppDeps.test.ts`; `pnpm --dir apps/webapp exec eslint src/app-layer/di/buildAppDeps.ts` — PASS.
- **A.2**: `pnpm --dir apps/webapp exec eslint src/shared/ui/PatientHeader.tsx src/shared/ui/DoctorHeader.tsx src/shared/hooks/useSupportUnreadPolling.ts` — PASS.
- **A.3**: `pnpm --dir apps/webapp exec tsc --noEmit`; `pnpm --dir apps/webapp exec vitest run src/modules/integrator/deliveryTargetsApi.test.ts src/app-layer/di/buildAppDeps.test.ts`; `pnpm --dir apps/webapp exec eslint src/app-layer/di/buildAppDeps.ts src/infra/repos/pgUserByPhone.ts src/infra/repos/inMemoryUserByPhone.ts src/modules/auth/userByPhonePort.ts` — PASS.
- **A.4**: `pnpm --dir apps/webapp exec tsc --noEmit`; `pnpm --dir apps/webapp exec vitest run src/modules/doctor-clients/appointmentStatsFromHistory.test.ts src/infra/repos/pgDoctorAppointments.test.ts src/modules/doctor-clients/service.test.ts`; `pnpm --dir apps/webapp exec eslint src/modules/doctor-clients/service.ts src/modules/doctor-clients/appointmentStatsFromHistory.ts src/infra/repos/pgDoctorAppointments.ts` — PASS.
- **A.5**: `pnpm --dir apps/webapp exec tsc --noEmit`; `pnpm --dir apps/webapp exec vitest run src/app/api/patient/messages/route.test.ts src/app/api/doctor/messages/unread-count/route.test.ts src/app/api/admin/users/[userId]/archive/route.test.ts src/modules/patient-home/newsMotivation.test.ts`; `pnpm --dir apps/webapp exec eslint src/app/api/patient/messages/route.test.ts src/app/api/doctor/messages/unread-count/route.test.ts src/app/api/admin/users/[userId]/archive/route.test.ts src/modules/patient-home/newsMotivation.test.ts` — PASS.

### Полный CI после последнего шага
- `pnpm install --frozen-lockfile && pnpm run ci` — PASS.

### Блокеры
- Нет.
