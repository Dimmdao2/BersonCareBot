---
name: Exercise load from refs
overview: Выровнять справочник load_type с lfk_exercises.load_type; UI и валидация через references + сид v1. Закрыто 2026-05-04; канон и пост-аудит — docs/archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/EXERCISE_LOAD_TYPE_FROM_REFS_PLAN.md
todos:
  - id: migration-load-type-items
    content: "Drizzle SQL 0041 + journal"
    status: completed
  - id: inmemory-seed-items
    content: "inMemoryReferences load_type items"
    status: completed
  - id: domain-module-parity-test
    content: exerciseLoadTypeReference + seed parity test
    status: completed
  - id: ui-reference-select
    content: DoctorCatalogFiltersForm + ExerciseForm categoryCode
    status: completed
  - id: server-validation
    content: RSC exercises/lfk-templates + actionsShared + preserve/client sync
    status: completed
  - id: cleanup-options-tests-ci
    content: exerciseLoadTypeOptions + tests; audit follow-up (TP page types)
    status: completed
isProject: false
---

# Тип нагрузки из справочников — закрыто

Полный текст плана, пост-аудит и таблица файлов перенесены в репозиторий:

**[`docs/archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/EXERCISE_LOAD_TYPE_FROM_REFS_PLAN.md`](../../docs/archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/EXERCISE_LOAD_TYPE_FROM_REFS_PLAN.md)**

Кратко: миграция `0041_exercise_load_type_reference_align`, модуль `exerciseLoadTypeReference`, UI через `categoryCode=load_type`, RSC-парсинг на exercises + lfk-templates, `saveDoctorExerciseCore` с allow list из БД; test-sets без оси `load` (см. FILTER URL LOG); из `treatment-program-templates/page` убран мёртвый `load` в типе searchParams.
