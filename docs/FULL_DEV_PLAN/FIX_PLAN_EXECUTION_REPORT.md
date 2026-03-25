# Отчёт о выполнении FIX_PLAN для всех этапов

**Дата:** 2026-03-25  
**Статус проверок:** полный `pnpm run ci` — **PASS** (включая code review Pack G 2026-03-25).

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
