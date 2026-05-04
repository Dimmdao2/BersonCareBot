# AUDIT_GLOBAL — ASSIGNMENT_CATALOGS_REWORK (B1–B7)

**Дата:** 2026-05-03  
**Scope:** сводный аудит после закрытия **B7** — кросс-регресс doctor-facing каталогов и API, согласованность с соседней инициативой **`PROGRAM_PATIENT_SHAPE`** (границы scope).  
**Канон:** [`MASTER_PLAN.md`](MASTER_PLAN.md), [`../PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md`](../PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md), продуктовое ТЗ [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md).  
**Журнал:** [`LOG.md`](LOG.md).  
**Поэтапные аудиты:** [`AUDIT_STAGE_B1.md`](AUDIT_STAGE_B1.md) … [`AUDIT_STAGE_B7.md`](AUDIT_STAGE_B7.md).

## 1. Executive summary

| Этап | Verdict (после FIX) | Кратко |
|------|---------------------|--------|
| B1 | **PASS** | Две оси `arch` × `pub` + legacy query; GET-формы не теряют фильтры |
| B2 | **PASS** | Scoring / measure kinds / API `measure-kinds`; список клинических тестов |
| B3 | **PASS** | Редактор набора тестов без UUID-textarea; комментарии строк набора в каталоге |
| B4 | **PASS** | Рекомендации: тип, регион, текстовые поля, фильтры |
| B5 | **PASS** | «Глаз» / читаемый список рекомендаций |
| B6 | **PASS** | Конструктор шаблонов программ: UX, превью, CTA; без смены assign/snapshot |
| B7 | **PASS** | Универсальный comment + LFK `local_comment`; snapshot `test_set` с `tests[].comment` + UI |

**Итог инициативы (аудит этапов):** все заявленные этапы **B1–B7** закрыты с Verdict **PASS** в соответствующих `AUDIT_STAGE_B*.md`. Риск «кросс-регресс каталогов» снижен общим слоем `doctorCatalogListStatus` + `DoctorCatalogFiltersForm` (где применимо) и точечными FIX по API списков (см. §2).

## 2. Кросс-регресс: doctor catalog (страницы и API)

### 2.1. Ось B1 «архив × публикация» (`listPubArch` / `CatalogStatusFilters`)

Три **целевых** каталога ТЗ B1 делят один контракт query + UI:

| RSC-страница | Клиентский список | Ключевые query-параметры | Список через `buildAppDeps` | REST list (если есть) |
|--------------|-------------------|--------------------------|----------------------------|------------------------|
| [`doctor/lfk-templates/page.tsx`](../../../../apps/webapp/src/app/app/doctor/lfk-templates/page.tsx) | `LfkTemplatesPageClient` | `arch`, `pub`, поиск, регион, тип нагрузки | `lfkTemplates.listTemplates` + `lfkTemplateFilterFromPubArch` | — (данные в RSC) |
| [`doctor/test-sets/page.tsx`](../../../../apps/webapp/src/app/app/doctor/test-sets/page.tsx) | `TestSetsPageClient` | то же | `testSets.listTestSets` + `testSetListFilterFromPubArch` | [`GET /api/doctor/test-sets`](../../../../apps/webapp/src/app/api/doctor/test-sets/route.ts) (`testSetListFilterFromDoctorApiGetQuery`) |
| [`doctor/treatment-program-templates/page.tsx`](../../../../apps/webapp/src/app/app/doctor/treatment-program-templates/page.tsx) | `TreatmentProgramTemplatesPageClient` | то же + библиотека наборов только **published** active | `treatmentProgram.listTemplates` + `treatmentProgramTemplateFilterFromPubArch` | — |

**Проверка консистентности:** все три используют [`parseDoctorCatalogPubArchQuery`](../../../../apps/webapp/src/shared/lib/doctorCatalogListStatus.ts) + `DoctorCatalogFiltersForm` с `catalogPubArch`; редиректы форм сохраняют `listArch`/`listPub` (см. B1 FIX, `LOG.md`). Кросс-регресс «потеря фильтра при submit» для этой тройки закрыт аудитом B1.

### 2.2. Другие doctor-листы (связаны с B, но **без** полной оси pub/arch B1)

| Область | Список / форма | Параметры фильтра | Примечание |
|---------|----------------|-------------------|------------|
| Клинические тесты | [`clinical-tests/page.tsx`](../../../../apps/webapp/src/app/app/doctor/clinical-tests/page.tsx) | `parseRecommendationListFilterScope` → `status`, `region`, `assessment` | Ось **архива** совместима с парсером «как у рекомендаций»; **нет** второй оси публикации набора (B2/B1 FIX по assessment) |
| Рекомендации | [`recommendations/page.tsx`](../../../../apps/webapp/src/app/app/doctor/recommendations/page.tsx) | `listStatus`, `region`, `domain` | B4/B5; доменные фильтры, не дублируют B1 pub для шаблонов ЛФК |
| Упражнения ЛФК (каталог упражнений) | [`exercises/page.tsx`](../../../../apps/webapp/src/app/app/doctor/exercises/page.tsx) | `parseRecommendationListFilterScope` | В MASTER B1 **вне** оси публикации — ожидаемое расхождение с тройкой §2.1 |
| Курсы | [`courses/page.tsx`](../../../../apps/webapp/src/app/app/doctor/courses/page.tsx) | `parseTemplateCourseCatalogListStatus` | Отдельный парсер из [`doctorCatalogListStatus.ts`](../../../../apps/webapp/src/shared/lib/doctorCatalogListStatus.ts); не смешан с B1 pub тройкой |

**Вывод:** дублирования **логики** B1 на все каталоги не требовалось продуктом; кросс-регресс касается **не перепутать** два семейства фильтров (тройка `listPubArch` vs `listStatus`/курсы). Новых противоречий между страницами §2.1 по коду на дату аудита не выявлено.

### 2.3. API маршруты, затронутые B1–B7 (контур «назначений»)

Ниже — маршруты под `/api/doctor/`, которые этапы B1–B7 **расширяли или на которые опираются** списки/формы (не полный инвентарь всех doctor API):

| Префикс / маршрут | Этапы | Назначение |
|-------------------|-------|------------|
| `GET/PUT …/test-sets`, `…/test-sets/[id]`, `…/test-sets/[id]/items` | B1, B3 | Публикация набора, состав + `comment` строк |
| `GET …/clinical-tests`, `…/clinical-tests/[id]` | B2 | Список/деталь с scoring / assessment |
| `GET/POST …/measure-kinds` | B2 | Справочник видов измерений |
| `GET/PUT …/recommendations` (+ `[id]`) | B4 | Домен, регион, метрики |
| `…/treatment-program-templates/**` | B6, B7 | Конструктор, комментарии элементов шаблона |
| `…/treatment-program-instances/**` (+ `stage-items` PATCH) | B7 (+ A2 read) | `local_comment` элемента экземпляра |
| `…/clients/[userId]/lfk-complex-exercises/[exerciseRowId]` | B7 | Override `local_comment` строк комплекса пациента |

Пациентский read программы / прогресс остаётся в контуре `patient/treatment-program-instances/**` (инициатива Shape + B7 read в UI); **новых** маршрутов прогресса в B не добавлялось (см. §3).

## 3. Граница с `PROGRAM_PATIENT_SHAPE` (нет лишнего дублирования)

### 3.1. Договорённое разделение (два MASTER-а)

| Документ | Формулировка out-of-scope |
|----------|---------------------------|
| [`ASSIGNMENT_CATALOGS_REWORK` MASTER §2](MASTER_PLAN.md) | Не вводить **новые** фичи домена Shape (прогресс, `program_action_log`, бейджи); не менять их семантику в B-этапах |
| [`PROGRAM_PATIENT_SHAPE` MASTER §2](../PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md) | Полная переработка каталогов B1–B7 — **sister-инициатива**, вне scope A |

### 3.2. Согласованные точки соприкосновения (не дубли)

| Тема | Где зафиксировано | Факт в коде после B7 |
|------|-------------------|----------------------|
| `instance_stage_item.local_comment` + effective comment | Shape A2; B7 не расходить семантику | [`effectiveInstanceStageItemComment`](../../../../apps/webapp/src/modules/treatment-program/types.ts); PATCH экземпляра; B7 FIX формы override (только `localComment`, placeholder из шаблона) |
| Конструктор шаблонов после фазы A | PRE_IMPL / B6 pre-check | B6 — UX поверх актуального A; без удаления A1/A3 блоков |
| Снимок элемента `test_set` | B3 комментарий в каталоге; пациентский план — Shape UI | B7 FIX: `comment` в `tests[]` снимка + отображение в [`PatientTreatmentProgramDetailClient`](../../../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx) / врач [`TreatmentProgramInstanceDetailClient`](../../../../apps/webapp/src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx) — **расширение read-модели каталога внутри существующего** элемента программы, не новый milestone A4/A5 |

### 3.3. Что остаётся **исключительно** в Shape (B туда не лезет по плану)

- `program_action_log`, inbox «К проверке», бейджи «План обновлён» / «Новое», FSM прогресса этапов — пути из [`PROGRAM_PATIENT_SHAPE` MASTER §3.1](../PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md).  
- В B-этапах **не** добавлялись параллельные реализации этих подсистем.

### 3.4. Что делает только ASSIGNMENT_CATALOGS (не требует дублирования в Shape)

- Оси каталога **pub × arch** для тройки §2.1, редактор наборов B3, скоринг клинических тестов B2, карточка/фильтры рекомендаций B4–B5, **ЛФК** `lfk_complex_exercises.local_comment` и doctor PATCH на карточке клиента (B7) — вне перечня «только `treatment-program`-контур» из Shape MASTER, но **не** конфликтует с ним: другие сущности и другие экраны.

**Итог §3:** пересечение с `PROGRAM_PATIENT_SHAPE` **в пределах согласованного scope** (комментарии элемента программы + снимок `test_set` + конструктор после A). **Вне** согласованного scope дублирующей доменной работы Shape не обнаружено.

## 4. Остаточные риски и наблюдения

1. **Полный CI перед push** — по [`MASTER_PLAN.md`](MASTER_PLAN.md) §9; поэтапные аудиты не заменяют финальный `pnpm run ci` на ветке.  
2. **Разные модели фильтров** между §2.1 и §2.2 — осознанное продуктовое разделение; регрессии искать **внутри** каждого семейства (не ожидать `pub` на клинических тестах).  
3. **E2E** сквозных сценариев «каталог → программа → пациент» в репозитории нет как обязательного артефакта — остаётся на QA / будущий контур (см. defer в [`AUDIT_STAGE_B7.md`](AUDIT_STAGE_B7.md)).

## 5. Закрытие

- **Сводный Verdict:** **PASS** по целям инициативы B1–B7 и границам с `PROGRAM_PATIENT_SHAPE`.  
- **Рекомендация:** при изменениях в общих файлах (`doctorCatalogListStatus.ts`, `DoctorCatalogFiltersForm`, `buildAppDeps`, схемы каталогов) повторять выборочную проверку §2.1 + smoke одного списка из §2.2.
