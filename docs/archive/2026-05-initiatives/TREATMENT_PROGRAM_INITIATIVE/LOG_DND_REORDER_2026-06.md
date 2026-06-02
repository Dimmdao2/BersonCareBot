# LOG: DnD reorder программ лечения (2026-06)

## Сделано

- Bulk-reorder API шаблона: `POST .../treatment-program-templates/[id]/stages/reorder`, `POST .../stages/[stageId]/items/reorder`.
- Порт/сервис/`pgTreatmentProgram` + in-memory; этап 0 фиксирован на индексе 0; для этапов шаблона — двухфазная перенумерация из-за unique `(template_id, sort_order)`.
- DnD в редакторе шаблона и назначенной программы (`@dnd-kit`): pipeline-этапы и элементы между пользовательскими группами / «Без группы».
- Валидация stage 0 при reorder экземпляра (сервис + PG + in-memory instance repo).
- `reorderTemplateStageItems`: archived-check через `templateId` в `getTemplateStageValidationContext`.
- Shared: `treatmentProgramReorderHelpers.ts` (`planStageItemDndReorder`), `TreatmentProgramDndUi.tsx`.
- Chevrons элементов шаблона — `POST items/reorder` (не двойной PATCH `sortOrder`).

## Доработки после ревью (2026-06-02)

- `planStageItemDndReorder` — единая логика DnD элементов (шаблон + инстанс).
- Сообщения об ошибках при неудачном DnD; `reload` после частичного сбоя (PATCH `groupId` ok, `items/reorder` fail).
- Удалён мёртвый `patchItemSortOrder`; типы `@dnd-kit` без internal import.
- Тесты: duplicate ids, archived template, RTL chevrons/items, `TreatmentProgramConstructorClient.reorder.test.tsx`.

## Не делали (v1)

- DnD в системные группы (`recommendations` / `tests`).
- Перенос элементов между разными этапами.
- Пациентский UI.
- Integration-тесты на живой PostgreSQL (только in-memory / service).

## Проверки (автоматические)

```bash
pnpm --dir apps/webapp exec vitest run \
  src/app/app/doctor/treatment-program-shared/treatmentProgramReorderHelpers.test.ts \
  src/app/app/doctor/treatment-program-shared/treatmentProgramInstanceItemDnd.test.ts \
  "src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.reorder.test.tsx" \
  src/modules/treatment-program/service.test.ts

pnpm --dir apps/webapp exec vitest run src/modules/treatment-program
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp run lint
```

## Ручная проверка (вне scope автоматизации)

- Визуальный DnD в браузере: шаблон и назначенная программа, grip + drop между группами.
- Регрессия chevrons этапов/элементов и этапа 0.
