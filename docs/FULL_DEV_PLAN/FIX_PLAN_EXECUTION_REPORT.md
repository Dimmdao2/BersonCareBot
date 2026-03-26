# Отчёт о выполнении FIX_PLAN для всех этапов

**Дата:** 2026-03-25  
**Статус проверок:** полный `pnpm run ci` — **PASS** (включая Pack I.4 — роль admin в мессенджере, 2026-03-25).

---

## Итог по этапам

| Этап | Критичные | Средние | Статус |
|------|-----------|---------|--------|
| Stage 00 | нет | legacy-слой CSS (технический долг) | ✅ нет кода для исправления |
| Stage 01 | ✅ исправлено | ✅ частично | ✅ выполнено |
| Stage 02 | нет | ✅ исправлено | ✅ выполнено |
| Stage 03 | нет | документация / продуктовое решение | ✅ нет кода для исправления |
| Stage 04 | нет | верификация чеклиста | ✅ нет кода для исправления |
| Stage 05 | нет | Zod + тесты | ⚠️ см. ниже |
| Stage 06 | нет | верификация тестов | ✅ нет кода для исправления |
| Stage 07 | нет | унификация recharts | ✅ нет кода для исправления |
| Stage 08 | нет | ✅ исправлено | ✅ выполнено |
| Stage 09 | ✅ исправлено | ✅ исправлено | ✅ выполнено |
| Stage 10 | нет | ✅ исправлено | ✅ выполнено |
| Stage 11 | ✅ Pack F (LFK): миграции 033–035, CRUD упражнений/шаблонов, назначение, UI врача/пациента | code review 2026-03-25: guard published+empty exercises, safe ROLLBACK, тесты pgLfkAssignments | ✅ выполнено |
| Stage 12 | ✅ реализован (Pack D: Reminders) | code review 2026-03-25: auth GET unread-count, тесты hook/pgReminderRules | ✅ выполнено |
| Stage 13 | ✅ реализован (Pack C: Relay/Integrations) | доработки по QA закрыты | ✅ выполнено |
| Stage 14 | ✅ реализован (Pack B: Settings/Admin) | доработки по QA закрыты | ✅ выполнено |

---

## Исправленные файлы (хронология)

### 1. `apps/webapp/src/infra/repos/pgDoctorAppointments.ts`
**Этап:** 01 (критично) + 09 (критично)  
**Проблема:** `getDashboardAppointmentMetrics` → `cancellationsInCalendarMonth` считал `status = 'canceled'` без исключения записей с `last_event IN ('event-remove-record', 'event-delete-record')`. Расхождение с семантикой «отмена» из подэтапа 1.8 / `getAppointmentStats`.  
**Исправление:** Добавлено условие `AND last_event NOT IN ('event-remove-record', 'event-delete-record')` — теперь метрика дашборда соответствует `getAppointmentStats`.

---

### 2. `apps/webapp/src/shared/ui/AskQuestionFAB.tsx`
**Этап:** 01 (medium)  
**Проблема:** Inline-стили (`opacity`, `pointerEvents`, `visibility`, `transition`) на обёртке FAB.  
**Исправление:** Заменены на Tailwind-классы (`opacity-0/100`, `pointer-events-none/auto`, `invisible/visible`, `transition-opacity duration-200`).

---

### 3. `apps/webapp/src/app/app/doctor/layout.tsx`
**Этап:** 02 + 09 (medium)  
**Проблема:** Хардкод `bg-[#f5f7fb]` вне токенов темы.  
**Исправление:** Заменено на `bg-muted/30`.

---

### 4. `apps/webapp/src/app/app/doctor/page.tsx`
**Этап:** 02 + 09 (medium)  
**Проблема:** Блок «Быстрые действия» использовал legacy-классы `.button`, `.panel`, `.feature-grid`, `.feature-grid--compact`.  
**Исправление:** Секция переписана на Tailwind (`flex flex-wrap gap-2`, `rounded-xl border bg-background p-4 shadow-sm`), ссылки используют `buttonVariants({ variant: "outline", size: "sm" })` из shadcn.

---

### 5. `apps/webapp/src/app/app/doctor/clients/DoctorClientsPanel.tsx`
**Этап:** 02 + 09 (medium)  
**Проблема:** Поле поиска с классом `auth-input` — не shadcn `Input`.  
**Исправление:** `<input className="auth-input">` → `<Input>` из `@/components/ui/input`.

---

### 6. `apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx`
**Этап:** 09 (medium)  
**Проблема:** Inline-стили `style={{ listStyle: "none", padding: 0, margin: 0 }}` на `<ul>` каналов и `style={{ marginTop: 16, marginBottom: 8 }}` на `<h3>`.  
**Исправление:** Классы `list-none p-0 m-0` и `mt-4 mb-2` на Tailwind.

---

### 7. `apps/webapp/src/app/app/patient/content/[slug]/page.tsx`
**Этап:** 10 (low)  
**Проблема:** `@next/next/no-img-element` — использование `<img>` вместо `next/image`; inline-стиль.  
**Исправление:** Добавлен осознанный `// eslint-disable-next-line` с объяснением (CMS-изображения с неизвестными размерами). Inline-стиль `style={{ maxWidth: "100%", height: "auto" }}` заменён на `className="max-w-full h-auto"`.

---

### 8. `apps/webapp/src/modules/messaging/hooks/useMessagePolling.ts`
**Этап:** 08 (medium)  
**Проблема:** При `visibilityState === hidden` интервал продолжал тикать (без сетевых запросов, но wasteful). При возврате на вкладку — ожидание до следующего тика.  
**Исправление:** Интервал снимается при `hidden`, запускается при `visible` с немедленным тиком. Добавлена защита от двойного запуска (`clearInterval` перед `setInterval` в `startInterval`).

---

### 9. `apps/webapp/src/app/app/doctor/clients/page.tsx`
**Этап:** 02 + 09 (medium)  
**Проблема:** Legacy-классы `master-detail`, `master-detail__list`, `master-detail__detail`, `panel stack`.  
**Исправление:**
- `master-detail` → `md:grid md:grid-cols-[1fr_2fr] md:gap-4`
- `master-detail__list` → убран класс
- `master-detail__detail` → `hidden md:block`
- `panel stack` на секции → `rounded-xl border border-border/60 bg-background p-4 shadow-sm flex flex-col gap-4`

---

### 10. `apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx`
**Этап:** 08 (medium × 2)  
**Проблемы:**
1. Legacy `panel stack gap-4` на корневой секции.
2. `auth-input` на `<textarea>`.
3. **8.5.2 не реализовано:** сортировка «непрочитанные сверху».

**Исправления:**
1. `className="panel stack gap-4"` → `className="flex flex-col gap-4"`.
2. `<textarea className="auth-input ...">` → `<Textarea className="min-h-[88px] resize-y">` из `@/components/ui/textarea`.
3. После `setList(rows)` применяется клиентская сортировка: диалоги с `lastSenderRole === "user"` (последнее сообщение от пациента — требует ответа) идут первыми, внутри групп — по `lastMessageAt DESC`.

---

### 11. `apps/webapp/src/app/app/settings/AdminModeToggle.tsx`
**Этап:** Pack B (low, закрыт)  
**Проблема:** после переключения режима администратора использовался `window.location.reload()`.  
**Исправление:** заменено на `router.refresh()` — обновление server state без полного перезагрузки вкладки.

---

### 12. `apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts` + `apps/webapp/src/infra/repos/pgSupportCommunication.ts` + `apps/webapp/src/infra/repos/inMemorySupportCommunication.ts`
**Этап:** Pack C (medium, закрыт)  
**Проблема:** двойной запрос и лишняя загрузка истории в `sendAdminReply` (`conversationExists` + `getConversationWithMessages`).  
**Исправление:** добавлен лёгкий метод порта `getConversationRelayInfo(conversationId)`; `sendAdminReply` использует один запрос для проверки существования и получения relay-binding.

---

## Нерешённые пункты (вне области точечных исправлений)

### Stage 05 — Zod на POST в `/api/auth/`
FIX_PLAN §5 пункт 2: «Zod на всех POST в `apps/webapp/src/app/api/auth/`».  
Затрагивает 10+ маршрутов; требует отдельной задачи с тестовым покрытием.

### Stage 07 — унификация импортов recharts
FIX_PLAN §5 пункт 1: grep по `modules/diaries/components` на прямой import recharts. Верификационная задача — нет дублирования по текущему коду.

### Stage 10 — расширить e2e CMS (upload → публикация)
FIX_PLAN §1: добавить сценарий `POST /api/media/upload` → `saveContentPage`. Требует отдельной задачи с моком сессии врача.

### Stage 11 — Pack F (ЛФК) — выполнено
Реализовано по `EXEC_F_LFK!.md` (миграции 033–035, модули, UI, назначение). Code review 2026-03-25: guard «published без упражнений», безопасный `ROLLBACK`, тесты `pgLfkAssignments`; `pnpm run ci` — PASS.

---

## Проверка корректности исправлений

### Потенциальная проблема в `AskQuestionFAB.tsx` — разрешена
Оригинальный код использовал три независимых inline-стиля. Новый код объединяет их в Tailwind-классы через conditional join. Все состояния (`unknown`/`mini`/`browser`) покрыты корректно:

| `miniAppEnv` | `hideInMessenger` | `isReady` | Классы |
|---|---|---|---|
| `unknown` | false | false | `opacity-0 pointer-events-none visible` |
| `mini` | true | true | `opacity-0 pointer-events-none invisible` |
| `browser` | false | true | `opacity-100 pointer-events-auto visible` |

### Потенциальная проблема в `useMessagePolling.ts` — разрешена
Новая реализация: при mount-е если страница visible — немедленно тикает и запускает интервал. Это безопасно: `poll` guard'ируется `if (!selectedId || !lastCreatedAt) return`. При `enabled` = false — интервал не запускается (early return в эффекте). При смене `enabled` false→true — запускается с немедленным тиком, что ускоряет доставку сообщений.

### `clients/page.tsx` — сохранены id для e2e
`id="doctor-clients-master-detail"`, `id="doctor-clients-list-column"`, `id="doctor-clients-detail-column"`, `id="doctor-clients-list-section"` — все сохранены.

---

## Pack E Code Review Snapshot (2026-03-25)

- Статус: **Needs Rework**.
- Критичный блокер: конфликт `channel_link` в webapp сейчас может перезаписать владельца binding (`ON CONFLICT ... DO UPDATE`), что противоречит policy из `USER_TODO_STAGE.md` (нужен конфликтный сценарий + уведомление, без автоперепривязки).
- Высокие блокеры:
  - шаги E.6/E.7 не выполнены;
  - E.5 не закрыт по требованиям EXEC (нет nock integration tests, нет подтверждённого соответствия dependency-требованию `googleapis`/`nock` в integrator package).
- Мелкие фиксы после ревью внесены (комментарий Flow 5 в send-email route, тест идемпотентной ветки channel-link complete).

---

## A-E Remediation Follow-up (2026-03-25, post-review)

Статус после повторного code review и доработок по `EXEC_A-E_REMEDIATION_MASTER.md`:

- **Wave 1–3:** закрыты (channel-link conflict policy, dependencies `googleapis`/`nock`, Google Calendar nock + timezone, Rubitime reverse M2M, email autobind policy branches).
- **Wave 4:** закрыт:
  - добавлен domain nock coverage (`api.telegram.org`, MAX host, `googleapis.com`, `smsc.ru`, `rubitime.ru`);
  - добавлен inject coverage для `/webhook/telegram`, `/webhook/max`, `/webhook/rubitime/*`;
  - добавлен `apps/integrator/e2e/README.md` (manual smoke).
- **Wave 5:** выполнен targeted regression pass по A-D touch areas (auth/channel-link, messaging relay, reminders/integrator routes + integrator webhooks).
- **Wave 6:** обновлены отчёты и закрыт Pack E в `QA_CHECKLIST.md`.

### Дополнительно закрыто по итогам review

- `user.email.autobind` conflict path теперь имеет выделенный reporter-hook в webapp (`setEmailAutobindConflictReporter`) и structured warning.
- Добавлен doctor UI слой для Rubitime reverse API (`DoctorAppointmentActions`) и route tests для:
  - `POST /api/doctor/appointments/rubitime/update`
  - `POST /api/doctor/appointments/rubitime/cancel`.

### Финальная верификация

- `pnpm run ci` — **PASS** (lint, typecheck, integrator tests, webapp tests, webapp typecheck, build integrator, build webapp, audit).

### Актуальный статус Stage 13 / Pack E

- **Статус:** ✅ выполнено в рамках текущего remediation scope.

---

## QA Checkpoint (2026-03-25)

Проведена сверка `docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md` с фактическим состоянием репозитория.

### Подтверждено

- `pnpm run ci` — **PASS**.
- `pnpm run test:webapp` — **PASS** (в составе CI).
- Нет новых `console.log` в production-коде по добавленным строкам `git diff`.
- Нет новых `any` в прод-коде по добавленным строкам `git diff` (кроме `expect.any(...)` в тестах).
- Миграции webapp последовательны и уникальны в диапазоне `031–035`.
- `INTEGRATOR_CONTRACT.md` покрывает M2M flow'ы: send-sms, send-email, relay-outbound, Rubitime update/remove.

### Открытые замечания

1. `*.env.example` не полностью синхронизированы с новыми env-ключами:
   - root `.env.example` не включает Google Calendar env и `RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES`;
   - `apps/webapp/.env.example` не включает `ALLOWED_MAX_IDS`.
2. Policy «важных сообщений» (вариант B) остаётся за пределами scope Pack D (отдельная задача).

Детальный список проблем вынесен в `docs/FULL_DEV_PLAN/EXEC/QA_CHEK_RESULT`.

---

## Code review — Pack H часть 1 (`EXEC_H_HOTFIX_UI_AUTH` H.1.1–H.3), 2026-03-25

### Результат

- Сверка с `EXEC_H_HOTFIX_UI_AUTH.md` и `QA_CHECKLIST.md`: закрыты пробелы по валидации телефона на всех входах API (не только `phone/start`), по WCAG touch-target в шапках, по тесту «нет фантомного cooldown» после ошибки интегратора.
- Валидация нормализованного номера унифицирована: `isValidRuMobileNormalized` (`^\+7\d{10}$`) — эквивалент требованию «12 символов +7XXXXXXXXXX», строже наивного `length < 12` из EXEC для лишних цифр.
- **`pnpm run ci` — PASS** после исправлений.

### Изменённые файлы (итог review)

- `apps/webapp/src/modules/auth/phoneValidation.ts`, `phoneValidation.test.ts`
- `apps/webapp/src/shared/ui/auth/PhoneInput.tsx`, `apps/webapp/src/modules/auth/phoneAuth.ts`
- `apps/webapp/src/app/api/auth/check-phone/route.ts`, `pin/login/route.ts`, `messenger/start/route.ts`
- `apps/webapp/src/modules/auth/phoneNormalize.test.ts` (кейс `8(918)900-07-82`)
- `apps/webapp/src/infra/integrations/sms/integratorSmsAdapter.test.ts`
- `apps/webapp/src/shared/ui/PatientHeader.tsx`, `DoctorHeader.tsx`
- Документация: `docs/FULL_DEV_PLAN/finsl_fix_report.md`, `docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md`

---

## Code review — Pack H часть 2 (`EXEC_H_HOTFIX_UI_AUTH` H.1.3–H.1.5), 2026-03-25

### Результат

- Сверка с `EXEC_H_HOTFIX_UI_AUTH.md` и `QA_CHECKLIST.md`: закрыты расхождения по H.1.5 (подсказка Telegram только при входе по SMS OTP), по UX fallback «отправить на СМС» (не сбрасывать challenge до успешного `phone/start`), по мелкому шрифту ссылки SMS в `ChannelPicker`.
- Регрессия **не выявлена** для входа через Telegram Mini App: `AuthBootstrap` по-прежнему обрабатывает `?t=` / `telegram-init` до ветки `showPhoneFlow`; `AuthFlowV2` включается только при `NEXT_PUBLIC_AUTH_V2=1` и условии `showPhoneFlow`.
- `INTEGRATOR_CONTRACT.md` содержит описание `POST /api/bersoncare/send-otp`.
- **`pnpm run ci` — PASS** после исправлений.

### Изменённые файлы (итог review)

- `apps/webapp/src/shared/ui/auth/PostLoginSuggestion.tsx`
- `apps/webapp/src/shared/ui/auth/AuthFlowV2.tsx`
- `apps/webapp/src/shared/ui/auth/ChannelPicker.tsx`
- `docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md`
- `docs/FULL_DEV_PLAN/finsl_fix_report.md`

---

## Code review — Pack H часть 3 (`EXEC_H_HOTFIX_UI_AUTH` H.4, H.5, H.1.6), 2026-03-25

### Результат

- **H.4:** Секция «Кабинет» на `/app/patient` содержит только карточки «Дневник» и «Мои записи» (меню `diary` + `cabinet`, порядок в `PatientHomeCabinetSection`); отдельной секции «Дневники» нет, компонент `PatientHomeDiariesSection` удалён из кодовой базы.
- **H.5:** `AUDIT_PAGES_VS_RAWPLAN.md` обновлён разделом о покрытии: основные экраны по RAW §7–18 и doctor §5–9 отражены; полный построчный обход каждого `page.tsx` (emergency, lessons, doctor/appointments, …) не выполнялся — зафиксировано в документе как пробел при необходимости второй итерации.
- **H.1.6:** Тесты auth (`src/modules/auth` + `src/app/api/auth`) — **103 passed**; чеклист в конце `EXEC_H_HOTFIX_UI_AUTH.md` отмечен выполненным.
- **`pnpm run ci`:** **PASS** (актуально на момент закрытия Pack H часть 3).

### Документы

- `docs/FULL_DEV_PLAN/EXEC/EXEC_H_HOTFIX_UI_AUTH.md` — контрольный чеклист (все пункты [x]).
- `docs/FULL_DEV_PLAN/EXEC/AUDIT_PAGES_VS_RAWPLAN.md` — аудит + блок про покрытие.
- `docs/FULL_DEV_PLAN/finsl_fix_report.md` — запись code review Pack H часть 3.

---

## Pack I — EXEC_I_UI_REVIEW (фрагменты)

### I.1–I.3 (UI) + чеклист EXEC_I

- Реализованы шаги I.1–I.3 (кнопки, размеры, PIN); по контрольному чеклисту в `EXEC_I_UI_REVIEW.md` пункты **1–4 и 22** (CI) закрыты в рамках этих шагов; пункты **5–21** относятся к I.5+ и не входили в объём I.1–I.3.
- Детали и файлы: `docs/FULL_DEV_PLAN/finsl_fix_report.md` (секция Pack I).

### I.4 — админ в Telegram/Max mini-app (`EXEC_I_UI_REVIEW.md`), 2026-03-25

**Результат**

- Роль из env определяется по `ADMIN_TELEGRAM_ID`, `DOCTOR_TELEGRAM_IDS`, `ADMIN_MAX_IDS`, `DOCTOR_MAX_IDS` в дополнение к телефонным спискам; исправлены `exchangeIntegratorToken`, `exchangeTelegramInitData`, `getCurrentSession` и сценарии с `resolveRoleFromEnv` только по телефону.
- Добавлены тесты: `envRole.test.ts` (включая явный кейс «telegramId вне admin/doctor → `client`»), `exchangeIntegratorToken.messengerRole.test.ts` — три интеграционных кейса: admin tg, doctor tg, обычный пользователь в whitelist → **`client`** (роль пациента в коде — `client`, не строка `patient`).
- **Code review I.4:** регрессий в обычном auth flow не выявлено; расширение тестов закрывает пробел «только admin в exchange».
- **`pnpm run ci` — PASS** (после замены `exchangeIntegratorToken.adminRole.test.ts` на `messengerRole`).

**Изменённые файлы**

- `apps/webapp/src/modules/auth/envRole.ts`, `service.ts`
- `apps/webapp/src/app-layer/di/buildAppDeps.ts`
- `apps/webapp/src/app/api/auth/messenger/poll/route.ts`, `pin/login/route.ts`
- `apps/webapp/src/modules/auth/envRole.test.ts`, `exchangeIntegratorToken.messengerRole.test.ts`
- `docs/FULL_DEV_PLAN/finsl_fix_report.md`

### I.5, I.6, I.12 — code review (`EXEC_I_UI_REVIEW.md` чеклист), 2026-03-25

**Проверено по чеклисту (релевантные пункты):** одна «Дневник» на главной (кабинет) и в меню шапки; вкладки дневника sticky с подсветкой активной; FAB быстрого добавления только вне `/app/patient/diary*`, `bottom-6 right-6`; toast «Запись сохранена» и «Сохраняю…»; дедуп «в моменте» с confirm; форма нового симптома — по умолчанию только название + «Дополнительно» для расширенных полей.

**Исправления при review:** смещение sticky вкладок `top-14` → `top-16` под высоту `PatientHeader`; добавлены unit-тесты `symptomEntryDedup.test.ts`; комментарий `FeatureCard` приведён к текущей модели «один Дневник».

**Документы:** `docs/FULL_DEV_PLAN/finsl_fix_report.md` — блок Code review I.5/I.6/I.12.

**`pnpm run ci`:** PASS после правок.

### I.7, I.8 — code review + `buttonVariants` (Server Components), 2026-03-25

**Чеклист EXEC_I (I.7):** ползунки 28px и градиент трека; попапы модальные по центру; дата «Сегодня»/«Готово»; время только «Готово»; после review — явные `rounded-lg` на контенте диалогов ЛФК.

**Чеклист EXEC_I (I.8):** переключатель периода с явным неактивным `bg-muted`; «Всё» ограничено `earliestIso`; ось X месяца — метки по понедельникам UTC; журнал на отдельных URL с месячной навигацией и подписью периода; `mt-6` у графика ЛФК в детальном режиме.

**Исправление:** `buttonVariants` вынесен в `apps/webapp/src/components/ui/button-variants.ts` (без `"use client"`); Server Components (`AppShell`, страницы врача/контента, карточки клиента/подписчика, журналы дневника и др.) импортируют `buttonVariants` из `button-variants`; `button.tsx` реэкспортирует для клиентских файлов.

**`pnpm run ci`:** PASS после правок.

### I.9, I.10, I.11 — code review (`EXEC_I_UI_REVIEW.md` чеклист), 2026-03-25

**Проверено:** отдельные `/app/patient/booking` и `/app/patient/address` с iframe на высоту viewport минус шапка; кнопка записи на главной и в кабинете; блок «Информация» и «У вас нет записей»; заглушки гостя — янтарный блок + описание + действия; контент-страницы без формы телефона; I.11 (бейдж/SQL, reminders) — по `POST_PROD_TODO.md` §7 без изменений кода счётчика.

**Правки при review:** выравнивание копирайта I.10 в `guestAccess.tsx` (в т.ч. «Записаться на приём»); `AppShell` patient: `main` с `flex-1 min-h-0 flex-col`; iframe booking/address — `h-[calc(100dvh-9rem)]`.

**Документы:** `docs/FULL_DEV_PLAN/finsl_fix_report.md` — блок Code review I.9/I.10/I.11.

**`pnpm run ci`:** PASS после правок.

### Независимый аудит Pack I (2026-03-25)

Сверка `EXEC_I_UI_REVIEW.md` (чеклист), `QA_CHECKLIST.md` (Pack H: normalize, auth flow, UI), выборочно `USER_TODO_STAGE.md` / `RAW_PLAN.md` (scope I не конфликтует).

- **Auth V2:** `AuthFlowV2.tsx` — phone → check-phone → new_user_sms | pin | choose_channel → code; PIN 4 цифры (`PinInput`, `pinAuth`), 3× fail или «Не помню PIN» → choose_channel.
- **normalizePhone:** `phoneNormalize.ts` + тесты; `PhoneInput`, маршруты `check-phone`, `phone/start`, `messenger/start`, `pin/login` + `isValidRuMobileNormalized`.
- **Admin в мессенджере:** `envRole.ts` + `exchangeIntegratorToken.messengerRole.test.ts`.
- **Кнопки / размеры / дневники / статистика / запись / заглушки:** как в чеклисте I и в секциях I.5–I.10 выше; доп. правка аудита: `DiaryStatsPeriodBar.tsx` — `active:scale-[0.98]` на сегментах периода.

**Verdict:** **ready**; остаточно: I.11 данные в БД, ручной smoke внешних iframe.

**`pnpm run ci`:** PASS.
