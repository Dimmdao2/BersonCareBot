# Patient diary — execution log

## Scope

- Блоки «Разминки за неделю» и «План за неделю» под графиком самочувствия.
- Снимки `patient_diary_day_snapshots` с ленивым закрытием прошлых дней недели при открытии дневника.
- Вынесен `pickActivePlanInstance` для согласования с главной «Сегодня».

## Решения

- **Слоты разминки:** `countWarmupReminderSlotsInUtcRange` в `nextReminderOccurrence.ts` — только `reminderIntent === "warmup"`, без фильтра `linkedObjectType`; при 0 слотов — fallback **3** (как в `diary.md`).
- **Выполнения разминки:** считаются строки `patient_practice_completions` с `source` ∈ `daily_warmup`, `reminder`.
- **Снимок:** immutable после вставки (`ON CONFLICT DO NOTHING`); поздние `done` за прошлые дни **не** пересчитывают снимок (MVP).
- **Границы недели:** те же `weekStartMs` / `weekEndMs` / `iana`, что у `loadPatientDiaryWeekWellbeing`.
- **Ось Y в спеке:** в `diary.md` выровнено с реализацией графика (**1–5**).

## Проверки

- `pnpm exec vitest run` (выборочно): `nextReminderOccurrence.test.ts`, `pickActivePlanInstance.test.ts`, `inMemoryPatientDiarySnapshots.test.ts`, `patient-practice/service.test.ts`, `PatientHomeToday.test.tsx`.
- `pnpm exec tsc --noEmit` (webapp).

## Намеренно не делали

- Вкладки симптомов/ЛФК и QuickAdd на корневой странице дневника.
- Backfill снимков до внедрения фичи.
- Отдельный cron закрытия дня — только ленивый триггер при заходе на дневник.
