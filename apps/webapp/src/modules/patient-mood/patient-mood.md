# patient-mood

Чек-ин самочувствия пациента на главной «Сегодня».

- Данные хранятся в `patient_daily_mood`: одна запись на `user_id + mood_date`.
- `mood_date` — локальная дата приложения, рассчитанная через `getAppDisplayTimeZone()` и `getMoodDateForTimeZone()`.
- `score` строго `1..5`; повторная отметка за тот же день перезаписывает значение.
- Модуль не связан с дневником симптомов, ЛФК-дневником и `patient_practice_completions.feeling`.
- Runtime-доступ к БД выполняется через порт `PatientMoodPort`; PG-реализация живёт в `infra/repos/pgPatientDailyMood.ts` и использует Drizzle ORM.

## API and UI

- `POST /api/patient/mood` - сохранить или перезаписать сегодняшний score.
- `GET /api/patient/mood/today` - получить текущий score на локальную дату приложения.
- `PatientHomeMoodCheckin` рендерит 5 score-кнопок, подсвечивает сохранённый score и делает optimistic update с rollback при ошибке.

Route handlers остаются тонкими: auth, parse/validate, timezone, вызов сервиса, JSON response.
