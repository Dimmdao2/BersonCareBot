# LOG — PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE

Исторический журнал инициативы ведётся в [`docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/LOG.md`](../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/LOG.md).

## 2026-05-14 — lifecycle клинтест-попыток (кратко)

См. верхнюю запись того же дня в архивном LOG: исторический `accepted_*`, accept только актуальной хвостовой submitted-попытки, атомарный `startNewAttemptAfterSubmitted`, идемпотентный `markAttemptSubmitted`, doctor `attemptAcceptMap`, перезагрузка patient embedded snapshot после submit/start/mark-viewed/«Снять Новое».

## 2026-05-14 — lifecycle: явные регрессионные тесты (доп. к записи выше)

В `apps/webapp/src/modules/treatment-program/progress-service.test.ts` добавлены три кейса: приём **отправленной** попытки при более новой **открытой**; повторный `patientStartNewTestAttempt` при уже открытой попытке (`Сначала отправьте текущую попытку`); старт новой попытки без ни одной отправленной (`Сначала отправьте набор тестов`). Целевая проверка: `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts`.
