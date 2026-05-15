# LOG — Patient Reminder UX

## 2026-05-15 — Дефолты rehab / «офисный день», цель на главной (`practiceTarget`), разбивка прогресса

- **План (архив репозитория):** [`reminder_defaults_and_home_goal.plan.md`](../../../../.cursor/plans/archive/reminder_defaults_and_home_goal.plan.md) — файл перенесён из `~/.cursor/plans/` в монорепозиторий; в YAML добавлено `status: completed`, все `todos.status: completed`, блок Definition of Done помечен `[x]`.
- **Код (webapp):** `DEFAULT_REHAB_DAILY_SLOTS`; `reminderFormDefaults.ts`; формы + repos/service; `nextReminderOccurrence` (предикатный счётчик, `hasEnabledWarmupsSectionReminder`); `PatientHomeToday` (матрица цели, mute, единый `plannedTotal`); `PatientHomeProgressBlock` (разбивка, a11y).
- **Интегратор:** выровнены фикстуры под канон слотов (напр. `remindersReadsPort.test.ts`).
- **Тесты:** цепочка из плана + пост-аудит (mute в `#patient-home-progress-block`, общие helpers правил, `POST .../create` rehab без `scheduleData` и контракт `SLOTS_V1_DB_PLACEHOLDER`).
- **Документация модулей:** [`patient-home.md`](../../../../apps/webapp/src/modules/patient-home/patient-home.md), [`reminders.md`](../../../../apps/webapp/src/modules/reminders/reminders.md), [`CONFIGURATION_ENV_VS_DATABASE.md`](../../../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md).
- **Проверки при разработке:** точечный `vitest`; полный **`pnpm run ci`** — перед merge по политике репозитория (в сессии только док-синхронизации повторно не запускался).
- **Сознательно не делали:** согласование числителя «выполнено сегодня» с разбивкой (отдельная продуктовая задача); изменения GitHub Actions workflow.

## 2026-05-10 — Выравнивание тем рассылок и reminder-движка (`notification_topic_code`)

- **Цель:** связать id тем из `notifications_topics` с доставкой integrator без расширения `REMINDER_CATEGORIES`.
- **Хранилище:** колонка `notification_topic_code` в `public.reminder_rules` и `integrator.user_reminder_rules` (миграции webapp `0054_reminder_rules_notification_topic_code.sql`, integrator `20260510_0001_user_reminder_rules_notification_topic_code.sql`).
- **Webapp:** маппинг `ReminderRule` → код темы в `modules/reminders/notificationTopicCode.ts`; запись при upsert правила; M2M payload расширен полем `notificationTopicCode`.
- **Integrator:** `reminderOccurrenceTopicCode` сначала берёт `rule.notificationTopicCode`, иначе legacy-эвристика; upsert при отсутствии поля в payload сохраняет существующее значение в БД. Rubitime `scheduleBookingReminders` вызывает delivery-targets с `topic=appointment_reminders`.
- **Тесты:** `notificationTopicCode.test.ts` (webapp), расширены integrator-тесты контрактов/dispatch/Rubitime по необходимости.

## 2026-05-10 — Post-audit: важное (`water`) и topic-фильтр

- **Проблема:** при пустом `notificationTopicCode` эвристика `reminderIntent === 'generic'` отдавала `exercise_reminders` для интегратор-категории `water` (webapp «важное») — нарушался bypass по теме.
- **Исправление:** в `reminderOccurrenceTopicCode` ранний выход для `rule.category === 'water'` → `undefined` (без `getTargetsByChannelBinding` с topic). Тесты в `reminderNotificationTopicCode.test.ts`.
- **Скрипт:** `pnpm --dir apps/integrator run lint` (`eslint src`).

## 2026-05-10 — Пост-аудит (хвосты из сверки с планом)

- **Rubitime:** добавлен тест `booking.created does not enqueue slot reminders when appointment_reminders yields no channel bindings` — при `null` от delivery-targets с `topic=appointment_reminders` очередь слот-напоминаний не ставится; мгновенное сообщение пациенту по-прежнему без фильтра темы (первый вызов `getTargetsByPhone`).
- **remindersReadsPort:** в unit-тестах проверяется маппинг `notificationTopicCode` из JSON webapp (включая явный `null`).
- **Проекция (in-memory):** контрактный тест фиксирует `notificationTopicCode === null` у правила из проекции без поля.
- **Маппер:** задокументирован резерв `symptom_reminders` (пока нет типа правила — возвращается `null`); тест на категорию без маппинга (`broadcast`).
- **Остаточно по продукту:** мгновенные сообщения при lifecycle записи (`sendLinkedChannelMessage`) без `topic` — осознанно; смена потребует отдельного решения.

## 2026-05-09 — Аудит «усиленного» плана (пациентские блоки + план + интервал)

- **Pre-audit (rg):** `updateRule` только `service.ts`, `patient/reminders/actions.ts`, `api/patient/reminders/[id]/route.ts`; интервал `interval_window` валидируется в `validateSchedule` (30…659), Zod в `actions.ts`, дубли в REST create/PATCH не вводились.
- **Хвосты после ревью:** общий `formatReminderMinuteOfDayToHhMm` в `modules/reminders/reminderScheduleFormat.ts` для `summarizeReminderForCalendarDay` и `formatScheduleSummary` в `ReminderRulesClient`; в строке «сегодня» для `interval_window` интервал через `clampIntervalMinutes`; порядок UI: блоки rehab/разминки → «Мои напоминания» → «Создать напоминание»; `RemindersHashScroll` — двойной rAF + повтор через 320 ms для стабильного скролла к якорю; тесты `weekly_mask` и успешный `every_n_days` в `summarizeReminderForCalendarDay.test.ts`.

## 2026-05-09 — Закрытие инициативы (базовый план) реализация по `.cursor/plans/archive/reminder_ux_full.plan.md`.
- Решения: mute на `platform_users.reminder_muted_until`; label rehab через `display_title`/`display_description`; integrator — drop `UNIQUE(user_id,category)`, upsert по PK `id`.
- Главная пациента: `slots_v1` + `rehab_program` в `nextReminderOccurrence`, счётчик «n из N» за локальный день приложения + `countDoneSkippedInUtcRange` в журнале; карточка — пауза / прогресс / «На сегодня напоминаний нет».
- Экран `/app/patient/reminders`: баннер при активном `reminder_muted_until`; HTTP-проекция integrator GET правил включает `schedule_data`, `reminder_intent`, `display_*`.
- Тесты: snooze 1–721; integrator `reminderRulesRoute` upsert; inline keyboard длинный id + mute row; `notifyIntegrator` mock `getAppBaseUrlSync`.
- Документация: `docs/README.md` — инициатива перенесена в §Архив; обновлены `reminders.md`, `patient-home.md`, `DB_STRUCTURE` §2.5; README инициативы — статус закрыта.

## 2026-05-09 — Quiet hours + режимы расписания (UI и документирование)

- **Данные и API** (ранее): колонки quiet в webapp/integrator; `PATCH`/`POST` с `scheduleType`, `scheduleData`, quiet; фильтрация тихих часов при планировании и на главной.
- **UI:** `ReminderCreateDialog` — переключатель «Интервал в окне» / «Фиксированные времена», ввод слотов, фильтр дней (`weekdays` / `weekly_mask` + маска), опциональные тихие часы; для новых правил **rehab_program** по умолчанию режим слотов.
- **ReminderRulesClient:** текст сводки расписания (`formatScheduleSummary`); исправлена форма категорий от врача (окно/интервал/дни/тихие часы); сохранение через server action **`patchPatientReminderScheduleBundle`**; редактирование **rehab_program** тем же диалогом.
- **`actions.ts`:** добавлен **`patchPatientReminderScheduleBundle`** (полный объект `schedule`, как в REST).
- **Страница напоминаний:** `rehab_program` в иконке и подписи (`display_title`).
- **Тесты:** `service.test.ts` (bundle interval/slots), `create/route.test.ts` (параметры create + `slots_v1`); исправления типов в mood/weekSparkline и vitest hooks в patient-practice.
