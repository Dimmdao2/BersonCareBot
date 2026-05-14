# Модуль `treatment-program` (webapp)

Шаблоны и экземпляры программ лечения, прогресс пациента, события плана, клинические тесты внутри программы.

## Где смотреть детали

| Тема | Документ / код |
|------|----------------|
| Порты и DI | `ports.ts`, сборка в `apps/webapp/src/app-layer/di/buildAppDeps.ts` |
| Прогресс пациента / врач (попытки тестов, accept, snapshot) | `progress-service.ts`; регрессия lifecycle попыток — `progress-service.test.ts` (кейсы `clinical_test: …`) |
| Таблицы `test_attempts` / `test_results`, инварианты | `docs/ARCHITECTURE/DB_STRUCTURE.md` |
| Пациентский UI этапов и `clinical_test` | `docs/ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md` |
| HTTP-контракты (в т.ч. **`GET .../doctor/.../test-results`** + **`attemptAcceptMap`**) | `apps/webapp/src/app/api/api.md` |
| План попыток / история приёма (архив + amendment) | `.cursor/plans/archive/clinical_test_attempts_history.plan.md` |
