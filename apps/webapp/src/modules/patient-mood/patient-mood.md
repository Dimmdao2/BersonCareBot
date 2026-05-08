# patient-mood

Чек-ин самочувствия пациента на главной «Сегодня».

- Данные хранятся в **`symptom_entries`** (`entry_type: instant`, `source: webapp`, значение **1–5** в колонке `value_0_10`) для служебного трекинга с **`symptom_trackings.symptom_key = 'general_wellbeing'`** и типом из справочника `reference_items` (категория `symptom_type`, код `general_wellbeing`). Таблица **`patient_daily_mood` удалена** (миграция `0049_wellbeing_symptom_unify`).
- Локальная дата «сегодня» для UI — через `getAppDisplayTimeZone()` и `getMoodDateForTimeZone()`.
- **Правила повторной отметки** (по `recorded_at` **последней по времени** записи трекинга, UTC; возраст `now - recorded_at`): **≤10 мин включительно** — тихое обновление той же строки, **`recorded_at` сохраняется**; **строго больше 10 мин и ≤60 мин включительно** — модалка «новая / изменить прошлую», `POST` с `intent`; **>60 мин** — новая instant-запись. В **`GET …/today`** поле **`lastEntry.score`** может быть **`null`**, если в БД `value_0_10` вне 1–5 (аномалия); правила по времени всё равно считаются по этой строке.
- **`ensureWellbeingTracking`** — через `diaries.ensureGeneralWellbeingTracking`: одна активная строка на `platform_user_id` (частичный unique + `INSERT … ON CONFLICT` в PG, миграция **`0050_symptom_general_wellbeing_unique`**); без гонки «два трекинга при первом чек-ине».
- Сервис: `createPatientMoodService({ diaries, references })` в `wellbeingMoodService.ts`; при первом обращении — upsert с привязкой к справочнику `general_wellbeing`.
- Модуль связан с дневником симптомов только через этот служебный трекинг; не смешивать с `patient_practice_completions.feeling`.

## API and UI

- `POST /api/patient/mood` — тело: `score` (1–5), `intent` (по умолчанию `auto`). Ответ: `mood`, `lastEntry`; **409** + `intent_required`, если нужен явный выбор в окне 10–60 мин.
- `GET /api/patient/mood/today` — `mood` за локальный день + **`lastEntry`** (для правил и модалки).
- `GET /api/patient/mood/week` — семь локальных дней «сегодня минус 6…сегодня» для полоски на главной (`warmupHint`, `diaryNoteHint` зарезервированы).
- `PatientHomeMoodCheckin` — пять кнопок, модалка 10–60 мин, `PatientHomeWellbeingWeekStrip` под шкалой.

Route handlers остаются тонкими: auth, parse/validate, timezone, вызов сервиса, JSON response.

## Политика трекингов

Пациент **не создаёт** произвольные symptom trackings из дневника; служебный `general_wellbeing` создаётся системой/сервисом самочувствия. Создание прочих трекингов — врачебный поток (например `POST /api/doctor/clients/[userId]/symptom-trackings`). Список трекингов для **интегратора** (`GET /api/integrator/diary/symptom-trackings`) **не** содержит `general_wellbeing`.
