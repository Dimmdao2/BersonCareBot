# Execution log: ЛФК в шаблоне — развёртывание в упражнения

## Scope

- `POST /api/doctor/treatment-program-templates/stages/[stageId]/items/from-lfk-complex`: атомарная вставка строк `exercise` из каталожного шаблона комплекса ЛФК; опционально группа / без группы; копирование описания комплекса в группу по продуктовым правилам.
- Конструктор шаблона: выбор комплекса ЛФК открывает модалку (три режима + чекбокс), без создания строк `lfk_complex`.
- Документация: `apps/webapp/src/app/api/api.md`, `docs/TREATMENT_PROGRAM_LFK_TEMPLATE_LEGACY_TODO.md`.

## Пост-аудит (типизация HTTP и тесты)

- **404 без парсинга текста:** для отсутствующего или чужого контекста используется **`TreatmentProgramExpandNotFoundError`** (`apps/webapp/src/modules/treatment-program/errors.ts`); маршрут `from-lfk-complex` возвращает **`404`** только для этого типа. Прочие ошибки домена по-прежнему **`400`**, конфликт описания группы — **`409`** с `code: group_description_conflict`, архивный шаблон — **`400`** `already_archived`.
- **Дополнительные unit-тесты:** группа другого этапа того же шаблона; архивный шаблон; guard по `expectedExerciseIds` (TOCTOU); smoke UI — модалка развёртывания после выбора типа «Комплекс ЛФК».

## Авторизация

- Как у остальных мутаций конструктора шаблонов программы под `/api/doctor/treatment-program-templates/*`: проверяются **сессия** и роль **врача** (`canAccessDoctor`). Отдельной привязки шаблона к `userId` врача в API **нет** — любой врач с валидной сессией, знающий UUID шаблона/этапа, может вызвать эндпоинт (наследованная модель доступа; при необходимости сужения — отдельная задача).

## Не делали (на момент шаблонного expand)

- Миграцию старых шаблонов с уже сохранёнными строками `lfk_complex` (см. ниже — выполнено отдельно).
- Изменения назначения экземпляра пациенту и пациентских экранов ЛФК (см. ниже — выполнено отдельно).
- Лимит на число упражнений за один запрос (риск нагрузки при огромном комплексе) — вынесено в продуктовый backlog при появлении таких данных.

## Дополнение (2026-05-27): инстанс + пациент

- **Инстанс:** `POST .../treatment-program-instances/.../items/from-lfk-complex`, `doctorExpandLfkComplexIntoStage`, `InstanceAddLibraryItemDialog` → разворот в `exercise`; прямой `doctorAddStageItem(lfk_complex)` — отказ.
- **Данные:** `0081_expand_lfk_complex_stage_items.sql`, `0082_drop_lfk_complex_item_type_check.sql`; канон — `docs/TREATMENT_PROGRAM_LFK_TEMPLATE_LEGACY_TODO.md`.
- **Пациент:** удалены `lfk-session`, `PatientLfkChecklistRow`; комментарий — `observation-note`; promo без комментария; notify врачу — `notifyDoctorPatientProgramNote`.
- **Проверки:** `instance-service.test.ts`, `patient-program-actions.test.ts`, `InstanceAddLibraryItemDialog.test.tsx`, `notifyDoctorPatientProgramNote.test.ts`, patient treatment UI-тесты; корневой **`pnpm run ci`** — зелёный (2026-05-27).
- **Документация:** `api.md`, `program-detail/README.md`, `docs/TREATMENT_PROGRAM_LFK_TEMPLATE_LEGACY_TODO.md`, план [`.cursor/plans/archive/lfk_expand_instance_cleanup.plan.md`](../../../.cursor/plans/archive/lfk_expand_instance_cleanup.plan.md) (`status: completed`).

## Проверки (целевые тесты webapp — шаблон)

Из каталога `apps/webapp`:

```bash
pnpm exec vitest run src/modules/treatment-program/service.test.ts \
  "src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.test.tsx"
```

Полный корневой **`pnpm run ci`** — по политике репозитория перед push; отдельно учитывать шаг **`pnpm run audit`** (реестр уязвимостей зависимостей).

## Известные ограничения

- Гонка по `sort_order` при параллельных сохранениях конструктора — как у обычного `POST .../items`; без дополнительной блокировки.

## PR

- Закрыто в основной ветке разработки (2026-05-27); отдельный PR-номер не фиксировался в журнале.
