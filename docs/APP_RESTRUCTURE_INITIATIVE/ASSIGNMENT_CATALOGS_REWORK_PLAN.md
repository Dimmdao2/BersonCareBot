# ASSIGNMENT_CATALOGS_REWORK_PLAN — переработка каталогов «Назначений»

**Статус:** живой план (документация). Код не менялся.
**Дата:** 2026-05-03.
**Назначение:** UX/тех-фиксы существующих каталогов раздела «Назначения» в кабинете врача (клинические тесты, наборы тестов, рекомендации, комплексы ЛФК, шаблоны программ). Решает накопленные баги текущей реализации и подготавливает почву для [`PROGRAM_PATIENT_SHAPE_PLAN.md`](PROGRAM_PATIENT_SHAPE_PLAN.md), не дублируя его доменную работу.

**Связанные документы:**
- ТЗ доменной модели плана пациента: [`PROGRAM_PATIENT_SHAPE_PLAN.md`](PROGRAM_PATIENT_SHAPE_PLAN.md) (этапы A1–A5).
- Дорожная карта: [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) (этап 9, эта переработка — sister-план перед/параллельно A1+A3).
- **Execution-контур B1–B7:** [`../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/README.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/README.md) (`MASTER_PLAN`, `STAGE_B1..B7`, `LOG`, сводный [`AUDIT_GLOBAL.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_GLOBAL.md), [`AUDIT_PREPUSH_POSTFIX.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_PREPUSH_POSTFIX.md)).
- Шаблон каталога (usage / archive): [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md).
- Целевая IA врача: [`TARGET_STRUCTURE_DOCTOR.md`](TARGET_STRUCTURE_DOCTOR.md) §6.

> Принципы scope:
> 1. **Не делать доменную работу `PROGRAM_PATIENT_SHAPE`.** Здесь — только переработка существующих каталогов (типизация, недостающие поля, фильтры, замена убогого UI на нормальный, фикс багов).
> 2. **Не плодить «второй движок».** Конструктор шаблона программ переписывается визуально (B6), доменное расширение (группы/цели/задачи) — в A1+A3 PROGRAM_PATIENT_SHAPE.
> 3. **Не разбивать одну ось на две и наоборот.** «Опубликовано/черновик» и «архив/активно» — две **независимые** оси (см. B1).

---

## 1. Контекст: что сейчас не так

| Каталог | Боль | Файл |
|---|---|---|
| Клинические тесты | `scoring_config` — `<Textarea>` JSON; `testType` — произвольная строка; нет региона тела; фильтр «Регион» в шапке списка ничего не фильтрует (поля нет в карточке) | [`apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx) |
| Наборы тестов | Состав набора вводится как «UUID по одной строке» в `<Textarea>` | [`apps/webapp/src/app/app/doctor/test-sets/TestSetItemsForm.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetItemsForm.tsx) |
| Рекомендации | Поле называется «Область», а это `domain` (тематика, не регион тела); нет `body_region`, нет структурированных «количество / частота / длительность» | [`apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx), [`apps/webapp/src/modules/recommendations/recommendationDomain.ts`](../../apps/webapp/src/modules/recommendations/recommendationDomain.ts) |
| Комплексы ЛФК | «Иконка глаза» (публикация черновика) визуально не реагирует на ожидаемое действие; в целом UX списка/карточки требует pass-1 | [`apps/webapp/src/app/app/doctor/lfk-templates/`](../../apps/webapp/src/app/app/doctor/lfk-templates/) |
| Шаблоны программ | Конструктор минимально функциональный, но визуально настолько убогий, что воспринимается как «не правится»; модалка добавления элемента — без превьюшек; нет нормальных save/publish CTA | [`apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx) |
| Все каталоги с публикацией | Фильтр `DoctorCatalogListStatus = "all" \| "active" \| "archived"` сворачивает `draft`/`published` в `active` (см. legacy в [`apps/webapp/src/shared/lib/doctorCatalogListStatus.ts`](../../apps/webapp/src/shared/lib/doctorCatalogListStatus.ts)). Невозможно отдельно увидеть черновики vs опубликованные, при этом `archived draft` после восстановления должен оставаться черновиком | shared lib |
| Все item-контейнеры | Универсального паттерна «коммент в шаблоне → копия в инстансе → опц. локальное переопределение» нет; есть только частный `local_comment` на `instance_stage_item` (зафиксирован в `PROGRAM_PATIENT_SHAPE_PLAN`) | разное |

---

## 2. Зафиксированные продуктовые решения

Решения 2026-05-03 (после обсуждения):

1. **Две независимые оси фильтра** для каталогов **с понятием публикации**:
   - **Ось публикации:** `draft` ↔ `published` (только эти два значения; третьего нет).
   - **Ось архива:** `archived` ↔ `active` (отдельно от публикации; в сущностях с единым `status` оси строятся на уровне UI/парсинга).
   - Архивный черновик после восстановления остаётся **черновиком**. Архивный published — остаётся **published**. Восстановление НЕ меняет статус публикации.
   - Применяется к: комплексы ЛФК, шаблоны программ, наборы тестов, курсы (когда появятся).
   - Для `test_sets` публикационный статус добавляется в B1 (миграция + API/UI фильтры).
   - Не применяется (только архив) к: упражнениям, клиническим тестам, рекомендациям. У них `publication_status` нет.

2. **Клинические тесты — структурированный scoring**:
   - Шапка теста: `schema_type` — `numeric` / `likert` / `binary` / `qualitative` (qualitative = «врач смотрит вручную», без авто-оценки).
   - Внутри: список «измерений» `measure_items[]` с полями `measure_kind`, `value`, `unit?`, `comment?`.
   - `measure_kind` — combobox с **автодобавлением** (см. B2.5: новый shared компонент `CreatableComboboxInput`).
   - Свободное поле `raw_text` на уровне теста — для всего, что не лезет в структуру.
   - JSON-режим оставить как «продвинутый» (toggle), не основной.

3. **Клинические тесты — `assessmentKind` как справочник**: фиксированный enum (как у упражнений `loadType`), русские подписи. Кандидаты:
   `mobility` (подвижность), `pain` (болезненность), `sensitivity` (чувствительность), `strength` (сила), `neurodynamics` (нейродинамика), `proprioception` (проприоцепция), `balance` (равновесие), `endurance` (выносливость).
   Точный финальный список — за врачом (см. §5 Открытые вопросы).

4. **Клинические тесты — `body_region` FK** на справочник регионов тела (как у упражнений). Опциональное поле. После добавления — фильтр «Регион» в шапке списка тестов наконец заработает.

5. **Наборы тестов** — переписываются по образцу редактора LFK-комплекса:
   - Колонка / список «тесты в наборе» с превьюшкой, drag-n-drop сортировкой.
   - На каждый тест — поле **«Комментарий»** (template-уровень). Поле reps/sets/side/pain — **убрать** (нерелевантно тестам).
   - Selector добавления — диалог поиска по библиотеке (как «Элемент из библиотеки» в конструкторе шаблонов).
   - UUID-textarea — удалить полностью (без admin-fallback).

6. **Рекомендации**:
   - Переименовать в UI «Область» → **«Тип»** (поле `domain` в коде остаётся; миграция переименования — отдельным шагом, опционально).
   - Расширить enum под продуктовые решения [`PROGRAM_PATIENT_SHAPE_PLAN.md`](PROGRAM_PATIENT_SHAPE_PLAN.md) §4.2 (`regimen` / `nutrition` / `device` / `self_procedure` / `external_therapy` / `lifestyle`; `physiotherapy` / `motivation` / `safety` — слить или сохранить как подвиды).
   - Добавить **`body_region` FK** (опц.).
   - Добавить опц. `quantity` / `frequency` / `duration` (фристайл-текст).
   - Описание (`bodyMd`) и комментарий — **разные сущности**: описание принадлежит каталоговой записи (что такое рекомендация), комментарий — заметка врача в контексте, куда он её вставил (см. B7 universal comment).

7. **Комплексы ЛФК — pass-1 UX**:
   - Диагностика и фикс «иконки глаза» (если действительно не реагирует).
   - Карточка: понятные подписи, видимые статусы (черновик / опубликован, архивный / активный — после B1).
   - Список: превьюшка комплекса (миниатюра первого упражнения или картинка комплекса), счётчик упражнений, статусы, фильтры B1.
   - Без новой доменной модели — только визуальный pass и нормальные CTA.

8. **Шаблоны программ — pass-1 UX (без новой доменной модели)**:
   - Превьюшки в списке шаблонов и в модалке «Элемент из библиотеки».
   - Двухколоночный layout: «Этапы» / «Элементы этапа», sticky-шапка, понятные иконки сортировки/удаления.
   - Чёткие CTA: «Сохранить черновик», «Опубликовать», «Архивировать»; статус-бейдж шаблона рядом с заголовком.
   - **Без** добавления `goals/objectives/expected_duration_*` и **без** групп — это в A1+A3 `PROGRAM_PATIENT_SHAPE_PLAN`. Эта переработка готовит конструктор к A1+A3, не делая их.

9. **Universal comment pattern**:
   - У каждого item-в-контейнере (template_stage_item, lfk_complex_template_exercise, test_set_item, recommendation-в-программе и т.п.) — поле `comment TEXT NULL` на template-уровне.
   - При создании инстанса из шаблона комментарий **копируется** в `instance_*_item.local_comment` (или эквивалентное поле).
   - Если врач правит `local_comment` в инстансе — это override, видимый только конкретному пациенту.
   - Если `local_comment IS NULL` — пациенту показывается template-комментарий.
   - **Уже зафиксировано** для `instance_stage_item.local_comment` в [`PROGRAM_PATIENT_SHAPE_PLAN.md`](PROGRAM_PATIENT_SHAPE_PLAN.md) §1.4. Здесь — расширение паттерна на остальные item-контейнеры (см. B7 + новый раздел в `PROGRAM_PATIENT_SHAPE_PLAN.md` §1.9).

10. **Глобальный пул значений `measure_kind`**: одна общая таблица-справочник на всё приложение, без scope per-doctor (в этой копии проекта врач один). Любой врач, добавивший новое значение через combobox, расширяет общий справочник для последующих сессий.

---

## 3. Нарезка работ — этапы B1…B7

> Зависимости: B1 — поперечный (нужен фильтрам в B5/B6/B3). B7 — поперечный, делается после B3/B4. Остальные — параллелизуемые.

### B1. Универсальный паттерн фильтра «публикация × архив»

**Scope:**
- Расширить shared lib: добавить тип `DoctorCatalogPublicationStatus = "draft" | "published"` отдельно от `is_archived`.
- Утилиты парсинга query: `?pub=draft|published|all` × `?arch=active|archived|all` → две независимые оси.
- Backward compatibility со старыми ссылками (`status=active|archived` → пустой `pub` + `arch=active|archived`).
- shared UI компонент `CatalogStatusFilters` — два контрола рядом (Select / Toggle).
- Применить к: каталогам с `publication_status` (комплексы ЛФК, шаблоны программ, наборы тестов).
- Для `test_sets` в этом этапе: добавить статус публикации (`draft`|`published`) и провести его в list/query/save.

**Не делать:**
- Не вводить `publication_status` у упражнений / клин. тестов / рекомендаций. У них только архив.
- Не добавлять публикационный статус в сущности вне scope B1 (упражнения/клин. тесты/рекомендации).

**Файлы:**
- [`apps/webapp/src/shared/lib/doctorCatalogListStatus.ts`](../../apps/webapp/src/shared/lib/doctorCatalogListStatus.ts) — расширение.
- `apps/webapp/src/shared/ui/doctor/CatalogStatusFilters.tsx` — новый.
- ListPageClient-ы: lfk-templates, treatment-program-templates, test-sets — точечно.

**Тесты:** unit на парсер (legacy → новый формат), визуальный smoke списков.

**Размер:** малый, ~1 день.

---

### B2. Клинические тесты — типизация и структурированный scoring

**Scope:**
- Drizzle: добавить `assessment_kind TEXT NULL` (enum как у `loadType`), `body_region_id UUID NULL` FK, `scoring JSONB NULL` (новая структура), `raw_text TEXT NULL`.
- Старый `scoring_config JSONB` — оставить колонкой; миграция данных в новую `scoring`-структуру (best-effort, остатки — в `raw_text`); потом deprecate в отдельном этапе.
- `recommendationDomain.ts`-аналог: `apps/webapp/src/modules/tests/clinicalTestAssessmentKind.ts` с константами и подписями.
- `ClinicalTestForm.tsx`:
  - `assessmentKind` — `Select` из enum.
  - `bodyRegion` — `ReferenceSelect`.
  - `scoring`-блок: `schema_type` Select; для `numeric` / `likert` / `binary` — соответствующие поля; для `qualitative` — без авто-оценки.
  - `measure_items[]` блок: список строк, каждая с `measure_kind` (CreatableCombobox, см. B2.5), `value`, `unit?`, `comment?`. Drag-n-drop порядка.
  - `raw_text` — `Textarea`.
  - Toggle «JSON-режим» — показывает текущий `scoring` как сырой JSON для редких случаев.
- `ClinicalTestsPageClient`: фильтр «Регион» — наконец заработает по `body_region_id`; добавить фильтр по `assessmentKind`.

**B2.5 — `CreatableComboboxInput` (новый shared компонент):**
- Без `cmdk`/готового shadcn компонента (в проекте нет; shadcn Combobox — пример, не первичный примитив).
- Минимум: `Input` с datalist-подобным dropdown поверх Popover; live-фильтр по введённой строке; кнопка «+ Добавить «xxx»» при отсутствии совпадений.
- Источник данных — пропс `items: { value, label }[]` + callback `onCreate(rawValue) → Promise<{value, label}>`.
- Хранение `measure_kinds` — таблица в БД, scope глобальный (см. §2.10):
  - `clinical_test_measure_kinds (id UUID PK, code TEXT UNIQUE, label TEXT, sort_order INT, created_at)`;
  - read API `GET /api/doctor/measure-kinds`;
  - create API `POST /api/doctor/measure-kinds {label}` → нормализация в `code` (kebab/snake), идемпотентно.
- Файл: `apps/webapp/src/shared/ui/CreatableComboboxInput.tsx` + `*.test.tsx`.

**Тесты:**
- Unit: парсер `scoring` (legacy `scoring_config` → новый формат).
- Compose: `ClinicalTestForm` с `assessmentKind`, `bodyRegion`, `scoring` всех 4 schema_type.
- `CreatableComboboxInput`: фильтрация, Enter создаёт новый item.
- Backfill: миграция данных существующих `scoring_config`.

**Размер:** крупный, ~5–7 дней (новый компонент + миграция данных).

---

### B3. Наборы тестов — переписать редактор как клон LFK-комплекса

**Scope:**
- `TestSetItemsForm.tsx` — полностью переписать.
- Список items — карточками: превьюшка теста (`media[0]`), название, **поле «Комментарий»** (template-уровень), кнопка «Удалить», drag-handle.
- Кнопка «Добавить тест» → диалог библиотеки (по образцу `TreatmentProgramConstructorClient` диалога «Элемент из библиотеки»).
- Save через server action — батчем (как `LfkComplexExercisesForm`).
- Drizzle: добавить `comment TEXT NULL` на `test_set_items` (универсальный `template_comment` — см. B7).

**Не делать:**
- Не вводить reps/sets/side/pain — это упражнения, не тесты.

**Файлы:**
- [`apps/webapp/src/app/app/doctor/test-sets/TestSetItemsForm.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetItemsForm.tsx) — переписать.
- [`apps/webapp/src/modules/tests/`](../../apps/webapp/src/modules/tests/) — port для `comment`.

**Тесты:**
- Compose: добавление/удаление/сортировка/комментарий.
- Server action: сохранение состава с комментариями.

**Размер:** средний, ~3–4 дня.

---

### B4. Рекомендации — переименование, типизация, регион тела, метрики

**Scope:**
- Drizzle:
  - `recommendations.body_region_id UUID NULL` FK.
  - `recommendations.quantity_text TEXT NULL`.
  - `recommendations.frequency_text TEXT NULL`.
  - `recommendations.duration_text TEXT NULL`.
  - `recommendations.kind` — расширение enum (`regimen`, `nutrition`, `device`, `self_procedure`, `external_therapy`, `lifestyle` + сохранить старые `physiotherapy`, `motivation`, `safety` пока не приняли решение по миграции).
  - **Не переименовывать** колонку `domain` в `kind` в коде в этом проходе (опционально, если решим — отдельной задачей).
- [`recommendationDomain.ts`](../../apps/webapp/src/modules/recommendations/recommendationDomain.ts) → переименовать файл/символы в `recommendationKind.ts` (опц.) **или** оставить `domain` как есть в коде, поправить только UI-подпись.
- `RecommendationForm.tsx`:
  - Лейбл «Область» → **«Тип»**.
  - Добавить `bodyRegion` (ReferenceSelect).
  - Добавить три `Input`-поля под `quantity` / `frequency` / `duration` (короткие, фристайл).
- `RecommendationsPageClient`: фильтр по `body_region_id`, по `kind` остаётся.

**Тесты:**
- Compose: форма рекомендации со всеми новыми полями.
- Backfill: существующие `recommendations.body_region_id = NULL`, фильтр работает корректно.

**Размер:** средний, ~3 дня.

---

### B5. Комплексы ЛФК — UX pass-1 + фикс «иконки глаза»

**Scope:**
- Диагностика и фикс «иконки глаза» (публикация/анпубликация / unarchive — выяснить корневую причину).
- Список: превьюшка (миниатюра первого упражнения или собственная), счётчик упражнений, два статуса (`draft|published`, `active|archived`) — после B1.
- Карточка-редактор: чёткие зоны «Метаданные / Упражнения / Действия», понятные кнопки сохранения/публикации/архивации.
- Применить B1 фильтры.

**Не делать:**
- Не менять модель данных комплекса.

**Файлы:** [`apps/webapp/src/app/app/doctor/lfk-templates/`](../../apps/webapp/src/app/app/doctor/lfk-templates/).

**Тесты:**
- E2E/manual smoke: публикация, архивация, восстановление.
- Регресс на usage/archive (`done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`).

**Размер:** средний, ~3–4 дня.

---

### B6. Шаблоны программ — UX pass-1 конструктора (без новой доменной модели)

**Scope:**
- Превьюшки в списке шаблонов: обязательны счётчики этапов и элементов; миниатюра **первого элемента программы** по порядку этапов — когда бэкенд заполняет `listPreviewMedia` (типы элемента `exercise`, `recommendation`, `test_set`, `lfk_complex`); иначе иконка-заглушка. Расширение на `lesson` — при отдельной задаче.
- Превьюшки в модалке «Элемент из библиотеки» (`TreatmentProgramConstructorClient` диалог): для упражнения / комплекса / теста / набора / рекомендации / урока — миниатюра + название + короткий sub.
- Двухколоночный layout, sticky-шапка с CTA «Сохранить черновик» / «Опубликовать» / «Архивировать», статус-бейдж рядом с заголовком.
- Применить B1 фильтры.
- Если будет найден баг «этапы не правятся в черновике» — починить в этом этапе. По текущему коду (`editLocked = busy || isArchived`) править должно — нужна верификация в realtime.

**Не делать:**
- **Не** добавлять `goals/objectives/expected_duration_*` (это A1 в `PROGRAM_PATIENT_SHAPE_PLAN`).
- **Не** добавлять группы внутри этапа (это A3 там же).
- **Не** менять item-types / снапшот-логику.

**Файлы:**
- [`apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx).
- [`apps/webapp/src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx).

**Тесты:** existing tests + smoke на новые превьюшки.

**Размер:** средний, ~3–4 дня.

---

### B7. Universal comment pattern (template + local override) — раскат на все item-контейнеры

**Scope:**
- Аудит всех item-таблиц на наличие `comment` поля (template) и парного `local_comment` (instance).
- Drizzle:
  - Добавить недостающие колонки `comment TEXT NULL` на template-стороне (например, `test_set_items.comment`, `treatment_program_template_stage_items.comment` если ещё нет).
  - Добавить `local_comment TEXT NULL` на instance-стороне там, где есть инстанс (например, `patient_lfk_assignments.*` — если соответствующая instance-таблица существует).
- Сервис копирования template→instance переносит `comment` в `local_comment` при создании инстанса.
- UI:
  - Template-форма: одно поле «Комментарий» рядом с item.
  - Instance-форма (правка инстанса пациента): тот же UI, но изменения сохраняются в `local_comment`. Если врач очистил поле — fallback на template-комментарий через placeholder «Из шаблона: …».
  - Пациент: показывается `local_comment ?? template_comment`.

**Зависимости:**
- B3 (test_sets — там пара `comment` / `local_comment` появляется впервые).
- B4 (рекомендации — `bodyMd` ≠ комментарий, **не объединяем**, см. §2.6).
- A2 PROGRAM_PATIENT_SHAPE — `instance_stage_item.local_comment` уже зафиксирован в плане (см. §1.4 / §1.9 этого плана).

**Тесты:**
- Unit: copy template→instance переносит comment.
- Unit: override в инстансе работает, очистка → возврат к template.
- UI compose.

**Размер:** малый-средний, ~2–3 дня (после B3 и B4).

---

## 4. Изменения в схеме данных (high-level)

| Этап | Таблица | Изменение |
|---|---|---|
| B1 | `test_sets` | + `publication_status` (`draft` \| `published`), CHECK, индекс; shared lib `doctorCatalogListStatus` + UI `CatalogStatusFilters` на трёх каталогах |
| B2 | `clinical_tests` | + `assessment_kind TEXT NULL`, `body_region_id UUID NULL`, `scoring JSONB NULL`, `raw_text TEXT NULL` |
| B2 | `clinical_test_measure_kinds` | NEW (`id`, `code UNIQUE`, `label`, `sort_order`, `created_at`) |
| B3 | `test_set_items` | + `comment TEXT NULL` |
| B4 | `recommendations` | + `body_region_id UUID NULL`, `quantity_text`, `frequency_text`, `duration_text`; расширение enum `domain` |
| B5 | — | Только UX/UI |
| B6 | — | Только UX/UI |
| B7 | разное | + `comment` на недостающих template-таблицах; + `local_comment` на недостающих instance-таблицах |

Все ALTER — нерушащие (nullable / DEFAULT).

---

## 5. Открытые продуктовые вопросы

Статусы синхронизированы с `PRE_IMPLEMENTATION_DECISIONS` и журналом решений §8.2.

| # | Вопрос | Статус |
|---|---|---|
| Q1 | Виды оценки клинического теста (`assessmentKind`) | **Решено:** переводим в **редактируемый системный справочник в БД**. Текущий enum v1 — стартовый сид, не «вечный хардкод». |
| Q2 | `schema_type = qualitative` в инстансе | **Решено:** врач отмечает прохождение теста так же, как для остальных типов; оценка результата и открытие следующего этапа идут общим контуром прогресса программы. |
| Q3 | Старые/новые значения `recommendations.domain` | **Решено:** расширение множества кодов допустимо; делаем системный справочник в БД. Массовый merge legacy в той же миграции не обязателен. |
| Q4 | `domain` vs `kind` в БД/коде | **Решено:** до отдельного эпика оставляем `domain`, UI = «Тип». Если объём изменения приемлем — переименовать в `kind` отдельным этапом. |
| Q5 | UUID-textarea в редакторе наборов тестов | **Закрыто 2026-05-03** |
| Q6 | Модерация `measure_kinds` | **Решено:** первый шаг — доступ к системному справочнику (управление списком). Merge/dedup/«тяжёлая» модерация — позже при необходимости. |
| Q7 | `comment` у каталога рекомендации | **Закрыто:** отдельный template-comment каталога не вводим; `bodyMd` остаётся описанием. |

---

## 6. Definition of Done

- B1 фильтр работает на всех 3 каталогах (LFK / templates / test-sets); legacy-ссылки парсятся.
- B2: каталог клинических тестов имеет `assessmentKind`, `body_region`, структурированный `scoring` через `CreatableComboboxInput`; фильтр «Регион» в шапке наконец фильтрует.
- B3: редактор наборов тестов = клон LFK-комплекса (без reps/sets, с комментарием), без UUID-textarea как основного UI.
- B4: рекомендации имеют «Тип» (UI), `body_region`, `quantity`/`frequency`/`duration`; фильтр работает.
- B5: иконка глаза реагирует, карточка/список комплексов читаемы; фильтры B1.
- B6: список и модалка добавления элемента в шаблон — с превьюшками; конструктор имеет двухколоночный layout с понятными CTA.
- B7: `template_comment` + `local_comment` есть на всех item-контейнерах; copy template→instance переносит, override работает.
- На каждом B-этапе — целевые проверки по затронутой области (step/phase policy); полный `pnpm run ci` обязателен перед push.
- LOG-блок в [`../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md) на каждое реализованное B.

---

## 7. Backlog (откладываемое)

| Идея | Условие старта |
|---|---|
| ~~Удалить колонку `tests.scoring_config` (клинические тесты, таблица `tests`)~~ | **Сделано в репо + dev (2026-05-04):** миграция [`0040_drop_tests_scoring_config.sql`](../../apps/webapp/db/drizzle-migrations/0040_drop_tests_scoring_config.sql) на таблицу **`tests`** (`DROP` legacy-колонки); код/схема без `scoring_config`; **dev** — журнал миграций прогнан для теста. **Prod** — при деплое, с backup по [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) (см. [`AUDIT_DEFER_CLOSURE_GLOBAL.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_DEFER_CLOSURE_GLOBAL.md) §8–§9, [`../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md)). |
| ~~Перевести `assessmentKind` в системный справочник БД (категория + UI управления + валидация)~~ | **Сделано (D2, 2026-05-03):** [`STAGE_D2_PLAN.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_D2_PLAN.md), [`AUDIT_STAGE_D2.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_D2.md) |
| ~~Перевести типы рекомендаций в системный справочник БД~~ | **Сделано (D3, 2026-05-03):** [`STAGE_D3_PLAN.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_D3_PLAN.md), [`AUDIT_STAGE_D3.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_D3.md) |
| Переименовать `recommendations.domain` → `recommendations.kind` (миграция + API + модуль `recommendations`) | **Отложено (2026-05-04):** отдельный этап по запросу; до снятия паузы остаёмся на колонке `domain` и UI «Тип» (см. [`STAGE_D5_PLAN.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_D5_PLAN.md)). |
| Расширить `CreatableComboboxInput` до **многозначного** (теги) | По запросу |
| ~~Доступ к системному справочнику `measure_kinds` (список/правка позиций)~~ | **Сделано (D1, 2026-05-03):** [`STAGE_D1_PLAN.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_D1_PLAN.md), [`AUDIT_STAGE_D1.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_STAGE_D1.md) |
| ~~`publication_status` на упражнениях / клин. тестах / рекомендациях~~ | **Не делаем** (решение §8.2) |
| ~~Отдельный API bulk-операций над items внутри контейнера~~ | **Не планируем** (решение §8.2; текущих батч-операций достаточно) |

---

## 8. Зафиксированные решения (журнал продуктовых выборов)

### 8.1 (2026-05-03) — Принципы B-инициативы

- B-план = **отдельная** инициатива от `PROGRAM_PATIENT_SHAPE_PLAN` (доменная работа). Не дублирует A1+A3.
- Фильтр «опубликовано/черновик» × «архив/активно» — **две независимых оси**, не один enum.
- Две оси применяются к каталогам с публикационным lifecycle: LFK/templates уже имеют `status`; для `test_sets` lifecycle добавляется в B1 (миграция + UI/API).
- `CreatableComboboxInput` — новый shared компонент (shadcn такого нет; пишем сами поверх Input + Popover).
- Глобальный пул `measure_kinds` — без scope per-doctor (в проекте врач один).
- UUID-textarea в test-sets удаляется полностью, без fallback-режимов.
- Описание рекомендации (`bodyMd`) ≠ комментарий — разные сущности (B7 не объединяет их).
- `comment` (template) → `local_comment` (instance, override) — универсальный паттерн на все item-контейнеры (B7).

### 8.2 (2026-05-03) — Уточнения по закрытию product defer

- **Q1:** `assessmentKind` — это **системный справочник в БД**, редактируемый из UI, а не фиксированный enum только в TypeScript.
- **Q2:** в инстансе врач/контур программы отмечает прохождение теста одинаково для всех типов (включая `qualitative`): результат оценён -> этапный прогресс обновлён -> можно открыть следующий этап.
- **Q3:** для «Типа» рекомендации допускается сосуществование старых и новых кодов; источник правды — справочник в БД; точечная очистка/пополнение на production допускается операционно.
- **Q4:** до отдельного эпика сохраняем колонку `domain` и подпись UI «Тип»; целевое имя `kind` предпочтительно, но переименование делаем отдельным этапом после оценки объёма. **2026-05-04:** переименование **отложено** (не в текущем объёме); см. [`STAGE_D5_PLAN.md`](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_D5_PLAN.md).
- **Q6:** первый приоритет — доступ к системному справочнику `measure_kinds`; merge/dedup и сложные операции откладываются.
- **Инженерия:** колонка `tests.scoring_config` (клинические тесты) — **не нужна**; в репозитории — миграция **`0040`** + чистка кода; на **dev** миграции прогнаны для теста; **prod** — по деплою/runbook (§7).
- **E2E:** расширение Playwright/CI **не** планируется; приёмка — ручной smoke; автоматический e2e — только для уже стабилизированного UI и по отдельному решению.
- `publication_status` на упражнениях / клинических тестах / рекомендациях в рамках этой инициативы **не вводим**.
- Отдельный `bulk` API для состава наборов/шаблонов **не планируем**, пока нет подтверждённой нагрузки/боли.
