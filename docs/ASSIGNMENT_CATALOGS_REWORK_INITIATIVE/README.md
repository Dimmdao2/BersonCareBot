# ASSIGNMENT_CATALOGS_REWORK_INITIATIVE

Отдельная инициатива исполнения **sister-плана B1–B7** к этапу 9 roadmap: UX/тех-фиксы каталогов «Назначений» и связанный UI; **не** дублирует новую доменную работу `PROGRAM_PATIENT_SHAPE` вне scope B (см. [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md) на пересечения с уже влитым A).

## Зачем отдельная папка

[`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) остаётся продуктовым ТЗ (решения §2, схема §4, открытые вопросы §5, backlog §7).

Эта папка — операционный контур реализации:

- [`MASTER_PLAN.md`](MASTER_PLAN.md) — общий мастер-план, порядок, карта кода, политики;
- [`STAGE_B1_PLAN.md`](STAGE_B1_PLAN.md) … [`STAGE_B7_PLAN.md`](STAGE_B7_PLAN.md) — рабочие планы этапов;
- [`LOG.md`](LOG.md) — журнал исполнения;
- [`LOG_TEMPLATE.md`](LOG_TEMPLATE.md) — шаблон записи после прохода;
- [`EXECUTION_AUDIT_TEMPLATE.md`](EXECUTION_AUDIT_TEMPLATE.md) — шаблон аудита этапа/инициативы;
- [`PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`](PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md) — copy-paste промпты EXEC/AUDIT/FIX и правила CI/коммитов;
- [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md) — решения до кода и расхождения планов с репозиторием;
- (позже) `ASSIGNMENT_CATALOGS_REWORK_EXECUTION_AUDIT.md` — итоговый аудит после закрытия B7 в коде.

## Связанные документы

- Продуктовое ТЗ: [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md)
- Доменный план пациента (sister, не смешивать scope): [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) + execution: [`../PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md`](../PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md)
- Roadmap этап 9: [`../APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md`](../APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md)
- Usage/archive каталогов: [`../APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md)
- Целевая IA врача: [`../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md`](../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md) §6

## Файлы инициативы

| Файл | Назначение |
|------|------------|
| [`MASTER_PLAN.md`](MASTER_PLAN.md) | Порядок B1–B7, зависимости с A, карта кода, DoD-политика |
| [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md) | Pre-impl решения после аудита кода; слабые места этапных планов |
| [`STAGE_B1_PLAN.md`](STAGE_B1_PLAN.md) | Две оси фильтра публикация × архив |
| [`STAGE_B2_PLAN.md`](STAGE_B2_PLAN.md) | Клинические тесты + B2.5 `CreatableComboboxInput` + `measure_kinds` |
| [`STAGE_B3_PLAN.md`](STAGE_B3_PLAN.md) | Наборы тестов — редактор как LFK-комплекс |
| [`STAGE_B4_PLAN.md`](STAGE_B4_PLAN.md) | Рекомендации — тип, регион, метрики |
| [`STAGE_B5_PLAN.md`](STAGE_B5_PLAN.md) | Комплексы ЛФК — UX pass-1, «иконка глаза» |
| [`STAGE_B6_PLAN.md`](STAGE_B6_PLAN.md) | Шаблоны программ — UX pass-1 конструктора (см. `PRE_IMPLEMENTATION_DECISIONS` — A уже в коде) |
| [`STAGE_B7_PLAN.md`](STAGE_B7_PLAN.md) | Universal comment pattern на item-контейнеры |
| [`LOG.md`](LOG.md) | Журнал |
| [`LOG_TEMPLATE.md`](LOG_TEMPLATE.md) | Шаблон записи в LOG |
| [`EXECUTION_AUDIT_TEMPLATE.md`](EXECUTION_AUDIT_TEMPLATE.md) | Шаблон аудита |
| [`PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`](PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md) | Промпты EXEC/AUDIT/FIX, коммиты, пуш, CI (см. `MASTER_PLAN` §9) |
