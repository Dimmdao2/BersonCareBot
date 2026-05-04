# AUDIT_STAGE_B1 — ASSIGNMENT_CATALOGS_REWORK

**Дата:** 2026-05-03  
**Scope:** Stage B1 (публикация × архив, `test_sets`, три каталога)  
**Source plan:** [`STAGE_B1_PLAN.md`](STAGE_B1_PLAN.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), продуктовое ТЗ [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §3 B1

## 1. Verdict

- **Status:** **PASS** (после FIX 2026-05-03)
- **Summary:** Critical/major из первичного аудита закрыты: GET-форма сохраняет `arch`/`pub`; picker шаблона программ и `GET /api/doctor/test-sets` учитывают публикацию. Minor: терминология выровнена в промптах/STAGE_B1; дополнительный unit-тест на явный `pub` поверх legacy `status`. **FIX defer-closure 2026-05-03:** toast при явно невалидных `arch`/`pub` — [`DoctorCatalogInvalidPubArchToast.tsx`](../../../../apps/webapp/src/shared/ui/doctor/DoctorCatalogInvalidPubArchToast.tsx) на трёх каталогах (LFK, test-sets, шаблоны программ) + `explicitDoctorCatalogPubArchParamsInvalid` в [`doctorCatalogListStatus.ts`](../../../../apps/webapp/src/shared/lib/doctorCatalogListStatus.ts).

## 2. Scope Verification

| Requirement | Source | Status | Evidence |
|-------------|--------|--------|------------|
| Две оси query `arch` × `pub` | STAGE_B1 §3, ТЗ §3 B1 | **PASS** | `parseDoctorCatalogPubArchQuery`, `applyDoctorCatalogPubArchToSearchParams` в [`apps/webapp/src/shared/lib/doctorCatalogListStatus.ts`](../../../../apps/webapp/src/shared/lib/doctorCatalogListStatus.ts) |
| Legacy `status=` / `scope=` | STAGE_B1 §3 | **PASS** (с оговорками) | Тот же файл: `arch` из `status=archived`; `pub` из `status=draft|published` при неархивном списке; `working`/`active` → pub по умолчанию `all`. Старое `status=all` для шаблонов ранее сворачивалось в «active» и в одноосевом парсере — регресс не хуже прежнего. |
| Shared UI два селекта | STAGE_B1 §3 | **PASS** | [`CatalogStatusFilters.tsx`](../../../../apps/webapp/src/shared/ui/doctor/CatalogStatusFilters.tsx), шапка [`DoctorCatalogListSortHeader.tsx`](../../../../apps/webapp/src/shared/ui/doctor/DoctorCatalogListSortHeader.tsx) с `catalogPubArch` |
| Три списка: ЛФК | STAGE_B1 | **PASS** | [`lfk-templates/page.tsx`](../../../../apps/webapp/src/app/app/doctor/lfk-templates/page.tsx) + `lfkTemplateFilterFromPubArch` + `pgLfkTemplates` `statusIn` |
| Три списка: шаблоны программ | STAGE_B1 | **PASS** | [`treatment-program-templates/page.tsx`](../../../../apps/webapp/src/app/app/doctor/treatment-program-templates/page.tsx) + `treatmentProgramTemplateFilterFromPubArch` |
| Три списка: наборы тестов | STAGE_B1 | **PASS** | [`test-sets/page.tsx`](../../../../apps/webapp/src/app/app/doctor/test-sets/page.tsx) + `testSetListFilterFromPubArch` + `pgTestSets` по `publicationScope` |
| Публикация в БД для `test_sets` | PRE_IMPLEMENTATION_DECISIONS B1 | **PASS** | Колонка **`publication_status`** (не `status`): [`clinicalTests.ts`](../../../../apps/webapp/db/schema/clinicalTests.ts), миграция [`0033_test_sets_publication_status.sql`](../../../../apps/webapp/db/drizzle-migrations/0033_test_sets_publication_status.sql), CHECK + индекс |
| Восстановление из архива не меняет публикацию | ТЗ §2.1 | **PASS** (по коду) | `archive`/`unarchive` в `pgTestSets` не трогают `publicationStatus`; форма архива не меняет селект публикации |

## 3. Changed Files (ревью-ориентир)

| Область | Файлы | Risk |
|---------|-------|------|
| Парсер / билдеры | `doctorCatalogListStatus.ts`, `*.test.ts` | low |
| UI фильтров | `CatalogStatusFilters.tsx`, `DoctorCatalogListSortHeader.tsx`, `DoctorCatalogFiltersForm.tsx` | low |
| Страницы каталогов | `lfk-templates/page.tsx`, `treatment-program-templates/page.tsx`, `test-sets/page.tsx`, `*PageClient.tsx` | medium |
| Схема / миграция | `clinicalTests.ts`, `0033_*.sql`, `_journal.json` | low при применённом migrate |
| Репозитории | `pgTestSets.ts`, `pgLfkTemplates.ts`, `inMemoryTestSets.ts` | low |
| Форма набора / actions | `TestSetForm.tsx`, `actionsShared.ts`, `actionsInline.ts` | low |

## 4. Architecture Rules Check

- [x] `modules/*` без прямых `@/infra/db/*` / `@/infra/repos/*` в изменениях B1.
- [x] Route handlers не раздувались бизнес-логикой (страницы вызывают `buildAppDeps` + сервисы).
- [x] Новая колонка через Drizzle + миграция.
- [x] Порты/типы в `modules/tests`, реализация в `infra/repos`.
- [x] Интеграционные env для этой фичи не добавлялись.

## 5. UI Contract Check (doctor)

- [x] Используются shadcn `Select` и существующие примитивы; отдельный shared `CatalogStatusFilters` — уместно.
- [x] B6-ограничения не затрагивались.

## 6. Patient-facing

- [x] Не затрагивался.

## 7. Data Migration / Backfill

| Migration | Reversible? | Backfill? | Notes |
|-----------|-------------|-------------|--------|
| `0033_test_sets_publication_status` | Частично (DROP COLUMN) | Да: `DEFAULT 'draft' NOT NULL` на всех строках | Исторически все наборы становятся черновиками по публикации до ручного «Опубликован» — ожидаемо для новой оси. |

## 8. Test Evidence (зафиксировано в LOG B1)

```bash
pnpm exec eslint <затронутые файлы>
pnpm exec vitest run src/shared/lib/doctorCatalogListStatus.test.ts \
  src/app/app/doctor/lfk-templates/lfkTemplatesListPreserveQuery.test.ts \
  src/app/app/doctor/test-sets/TestSetForm.test.tsx \
  src/shared/ui/doctor/DoctorCatalogFiltersForm.test.tsx
pnpm exec tsc --noEmit   # в каталоге apps/webapp
```

- eslint / vitest / tsc: **PASS** на момент EXEC; после FIX — см. §13 и `LOG.md` (B1 FIX).

## 9. Manual Smoke

- [x] Три каталога: **Архив** × **Публикация**, затем **«Применить»** — `arch`/`pub` сохраняются (FIX hidden в форме).
- [ ] Legacy URL только с `?status=draft` / `?status=archived` на трёх маршрутах (периодическая регрессия).
- [ ] Набор: смена публикации, сохранение, архив/разархив — сводка «где используется».

## 10. Regressions / Findings (первичный аудит — **закрыто в FIX 2026-05-03**)

### High (resolved)

1. ~~GET-форма фильтров сбрасывает `arch`/`pub`.~~ — **Исправлено:** опциональный проп `catalogPubArch` + hidden `arch`/`pub` в [`DoctorCatalogFiltersForm.tsx`](../../../../apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersForm.tsx); передаётся из трёх `*PageClient`.

### Medium (resolved)

2. ~~Picker шаблона программы без фильтра публикации.~~ — **`listTestSets({ archiveScope: "active", publicationScope: "published" })`** в [`treatment-program-templates/page.tsx`](../../../../apps/webapp/src/app/app/doctor/treatment-program-templates/page.tsx).

3. ~~API `GET /api/doctor/test-sets` без `publicationScope`.~~ — Query `arch`, `publicationScope` (+ legacy `includeArchived`); маппинг в [`testSetListFilterFromDoctorApiGetQuery`](../../../../apps/webapp/src/shared/lib/doctorCatalogListStatus.ts) в `doctorCatalogListStatus.ts`; [`api.md`](../../../../apps/webapp/src/app/api/api.md) обновлён.

### Low

4. **Именование `test_sets.status` в промптах** — **исправлено** в [`PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`](PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md), чеклист [`STAGE_B1_PLAN.md`](STAGE_B1_PLAN.md) (миграция `publication_status`).

5. **Невалидные `arch`/`pub` в URL** — **исправлено (defer-closure 2026-05-03):** toast при **явно** переданных недопустимых `?arch=` / `?pub=`; legacy `status=` по-прежнему тихо мапится. См. [`DoctorCatalogInvalidPubArchToast.tsx`](../../../../apps/webapp/src/shared/ui/doctor/DoctorCatalogInvalidPubArchToast.tsx), [`doctorCatalogListStatus.ts`](../../../../apps/webapp/src/shared/lib/doctorCatalogListStatus.ts) (`explicitDoctorCatalogPubArchParamsInvalid`), тесты в [`doctorCatalogListStatus.test.ts`](../../../../apps/webapp/src/shared/lib/doctorCatalogListStatus.test.ts).

## 11. Deferred Work

- Периодический smoke §9 (legacy URL, usage).
- ~~Опционально: toast при невалидных query-параметрах (§10.5).~~ — **закрыто** см. §10.5 и §16.

## 12. Final DoD (этап)

- [x] Две оси на трёх каталогах + legacy query + сохранение осей при «Применить».
- [x] `LOG.md` обновлён (EXEC + FIX).
- [x] Коммиты за EXEC и FIX.
- [ ] Продуктовое ТЗ §8 — не требовалось (решение picker/API зафиксировано в LOG/audit).
- [x] Residual risks сняты по critical/major.

---

## 13. FIX 2026-05-03 (закрытие AUDIT)

| ID | Действие | Файлы |
|----|----------|--------|
| critical | Hidden `arch`/`pub` в GET-форме каталога | `DoctorCatalogFiltersForm.tsx`, `DoctorCatalogFiltersForm.test.tsx`, `LfkTemplatesPageClient.tsx`, `TreatmentProgramTemplatesPageClient.tsx`, `TestSetsPageClient.tsx` |
| major | Picker: только опубликованные наборы | `treatment-program-templates/page.tsx` |
| major | API list: `arch` + `publicationScope` | `route.ts` (`test-sets`), `doctorCatalogListStatus.ts` (`testSetListFilterFromDoctorApiGetQuery`), `doctorCatalogListStatus.test.ts`, `api.md` |
| minor | Доки/промпты `publication_status` | `PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`, `STAGE_B1_PLAN.md` |

---

## MANDATORY FIX INSTRUCTIONS — **выполнено (2026-05-03)**

### critical — done

1. Сохранение `arch`/`pub` при submit — см. §13.

### major — done

2. Picker — только `publicationScope: "published"` для списка наборов в library.

3. API — расширен query; маппинг в shared lib для тонкого `route.ts`.

### minor

4. Терминология — см. §10.4.

5. **Done (defer-closure 2026-05-03)** — см. §16.

---

## 16. FIX defer-closure 2026-05-03 (toast `arch`/`pub`)

| Действие | Файлы |
|----------|--------|
| Детекция явно битых `arch`/`pub` | [`doctorCatalogListStatus.ts`](../../../../apps/webapp/src/shared/lib/doctorCatalogListStatus.ts) — `explicitDoctorCatalogPubArchParamsInvalid`; [`doctorCatalogListStatus.test.ts`](../../../../apps/webapp/src/shared/lib/doctorCatalogListStatus.test.ts) |
| Toast на три каталога с B1-осями | [`DoctorCatalogInvalidPubArchToast.tsx`](../../../../apps/webapp/src/shared/ui/doctor/DoctorCatalogInvalidPubArchToast.tsx); подключение в [`LfkTemplatesPageClient.tsx`](../../../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx), [`TestSetsPageClient.tsx`](../../../../apps/webapp/src/app/app/doctor/test-sets/TestSetsPageClient.tsx), [`TreatmentProgramTemplatesPageClient.tsx`](../../../../apps/webapp/src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx) |

**Примечание:** не затрагивает каталоги без осей `arch`×`pub` (например клинические тесты с одной осью `status`).
