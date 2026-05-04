# FILTER URL CONTRACT FIX PLAN — doctor assignment catalogs

**Статус: завершён (2026-05-04).** Верификация: [`AUDIT_FILTER_URL_CONTRACT_FIX.md`](AUDIT_FILTER_URL_CONTRACT_FIX.md), [`LOG.md`](LOG.md). Решения владельца: каталог **шаблонов программ** не меняли; **историю коммитов** не переписывали; **рефакторинг имён `regionRefId`** в коде не делается — в query-layer только параметр **`region`** (код); добавлены **unit-тесты** preserve для recommendations / clinical-tests / test-sets. Исключение: у **наборов тестов** ось **`load`** в preserve намеренно убрана (см. LOG III).

## 1. Goal

Bring doctor assignment catalog filters to a stable URL and data-loading contract:

- `region` in URL is only `reference_items.code`.
- No UUID fallback for `searchParams.region`.
- No `regionRefId` in URL/query-layer.
- `q`, `region`, `load`, and `titleSort` are client-side filters/sort.
- Server pages do not apply `q`, `region`, or `load` to list queries.
- `view` can remain in URL because it is UI state, not a data filter.

## 2. Scope

### In scope

- Doctor catalog filter/listing code only:
  - `DoctorCatalogFiltersForm`
  - `ReferenceSelect` only if needed for catalog filter behavior
  - doctor catalog page/client files under `apps/webapp/src/app/app/doctor/**`
  - preserve-query helpers used by catalog redirects/actions
  - tests for URL contract, preserve-query, and client filtering
- Documentation update in `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md` after EXEC/FIX.

### Out of scope

- Create/edit forms for catalog entities: they continue using UUID/FK values where the domain model requires them.
- Database schema, migrations, reference data seeds, and Drizzle schema changes.
- Patient UI and assignment runtime.
- New server APIs or broad refactors of catalog services/ports.
- Changing `status` / `arch` / `pub` semantics unless the existing list loading contract requires a minimal cleanup.

Any scope expansion must be explicitly approved before implementation.

## 3. URL Contract

Allowed query params for this fix:

- `region=<reference_items.code>`
- `load=<ExerciseLoadType>`
- `q=<text>`
- `view=<tiles|list>`
- `titleSort=<asc|desc>`
- `selected=<id>` as existing UI selection state, not a list data filter
- `status` / `arch` / `pub` as existing archive/publication scope params

Forbidden query-layer contract:

- `regionRefId`
- UUID fallback in `region`
- legacy filter aliases such as `catalogView` / `loadType`, unless a helper removes or normalizes them without preserving them in generated URLs.

Decision notes:

- `titleSort` should be client-side sorting.
- `status` / `arch` / `pub` may remain server-side filters when a catalog intentionally does not load archived/published scopes together.
- `selected` may remain in URL if it only controls selected item/details UI and does not change the list query.

## 4. Execution Steps

### Step 1 — URL contract audit

Checklist:

- [x] Locate all doctor catalog filter/query helpers and current param aliases.
- [x] Confirm every generated URL uses `region`, `load`, `q`, `view`, `titleSort`.
- [x] Confirm tests expect `region=spine` or another readable code, not UUID.

Checks:

```bash
rg "regionRefId=|catalogView=|loadType=" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor
rg "searchParams.*region|regionRefId|loadType|catalogView" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor apps/webapp/src/shared/lib
```

Closure:

- No runtime URL generation writes `regionRefId`.
- Remaining matches are either removed, test fixtures to update, or explicitly documented as unrelated create/edit UUID/FK behavior.

### Step 2 — ReferenceSelect for catalog filters

Checklist:

- [x] Region filter uses `valueMatch="code"` or the existing equivalent.
- [x] Submitted/controlled value is `regionCode`.
- [x] Internal selected filter state does not store `regionRefId`.
- [x] Create/edit forms still submit UUID/FK values where required.

Checks:

```bash
rg "valueMatch|submitField|regionCode|regionRefId" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor
```

Closure:

- Selecting a region writes `region=<code>` to the URL.
- UUID region values do not appear in generated filter URLs.

### Step 3 — Client-side filtering and sorting

Checklist:

- [x] Server passes the client enough data to filter locally: region code or `regionRefId -> code` map, load type, title/search fields.
- [x] Client display-list logic applies:
  - `q`
  - `region` by code
  - `load` by code
  - `titleSort`
- [x] Filter changes update URL/local state without triggering list refetch/RSC navigation.
- [x] No apply button, no summary line, and dropdown-only focus behavior remain unchanged.

Checks:

```bash
rg "useDoctorCatalogDisplayList|titleSort|regionCode|load" apps/webapp/src/app/app/doctor apps/webapp/src/shared
pnpm --dir apps/webapp exec vitest run <targeted-client-filter-tests>
```

Closure:

- Changing `q`, `region`, `load`, or `titleSort` changes the visible list locally.
- The server list loader is not called again for these client-side filter changes.

### Step 4 — Server pages cleanup

Checklist:

- [x] Server pages read `q`, `region`, `load`, `view`, and `titleSort` only as initial UI state.
- [x] `q`, `region`, and `load` are not passed into server `list*` calls.
- [x] Server parsing of `searchParams.region` accepts only code-shaped values and does not treat UUID as a valid region.
- [x] `status` / `arch` / `pub` server filtering remains only where it represents data scope.

Checks:

```bash
rg "list.*\\(\\{[^}]*search|regionRefId|loadType|searchParams\\.region|searchParams\\.load|searchParams\\.q" apps/webapp/src/app/app/doctor
```

Closure:

- Server list calls receive archive/publication scope and base list options only.
- No server code converts `region` UUID to `regionRefId`.

### Step 5 — Preserve redirects and query helpers

Checklist:

- [x] Save/archive/restore redirects preserve `region` code, `load`, `q`, `view`, and `titleSort`.
- [x] Preserve helpers do not preserve `regionRefId`.
- [x] Legacy aliases are not reintroduced by redirects.

**Исключение (принято):** каталог **наборов тестов** не сохраняет `load` в preserve/redirect — см. [`LOG.md`](LOG.md) (III).

Checks:

```bash
rg "preserve|redirect|regionRefId|region=|load=|titleSort" apps/webapp/src/app/app/doctor apps/webapp/src/shared
pnpm --dir apps/webapp exec vitest run <targeted-preserve-query-tests>
```

Closure:

- Redirects keep readable filter state.
- Redirects never write UUID region query params.

### Step 6 — Tests and docs

Checklist:

- [x] `DoctorCatalogFiltersForm` test: URL contains `region=spine`, `load=strength`, and no UUID.
- [x] Preserve-query test: catalog redirects keep `region=spine`.
- [x] Client filtering test: item with `regionCode=spine` is visible only for `region=spine`.
- [x] Existing no apply button / no summary line / dropdown-only focus tests remain green.
- [x] `LOG.md` records scope, decisions, changed files, checks, and residual risks.

Checks:

```bash
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run <targeted-test-files>
pnpm --dir apps/webapp exec tsc --noEmit
```

Closure:

- Targeted tests and typecheck pass, or any skipped check is documented with a reason.
- Full `pnpm run ci` is reserved for pre-push unless explicitly requested.

## 5. Definition of Done

- URL region is human-readable: `region=spine`.
- Region UUID never appears in generated filter URLs.
- `searchParams.region` server parsing does not accept UUID as region fallback.
- `q`, `region`, `load`, and `titleSort` work without server list refetch.
- `view` remains `view`.
- `status` / `arch` / `pub` behavior remains compatible with current archive/publication scope loading.
- UI filters do not reintroduce an apply button, bottom summary text, or dropdown focus regression.
- Targeted eslint/vitest/typecheck results are recorded in `LOG.md`.

## 6. EXEC Prompt

```text
Выполни FILTER URL CONTRACT FIX по:
- docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/FILTER_URL_CONTRACT_FIX_PLAN.md
- docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/MASTER_PLAN.md §9
- docs/APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md

Цель:
- `region` в URL только `reference_items.code`, например `region=spine`.
- Никакого `regionRefId` в URL/query-layer.
- Серверный parsing `searchParams.region` не воспринимает UUID как fallback.
- `q`, `region`, `load`, `titleSort` работают клиентски и не передаются в server `list*` queries.
- `view` остаётся URL UI-state.
- `status` / `arch` / `pub` можно оставить server-side scope filters, если каталог не грузит архив вместе с активными.

Scope:
- Только doctor catalog filters/listing:
  - `DoctorCatalogFiltersForm`
  - `ReferenceSelect` только при необходимости для filter behavior
  - doctor catalog page/client files
  - preserve-query helpers/actions
  - tests
- Не менять create/edit формы, которые должны отправлять UUID/FK.
- Не менять БД, migrations, seeds, patient UI или assignment runtime.

Сделай:
1. Проведи rg-аудит query contract:
   - `regionRefId=|catalogView=|loadType=`
   - `searchParams.region`, `regionRefId`, `loadType`, `catalogView`
2. Переведи region filter на code-value contract (`valueMatch="code"` / equivalent), internal state = `regionCode`.
3. Передай в client list данные, нужные для локальной фильтрации: `regionCode` или map `regionRefId -> code`, `loadType`, title/search fields.
4. Реализуй/выровняй client filtering:
   - `q`
   - `region` по code
   - `load`
   - `titleSort`
5. Убери передачу `q/region/load` в server `list*` calls. Server pages читают их только как initial UI state.
6. Обнови preserve redirects/helpers: сохранять `region`, `load`, `q`, `view`, `titleSort`; не сохранять `regionRefId`.
7. Обнови/добавь тесты:
   - `DoctorCatalogFiltersForm`: `region=spine`, `load=strength`, без UUID.
   - preserve-query: сохраняется `region=spine`.
   - client filtering: item с `regionCode=spine` показывается только при `region=spine`.
   - no apply button / no summary line / dropdown-only focus остаются.
8. Прогони таргетные проверки:
   - `pnpm --dir apps/webapp exec eslint <changed-files>`
   - `pnpm --dir apps/webapp exec vitest run <targeted-test-files>`
   - `pnpm --dir apps/webapp exec tsc --noEmit`
9. Обнови `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md` с решениями, изменёнными файлами, проверками и residual risks.
10. Сделай коммит после зелёного EXEC, если это соответствует текущей инструкции пользователя на коммит.

Важно:
- Не добавляй `regionRefId` обратно как compatibility shim.
- Не вводи UUID fallback для `region`.
- Не превращай `view` в data filter.
- Не трогай UUID/FK behavior create/edit форм.
```

## 7. AUDIT Prompt

```text
Проведи аудит FILTER URL CONTRACT FIX по:
- docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/FILTER_URL_CONTRACT_FIX_PLAN.md
- фактическому diff текущей ветки

Сохрани результат в:
- docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_FILTER_URL_CONTRACT_FIX.md

Проверь обязательно:
1. URL contract:
   - generated URLs use `region=<code>`, not UUID.
   - `regionRefId` отсутствует в URL/query-layer.
   - aliases `catalogView` / `loadType` не сохраняются в generated URLs.
2. Server parsing/loading:
   - `searchParams.region` не принимает UUID как валидный region fallback.
   - server pages не передают `q`, `region`, `load` в `list*` queries.
   - `status` / `arch` / `pub` остаются только data-scope filters.
3. Client filtering:
   - `q`, `region`, `load`, `titleSort` применяются локально.
   - filter changes не вызывают list refetch/RSC navigation.
   - client получает достаточные данные (`regionCode` или map `regionRefId -> code`, `loadType`, title/search fields).
4. ReferenceSelect/forms:
   - catalog region filter uses code.
   - create/edit forms with UUID/FK behavior are not broken.
5. Preserve redirects:
   - save/archive/restore preserve `region` code, `load`, `q`, `view`, `titleSort`.
   - no UUID region is preserved.
6. UI regression:
   - no apply button.
   - no bottom summary line.
   - dropdown-only focus behavior is preserved.
7. Tests:
   - filter form URL test covers `region=spine`.
   - preserve-query test covers `region=spine`.
   - client filtering test covers `regionCode=spine`.
   - targeted eslint/vitest/typecheck evidence is present.

Аудит-формат:
- Verdict: PASS / PASS WITH RISKS / FAIL.
- Findings ordered by severity: Critical, Major, Minor.
- For every finding include file path, exact behavior risk, and mandatory fix instruction.
- Add "MANDATORY FIX INSTRUCTIONS" section even if no critical findings.
- Document residual risks and skipped checks.

Не исправляй код в audit pass, кроме создания audit-файла и при необходимости записи в LOG, если это явно разрешено текущим режимом работы.
```

## 8. FIX Prompt

```text
Выполни FIX по:
- docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_FILTER_URL_CONTRACT_FIX.md
- docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/FILTER_URL_CONTRACT_FIX_PLAN.md

Сделай:
1. Закрой все Critical и Major findings из аудита.
2. Minor findings:
   - исправь, если это локально и безопасно;
   - или явно defer с обоснованием в audit/log, если исправление расширяет scope.
3. Не расширяй scope за пределы doctor catalog filters/listing без явного согласования.
4. Сохрани обязательные контракты:
   - `region` в URL только code.
   - no `regionRefId` in URL/query-layer.
   - no UUID fallback in `searchParams.region`.
   - `q`, `region`, `load`, `titleSort` client-side.
   - `view` remains URL UI-state.
   - create/edit forms keep UUID/FK behavior.
5. Догони/обнови тесты под исправления.
6. Прогони таргетные проверки:
   - `pnpm --dir apps/webapp exec eslint <changed-files>`
   - `pnpm --dir apps/webapp exec vitest run <targeted-test-files>`
   - `pnpm --dir apps/webapp exec tsc --noEmit`
7. Обнови:
   - `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_FILTER_URL_CONTRACT_FIX.md` с fix verification.
   - `docs/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/LOG.md` с результатами FIX и проверками.
8. Сделай коммит после зелёного FIX, если это соответствует текущей инструкции пользователя на коммит.

Перед завершением проверь:
- `rg "regionRefId=|catalogView=|loadType=" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor`
- `rg "list.*\\(\\{[^}]*search|regionRefId|loadType|searchParams\\.region|searchParams\\.load|searchParams\\.q" apps/webapp/src/app/app/doctor`

Если остаются matches, объясни для каждого: исправлено, не runtime, test fixture, или intentional non-filter UUID/FK form behavior.
```

## Связанный follow-up (вне контракта FILTER URL)

Параметр `load` в URL каталогов врача по-прежнему осмыслен для упражнений и комплексов ЛФК; **допустимые значения** для парсинга и UI привязаны к справочнику `reference_items` категории `load_type` (миграция `0041`, модуль `exerciseLoadTypeReference`). Документация закрытия: [`EXERCISE_LOAD_TYPE_FROM_REFS_PLAN.md`](EXERCISE_LOAD_TYPE_FROM_REFS_PLAN.md). Каталог **наборов тестов** ось `load` не использует (см. LOG 2026-05-04 (III)).
