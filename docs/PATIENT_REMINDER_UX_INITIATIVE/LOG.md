# LOG — Patient Reminder UX

## 2026-05-09

- Инициатива создана; реализация по `.cursor/plans/reminder_ux_full.plan.md`.
- Решения: mute на `platform_users.reminder_muted_until`; label rehab через `display_title`/`display_description`; integrator — drop `UNIQUE(user_id,category)`, upsert по PK `id`.
- Главная пациента: `slots_v1` + `rehab_program` в `nextReminderOccurrence`, счётчик «n из N» за локальный день приложения + `countDoneSkippedInUtcRange` в журнале; карточка — пауза / прогресс / «На сегодня напоминаний нет».
- Экран `/app/patient/reminders`: баннер при активном `reminder_muted_until`; HTTP-проекция integrator GET правил включает `schedule_data`, `reminder_intent`, `display_*`.
- Тесты: snooze 1–721; integrator `reminderRulesRoute` upsert; inline keyboard длинный id + mute row; `notifyIntegrator` mock `getAppBaseUrlSync`.
- Документация: `docs/README.md` — инициатива перенесена в §Архив; обновлены `reminders.md`, `patient-home.md`, `DB_STRUCTURE` §2.5; README инициативы — статус закрыта.
