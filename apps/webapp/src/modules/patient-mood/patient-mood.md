# patient-mood

Чек-ин самочувствия пациента на главной «Сегодня».

- Данные хранятся в **`symptom_entries`** (`entry_type: instant`, `source: webapp`, значение **1–5** в колонке `value_0_10`) для служебного трекинга с **`symptom_trackings.symptom_key = 'general_wellbeing'`** и типом из справочника `reference_items` (категория `symptom_type`, код `general_wellbeing`). Таблица **`patient_daily_mood` удалена** (миграция `0049_wellbeing_symptom_unify`).
- Локальная дата «сегодня» для UI — через `getAppDisplayTimeZone()` и `getMoodDateForTimeZone()`.
- **Правила повторной отметки** (по `recorded_at` **последней по времени** записи трекинга, UTC; возраст `now - recorded_at`): **≤5 мин включительно** — если в этом окне есть **`warmup_feeling`** и **после** её `recorded_at` нет «ручной» instant-строки общего самочувствия (строки с `notes`, совпадающим с **`WELLBEING_GENERAL_MIRROR_NOTE`**, не считаются — см. `../diaries/wellbeingGeneralMirrorNote.ts`, `isWellbeingGeneralMirrorNote`) — **новая** instant-строка; иначе — **тихое обновление** последней строки, **`recorded_at` сохраняется** (в т.ч. при замене последней «ручной» после разминки). **>5 мин** — всегда **новая** instant-запись. В **`GET …/today`** поле **`lastEntry.score`** может быть **`null`**, если в БД `value_0_10` вне 1–5 (аномалия); **`lastEntry.notes`** — при необходимости для клиента (в т.ч. маркер зеркала после разминки).
- **`ensureWellbeingTracking`** — через `diaries.ensureGeneralWellbeingTracking`: одна активная строка на `platform_user_id` (частичный unique + `INSERT … ON CONFLICT` в PG, миграция **`0050_symptom_general_wellbeing_unique`**); без гонки «два трекинга при первом чек-ине».
- Сервис: `createPatientMoodService({ diaries, references })` в `wellbeingMoodService.ts`; при первом обращении — upsert с привязкой к справочнику `general_wellbeing`. Для правил после разминки читается трекинг **`warmup_feeling`** (через `ensureWarmupFeelingTracking` при наличии ref в справочнике).
- Модуль связан с дневником симптомов только через этот служебный трекинг; не смешивать с `patient_practice_completions.feeling`.

## API and UI

- `POST /api/patient/mood` — тело: `score` (1–5), `intent` (по умолчанию `auto`, оставлен для совместимости). Ответ: `mood`, `lastEntry`.
- `GET /api/patient/mood/today` — `mood` за локальный день + **`lastEntry`**.
- `GET /api/patient/mood/week` — календарная неделя пн–вс в **том же IANA, что дневник самочувствия** (`resolveCalendarDayIanaForPatient` + сохранённый пояс пациента или TZ приложения); по каждому дню **среднее** instant `general_wellbeing` (1–5, округление до целого), как агрегат «Среднее за день» в дневнике (`warmupHint`, `diaryNoteHint` зарезервированы).
- `PatientHomeMoodCheckin` — пять кнопок, без модалки выбора; `PatientHomeWellbeingWeekStrip` под шкалой.

Route handlers остаются тонкими: auth, parse/validate, timezone, вызов сервиса, JSON response.

## Политика трекингов

Пациент **не создаёт** произвольные symptom trackings из дневника; служебный `general_wellbeing` создаётся системой/сервисом самочувствия. Создание прочих трекингов — врачебный поток (например `POST /api/doctor/clients/[userId]/symptom-trackings`). Список трекингов для **интегратора** (`GET /api/integrator/diary/symptom-trackings`) **не** содержит `general_wellbeing`.
