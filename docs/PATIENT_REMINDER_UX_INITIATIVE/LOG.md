# LOG — Patient Reminder UX

## 2026-05-09

- Инициатива создана; реализация по `.cursor/plans/reminder_ux_full.plan.md`.
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
