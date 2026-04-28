# patient-mood

Чек-ин самочувствия пациента на главной «Сегодня».

- Данные хранятся в `patient_daily_mood`: одна запись на `user_id + mood_date`.
- `mood_date` — локальная дата приложения, рассчитанная через `getAppDisplayTimeZone()` и `getMoodDateForTimeZone()`.
- `score` строго `1..5`; повторная отметка за тот же день перезаписывает значение.
- Модуль не связан с дневником симптомов, ЛФК-дневником и `patient_practice_completions.feeling`.
- Runtime-доступ к БД выполняется через порт `PatientMoodPort`; PG-реализация живёт в `infra/repos/pgPatientDailyMood.ts` и использует Drizzle ORM.
