# ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN — этап 7: где используется и безопасная архивация

**Дата:** 2026-05-02.  
**Статус:** Выполнено — все 7 каталогов закрыты; пост-аудит и доводка DoD: 2026-05-02.  
**Связанный общий план:** [PLAN_DOCTOR_CABINET.md](../PLAN_DOCTOR_CABINET.md), этап 7.

---

## Цель

Врач должен видеть последствия перед изменением или архивацией элемента каталога назначений.

Минимальный результат:

- на карточке / строке элемента есть понятная сводка «где используется»;
- **под каждой группой счётчиков — до N конкретных сущностей с названием и ссылкой** на экран врача (тот же паттерн, что для упражнений: read-only refs в snapshot, лимит списка, остаток только числом «показаны первые K из M»);
- перед архивацией элемента с активным использованием показывается предупреждение (в диалоге — те же сводки и ссылки, что в блоке usage);
- врач понимает, это просто уборка каталога или действие, которое затронет текущие назначения пациентов;
- серверный слой не позволяет обойти важное предупреждение простым submit без подтверждения.

Это не этап переделки самих каталогов. Это защитный слой поверх существующих каталогов.

### Примечание (UI, 2026-05-02)

Компонент `Select` на Base UI (`@/components/ui/select`): в триггере у `SelectValue` без дочерних узлов часто отображается сырое `value` (ключ), а не подпись из `SelectItem`. Для каталогов назначений и связанных экранов подпись выбранного пункта задаётся **явно** дочерним текстом `SelectValue` (как в `DoctorCatalogTitleSortSelect`, `MediaLibraryFolderScopeSelect`) или через общие хелперы (`exerciseLoadTypeLabel`, `mediaLibraryListSortLabel`). Если для controlled-пустого состояния используется sentinel-`value`, в `SelectValue` нельзя оставлять `null`/`undefined` как children — иначе в триггер попадёт сам sentinel; нужна явная подпись (например «Не выбран»).

### Примечание (archive-фильтр и черновики, 2026-05-02)

В doctor-каталогах назначений пользовательский фильтр списка сейчас — **только архивность**:

- `Активные` — значение по умолчанию; URL без `status` считается активным списком.
- `Архив` — `status=archived`.
- Старые ссылки с `status=all`, `status=draft`, `status=published` или `status=working` должны трактоваться как активный список, а не как отдельные пользовательские режимы.

Контрол архивности не должен жить среди поисковых фильтров (`DoctorCatalogFiltersForm`). Он вынесен в шапку списка рядом с сортировкой и реализован отдельным `DoctorCatalogArchiveScopeSelect` на shadcn/Base UI `Select`.

`draft | published | archived` у шаблонов программ, комплексов ЛФК и курсов — текущая техническая модель готовности/публикации, но в UI списка она **не является** отдельным фильтром. Причина: `archived` смешан в том же enum с состояниями готовности, а архивность по смыслу ортогональна черновику/публикации. До явной переработки модели не добавлять в списковые тулбары варианты `Черновики`, `Опубликованные`, `В работе` и не возвращать `Все` как пользовательский archive-фильтр.

Если продукту понадобятся черновики как самостоятельный пользовательский сценарий, сначала нужно разделить модель минимум на две оси: `is_archived` / archive scope отдельно и readiness/publication status отдельно. Задача заведена в `docs/TODO.md`.

---

## Каталоги этапа

Исполнять по одному каталогу за проход, с отдельной проверкой и записью в `LOG.md`.

Рекомендуемый порядок:

1. Упражнения.
2. Комплексы ЛФК.
3. Клинические тесты.
4. Наборы тестов.
5. Рекомендации.
6. Шаблоны программ.
7. Курсы.

Не объединять все семь каталогов в один большой проход без отдельного решения.

### Трекер подшагов этапа 7

Поддерживать в этом файле актуальные статусы:

| Каталог | Статус | Детальные ссылки (refs) |
|---|---|---|
| 1. Упражнения | `completed` | `completed` (см. `ExerciseUsageSnapshot` + `exerciseUsageDocLinks.ts`) |
| 2. Комплексы ЛФК | `completed` | `completed` (`LfkTemplateUsageSnapshot`, `lfkTemplatesUsageDocLinks.ts`, `pgLfkTemplates.loadTemplateUsageSummary`) |
| 3. Клинические тесты | `completed` | `completed` (`ClinicalTestUsageSnapshot`, `clinicalTestsUsageDocLinks.ts`, `pgClinicalTests.loadClinicalTestUsageSummary`) |
| 4. Наборы тестов | `completed` | `completed` (`TestSetUsageSnapshot`, `testSetUsageDocLinks.ts`, `pgTestSets.loadTestSetUsageSummary`) |
| 5. Рекомендации | `completed` | `completed` (`RecommendationUsageSnapshot`, `recommendationUsageDocLinks.ts`, `pgRecommendations.loadRecommendationUsageSummary`) |
| 6. Шаблоны программ | `completed` | `completed` (`TreatmentProgramTemplateUsageSnapshot`, `templateUsageDocLinks.ts`, `GET …/treatment-program-templates/[id]/usage`, архивация через `DELETE` / `PATCH` + `acknowledgeUsageWarning`) |
| 7. Курсы | `completed` | `completed` (`CourseUsageSnapshot`, `courseUsageDocLinks.ts`, `GET …/courses/[id]/usage`, `PATCH` + `acknowledgeUsageWarning`) |

Допустимые статусы: `pending` -> `in_progress` -> `completed` (или `cancelled`, если подшаг отменён отдельным решением).

---

## Обязательный pre-read перед первым каталогом

Перед началом работ по каталогу исполнитель читает и подтверждает, что учитывает:

- `.cursor/rules/clean-architecture-module-isolation.mdc`;
- `.cursor/rules/plan-authoring-execution-standard.mdc`;
- `.cursor/rules/000-critical-integration-config-in-db.mdc`;
- `.cursor/rules/runtime-config-env-vs-db.mdc`;
- `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md` (для абсолютных запретов инициативы);
- `docs/APP_RESTRUCTURE_INITIATIVE/PLAN_DOCTOR_CABINET.md` (этап 7 как parent-plan).

Если между документами есть конфликт, приоритет: always-apply rules -> более узкоспециализированное правило по теме -> текущий plan.

---

## Scope boundaries

Разрешено трогать:

- doctor pages каталогов:
  - `apps/webapp/src/app/app/doctor/exercises/**`;
  - `apps/webapp/src/app/app/doctor/lfk-templates/**`;
  - `apps/webapp/src/app/app/doctor/clinical-tests/**`;
  - `apps/webapp/src/app/app/doctor/test-sets/**`;
  - `apps/webapp/src/app/app/doctor/recommendations/**`;
  - `apps/webapp/src/app/app/doctor/treatment-program-templates/**`;
  - `apps/webapp/src/app/app/doctor/courses/**`;
- соответствующие modules:
  - `apps/webapp/src/modules/lfk-exercises/**`;
  - `apps/webapp/src/modules/lfk-templates/**`;
  - `apps/webapp/src/modules/tests/**`;
  - `apps/webapp/src/modules/recommendations/**`;
  - `apps/webapp/src/modules/treatment-program/**`;
  - `apps/webapp/src/modules/courses/**`;
- соответствующие infra repos:
  - `apps/webapp/src/infra/repos/pgLfkExercises.ts`;
  - `apps/webapp/src/infra/repos/pgLfkTemplates.ts`;
  - `apps/webapp/src/infra/repos/pgLfkAssignments.ts`;
  - `apps/webapp/src/infra/repos/pgClinicalTests.ts`;
  - `apps/webapp/src/infra/repos/pgTestSets.ts`;
  - `apps/webapp/src/infra/repos/pgRecommendations.ts`;
  - `apps/webapp/src/infra/repos/pgTreatmentProgram.ts`;
  - `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts`;
  - `apps/webapp/src/infra/repos/pgCourses.ts`;
  - in-memory repos and tests for the same ports, if present;
- doctor API routes только для каталогов, где архив/статус уже проходят через route handlers:
  - `apps/webapp/src/app/api/doctor/courses/**`;
- DI only where needed:
  - `apps/webapp/src/app-layer/di/buildAppDeps.ts`;
  - `apps/webapp/src/app-layer/di/buildAppDeps.test.ts`;
- small doctor-only UI primitives for usage summary / archive warning;
- рядом с doctor-страницей каталога — локальный модуль ссылок вида `*UsageDocLinks.ts` (как `exerciseUsageDocLinks.ts`): строит `/app/doctor/...` из `kind` + id, **без** захардкоженных путей в `modules/*` или SQL;
- docs:
  - `docs/APP_RESTRUCTURE_INITIATIVE/LOG.md`;
  - this document;
  - `PLAN_DOCTOR_CABINET.md`, only if decisions change.

Вне scope:

- не менять существующие LFK table schemas:
  - `lfk_exercises`;
  - `lfk_exercise_media`;
  - `lfk_complex_templates`;
  - `lfk_complex_template_exercises`;
  - `lfk_complexes`;
  - `lfk_complex_exercises`;
  - `lfk_sessions`;
  - `patient_lfk_assignments`;
- не строить отдельный course engine;
- не объединять courses и treatment program templates;
- не добавлять FK на polymorphic `item_ref_id`;
- не исправлять scoring clinical tests, `test_type` как справочник, markdown preview рекомендаций, страницу комплексов целиком;
- не менять пациентский интерфейс;
- не добавлять env vars, интеграционные настройки, новые зависимости;
- не менять GitHub CI workflow.

Если для производительности понадобится индекс или миграция, остановиться и согласовать отдельно. По умолчанию этап должен обойтись read-only query и UI/service правками.

---

## Архитектурные правила

Держать направление зависимостей:

```text
doctor page / server action / route
  -> buildAppDeps()
  -> modules/*/service.ts
  -> modules/*/ports.ts
  -> infra/repos/pg*.ts
```

Запрещено:

- импортировать `@/infra/db/*` или `@/infra/repos/*` из `modules/*`;
- писать SQL в route handlers или server actions;
- добавлять новые файлы в ESLint allowlist;
- делать бизнес-логику предупреждения только на клиенте.

Рекомендуемая форма для каждого каталога:

- добавить read-only usage type в `types.ts` (**числовые счётчики для guard + массивы `*Refs` с лимитом**, см. `EXERCISE_USAGE_DETAIL_LIMIT` и `ExerciseUsageRef` в упражнениях);
- проверка «есть ли какое-то использование» для пустого UI — **только по числовым полям**, не через `Object.values(snapshot)` (массивы refs не должны ломать логику);
- расширить port методом `getUsage(id)` или более точным именем;
- добавить service method `getXUsage(id)`;
- для архивации добавить подтверждение, если есть активное использование:
  - пример: `archiveExercise(id, { acknowledgeUsageWarning: true })`;
  - если usage пустой, архивировать без дополнительного подтверждения;
  - если usage активный и подтверждения нет, service возвращает/бросает понятную ошибку для UI;
- реализовать query в infra repo;
- обновить UI: usage summary + archive warning dialog;
- покрыть service/repo/UI action тестами по масштабу каталога.

Если после двух каталогов появится явное дублирование, можно вынести doctor-only UI:

- `CatalogUsageSummaryBadge`;
- `ArchiveUsageWarningDialog`;
- `formatCatalogUsageSummary`.

Не выносить абстракцию заранее, пока не понятно, какие счётчики реально нужны.

### Единый контракт archive guard

Чтобы поведение в 7 каталогах не расходилось, использовать общий семантический контракт:

- сервис возвращает доменную ошибку с кодом `USAGE_CONFIRMATION_REQUIRED`;
- ошибка включает usage snapshot (**счётчики + refs**, как для упражнений), который показывается в warning dialog без повторного запроса;
- server action / route маппит ошибку в ожидаемый для текущего flow формат (например, `ok: false` + code/message для form state);
- при повторной отправке с `acknowledgeUsageWarning=true` архивирование проходит по существующему path;
- UI не пытается "догадываться" о критичности по тексту ошибки, а ориентируется на `code`.

---

## Что считать usage

### Общие принципы

Сводка должна быть понятной, а не идеально академической.

Минимальные группы счётчиков:

- `в шаблонах` — используется в библиотечных шаблонах / наборах;
- `в опубликованных шаблонах` — влияет на то, что врач может назначать;
- `назначено пациентам` — активные назначения / активные экземпляры программ;
- `в истории` — уже есть завершённые/исторические следы, если это важно для удаления/замены.

Для предупреждения при архивации главный сигнал — активное использование пациентами или опубликованными шаблонами.

### Матрица источников

| Каталог | Где искать usage | Что показывать в UI | Детализация (refs + куда вести ссылку) |
|---|---|---|---|
| Упражнение | `lfk_complex_template_exercises.exercise_id`; `lfk_complex_exercises.exercise_id`; `treatment_program_template_stage_items item_type='exercise'`; `treatment_program_instance_stage_items item_type='exercise'` | В N комплексах ЛФК, в N шаблонах программ, назначено N пациентам / активным программам | Шаблон комплекса → `/app/doctor/lfk-templates/[id]`; шаблон программы → `/app/doctor/treatment-program-templates/[id]`; экземпляр программы → `/app/doctor/clients/[userId]/treatment-programs/[instanceId]`; активное назначение ЛФК → карточка клиента `/app/doctor/clients/[userId]` |
| Комплекс ЛФК | `patient_lfk_assignments.template_id`; `treatment_program_template_stage_items item_type='lfk_complex'`; `treatment_program_instance_stage_items item_type='lfk_complex'` | Назначен N пациентам, используется в N шаблонах программ | Шаблон комплекса (редактор); шаблон программы; экземпляр программы; назначение → клиент (как для упражнений) |
| Клинический тест | `test_set_items.test_id`; через test sets, которые включены в `treatment_program_*_stage_items item_type='test_set'`; результаты/attempts, если уже есть | В N наборах тестов, через них назначен N пациентам | Набор тестов → `/app/doctor/test-sets/[id]`; далее шаблоны/экземпляры программ по цепочке |
| Набор тестов | `treatment_program_template_stage_items item_type='test_set'`; `treatment_program_instance_stage_items item_type='test_set'`; `treatment_program_test_attempts/results` для истории | В N шаблонах программ, назначен N пациентам, есть результаты | Шаблон программы; экземпляр программы; при необходимости только текст для «истории результатов» без URL |
| Рекомендация | `treatment_program_template_stage_items item_type='recommendation'`; `treatment_program_instance_stage_items item_type='recommendation'` | В N шаблонах программ, назначена N пациентам | Шаблон программы; экземпляр программы |
| Шаблон программы | `treatment_program_instances.template_id`; `courses.program_template_id` | Назначен N пациентам, используется N курсами | Экземпляр программы; курс → `/app/doctor/courses/[id]`; карточка клиента при необходимости |
| Курс | `courses.program_template_id`; активные `treatment_program_instances` по связанному шаблону; `content_pages.linked_course_id`, если используется как промо | Опубликован / есть связанный шаблон / по связанному шаблону есть N активных программ | Связанный шаблон программы; экземпляры по `template_id`; CMS-страница по `linked_course_id` только если есть стабильный doctor/admin URL в проекте — иначе текст без ссылки |

Важно по курсам: сейчас `treatment_program_instances` не хранит `course_id`. Поэтому точную фразу «купили этот курс N пациентов» писать нельзя, если нет отдельного подтверждённого источника. Допустимая формулировка: «по связанному шаблону есть N активных программ». Если продукту нужен точный счётчик именно по курсу, это отдельная модель данных и отдельный этап.

---

## UX по умолчанию

### Usage summary

На карточке или в detail-панели элемента:

- компактный блок «Где используется»;
- если usage пустой: «Пока не используется»;
- если usage есть: **для каждой ненулевой группы** — одна строка-сводка (как сейчас) **и** маркированный список из **до N** конкретных целей со ссылкой `next/link` на соответствующий экран врача (лимит N общий для каталога, как `EXERCISE_USAGE_DETAIL_LIMIT`; если всего больше — строка «Показаны первые K из M»);
- счётчики для archive guard остаются агрегатами по БД; список refs — только UX, не обязан покрывать все строки при больших M.

Примеры формулировок:

- «В 3 комплексах ЛФК, назначено 12 пациентам».
- «В 2 шаблонах программ, активных назначений нет».
- «Набор используется в 4 активных программах пациентов».
- «Курс опубликован. По связанному шаблону есть 8 активных программ».

### Archive warning

Если активного usage нет:

- обычное подтверждение архивации допустимо, но можно оставить текущий flow.

Если активный usage есть:

- показывать предупреждение перед действием;
- текст должен объяснять последствия простыми словами;
- кнопка подтверждения должна быть явной: «Архивировать всё равно»;
- server action / route передаёт `acknowledgeUsageWarning=true`;
- service перепроверяет usage перед архивированием.

Пример текста:

```text
Элемент уже используется.

Он есть в 2 опубликованных шаблонах и назначен 5 пациентам.
Архивация уберёт его из каталога для новых назначений, но не должна удалить уже выданную историю.
```

Не обещать того, что код не гарантирует. Если конкретный каталог при архивировании влияет иначе, текст должен быть уточнён в его проходе.

---

## Шаги исполнения для каждого каталога

### Шаг 0. Preflight каталога

Для выбранного каталога:

- найти UI list/detail/form/action flow;
- найти module service/ports/types;
- найти infra repo и in-memory repo;
- найти текущую archive/delete/status action;
- составить список таблиц, откуда берутся usage counters;
- проверить, что не требуется schema change.

Проверки:

- `rg "archive|archived|setStatus|delete" <catalog-paths>`;
- `rg "<catalog-id-field>|item_type" apps/webapp/src apps/webapp/db/schema`;
- `rg "<expected-table-or-column>" apps/webapp/db/schema` (перед query сверить точные имена таблиц/колонок в Drizzle schema);
- `rg "@/infra/db|@/infra/repos" apps/webapp/src/modules/<module>`.

Критерий закрытия: исполнитель понимает текущую цепочку архивации и источники счётчиков.

### Шаг 1. Usage type + port

- Добавить usage type в module types (**counts + `*Refs[]` с дискриминантом `kind`**, id/title/pри необходимости `patientUserId` или другие поля для построения URL только в doctor-слое).
- Расширить port read-only методом usage.
- Обновить in-memory repo (в тестах задавать и refs, если проверяется UI/actions).
- В service добавить `getXUsage(id)`.

Проверки:

- unit tests service: item exists / item missing / empty usage / non-empty usage;
- typecheck затронутого модуля, если менялись exports.

### Шаг 2. Infra query

- Реализовать usage query в infra repo (**один round-trip**: агрегаты + `jsonb_agg` подзапросы по TOP N для каждой группы refs, либо эквивалент без N+1).
- Использовать Drizzle там, где repo уже Drizzle.
- В legacy LFK repos допустимо продолжить существующий repo-style, но только внутри infra.
- Считать active patient usage отдельно от template usage.
- Не делать тяжёлые N+1 запросы в списке; для списка либо batch usage, либо usage только в detail-панели.

Проверки:

- repo test на empty/non-empty usage;
- если данных для корректного теста много, минимум service test + query shape review.

### Шаг 3. Archive guard

- Service archive method должен проверять usage.
- Если есть active usage и нет явного подтверждения, вернуть доменную ошибку `USAGE_CONFIRMATION_REQUIRED`.
- Ошибка должна нести usage snapshot, который UI показывает в предупреждении без повторной интерпретации текста.
- Если подтверждение есть, архивировать как сейчас.
- Исторические назначения не удалять.

Проверки:

- archive unused item — проходит без предупреждения;
- archive used item без confirmation — не проходит, возвращает `USAGE_CONFIRMATION_REQUIRED` и usage snapshot;
- archive used item с confirmation — проходит.

### Шаг 4. UI summary

- Показать usage на карточке / detail-панели (**секции: сводка + список ссылок**, общий UX-паттерн с `ExerciseForm` / `ExerciseUsageSectionsView`).
- Рядом с формой каталога — функции `doctor…UsageHref(ref)` или модуль `*UsageDocLinks.ts` (пути только здесь).
- Не перегружать list, если query дорогой.
- Empty state: «Пока не используется».
- Loading/error state — мягкий: если usage не загрузился, не блокировать весь экран, но не скрывать предупреждение при archive action на сервере.

Проверки:

- render/RTL test на item без usage;
- render/RTL test на item с usage;
- manual smoke выбранного каталога.

### Шаг 5. Archive warning UI

- Добавить dialog / confirm state.
- Для active usage показать понятный warning **с теми же секциями и ссылками**, что в блоке usage (данные из snapshot в ответе `USAGE_CONFIRMATION_REQUIRED`).
- При подтверждении отправить `acknowledgeUsageWarning=true`.
- Сохранить текущие redirect/list preserve параметры, если они есть.

Проверки:

- UI test: кнопка архивации открывает warning при usage;
- action test: confirmation доходит до service;
- manual smoke: archive unused / archive used.

### Шаг 6. Лог и документы

- Добавить запись в `LOG.md`:
  - какой каталог закрыт;
  - какие счётчики добавлены;
  - **добавлены ли списки refs и куда ведут ссылки** (или явное ограничение без URL);
  - какие проверки выполнены;
  - что сознательно не делали.
- Если по каталогу обнаружена невозможность точного счётчика — записать как decision / limitation.

---

## Порядок по каталогам

### 1. Упражнения

Файлы старта:

- `apps/webapp/src/app/app/doctor/exercises/**`;
- `apps/webapp/src/modules/lfk-exercises/**`;
- `apps/webapp/src/infra/repos/pgLfkExercises.ts`;
- `apps/webapp/src/infra/repos/pgLfkTemplates.ts` для template usage;
- treatment program repos для `item_type='exercise'`.

Минимальные счётчики:

- комплексы ЛФК, где упражнение входит в шаблон;
- активные пациентские комплексы/назначения, где упражнение уже находится;
- шаблоны программ и активные экземпляры программ, где item type = `exercise`.

**Refs:** реализовано (`ExerciseUsageSnapshot`, `pgLfkExercises.loadExerciseUsageSummary`, UI в `ExerciseForm`).

Stop condition: если активные patient LFK counts требуют дорогой цепочки через `lfk_complexes` / `lfk_complex_exercises`, можно сначала закрыть template/program usage и записать patient LFK count как follow-up.

### 2. Комплексы ЛФК

Файлы старта:

- `apps/webapp/src/app/app/doctor/lfk-templates/**`;
- `apps/webapp/src/modules/lfk-templates/**`;
- `apps/webapp/src/modules/lfk-assignments/**` *(опционально: usage для шага 2 собирается в `pgLfkTemplates` из `patient_lfk_assignments`; отдельный модуль не обязателен)*;
- `apps/webapp/src/infra/repos/pgLfkTemplates.ts`;
- `apps/webapp/src/infra/repos/pgLfkAssignments.ts` *(опционально — см. выше)*.

Минимальные счётчики:

- активные `patient_lfk_assignments`;
- шаблоны программ с item type = `lfk_complex`;
- активные экземпляры программ с item type = `lfk_complex`.

**Refs:** по строкам матрицы — шаблон комплекса, шаблон программы, экземпляр программы, карточка клиента для назначения (аналог упражнений).

Не чинить весь UX страницы комплексов в этом этапе. Баг восстановления из архива — отдельный follow-up, если он не блокирует текущую архивацию.

### 3. Клинические тесты

Файлы старта:

- `apps/webapp/src/app/app/doctor/clinical-tests/**`;
- `apps/webapp/src/modules/tests/**`;
- `apps/webapp/src/infra/repos/pgClinicalTests.ts`;
- `apps/webapp/src/infra/repos/pgTestSets.ts`.

Минимальные счётчики:

- наборы тестов, где тест включён;
- через эти наборы — шаблоны программ / активные экземпляры программ.

**Refs:** ссылки на наборы тестов и далее на шаблоны/экземпляры программ (см. колонку матрицы).

Не чинить scoring UI и `test_type` как справочник в этом этапе.

### 4. Наборы тестов

Файлы старта:

- `apps/webapp/src/app/app/doctor/test-sets/**`;
- `apps/webapp/src/modules/tests/**`;
- `apps/webapp/src/infra/repos/pgTestSets.ts`;
- treatment program repos.

Минимальные счётчики (сводка в UI):

- шаблоны программ с item type = `test_set` — **по статусам** (`published` / `draft` / `archived`), чтобы врач видел и черновики, и историю;
- активные и завершённые экземпляры программ с item type = `test_set` (завершённые — как исторический контекст);
- наличие попыток/результатов тестов как исторический сигнал, если query уже рядом (счётчик попыток по `test_attempts`, без списка каждой попытки).

**Refs:** шаблоны и экземпляры программ; для «истории результатов» допускается только счётчик без перечисления каждой попытки.

**Guard архива (согласовано с клиническими тестами и разделом «Единый контракт archive guard»):** обязательное подтверждение (`acknowledgeUsageWarning`) только если в usage есть **опубликованные** шаблоны программ с таким набором **или** **активные** экземпляры с таким набором. Наличие **только** черновиков/архивных шаблонов, **только** завершённых экземпляров и/или ненулевого счётчика попыток **не** требует подтверждения — эти поля только информируют врача.

**Ручной smoke** (после доработок): сценарии «без usage» и «с usage», кликабельные refs, архив с предупреждением и с подтверждением, запрет обхода без ack на сервере — по чеклисту «Manual smoke» внизу этого документа.

### 5. Рекомендации

Файлы старта:

- `apps/webapp/src/app/app/doctor/recommendations/**`;
- `apps/webapp/src/modules/recommendations/**`;
- `apps/webapp/src/infra/repos/pgRecommendations.ts`;
- treatment program repos.

Минимальные счётчики (сводка в UI):

- шаблоны программ с item type = `recommendation` — по статусам (`published` / `draft` / `archived`);
- активные и завершённые экземпляры программ с item type = `recommendation` (завершённые — история).

**Refs:** шаблоны и экземпляры программ со ссылками.

**Guard архива** (как в разделах 4 и «Единый контракт archive guard»): подтверждение только при **опубликованных** шаблонах или **активных** экземплярах; только черновики / только архивные шаблоны / только завершённые экземпляры не требуют `acknowledgeUsageWarning`.

Не переименовывать поле «Область» и не трогать markdown preview в этом этапе.

### 6. Шаблоны программ

Файлы старта:

- `apps/webapp/src/app/app/doctor/treatment-program-templates/**`;
- `apps/webapp/src/modules/treatment-program/**`;
- `apps/webapp/src/infra/repos/pgTreatmentProgram.ts`;
- `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts`;
- `apps/webapp/src/infra/repos/pgCourses.ts`.

Минимальные счётчики:

- активные `treatment_program_instances` по template id;
- завершённые instances как historical usage;
- курсы, которые ссылаются на шаблон.

**Refs:** экземпляры программ, курсы с `program_template_id`, при необходимости карточка клиента.

Важное место внимания: в `TreatmentProgramPort` сейчас есть `deleteTemplate`, а у таблицы есть `status='archived'`. Для этого этапа предпочтительна безопасная архивация, не физическое удаление. Если текущий UI реально удаляет шаблон, исполнитель должен остановиться и согласовать переход на archive/status flow.

### 7. Курсы

Файлы старта:

- `apps/webapp/src/app/app/doctor/courses/**`;
- `apps/webapp/src/app/api/doctor/courses/**`;
- `apps/webapp/src/modules/courses/**`;
- `apps/webapp/src/infra/repos/pgCourses.ts`;
- `apps/webapp/src/modules/treatment-program/**`.

Минимальные счётчики:

- linked `programTemplateId`;
- active/completed instances по linked template id с осторожной формулировкой;
- `content_pages.linked_course_id`, если курс используется как промо/контент.

**Refs:** связанный шаблон программы; до N экземпляров по `template_id`; CMS-страницы — только при наличии стабильного URL в продукте.

Не делать отдельный course engine. Не обещать точный счётчик «купили курс», пока нет прямого источника `course_id` в назначениях/покупках.

---

## Проверки этапа

Для каждого каталога:

```bash
pnpm --dir apps/webapp test -- <relevant-test-file-or-pattern>
pnpm --dir apps/webapp lint
```

Если менялись type exports, DI или несколько модулей:

```bash
pnpm --dir apps/webapp typecheck
```

Архитектурная проверка:

```bash
rg "@/infra/db|@/infra/repos" apps/webapp/src/modules apps/webapp/src/app/api/doctor
```

Ожидаемо: в modules и route handlers не должно появиться новых прямых infra imports. Если `rg` показывает legacy, исполнитель обязан отличить старое от нового и записать это в лог.

Полный корневой `pnpm run ci` внутри каждого каталога не нужен. Перед push действует общее правило репозитория.

После закрытия всех 7 каталогов (перед merge/push) выполнить один финальный прогон:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

---

## Manual smoke для каждого каталога

Минимум два объекта:

- объект без usage;
- объект с usage.

Проверить:

- usage summary отображается (**в т.ч. кликабельные refs**, если каталог их поддерживает);
- empty usage отображается понятно;
- archive unused item работает как раньше;
- archive used item показывает warning;
- archive used item без подтверждения не проходит на server/service layer;
- archive used item с подтверждением проходит;
- список после архивации сохраняет текущий view/search, если такой preserve уже был.

---

## Stop conditions

Остановиться и спросить, если:

- для usage нужен schema change или новый индекс;
- счётчик требует неочевидной бизнес-интерпретации;
- курс требует точного счётчика покупок/назначений именно по `course_id`, которого сейчас нет;
- текущий catalog action делает hard delete вместо archive/status, и переход не очевиден;
- для одного каталога нужно трогать больше 8-10 файлов;
- нужно менять LFK schema;
- нужно добавлять FK на `item_ref_id`;
- задача начинает превращаться в переделку page UX, scoring, courses productization или карточки пациента;
- новые checks требуют полного CI без repo-level причины.

---

## Definition of Done

Этап 7 считается закрытым, когда по всем семи каталогам:

- есть usage summary на doctor UI **с перечислением до N ссылок на конкретные сущности** в каждой ненулевой группе (как для упражнений), либо в `LOG.md` зафиксировано обоснованное исключение (нет стабильного URL);
- archive action предупреждает при активном использовании;
- service layer перепроверяет active usage перед архивацией;
- исторические назначения/результаты не удаляются;
- нет schema changes в запрещённых LFK таблицах;
- нет новых нарушений module isolation;
- tests по каждому каталогу прошли на уровне риска;
- статусы в таблице «Трекер подшагов этапа 7» обновлены до фактических;
- после закрытия всех семи каталогов выполнен единый финальный `pnpm run ci`;
- `LOG.md` содержит записи по каждому каталогу и общий closeout этапа.

Если закрыт только один каталог, в `LOG.md` писать «закрыт подшаг этапа 7», а не весь этап.

**Closeout 2026-05-02 (доводка после независимого аудита):** доведены доказательства DoD — `apps/webapp/src/app/api/api.md` (контракт `DELETE` + `409` / `USAGE_CONFIRMATION_REQUIRED` / `acknowledgeUsageWarning` для `clinical-tests`, `test-sets`, `recommendations`), RTL-тесты цикла предупреждения→повтор с подтверждением для `ExerciseForm`, `ClinicalTestForm`, `TestSetForm`, финальный корневой `pnpm run ci` зафиксирован в `LOG.md`. Дополнительно: подтверждение архива на формах каталогов переведено на state (`archiveUsageAck`), диалог usage без вложенного блочного контента внутри `DialogDescription` (валидный HTML).
