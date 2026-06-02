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
| Bulk-reorder этапов/элементов и DnD (шаблон + инстанс) | Шаблон: `POST .../templates/[id]/stages/reorder`, `POST .../stages/[stageId]/items/reorder`. Инстанс: `POST .../instances/[id]/stages/reorder`, `POST .../stages/[stageId]/items/reorder` + `PATCH .../stage-items/[itemId]` (`groupId`). UI/helpers: `treatment-program-shared/TreatmentProgramDndUi.tsx`, `treatmentProgramReorderHelpers.ts` (`planStageItemDndReorder`). Журнал: `docs/archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/LOG_DND_REORDER_2026-06.md` |
| План попыток / история приёма (архив + amendment) | `.cursor/plans/archive/clinical_test_attempts_history.plan.md` |
