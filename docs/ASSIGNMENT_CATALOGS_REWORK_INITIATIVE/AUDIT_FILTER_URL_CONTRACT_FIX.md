# AUDIT — FILTER URL CONTRACT FIX

**Дата аудита:** 2026-05-04  
**Источники требований:** [`FILTER_URL_CONTRACT_FIX_PLAN.md`](FILTER_URL_CONTRACT_FIX_PLAN.md)  
**Фактическая реализация (ветка):** diff от merge-base `origin/main`…`HEAD`, с фокусом на коммит **`db5ba9ca`** (`fix(doctor-catalogs): region URL code-only and client-side list filters`) и связанные файлы в `apps/webapp` + `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md`.

**FIX verification (2026-05-04, сессия closure):** закрыты **Major M1 / M2**; см. § «FIX verification» внизу.

---

## Verdict: **PASS**

Контракт URL для **`region` как code**, отсутствие **`regionRefId` в query-layer**, клиентские **`q` / `region` / `load` / `titleSort`**, **`view`** как UI-state, preserve без UUID в **`region`** для inline redirects — **соблюдены** после FIX. Остаются **minor** ниже (приняты как defer / residual без блока релиза).

---

## Checklist vs plan (кратко)

| # | Тема | Статус |
|---|------|--------|
| 1 | URL: `region=<code>`, не UUID в генерируемых фильтрах; нет `regionRefId` в query | **PASS** |
| 2 | Нет `catalogView` / `loadType=` в generated URLs под doctor catalog | **PASS** (`load` / `view`, grep по `apps/webapp/.../doctor` без `catalogView`) |
| 3 | SSR: `searchParams.region` без UUID fallback | **PASS** (`parseDoctorCatalogRegionQueryParam`, `recommendationCatalogSsrQuery`) |
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

#### m1 — Шаблоны программ: `region` / `load` в URL не участвуют в панели и фильтрации списка — **DEFER (scope)**

- **Обоснование:** без расширения продукта (данные состава в строке списка / отдельная задача) менять TP не входило в закрытие M1/M2; поведение как ранее в `LOG.md`.

#### m2 — SSR принимает любой не-UUID токен как «код региона» без allowlist — **DEFER (scope)**

- Приемлемое UX-поведение (пустой список при опечатке); отдельная задача при необходимости SSR-баннера.

#### m3 — Тест формы: покрытие URL для `region` — **PARTIAL**

- Добавлены **`doctorCatalogClientUrlSync.test.ts`** (parse + preserve UUID) и обновлён **`DoctorCatalogFiltersForm.test.tsx`** под `replaceState` вместо `router.replace`. Полный сценарий «ReferenceSelect → `region=spine`» по-прежнему упирается в mock `ReferenceSelect` — не блокер при наличии sync-unit-тестов.

#### m4 — Внутренние имена `regionRefId` в портах/API — **NO CHANGE**

- Читаемость / отдельный рефакторинг.

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

## Residual risks & skipped checks

| Риск / пропуск | Комментарий |
|-----------------|-------------|
| Каталог шаблонов программ без `region`/`load` в UI | Minor m1 — осознанный residual. |
| Публичные JSON API (`GET /api/doctor/...`) | Контракт **страниц** каталога; API может отличаться по `region` — вне scope FILTER fix. |
| Полный CI | Не подтверждён в этом FIX-pass. |

---

## Закрытие чеклиста плана (mapping)

- **§3 URL contract:** `DoctorCatalogFiltersForm` пишет `region` / `load` как коды; preserve UUID отсекается.  
- **§4 Server parsing / loading:** без клиентских фильтров в `list*`; recommendations & clinical-tests загружают полный набор по archive + tertiary на клиенте.  
- **§5 Client filtering:** `useDoctorCatalogDisplayList` + tertiary для domain / assessmentKind.  
- **§6 ReferenceSelect:** регион каталога — `valueMatch="code"`; формы create/edit без изменений контракта.  
- **§7 Preserve:** inline actions используют `appendRegionParamFromListPreserve`.  
- **§8 UI regression:** без «Применить», без строки summary под фильтрами.  
- **§9 Tests:** см. Evidence.

---

## FIX verification (детали)

| ID | Критерий закрытия | Подтверждение |
|----|-------------------|---------------|
| M1 | Нет `router.replace` для синка фильтров; список не зависит от RSC при смене q/region/load/titleSort в URL | `DoctorCatalogFiltersForm`: только `history.replaceState` + `dispatchDoctorCatalogUrlSync`; клиенты с `useDoctorCatalogClientFilterMerge`. |
| M2 | Redirect после inline save/archive не пишет `region=<uuid>` | `appendRegionParamFromListPreserve` в трёх `actionsInline.ts`. |
| Консистентность списка без RSC | Recommendations: `listRecommendations` без `domain`; Clinical: `listClinicalTests` без `assessmentKind`; клиент режет по `domain` / `assessmentKind` через опции `useDoctorCatalogDisplayList` (`tertiaryCode` / `getItemTertiaryCode`). |

---

**Итог:** вердикт **PASS** для merge при принятии residual minor и без полного корневого CI в этом проходе.
