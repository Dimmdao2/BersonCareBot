---
name: program-stage-dnd-reorder
overview: "DnD reorder этапов и элементов программ лечения (шаблон + инстанс). Закрыт 2026-06-02: API, UI, тесты, документация."
todos:
  - id: template-reorder-api
    content: Добавить bulk-reorder API и сервис/репо-методы для этапов и элементов шаблона с инвариантом stage0 fixed
    status: completed
  - id: template-dnd-ui
    content: Реализовать DnD этапов и элементов в редакторе шаблона с переносами между custom-group и ungrouped
    status: completed
  - id: instance-stage-reorder-ui
    content: Добавить reorder этапов pipeline в UI назначенной программы через существующий stages/reorder endpoint
    status: completed
  - id: instance-item-dnd-ui
    content: Добавить DnD перенос элементов между custom-group и ungrouped в UI назначенной программы
    status: completed
  - id: tests-reorder-invariants
    content: Добавить/обновить unit+RTL тесты для reorder и межгрупповых переносов в шаблоне и инстансе
    status: completed
  - id: docs-sync
    content: Обновить api.md, treatment-program.md и профильный LOG.md по инициативе
    status: completed
isProject: false
---

# DnD Reorder For Treatment Programs

**Статус:** закрыт (2026-06-02). Журнал: `docs/archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/LOG_DND_REORDER_2026-06.md`.

## Scope
- **Включено**: врачебный редактор шаблона и врачебный редактор назначенной программы, перестановка этапов, DnD перенос элементов между пользовательскими группами и `ungrouped` внутри одного этапа.
- **Подтверждённые ограничения**:
  - этап `0` («Общие рекомендации») фиксирован и не участвует в reorder;
  - переносы в системные группы (`recommendations`/`tests`) в первой версии не реализуем.
- **Основные файлы**:
  - UI шаблона: `apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx`
  - UI инстанса: `apps/webapp/src/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx`
  - API шаблона: `apps/webapp/src/app/api/doctor/treatment-program-templates/`
  - сервисы: `apps/webapp/src/modules/treatment-program/service.ts`, `instance-service.ts`
  - shared UI/helpers: `apps/webapp/src/app/app/doctor/treatment-program-shared/TreatmentProgramDndUi.tsx`, `treatmentProgramReorderHelpers.ts`

## Definition Of Done

- [x] В шаблоне можно перетаскивать этапы (`>0`) и элементы между пользовательскими группами/ungrouped в пределах этапа.
- [x] В назначенной программе можно перетаскивать этапы pipeline и элементы между пользовательскими группами/ungrouped в пределах этапа.
- [x] Этап 0 не перемещается и его поведение не регрессирует.
- [x] Системные группы не становятся целью DnD в первой версии.
- [x] Покрытие тестами reorder-инвариантов и ключевых UI-сценариев (helpers, service, `TreatmentProgramConstructorClient.reorder.test.tsx`, `treatmentProgramInstanceItemDnd.test.ts`).
- [x] Документация/API (`api.md`, `treatment-program.md`, LOG) синхронизированы.
