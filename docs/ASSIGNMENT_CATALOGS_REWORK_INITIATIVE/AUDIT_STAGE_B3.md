# AUDIT_STAGE_B3 — ASSIGNMENT_CATALOGS_REWORK

**Дата:** 2026-05-03  
**Scope:** Stage B3 (редактор состава наборов тестов: dnd-kit, комментарий на item, диалог библиотеки, удаление UUID-textarea / Q5)  
**Source plan:** [`STAGE_B3_PLAN.md`](STAGE_B3_PLAN.md), [`MASTER_PLAN.md`](MASTER_PLAN.md) §9, продуктовое ТЗ [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §2.5 / §3 B3, [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md)

## 1. Verdict

- **Status:** **PASS** (после FIX 2026-05-03)
- **Summary:** Редактор набора соответствует плану B3/Q5: DnD, библиотека, комментарии, миграция `comment`, серверный парсер JSON без `itemLines`. Закрыт **major**: лимит длины `comment` в server action приведён к паритету с `PUT …/items` (10k) + уточнён контракт **`GET`** в `api.md`.

## 2. Scope Verification

| Requirement | Source | Status | Evidence |
|-------------|--------|--------|----------|
| Миграция `test_set_items.comment` | B3 §5.1 | **PASS** | [`0035_test_set_items_comment.sql`](../../apps/webapp/db/drizzle-migrations/0035_test_set_items_comment.sql), [`clinicalTests.ts`](../../apps/webapp/db/schema/clinicalTests.ts) |
| Имя `comment` согласуемо с B7 (per-item) | B3 / B7 | **ACCEPTED** | Колонка `comment` на строке набора; шаблонные комментарии программ — отдельная сущность в B7 |
| UI: карточки, превью, порядок, комментарий, удаление | B3 | **PASS** | [`TestSetItemsForm.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetItemsForm.tsx) |
| DnD `@dnd-kit` как TemplateEditor | B3 | **PASS** | `DndContext`, `SortableContext`, `useSortable`, `arrayMove` — тот же стек |
| Диалог библиотеки | B3 | **PASS** | `Dialog` + `PickerSearchField` + список; каталог активных тестов с сервера |
| UUID-textarea удалён (UI + сервер) | Q5 | **PASS** | Нет `itemLines` / `parseItemLines`; [`actionsShared.ts`](../../apps/webapp/src/app/app/doctor/test-sets/actionsShared.ts) — `itemsPayload` + Zod |
| Батч-сохранение порядка + комментариев | B3 | **PASS** | `itemsPayload` JSON; `setTestSetItems` + `replaceItems` |
| Валидация дубликатов / архивных тестов | B3 | **PASS** | [`service.ts`](../../apps/webapp/src/modules/tests/service.ts): `seen` Set, проверка `test.isArchived` |
| Тесты (unit) | B3 §5.5 | **PASS** | [`service.test.ts`](../../apps/webapp/src/modules/tests/service.test.ts), [`actionsShared.test.ts`](../../apps/webapp/src/app/app/doctor/test-sets/actionsShared.test.ts) |
| B1 preserve списков | B3 §5.4 | **PASS** | `TestSetItemsForm` не трогает query; `actionsInline` / split-view без регрессий по плану |
| Archive/usage safety | B3 checklist | **PASS** | Состав скрыт при `isArchived`; сохранение блокируется в core + сервисе |

## 3. Changed Files (ревью-ориентир)

| Область | Файлы | Risk |
|---------|-------|------|
| Миграция / meta | `0035_*.sql`, `meta/0035_snapshot.json`, `_journal.json` | low (DDL одна колонка) |
| Схема / типы | `clinicalTests.ts`, `modules/tests/types.ts` | low |
| Репозитории | `pgTestSets.ts`, `inMemoryTestSets.ts` | medium |
| Сервис | `service.ts` | medium |
| Server actions | `actionsShared.ts`, `actions.ts` | low |
| UI | `TestSetItemsForm.tsx`, `clinicalTestLibraryRows.ts`, `page.tsx`, `[id]/page.tsx`, `TestSetsPageClient.tsx` | low |
| API | `[id]/items/route.ts`, `api.md` | low |

## 4. Architecture Rules Check

- [x] `modules/*` без новых прямых infra-imports в рамках B3.
- [x] Route `PUT …/items` — parse → `buildAppDeps()` → `setTestSetItems`.
- [x] Новая колонка через Drizzle + SQL миграция.
- [x] Интеграционные env не добавлялись.

## 5. UI Contract Check (doctor)

- [x] `Button`, `Label`, `Textarea`, `Dialog`, `Badge`, `PickerSearchField`, `MediaThumb` — в рамках shadcn/shared.
- [x] B6-поля не затрагивались.

## 6. Patient-facing

- [x] Не затрагивался (B3 — doctor catalog).

## 7. Data Migration / Backfill

| Migration | Reversible? | Backfill? | Notes |
|-----------|-------------|-------------|--------|
| `0035_test_set_items_comment` | `DROP COLUMN` | Нет | Nullable `text`; существующие строки `NULL` |

## 8. Test Evidence

```bash
cd apps/webapp
pnpm exec vitest run \
  src/modules/tests/service.test.ts \
  src/app/app/doctor/test-sets/actionsShared.test.ts
pnpm exec eslint \
  src/app/app/doctor/test-sets/actionsShared.ts \
  src/app/app/doctor/test-sets/actionsShared.test.ts
pnpm exec tsc --noEmit
```

После FIX 2026-05-03: **vitest** / **eslint** / **tsc** — **PASS** (целевые команды; полный `pnpm run ci` — перед пушем по [`MASTER_PLAN.md`](MASTER_PLAN.md) §9).

## 9. Manual Smoke

- [ ] Doctor: split-view наборов — добавить тест из библиотеки, перетащить, комментарий, сохранить; архивный набор — состав недоступен.
- [ ] Строка набора с архивным тестом — бейдж и удаление до сохранения.
- [ ] `PUT /api/doctor/test-sets/[id]/items` с `comment` длиной более 10000 символов — `400` (Zod route).

## 10. Regressions / Findings

### High (critical)

- None.

### Medium (major)

- **M1 (закрыто FIX):** `parseTestSetItemsPayloadJson` принимал `comment` без верхней границы, тогда как `PUT …/items` ограничивает `comment` **10000** символов — расхождение контрактов server action vs REST и риск раздувания поля.

### Low (minor)

- **L1:** `TestSetItemsForm` синхронизирует строки по `itemsKey` без отдельного ключа на название теста; при переименовании теста в другой вкладке заголовок в строке обновится после `router.refresh()` / навигации — приемлемо.
- **L2:** Manual smoke §9 — периодически перед релизом.

## 11. Deferred Work

- E2E на полный сценарий редактора набора (опционально).
- Пуш-чекпоинт после B3: полный **`pnpm install --frozen-lockfile && pnpm run ci`** перед `git push` ([`MASTER_PLAN.md`](MASTER_PLAN.md) §9, [`.cursor/rules/pre-push-ci.mdc`](../../.cursor/rules/pre-push-ci.mdc)).

## 12. Final DoD (этап B3)

- [x] Редактор как LFK + библиотека + комментарии + без UUID-textarea.
- [x] Миграция и типы.
- [x] Unit-тесты по объёму изменений.
- [x] `LOG.md` — запись EXEC + FIX.
- [x] Коммит(ы) за AUDIT-документ + FIX.
- [x] `api.md` — `GET` (состав с `comment` / `previewMedia`) + `PUT` (лимит комментария).

---

## 13. FIX 2026-05-03 (закрытие AUDIT_STAGE_B3)

| ID | Severity | Действие | Файлы |
|----|----------|----------|-------|
| M1 | major | Zod `comment`: `z.string().max(10000)` в `itemsPayloadSchema`; тест на отклонение длины 10001+ | `actionsShared.ts`, `actionsShared.test.ts` |
| M1b | major (doc) | Паритет контракта: `GET` doctor/test-sets — уточнить поля `items[]` и лимит `comment` у `PUT` | `api.md` |

---

## MANDATORY FIX INSTRUCTIONS — **выполнено (2026-05-03)**

| ID | Severity | Instruction | Status |
|----|----------|-------------|--------|
| M1 | major | Выровнять валидацию длины `comment` в server action (`parseTestSetItemsPayloadJson` / `itemsPayloadSchema`) с `PUT …/items` (`z.string().max(10000)`); добавить unit-тест. | **done** §13 |
| M1b | major | Обновить `api.md`: в описании `GET /api/doctor/test-sets` указать `comment` и `test.previewMedia`; у `PUT` явно лимит 10k. | **done** §13 |

Критических открытых пунктов **нет**.

_Конец AUDIT_STAGE_B3._
