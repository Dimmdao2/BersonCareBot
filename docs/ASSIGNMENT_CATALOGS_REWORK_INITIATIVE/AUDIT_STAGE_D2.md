# AUDIT_STAGE_D2 — ASSIGNMENT_CATALOGS_REWORK (defer closure)

**Дата аудита:** 2026-05-03  
**Последний FIX:** 2026-05-03 (`AUDIT_STAGE_D2` MANDATORY closure)  
**Источник требований:** [`STAGE_D2_PLAN.md`](STAGE_D2_PLAN.md)  
**Scope:** Stage D2 — `assessmentKind` как системный справочник БД (Q1): миграция/сид, отказ от TS-enum как единственного источника, read tolerant / write strict, валидация.

## 1. Verdict

| Критерий | Статус |
|----------|--------|
| **Итог** | **PASS** |
| **Миграция + сид** | **PASS** |
| **Нет enum как единственного источника правды** | **PASS** (источник правды при ненулевой БД — `reference_items`; см. §7) |
| **List / read для legacy-кодов** | **PASS** (без 500; см. §5) |
| **Write validation** | **PASS** (создание и смена кода — allowlist; update без смены legacy — FIX-D2-M1, §10) |

**Краткое резюме:** миграция `0038` идемпотентна (`ON CONFLICT DO NOTHING`), in-memory зеркалирует категорию и 8 кодов. Валидация записи и query `assessment` / `?assessment=` идут через `listActiveItemsByCategoryCode` + `assessmentKindWriteAllowSet`. Репозиторий списка (`pgClinicalTests` / `inMemoryClinicalTests`) фильтрует по строковому равенству без ограничения enum — legacy-строки остаются в выдаче. TS-константа `CLINICAL_ASSESSMENT_KIND_SEED_V1` — фоллбек при пустом справочнике; при **непустой** БД allowlist для write/query берётся **только из БД**. **FIX 2026-05-03:** `updateClinicalTest` пропускает повторную проверку allowlist, если `assessmentKind` не менялся; паритет сидов — `clinicalAssessmentKindSeedParity.test.ts`; `POST` принимает `assessmentKind`.

---

## 2. Миграция и seed

| Проверка | Результат |
|----------|-----------|
| Файл миграции | [`0038_clinical_assessment_kind_reference.sql`](../../apps/webapp/db/drizzle-migrations/0038_clinical_assessment_kind_reference.sql) |
| Категория | `reference_categories.code = 'clinical_assessment_kind'`, `is_user_extensible = false` |
| Строки | 8 кодов (`mobility` … `endurance`), `sort_order` 1…8, `is_active = true`, `meta_json = '{}'` |
| Идемпотентность | `ON CONFLICT (code) DO NOTHING` на категории; `ON CONFLICT (category_id, code) DO NOTHING` на items |
| Журнал Drizzle | Запись в [`meta/_journal.json`](../../apps/webapp/db/drizzle-migrations/meta/_journal.json) с тегом `0038_clinical_assessment_kind_reference` |
| In-memory seed | [`inMemoryReferences.ts`](../../apps/webapp/src/infra/repos/inMemoryReferences.ts): категория `rc-clinical_assessment_kind` + 8 `reference_items` с теми же `code`/`title`/`sortOrder` |

**Замечание:** колонки `INSERT` соответствуют схеме Drizzle (`reference_categories`: `code`, `title`, `is_user_extensible`; `reference_items`: `category_id`, `code`, `title`, `sort_order`, `is_active`, `meta_json`); PK/defaults на стороне БД не требуются в `INSERT`.

---

## 3. Отсутствие хардкода enum как единственного источника

| Проверка | Результат |
|----------|-----------|
| `rg isClinicalAssessmentKind\|CLINICAL_ASSESSMENT_KIND_OPTIONS` по `apps/webapp` | **Нет вхождений** (enum-валидатор удалён) |
| Источник для UI фильтра | `referenceItemsToAssessmentKindFilterDto(assessmentRefItems)` на сервере → `ClinicalTestsPageClient` |
| Источник для формы | `buildClinicalAssessmentKindSelectOptions(items, current)` из данных `references` (каталог) + read-tolerant строка для текущего legacy-кода |
| Источник для write / query allowlist | `ReferencesPort.listActiveItemsByCategoryCode` + `assessmentKindWriteAllowSet` |

**Оговорка (процесс, закрыто FIX-D2-M2):** массив **`CLINICAL_ASSESSMENT_KIND_SEED_V1`** дублирует сид миграции и in-memory — фоллбек при пустой БД. В шапке [`clinicalTestAssessmentKind.ts`](../../apps/webapp/src/modules/tests/clinicalTestAssessmentKind.ts) зафиксирован чеклист трёх файлов; регрессия — [`clinicalAssessmentKindSeedParity.test.ts`](../../apps/webapp/src/modules/tests/clinicalAssessmentKindSeedParity.test.ts).

---

## 4. Стабильность list / read для legacy-кодов

| Сценарий | Поведение | Статус |
|----------|-----------|--------|
| Список без фильтра `assessment` | `listClinicalTests` не отбрасывает строки по «узнаваемости» кода; `assessment_kind` читается как text | **PASS** |
| Фильтр `?assessment=` / API GET | Невалидный код не передаётся в фильтр (страница: баннер `invalidAssessmentQuery`; API: **400** `invalid_query`) | **PASS** |
| `getClinicalTest` / JSON ответы | Поле `assessmentKind` возвращается как в БД | **PASS** |
| UI селекта | Для кода не из справочника добавляется опция `{code} (не в справочнике)` | **PASS** |
| `assessmentKindDisplayTitle` | Неизвестный код → сырая строка (или title из сида при пустом `items`) | **PASS** |

Репозиторий: [`pgClinicalTests.ts`](../../apps/webapp/src/infra/repos/pgClinicalTests.ts) — условие `eq(clinicalTestsTable.assessmentKind, ak)` только если в фильтр передан уже валидированный код; **нет** SQL-предиката вида «только enum».

---

## 5. Корректность write validation

| Путь | Реализация | Статус |
|------|------------|--------|
| `createClinicalTest` / `updateClinicalTest` | `assertClinicalTestWritePayload` + контекст update: allowlist **или** неизменённый `assessmentKind` | **PASS** |
| Пустой / неприменённый справочник | `assessmentKindWriteAllowSet([])` → коды из `CLINICAL_ASSESSMENT_KIND_SEED_V1` | **PASS** (dev/test), см. §7 |
| Непустой справочник | Allowlist **только** из активных не удалённых `reference_items` | **PASS** (строго по БД) |
| `actionsShared` | Дублирующая проверка enum снята; ошибка домена — из сервиса | **PASS** |
| `GET /api/doctor/clinical-tests` | Та же allowlist, что и для write | **PASS** |

**Legacy + update (закрыто FIX-D2-M1):** если в `updateClinicalTest` переданный `assessmentKind` после trim **совпадает** с уже сохранённым в строке теста, проверка по allowlist **не** выполняется — можно сохранить остальные поля без миграции кода. Смена на другой непустой код — строго по allowlist. `createClinicalTest` по-прежнему отклоняет неизвестные коды.

**Пробел REST (закрыто FIX-D2-M3):** `POST /api/doctor/clinical-tests` принимает опциональный `assessmentKind` в JSON; валидация через тот же сервис. См. [`api.md`](../../apps/webapp/src/app/api/api.md), [`route.ts`](../../apps/webapp/src/app/api/doctor/clinical-tests/route.ts), [`route.test.ts`](../../apps/webapp/src/app/api/doctor/clinical-tests/route.test.ts).

---

## 6. Чеклист `STAGE_D2_PLAN.md` §5 (сверка)

| # | Пункт плана | Статус |
|---|-------------|--------|
| 1 | `rg` точек замены | Выполнено: enum-хардкод в webapp **отсутствует** |
| 2 | Миграция category + seed items | **PASS** (`0038`) |
| 3 | Динамический лист в UI формы и списка | **PASS** |
| 4 | write-path по справочнику | **PASS** |
| 5 | read-path legacy без 500 | **PASS** |
| 6 | unit-тесты | **PASS** (`clinicalTestAssessmentKind.test.ts`, `clinicalAssessmentKindSeedParity.test.ts`, `service.test.ts`, `clinical-tests/route.test.ts`) |
| 7 | `api.md` | **PASS** |
| 8–10 | eslint / vitest / tsc | **PASS** после FIX 2026-05-03 (см. [`LOG.md`](LOG.md)) |

Чеклист §5 в [`STAGE_D2_PLAN.md`](STAGE_D2_PLAN.md) закрыт (`[x]`).

---

## 7. Architecture / правила репозитория

- [x] Запись интеграционных ключей в env не добавлялась.
- [x] Route handlers тонкие: список clinical-tests → `buildAppDeps()` + `references` + `clinicalTests`.
- [x] Модуль tests не импортирует `@/infra/db` напрямую; `ReferencesPort` инжектируется в сервис.

---

## 8. Deferred (вне обязательного FIX D2)

| Тема | Комментарий |
|------|-------------|
| UI управления справочником `clinical_assessment_kind` в админке | В плане D2 out of scope; при необходимости — общий контур `references` + staff API. |
| `PATCH /api/doctor/clinical-tests/[id]` без поля `assessmentKind` | Уже было до D2; не регрессия D2. |

---

## 9. MANDATORY FIX INSTRUCTIONS

**Открытых инструкций нет** после FIX 2026-05-03 (см. §10). Новые находки — новый проход AUDIT.

---

## 10. FIX closure log

| ID | Статус | Комментарий |
|----|--------|-------------|
| **FIX-D2-M1** | **CLOSED** | Вариант **B** в [`service.ts`](../../apps/webapp/src/modules/tests/service.ts): `ClinicalTestAssessmentWriteContext` для update — при совпадении нормализованного `assessmentKind` с `existing.assessmentKind` справочная проверка пропускается. Тесты в [`service.test.ts`](../../apps/webapp/src/modules/tests/service.test.ts). Подсказка в [`ClinicalTestForm.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx). |
| **FIX-D2-M2** | **CLOSED** | Комментарий-триада в [`clinicalTestAssessmentKind.ts`](../../apps/webapp/src/modules/tests/clinicalTestAssessmentKind.ts) + [`clinicalAssessmentKindSeedParity.test.ts`](../../apps/webapp/src/modules/tests/clinicalAssessmentKindSeedParity.test.ts) (SQL ↔ seed ↔ in-memory). |
| **FIX-D2-M3** | **CLOSED** | `POST` + `assessmentKind` в Zod и теле `createClinicalTest`; [`route.test.ts`](../../apps/webapp/src/app/api/doctor/clinical-tests/route.test.ts); [`api.md`](../../apps/webapp/src/app/api/api.md). |

После закрытия всех MANDATORY пунктов: ~~обновить таблицу §10, §1 Verdict (**PASS** без оговорок), §9 заменить на «Открытых инструкций нет».~~ **Выполнено.**

---

## 11. Test Evidence (повторяемая матрица)

```bash
cd apps/webapp
pnpm exec vitest --run \
  src/modules/tests/clinicalTestAssessmentKind.test.ts \
  src/modules/tests/clinicalAssessmentKindSeedParity.test.ts \
  src/modules/tests/service.test.ts \
  src/app/api/doctor/clinical-tests/route.test.ts \
  src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx
pnpm exec eslint \
  src/modules/tests/clinicalTestAssessmentKind.ts \
  src/modules/tests/clinicalTestAssessmentKind.test.ts \
  src/modules/tests/clinicalAssessmentKindSeedParity.test.ts \
  src/modules/tests/service.ts \
  src/modules/tests/service.test.ts \
  src/app/api/doctor/clinical-tests/route.ts \
  src/app/api/doctor/clinical-tests/route.test.ts \
  src/app/app/doctor/clinical-tests/page.tsx \
  src/app/app/doctor/clinical-tests/ClinicalTestsPageClient.tsx \
  src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx \
  src/app/app/doctor/clinical-tests/actionsShared.ts \
  src/infra/repos/inMemoryReferences.ts
pnpm run typecheck
```

---

## 12. Ссылки на ключевые артефакты

| Артефакт | Путь |
|----------|------|
| План D2 | [`STAGE_D2_PLAN.md`](STAGE_D2_PLAN.md) |
| Лог инициативы (EXEC D2) | [`LOG.md`](LOG.md) |
| Миграция | [`0038_clinical_assessment_kind_reference.sql`](../../apps/webapp/db/drizzle-migrations/0038_clinical_assessment_kind_reference.sql) |
| Доменные хелперы | [`clinicalTestAssessmentKind.ts`](../../apps/webapp/src/modules/tests/clinicalTestAssessmentKind.ts) |
| Сервис | [`service.ts`](../../apps/webapp/src/modules/tests/service.ts) |
| API list + POST | [`clinical-tests/route.ts`](../../apps/webapp/src/app/api/doctor/clinical-tests/route.ts), [`route.test.ts`](../../apps/webapp/src/app/api/doctor/clinical-tests/route.test.ts) |
