# AUDIT — FILTER URL CONTRACT FIX

**Дата аудита:** 2026-05-04  
**Источники требований:** [`FILTER_URL_CONTRACT_FIX_PLAN.md`](FILTER_URL_CONTRACT_FIX_PLAN.md)  
**Фактическая реализация (ветка):** diff от merge-base `origin/main`…`HEAD`, с фокусом на коммит **`db5ba9ca`** (`fix(doctor-catalogs): region URL code-only and client-side list filters`) и связанные файлы в `apps/webapp` + `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md`.

**FIX verification (2026-05-04, сессия closure):** закрыты **Major M1 / M2**; см. § «FIX verification» внизу.

**Tails fix (2026-05-04, III):** унифицирован парсинг `?region=` (без `invalidRegionQuery` и без отдельного UX для UUID/мусора в URL — ведёт себя как «Все регионы»); у **`test-sets`** убрана ось **`load`** из SSR, preserve и redirect; тесты и аудит обновлены — см. § «Tails fix verification».

**Док-синхронизация (2026-05-04, IV):** после аудита выполнения плана обновлены [`AUDIT_STAGE_D3.md`](AUDIT_STAGE_D3.md), [`AUDIT_STAGE_B4.md`](AUDIT_STAGE_B4.md) (сноски §1/§3/§5/§9/§13/§15); в **этом** файле — § Residual (CI, стадийные AUDIT, backlog preserve-тестов).

---

## Verdict: **PASS**

Контракт URL для **`region` как code**, отсутствие **`regionRefId` в URL/query-layer**, клиентские **`q` / `region` / `load` / `titleSort`**, **`view`** как UI-state, preserve без UUID в **`region`** для inline redirects — **соблюдены** после FIX. Residual: каталог шаблонов программ — **вне объёма по решению владельца**; переименование полей API **`regionRefId`** — **не делается**; перед push — полный CI.

---

## Checklist vs plan (кратко)

| # | Тема | Статус |
|---|------|--------|
| 1 | URL: `region=<code>`, не UUID в генерируемых фильтрах; нет `regionRefId` в query | **PASS** |
| 2 | Нет `catalogView` / `loadType=` в generated URLs под doctor catalog | **PASS** (`load` / `view`, grep по `apps/webapp/.../doctor` без `catalogView`) |
| 3 | SSR / parse: `?region=` — только валидный code-token (UUID и мусор → без фильтра, без отдельного error-state) | **PASS** (`parseDoctorCatalogRegionQueryParam`, `recommendationCatalogSsrQuery`) |
| 4 | Server pages: не передают `q`, `region`, `load` в `list*` | **PASS** (после FIX: recommendations / clinical-tests отдают полный список по archive scope + клиентский tertiary по `domain` / `assessment`) |
| 5 | `status` / `arch` / `pub` — scope на сервере | **PASS** |
| 6 | Client: `q`, `region`, `load`, `titleSort` локально | **PASS** (TP — только `q` + `titleSort` в панели; см. Minor m1) |
| 7 | Filter changes без list refetch / без RSC navigation | **PASS** (`history.replaceState` + merge из `window.location`, см. FIX M1) |
| 8 | Данные для клиента: map refId→code, load, title | **PASS** |
| 9 | Catalog `ReferenceSelect` region by code; create/edit UUID не сломаны | **PASS** |
| 10 | Preserve: `region` code; без UUID в redirect | **PASS** (`appendRegionParamFromListPreserve`, см. FIX M2) |
| 11 | UI: нет «Применить», нет summary под фильтрами, dropdown-only | **PASS** (по коду `DoctorCatalogFiltersForm` + тест) |
| 12 | Тесты + eslint/vitest/tsc | **PASS** (целевые прогоны в FIX-сессии; полный корневой CI — см. residual) |

---

## Findings by severity

### Critical

_Нет._

---

### Major

#### M1 — `router.replace` при смене фильтров vs «без list refetch / без RSC navigation» — **FIXED**

- **Было:** `DoctorCatalogFiltersForm` → `router.replace` → RSC refetch.
- **Стало:** `history.replaceState` + событие `doctorcatalog:urlsync`; родительские клиенты каталогов используют **`useDoctorCatalogClientFilterMerge`** (`readDoctorCatalogClientFilterUrlSlice` из `window.location`), база для патча URL — **`window.location.search`** в `navigateWithPatch`.
- **Файлы:** `apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersForm.tsx`, `apps/webapp/src/shared/lib/doctorCatalogClientUrlSync.ts`, `apps/webapp/src/shared/hooks/useDoctorCatalogClientFilterMerge.ts`, клиенты страниц doctor catalog (exercises, recommendations, clinical-tests, lfk-templates, test-sets, treatment-program-templates).

#### M2 — Preserve redirect: `listRegion` → `region` без отсечения UUID — **FIXED**

- **Стало:** общая функция **`appendRegionParamFromListPreserve`** (обёртка над `parseDoctorCatalogRegionQueryParam`) в  
  `recommendations/actionsInline.ts`, `clinical-tests/actionsInline.ts`, `test-sets/actionsInline.ts`.

---

### Minor

#### m1 — Шаблоны программ: `region` / `load` в URL не участвуют в панели и фильтрации списка — **OUT OF SCOPE (владелец 2026-05-04)**

- Каталог шаблонов программ **не менять** в рамках FILTER URL.

#### m2 — Любой не-UUID токен в `region` без allowlist — **MITIGATED (tails)**

- **`parseDoctorCatalogRegionQueryParam`:** нормализация в lower-case + sanity `[a-z0-9_]+`; UUID и нетокенный мусор → `regionCode: undefined` (как «Все регионы»), без баннеров.

#### m3 — Тест формы: покрытие URL для `region` / `load` — **PASS**

- Mock **`ReferenceSelect`** вызывает `onChange` с кодами; assert на `region=spine` + `load=strength` в URL; spy на **`history.replaceState`** с pass-through (jsdom обновляет query между шагами).

#### m4 — Внутренние имена `regionRefId` в портах/API — **NO CHANGE (подтверждено владельцем 2026-05-04)**

- Рефакторинг не выполняется; в query-layer используется только **`region`** (код).

#### m5 — `test-sets`: «мёртвый» `load` в preserve / URL — **CLOSED**

- Убраны `listLoad` / `loadType` из **`TestSetForm`**, **`TestSetsPageClient`**, **`test-sets/page.tsx`**, **`actionsInline`**; общая чистая функция **`appendTestSetsListPreserveToSearchParams`** + unit-тест **`testSetsListPreserveParams.test.ts`**.

---

## Evidence (целевые проверки, FIX-сессия 2026-05-04)

```bash
pnpm --dir apps/webapp exec eslint <changed-files>   # exit 0
pnpm --dir apps/webapp exec vitest run \
  src/shared/lib/doctorCatalogClientUrlSync.test.ts \
  src/shared/hooks/useDoctorCatalogDisplayList.test.ts \
  src/shared/ui/doctor/DoctorCatalogFiltersForm.test.tsx   # 9 tests passed
pnpm --dir apps/webapp exec tsc --noEmit   # exit 0
```

**Корневой `pnpm run ci`** в рамках данного FIX-pass **не** выполнялся.

---

## Tails fix verification (2026-05-04, III)

```bash
pnpm --dir apps/webapp exec eslint \
  src/shared/lib/doctorCatalogRegionQuery.ts \
  src/shared/lib/doctorCatalogClientUrlSync.ts \
  src/shared/hooks/useDoctorCatalogClientFilterMerge.ts \
  src/modules/recommendations/recommendationCatalogSsrQuery.ts \
  src/app/app/doctor/test-sets/testSetsListPreserveParams.ts \
  src/app/app/doctor/test-sets/actionsInline.ts \
  src/app/app/doctor/test-sets/TestSetForm.tsx \
  src/app/app/doctor/test-sets/TestSetsPageClient.tsx \
  src/app/app/doctor/test-sets/page.tsx   # exit 0

pnpm --dir apps/webapp exec vitest run \
  src/shared/lib/doctorCatalogRegionQuery.test.ts \
  src/shared/lib/doctorCatalogClientUrlSync.test.ts \
  src/modules/recommendations/recommendationCatalogSsrQuery.test.ts \
  src/shared/ui/doctor/DoctorCatalogFiltersForm.test.tsx \
  src/app/app/doctor/test-sets/testSetsListPreserveParams.test.ts \
  src/app/app/doctor/recommendations/recommendationsListPreserveParams.test.ts \
  src/app/app/doctor/clinical-tests/clinicalTestsListPreserveParams.test.ts   # 23 tests passed

pnpm --dir apps/webapp exec tsc --noEmit   # exit 0
```

**Корневой `pnpm run ci`** в этом tails-pass **не** выполнялся.

---

## Residual risks & skipped checks

| Риск / пропуск | Комментарий |
|-----------------|-------------|
| Каталог шаблонов программ без `region`/`load` в UI | Minor m1 — **вне объёма по решению владельца** (2026-05-04); не менять в рамках FILTER URL. |
| Рефакторинг имён `regionRefId` в портах/API | **Не делается** по решению владельца; в query-layer достаточно параметра **`region`** (код). |
| Публичные JSON API (`GET /api/doctor/...`) | Контракт **страниц** каталога; API может отличаться по `region` — вне scope FILTER fix. |
| Полный CI | Не подтверждён в FIX-pass и в tails-pass (III). Перед push в remote — по правилам репозитория обязателен **`pnpm install --frozen-lockfile && pnpm run ci`**. |
| Стадийные AUDIT (B4/D3) | **2026-05-04:** текст синхронизирован с каноном [`AUDIT_FILTER_URL_CONTRACT_FIX.md`](AUDIT_FILTER_URL_CONTRACT_FIX.md) (невалидный `region` на HTML-каталоге без отдельного баннера). |
| Backlog (низкий приоритет) | ~~Опционально: unit preserve для rec/clinical~~ — **сделано:** `recommendationsListPreserveParams.test.ts`, `clinicalTestsListPreserveParams.test.ts` (2026-05-04). |

---

## Закрытие чеклиста плана (mapping)

- **§3 URL contract:** `DoctorCatalogFiltersForm` пишет `region` / `load` как коды; preserve UUID отсекается.  
- **§4 Server parsing / loading:** без клиентских фильтров в `list*`; recommendations & clinical-tests загружают полный набор по archive + tertiary на клиенте.  
- **§5 Client filtering:** `useDoctorCatalogDisplayList` + tertiary для domain / assessmentKind.  
- **§6 ReferenceSelect:** регион каталога — `valueMatch="code"`; формы create/edit без изменений контракта.  
- **§7 Preserve:** inline actions через **`appendRegionParamFromListPreserve`** + pure helpers **`appendRecommendationsListPreserveToSearchParams`**, **`appendClinicalTestsListPreserveToSearchParams`**, **`appendTestSetsListPreserveToSearchParams`** (unit-тесты).
- **§8 UI regression:** без «Применить», без строки summary под фильтрами.  
- **§9 Tests:** см. Evidence (FIX) и **Tails fix verification** (III).

---

## FIX verification (детали)

| ID | Критерий закрытия | Подтверждение |
|----|-------------------|---------------|
| Tails | Нет отдельного UX/флага для UUID в `region`; мусор в URL → без фильтра региона; `test-sets` без `load` в preserve/redirect | Удалён `invalidRegionQuery` из shared + страниц; **`appendTestSetsListPreserveToSearchParams`**; тесты в § Tails fix verification. |
| M1 | Нет `router.replace` для синка фильтров; список не зависит от RSC при смене q/region/load/titleSort в URL | `DoctorCatalogFiltersForm`: только `history.replaceState` + `dispatchDoctorCatalogUrlSync`; клиенты с `useDoctorCatalogClientFilterMerge`. |
| M2 | Redirect после inline save/archive не пишет `region=<uuid>` | `appendRegionParamFromListPreserve` в трёх `actionsInline.ts`. |
| Консистентность списка без RSC | Recommendations: `listRecommendations` без `domain`; Clinical: `listClinicalTests` без `assessmentKind`; клиент режет по `domain` / `assessmentKind` через опции `useDoctorCatalogDisplayList` (`tertiaryCode` / `getItemTertiaryCode`). |

---

**Итог:** вердикт **PASS** для merge при принятии residual (TP вне объёма, без рефактора `regionRefId`, полный CI перед push).
