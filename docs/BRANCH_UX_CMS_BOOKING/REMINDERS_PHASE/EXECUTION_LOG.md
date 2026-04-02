# Execution Log: Механика напоминаний

---

## STAGE 1 — Контракты и схема

| Задача | Статус | Артефакт | Замечания |
|--------|--------|----------|-----------|
| S1.T01 Доменная модель | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Добавлены `linked_object_type`, `linked_object_id`, `custom_title`, `custom_text` в контракт модели |
| S1.T02 reminder_journal | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Полный draft SQL для расширения `reminder_rules` и создания `reminder_journal` |
| S1.T03 Расширение occurrence_history | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Полный draft SQL для `snoozed_*`/`skipped_*` полей |
| S1.T04 API-контракты | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Описаны request/response JSON schema для всех новых endpoint-ов |
| S1.T05 Inline keyboard layout | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Зафиксированы layout, callback format, snooze/skip flow |
| S1.T06 Фикс вопросов UX | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Подтверждение вопроса "да/нет" и правила anti-forward |
| S1.T07 Deep link формат | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Форматы deep link для ЛФК и разминок + fallback |

**Аудит S1:** rework (major замечания) -> fixed in contracts  
**Фиксы S1:** 2026-04-02, обновлён `STAGE_1_CONTRACTS.md`:
- Добавлены ownership/authorization invariants для всех patient API.
- Добавлены contract-level idempotency guards для snooze/skip/done.
- Уточнён deep-link для `lfk_complex` на маршрут с `complexId`.
- Добавлены read-контракты `journal`/`journal stats` + источник события `done`.
- Добавлен terminal-step для skip flow (`ack + state=idle`).
- Синхронизирована нумерация миграций S2 с `PLAN.md` (`050`/`051`, см. также `STAGE_1_CONTRACTS.md`).

---

## STAGE 2 — DB + Core-сервис

| Задача | Статус | Файлы | CI |
|--------|--------|-------|----|
| S2.T01 Миграция 050 | done | `apps/webapp/migrations/050_reminder_rules_object_links_and_journal.sql` | green |
| S2.T02 Миграция 051 | done | `apps/webapp/migrations/051_reminder_occurrence_actions.sql` | green |
| S2.T03 types.ts + ports.ts | done | `modules/reminders/types.ts`, `ports.ts` | green |
| S2.T04 pgReminderRules | done | `infra/repos/pgReminderRules.ts`, `inMemoryReminderRules.ts` | green |
| S2.T05 ReminderJournalPort | done | `reminderJournalPort.ts`, `pgReminderJournal.ts`, `inMemoryReminderJournal.ts` | green |
| S2.T06 service расширение | done | `modules/reminders/service.ts` | green |
| S2.T07 API route handlers | done | `app/api/patient/reminders/create`, `[id]`, `[id]/snooze`, `[id]/skip` | green |
| S2.T08 Integrator-facing API | done | `pgReminderProjection`, `buildReminderDeepLink.ts` | green |
| S2.T09 buildAppDeps wiring | done | `app-layer/di/buildAppDeps.ts` | green |
| S2.T10 Тесты | done | `modules/reminders/service.test.ts` | green |

**Аудит S2:** approve (см. последний audit-report S2)  
**Фиксы S2:** 2026-04-02 — `[S2.fix] address audit remarks`:
- `pgReminderJournal.logAction`: `RETURNING id` + ошибка при 0 вставленных строк (не silent fail).
- `recordSnooze` / `recordSkip`: `console.warn` в `catch` для диагностики (ответ API по-прежнему `not_found`).
- In-memory journal: стабильный `journalRuleIntegratorId` для snooze/skip вместо литерала `"rule"`.
- Patient API мутаций (create, PATCH/DELETE `[id]`, snooze, skip): `revalidatePath(routePaths.patientReminders)` + `revalidatePath(routePaths.patient)`.
- `service.test.ts`: пустой `customTitle`, delete несуществующего правила, дубликат object reminder, повторный skip (idempotency in-memory).
**CI после фиксов S2:** `pnpm run ci` green (2026-04-02)

---

## STAGE 3 — Бот-уведомления

| Задача | Статус | Файлы | CI |
|--------|--------|-------|----|
| S3.T01 Шаблон напоминания | done | `reminder.dispatch` и ack-шаблоны в `content/telegram/user/templates.json`, `content/max/user/templates.json`; рендер в `handlers/reminders.ts` | green |
| S3.T02 Inline-кнопки | done | `handlers/reminders.ts` (URL + `rem_snooze` / `rem_skip`) | green |
| S3.T03 Snooze handler | done | `handlers/reminders.ts` (`reminders.snooze.callback`), `POST .../integrator/reminders/occurrences/snooze`, `remindersWritesPort.ts` | green |
| S3.T04 Skip handler | done | `handlers/reminders.ts` (skip preset / free text), `POST .../integrator/reminders/occurrences/skip`, скрипты `waiting_skip_reason` | green |
| S3.T05 Deep link builder | done | `kernel/domain/reminders/buildPatientReminderDeepLink.ts` | green |
| S3.T06 Фикс вопросов | done | `confirmQuestion`, `q_confirm:yes|no`, скрипты `telegram.ask.question` / `telegram.q_confirm.no` (+ MAX аналоги) | green |
| S3.T07 Skip reason guard | done | Состояние `waiting_skip_reason:` + матч `$startsWith` в `scripts.json`; без admin forward в этом состоянии | green |
| S3.T08 MAX адаптация | done | `max/mapIn.ts` прокидывает те же поля callback, что Telegram (`normalizeDynamicTelegramAction`) | green |
| S3.T09 Тесты | done | Webapp `snooze/route.test.ts`, `skip/route.test.ts`; integrator `telegram/mapIn.test.ts`, `max/mapIn.test.ts` | green |

**Аудит S3:** approve (post-fix: critical/major из аудита S3 закрыты)  
**Фиксы S3:** 2026-04-02 — `incomingEventPipeline`: тип и spread `remindersWebappWritesPort`; ESLint `no-useless-assignment` в `handlers/reminders.ts` (инициализация `reminderTitle`).  
**Фиксы S3:** 2026-04-02 — `[S3.fix] address audit remarks`:
- **Skip reason → админ (critical):** defense in depth — при `conversationState` `waiting_skip_reason:*` не выполняется пересылка в support relay (`handleConversationUserMessage` в `supportRelay.ts`) и не открывается новый диалог с первым сообщением в админ (`conversation.openWithMessage` в `executeAction.ts`).
- **callback_data ≤ 64 байт (major):** вынесено в `reminderInlineKeyboard.ts` (`buildReminderDispatchInlineKeyboard`, `buildReminderSkipReasonInlineKeyboard`); при превышении лимита строки snooze/skip не добавляются (остаётся deep link); для экрана причин клавиатура опускается, если пресеты не помещаются.
- **MAX (major, частично):** в `content/max/user/templates.json` добавлены строки для сценария вопроса (`describeQuestion`, `confirmQuestion`, `questionAccepted`, `questionCancelled`) — паритет текстов с Telegram; полные max-скрипты `q_confirm`/draft не добавлялись (нет entry-point в меню MAX в рамках узкого scope).
- Тесты: `reminderInlineKeyboard.test.ts`.  
**CI после S3:** `pnpm run ci` green (2026-04-02)

---

## STAGE 4 — Webapp UI

| Задача | Статус | Файлы | CI |
|--------|--------|-------|----|
| S4.T01 LfkComplexCard | done | `app/patient/diary/lfk/LfkComplexCard.tsx` | green |
| S4.T02 Список ЛФК | done | `LfkDiarySectionClient.tsx`, `diary/page.tsx` (вкладка ЛФК) | green |
| S4.T03 ReminderCreateDialog | done | `modules/reminders/components/ReminderCreateDialog.tsx` (Dialog / Sheet) | green |
| S4.T04 API интеграция | done | `POST /api/patient/reminders/create`, `PATCH .../reminders/:id` из диалога | green |
| S4.T05 Кнопка разминок | done | `sections/SectionWarmupsReminderBar.tsx`, `sections/[slug]/page.tsx` (slug `warmups`) | green |
| S4.T07 Произвольные напоминания | done | `ReminderRulesClient.tsx` → `ReminderCreateDialog` `custom` | green |
| S4.T08 Единый список | done | `ReminderRulesClient.tsx` (мои + категории врача), toggle/PATCH/DELETE | green |
| S4.T09 Изменение расписания | done | `LfkComplexCard` ссылка; разминки — `SectionWarmupsReminderBar` | green |
| S4.T10 Статистика | done | `statsPerRuleForUser` + страница `reminders/journal/[ruleId]` | green |

**Аудит S4:** rework (major замечание) -> fixed  
**Фиксы S4:** 2026-04-02 — `[S4.fix] address audit remarks`:
- **LfkComplexCard cover (major):** в `pgLfkDiary.listComplexes/getComplexForUser` добавлен `cover_image_url` через `LEFT JOIN LATERAL` (`lfk_complex_exercises` -> `lfk_exercise_media`, первый media по `sort_order`); в `LfkDiarySectionClient` передаётся `coverImageUrl={c.coverImageUrl ?? null}` вместо константного `null`; fallback-заглушка сохранена.
- `LfkComplex` расширен опциональным полем `coverImageUrl` (без breaking changes для текущего UI/типов).
**S4 блок 4.A (T01–T04):** 2026-04-02 — карточки комплексов с колокольчиком, диалог расписания (mobile Sheet / desktop Dialog), канал Telegram/MAX как локальная настройка устройства (`localStorage`) + prefill при редактировании; тип `PatientReminderRuleJson` в `reminderPatientJson.ts`.  
**CI после S4.T01–T04:** `pnpm run ci` green (2026-04-02)  
**S4 блок 4.B–4.C (T05, T07–T10):** 2026-04-02 — разминки `content_section`/`warmups`; хаб напоминаний с произвольными правилами, объектным списком, журналом за 30 дней; `buildAppDeps.reminderJournal`, `routePaths.patientReminderJournal`.  
**CI после S4.T05–T10:** `pnpm run ci` green (2026-04-02)  
**CI после S4.fix:** `pnpm run ci` green (2026-04-02)

---

## STAGE 5 — Тест и релиз

| Задача | Статус | Замечания |
|--------|--------|-----------|
| S5.T01 Тест-матрица | done | Таблица ниже |
| S5.T02 Миграции dev | partial | В окружении агента `pnpm run db:migrate` завершился с `ZodError`: нет `DATABASE_URL` / `BOOKING_URL` в integrator env. На dev-хосте: загрузить `.env` integrator и выполнить `pnpm run db:migrate`. |
| S5.T03 Дополнительные тесты | done | Patient API (`create`, `[id]`, `snooze`, `skip`), `inMemoryReminderJournal` (stats), integrator `supportRelay` (skip → не в админ) |
| S5.T04 pnpm run ci | done | green 2026-04-02 |
| S5.T05 Pre-release checklist | done | Блок ниже (REMINDERS scope) |

### S5.T01 — Тест-матрица (тест-кейс / модуль / статус / файл)

| Тест-кейс | Модуль | Статус | Файл теста |
|-----------|--------|--------|------------|
| create object reminder | webapp service | pass | `apps/webapp/src/modules/reminders/service.test.ts` |
| create custom reminder | webapp service | pass | `apps/webapp/src/modules/reminders/service.test.ts` |
| delete reminder | webapp service | pass | `apps/webapp/src/modules/reminders/service.test.ts` |
| snooze occurrence | webapp service | pass | `apps/webapp/src/modules/reminders/service.test.ts` |
| skip occurrence | webapp service | pass | `apps/webapp/src/modules/reminders/service.test.ts` |
| listByUser (list rules) | webapp service | pass | `apps/webapp/src/modules/reminders/service.test.ts` (`listRulesByUser`) |
| stats (журнал per-user / per-rule) | webapp journal | pass | `apps/webapp/src/infra/repos/inMemoryReminderJournal.test.ts` |
| POST create auth + validation | webapp API | pass | `apps/webapp/src/app/api/patient/reminders/create/route.test.ts` |
| PATCH/DELETE ownership + auth | webapp API | pass | `apps/webapp/src/app/api/patient/reminders/[id]/route.test.ts` |
| POST snooze auth + validation + errors | webapp API | pass | `apps/webapp/src/app/api/patient/reminders/[id]/snooze/route.test.ts` |
| POST skip auth + validation + errors | webapp API | pass | `apps/webapp/src/app/api/patient/reminders/[id]/skip/route.test.ts` |
| integrator snooze callback parse | integrator | pass | `apps/integrator/src/integrations/telegram/mapIn.test.ts`, `apps/integrator/src/integrations/max/mapIn.test.ts` |
| integrator skip callback parse | integrator | pass | `apps/integrator/src/integrations/telegram/mapIn.test.ts` |
| integrator snooze/skip → webapp API | integrator-facing | pass | `apps/webapp/src/app/api/integrator/reminders/occurrences/snooze/route.test.ts`, `.../skip/route.test.ts` |
| skip reason без пересылки админу | integrator | pass | `apps/integrator/src/kernel/domain/executor/handlers/supportRelay.test.ts` (и защита в `supportRelay.ts` / `executeAction.ts`) |
| вопрос: confirm yes/no (callback) | integrator | pass | `apps/integrator/src/integrations/telegram/mapIn.test.ts` (`q_confirm`) |

---

## INCIDENT — Rubitime расхождения (2026-04-02)

**Scope:** системная сверка `integrator.rubitime_records` vs Rubitime API + влияние на webapp UI (`appointment_records` / `patient_bookings`).

### Что обнаружили

- Исходная сверка (окно 20 дней, `apiErrors=0`) показала системные расхождения:
  - `scanned=89`, `matches=0`, `mismatches=61`, `notFound=28`, `notFoundActive=0`, `notFoundCanceled=28`.
- `notFound` были только по `status='canceled'` (удаленные в Rubitime отмены; в основном тестовые/архивные).
- После точечной чистки `notFound canceled` и SQL-коррекции `record_at` за февраль/март-апрель:
  - `scanned=61`, `matches=23`, `mismatches=38`, `notFound=0`, `apiErrors=0`.
- Оставшиеся расхождения имеют системный характер:
  - `record_at mismatch` (в т.ч. `diffMin=-120` и `diffMin=-60`);
  - `stale diffMin=...` (локальные `updated_at` отстают от Rubitime на часы/дни).

### Что уже сделали (этапы 1–3)

1. Централизация timezone в integrator:
   - единая точка: `apps/integrator/src/config/appTimezone.ts`;
   - подключено в compare-скрипт и связанные места;
   - добавлены тесты и CI green.
2. Усилен скрипт сверки `compare-rubitime-records.ts`:
   - контроль rate-limit/retry;
   - `rubitimeOffsetMinutes`, `staleThresholdMinutes`;
   - классификация `notFoundActive` / `notFoundCanceled`.
3. Прод-операции:
   - удалены 28 `canceled + notFound` записей из `rubitime_records` (post-check `still_exists=0`);
   - выполнена SQL-коррекция `record_at` (обновлено 59 строк за март/апрель; февраль `0`).

### Отдельный баг, влияющий на UI (не «один юзер», а системный pipeline)

- В `projection_outbox` есть `dead/pending` события `appointment.record.upserted` с ошибкой:
  - `null value in column "platform_user_id" of relation "patient_bookings"`.
- Причина: резолв `platform_user_id` в webapp обработчике был через неверный lookup (использовался `integratorRecordId` как `integratorUserId`).
- Подготовлен код-фикс в репозитории:
  - `apps/webapp/src/modules/integrator/events.ts`
  - `apps/webapp/src/app/api/integrator/events/route.ts`
  (lookup по `phoneNormalized` + fallback по `integratorUserId`).

### Этап 4 — Quiet re-sync + repair-outbox (2026-04-02)

Создан новый скрипт `apps/integrator/src/infra/scripts/resync-rubitime-records.ts`:

**Режим `resync` (по умолчанию):**
- Источник истины: Rubitime API `get-record`.
- Target: `integrator.rubitime_records`.
- Dry-run по умолчанию; `--commit` — применить изменения.
- Diff-классы: `record_at`, `status`, `phone`, `payload`, `stale`, `not_found`.
- При commit: UPDATE только реально расходящихся строк; `updated_at = now()`.
- **Гарантия тишины:** скрипт НИКОГДА не вызывает `enqueueProjectionEvent` и не отправляет никаких уведомлений.

**Режим `repair-outbox`:**
- Находит `dead/pending` события `appointment.record.upserted` с `platform_user_id` в `last_error`.
- При `--commit`: сбрасывает в `pending` (`attempts_done=0`, `last_error=null`, `next_try_at=now()`).
- Опциональный фильтр по телефону (`--phone-last10`) и record ids (`--record-ids`).

**Команды запуска:** `pnpm --dir apps/integrator run rubitime:resync`  
**На хосте:** `node dist/infra/scripts/resync-rubitime-records.js`  
**Runbook:** `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/RUNBOOK_RUBITIME_RESYNC.md`

**Тесты:** `src/infra/scripts/resync-rubitime-records.test.ts` — 26 тестов, CI green.

### Postmortem

**Первопричина `record_at mismatch (-120/-60)`:**  
Rubitime API возвращает наивные даты (`YYYY-MM-DD HH:MM:SS`) без явного timezone-суффикса. До централизации timezone в `appTimezone.ts` обработчик webhook интерпретировал их как UTC вместо MSK (+3), что давало систематическое смещение -180 мин (или частично -120 / -60 при разных путях). Фикс: `getRubitimeRecordAtUtcOffsetMinutesForInstant()` применяется во всех точках разбора Rubitime дат.

**Первопричина `platform_user_id null` в outbox:**  
В обработчике `appointment.record.upserted` в `events.ts` (webapp) lookup пользователя по `integratorUserId` использовал `integratorRecordId` (ID записи в Rubitime) вместо `integratorUserId` (ID клиента в Rubitime). Для большинства новых записей пользователь не резолвился → `patient_bookings.platform_user_id = null` → constraint violation → dead outbox.  
Фикс кода: lookup по `phoneNormalized` (primary) + fallback по `integratorUserId` (secondary).

**Что исправили:**
1. Тихий re-sync `record_at` / `status` / `phone` / `payload` / `stale` — без уведомлений.
2. Requeue dead/pending outbox событий после код-фикса lookup.

**Остаточные риски:**
- Записи, созданные в окне между деградацией и фиксом кода, могут всё ещё требовать ручного requeue outbox.
- Новые записи Rubitime, поступающие до применения re-sync, будут иметь drift до очередного запуска скрипта.
- Если Rubitime изменит формат дат на timezone-aware (с суффиксом), парсер корректно обработает это автоматически.

### Текущий статус

- `notFound canceled` очищены.
- Создан тихий re-sync скрипт + runbook для prod-операции.
- После запуска re-sync на хосте: `mismatches` должны существенно снизиться.
- После repair-outbox + rebuild webapp: `patient_bookings` связываются с пользователями автоматически.

---

## GLOBAL AUDIT

**Verdict:** rework_required (входной global audit, 2026-04-02)  
**Замечания:** 2 critical + 2 major (security/data/regression)

---

## GLOBAL FIX

**Исправления:** 2026-04-02 — `[reminders.final-fix] address global audit remarks`

- **Critical #1 (M2M sync правил):**
  - `notifyIntegratorRuleUpdated` переведён на timestamp в секундах.
  - Приведён payload к контракту upsert (`payload.integratorRuleId`, `integratorUserId`, `isEnabled`, schedule fields).
  - В integrator добавлен подписанный `POST /api/integrator/reminders/rules` (`reminderRulesRoute.ts`) с валидацией и записью через `writePort` (`reminders.rule.upsert`).
  - Route подключен в `app/routes.ts`; `dbWritePort` проброшен через `app/di.ts`.

- **Critical #2 (гонка skip/snooze):**
  - Integrator: `rescheduleReminderOccurrencePlanned` теперь не перезаписывает `skipped` occurrence (`WHERE status <> 'skipped'`).
  - Integrator: `markReminderOccurrenceSkippedLocal` идемпотентен (`WHERE status <> 'skipped'`).
  - Webapp: `pgReminderJournal.recordSnooze` не выполняет snooze для уже skipped occurrence (`skipped_at` guard до и во время UPDATE).
  - In-memory journal синхронизирован с тем же guard.

- **Major #1 (подтверждение вопроса):**
  - `telegram.menu.default` больше не выполняет прямой `draft.send`.
  - По умолчанию отправляется confirm-клавиатура `q_confirm:yes/no` (`telegram:confirmQuestion`), дальнейшая отправка остаётся только через существующий callback flow.

- **Major #2 (удаление reminder/history):**
  - `pgReminderRules.delete` переведён на транзакционный delete:
    1) ownership-check правила,  
    2) удаление `reminder_occurrence_history` по `integrator_rule_id`,  
    3) удаление `reminder_rules`.
  - Закрыт риск orphan-истории после удаления правила.

**Тесты/проверки после global fix:**
- `pnpm --dir apps/integrator test -- reminderRulesRoute.test.ts` — green.
- `pnpm --dir apps/webapp test -- notifyIntegrator.test.ts` — green.
- `pnpm run ci` — green.

**CI после фиксов:** `pnpm run ci` green (2026-04-02)

---

## Pre-release Checklist

### REMINDERS_PHASE — S5.T05 (обязательные пункты)

- [x] Все миграции применяются — **подтверждено на dev 2026-04-02**: integrator (`ENV_FILE=.../.env pnpm --dir apps/integrator run db:migrate` — 4 applied), webapp (`pnpm --dir apps/webapp run migrate` — 050+051 already applied). Prod — при деплое.
- [x] Все тесты зелёные — `pnpm run ci`, vitest integrator + webapp
- [x] CI зелёный — тот же прогон 2026-04-02
- [x] Нет TODO/FIXME/HACK без комментария — выборочно по `modules/reminders`, `api/patient/reminders`, integrator `reminders` / `supportRelay`: замечаний нет
- [x] Нет console.log в production-коде напоминаний — те же пути: `console.log` нет
- [x] Нет hardcoded secrets — в scope напоминаний новых секретов нет; репозиторий проходит `eslint` в CI
- [x] Inline-кнопки ≤ 64 байт `callback_data` — `apps/integrator/src/kernel/domain/reminders/reminderInlineKeyboard.test.ts`
- [x] Skip reason не утекает админу — `supportRelay.test.ts` + ранние фиксы S3 (`waiting_skip_reason`)

### Прочее (продуктовый чеклист ветки)

- [x] Все миграции применяются на dev (подтверждено 2026-04-02); prod — при деплое
- [x] Все тесты зелёные
- [x] `pnpm run ci` зелёный
- [x] Нет TODO/FIXME/HACK без комментария (scope напоминаний)
- [x] Нет console.log в production-коде (scope напоминаний)
- [x] Нет hardcoded secrets (CI lint)
- [x] Inline-кнопки ≤ 64 байт callback_data
- [x] Skip reason НЕ утекает админу
- [ ] Существующие категории напоминаний работают
- [ ] Diary tabs не сломаны
- [ ] Content sections не сломаны
- [ ] Support relay работает
- [ ] Фикс вопросов не ломает обычный admin forward
