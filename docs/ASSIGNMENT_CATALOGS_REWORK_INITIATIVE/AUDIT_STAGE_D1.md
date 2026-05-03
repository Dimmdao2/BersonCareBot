# AUDIT_STAGE_D1 — ASSIGNMENT_CATALOGS_REWORK (defer closure)

**Дата аудита:** 2026-05-03  
**Последний FIX:** 2026-05-03 (`AUDIT_STAGE_D1` MANDATORY)  
**Источник требований:** [`STAGE_D1_PLAN.md`](STAGE_D1_PLAN.md)  
**Scope:** Stage D1 — `measure_kinds` как управляемый системный справочник (Q6 step-1)

## 1. Verdict

| Критерий | Статус |
|----------|--------|
| **Итог** | **PASS** |
| **MANDATORY (critical/major)** | **Закрыты** (см. §10) |
| **MANDATORY (minor)** | **Закрыты или defer с обоснованием** (см. §10) |

**Краткое резюме:** паритет `GET`/`POST`/`PATCH` → `buildAppDeps().measureKinds` → порт → `pg` / `inMemory`; UI `/app/doctor/references/measure-kinds`; combobox формы клин. теста синхронизирован с `sort_order` и событием каталога; негативные пути и разбор не-JSON ответов покрыты тестами и правками FIX 2026-05-03.

---

## 2. Паритет API / service / port / pg / inMemory

| Контракт | Route `measure-kinds` | `measureKindsService` | `ClinicalTestMeasureKindsPort` | `pgClinicalTestMeasureKinds` | `inMemoryClinicalTestMeasureKinds` |
|----------|----------------------|------------------------|--------------------------------|------------------------------|-------------------------------------|
| `listMeasureKinds()` | `GET` → `deps.measureKinds.listMeasureKinds()` | делегирует в порт | `listMeasureKinds` | `select` + `orderBy(sortOrder, label)` | `Map` + сортировка как в PG |
| `createMeasureKindFromLabel` | `POST` → `createMeasureKindFromLabel` | trim, длина, `upsertMeasureKindByLabel` | `upsertMeasureKindByLabel` | поиск по `code`, insert или существующая строка | то же по `code` |
| `saveMeasureKindsOrderAndLabels` | `PATCH` → `saveMeasureKindsOrderAndLabels` | сверка множества `id` и длины с `list`, trim label, длина | `saveMeasureKindsOrderAndLabels` | `transaction` + `update` по `id`, затем `select` | обновление по `id` в `Map` |

**Вывод:** контракты согласованы. In-memory кидает `internal: measure kind row missing` только при нарушении предусловий сервиса.

---

## 3. Корректность управления списком из UI

| Требование `STAGE_D1_PLAN` | Статус |
|----------------------------|--------|
| Страница + DnD + batch `PATCH` | **PASS** |
| Подпись редактируема, `code` read-only | **PASS** |
| Doctor/admin guards | **PASS** |
| Сайдбар `systemLinks` | **PASS** |
| Combobox + событие каталога | **PASS** |
| Блокировка сохранения на время запроса + `router.refresh` | **PASS** (`saveBusy` / `addBusy`, FIX-D1-m4) |

---

## 4. Негативные пути

| Сценарий | Статус |
|----------|--------|
| Пустой label (Zod / сервис / UI до `fetch`) | **PASS** |
| Устаревший набор строк (`422` + текст сервиса) | **PASS** |
| `POST` идемпотентность по `code` | **PASS** |
| Невалидное тело `PATCH` → **400** | **PASS** |
| Ошибка HTTP с не-JSON телом | **PASS** (`readMeasureKindsJsonBody`, тест в `MeasureKindsTableClient.test.tsx`) |

---

## 5. Чеклист `STAGE_D1_PLAN.md` §5

Все пункты закрыты в плане (`[x]`) с пометками где нужно; синхронизация — **FIX-D1-m3** (2026-05-03).

---

## 6. Architecture rules

- [x] Route тонкий → `buildAppDeps().measureKinds`.
- [x] Без новых integration env.
- [x] Drizzle в PG-репозитории.

---

## 7. Deferred (продукт / вне FIX D1)

| Тема | Статус |
|------|--------|
| merge/dedup | вне scope плана D1 |
| `is_active` для строк `measure_kinds` | вне текущей схемы БД |
| E2E Playwright «справочник → combobox» | **Deferred** — нет принятого E2E-контура в репозитории; smoke заменён unit/UI тестом таблицы. |
| П.7 плана «combobox» в одном файле с таблицей | **Deferred** — `CreatableComboboxInput` уже покрыт отдельными тестами B2.5; связка cross-page без E2E. |

---

## 8. Test Evidence

```bash
cd apps/webapp
pnpm exec vitest run \
  src/modules/tests/measureKindsService.test.ts \
  src/app/app/doctor/references/measure-kinds/MeasureKindsTableClient.test.tsx
pnpm exec eslint \
  src/modules/tests/measureKindsPorts.ts \
  src/modules/tests/measureKindsService.ts \
  src/modules/tests/measureKindsService.test.ts \
  src/modules/tests/measureKindsClientEvent.ts \
  src/infra/repos/pgClinicalTestMeasureKinds.ts \
  src/infra/repos/inMemoryClinicalTestMeasureKinds.ts \
  src/app/api/doctor/measure-kinds/route.ts \
  src/app/app/doctor/references/ReferencesSidebar.tsx \
  src/app/app/doctor/references/layout.tsx \
  src/app/app/doctor/references/measure-kinds/page.tsx \
  src/app/app/doctor/references/measure-kinds/MeasureKindsTableClient.tsx \
  src/app/app/doctor/references/measure-kinds/MeasureKindsTableClient.test.tsx \
  src/app/app/doctor/clinical-tests/ClinicalTestMeasureRowsEditor.tsx
pnpm exec tsc --noEmit
```

---

## 9. MANDATORY FIX INSTRUCTIONS

**Открытых инструкций нет** после FIX 2026-05-03 (см. §10). Новые находки — новый проход AUDIT.

---

## 10. FIX closure log (2026-05-03)

| ID | Было | Сделано |
|----|------|---------|
| **FIX-D1-M1** | Нет UI smoke | [`MeasureKindsTableClient.test.tsx`](../../apps/webapp/src/app/app/doctor/references/measure-kinds/MeasureKindsTableClient.test.tsx): пустой label без `PATCH`, `422` с JSON, не-JSON 502, успешный `PATCH` + `refresh` + `dispatchEvent`. |
| **FIX-D1-m1** | `res.json()` маскировал ошибки | `readMeasureKindsJsonBody` (`res.text` + `JSON.parse` + сообщения для не-JSON). |
| **FIX-D1-m2** | Нет unit на идемпотентный POST | Тест `createMeasureKindFromLabel is idempotent when normalized code matches` в [`measureKindsService.test.ts`](../../apps/webapp/src/modules/tests/measureKindsService.test.ts). |
| **FIX-D1-m3** | Чеклист плана не отражал факт | [`STAGE_D1_PLAN.md`](STAGE_D1_PLAN.md) §5 — все `[x]` с краткими оговорками. |
| **FIX-D1-m4** | Кнопка после save до `refresh` | `saveBusy` / `addBusy` + `disabled` на кнопках и полях ввода при мутации. |

---

## 11. DoD `STAGE_D1_PLAN` §6

| DoD | Статус |
|-----|--------|
| Управление из UI | **PASS** |
| Негативные пути | **PASS** |
| Каталог клинических тестов | **PASS** |
