# В9б — повторный аудит исполнимой декомпозиции tenant-wall

Дата: 2026-08-01

Target fix candidate: `e2187503d5e89e05c403d6462ead60fafa4948d0`

Проверенный artifact: `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md` из target
commit. Его SHA-256 совпадает с файлом в текущем worktree:
`c33c65938dcb7a08d153b7f1b3eccb5eac7008aef440bde6e6484b3c3a391088`.

Классификация: разовая docs-only security/deploy inspection. Product-тесты, миграции,
DB/DEV/TEST/PROD/deploy, taskdb/checkbox и push не выполнялись.

## Вердикт

**FAIL: 6/9 gates PASS.** F2, F4, F5 и F6 закрыты; F1/F3 и F7 закрыты не полностью.
До одного bounded fix-round product implementation остаётся заблокирован.

| Gate | Verdict | Evidence |
| --- | --- | --- |
| 1. `10 + 29 + 9` closure matrices | **FAIL** | Числа и колонки матриц верны, но строка `clinical_test_measure_kinds` ложно говорит `no live TS caller found`. На target есть живой route → DI → `pgClinicalTestMeasureKinds` caller с `SELECT/INSERT/UPDATE`, поэтому его seam/adoption/revoke contract отсутствует. |
| 2. Existing D1 writer | **PASS** | План включает `writeIdentityAndPreferencesDirect.ts`, `writePort.ts`, existing tests и grant overlay; запрещает второй writer; D10 явно не prerequisite. |
| 3. Expand → adopt → contract | **FAIL** | Общий DAG запрещает revoke в S02, но global matrix предписывает `S02 removes tenant direct grant` для `clinical_test_measure_kinds` до отсутствующего adoption живого caller. Тот же S02-revoke текст есть у `booking_cities`; deployable contract неоднозначен. |
| 4. Backfill fail-closed | **PASS** | S03 aborts всю migration при любом non-zero reason; quarantine relation и удаление/denial booking rows явно запрещены. |
| 5. S01 readiness | **PASS** | `WAIT_OVERLAP`/owner gate отсутствуют; S01 — `READY NOW`, collision condition измеряется active branch + SHA + `buildAppDeps.ts` path/hunk. |
| 6. Exact A1/TEST actors | **PASS** | Названы существующие TEST logins и пять terminal operational roles; `app_worker` явно запрещён как oracle/fallback. |
| 7. FORCE predicates | **FAIL** | Helper исправлен на существующий `app.current_org_id()`, но `user_web_push_subscriptions` ошибочно получает predicate по `platform_user_id`; target schema имеет только `user_id`. Такой S05a policy не создастся. |
| 8. Seven migration files | **PASS** | Таблица file assignment содержит ровно S01/S02/S03/S04/S05a/S05b/S05c; S06/S07 определены как harness/TEST evidence без migration. |
| 9. First-worker S01 | **PASS** | Brief удаляет только пять legacy projections и явно сохраняет canonical `be_*`, `patient_bookings`, `appointment_records`, D1 writer и D10; product wall запрещён до audit PASS. |

## Named findings

### RF1 — F1/F3: live global caller потерян, а revoke оставлен в S02

**Достижимый сценарий и impact.** Worker исполняет global row буквально: S02 отзывает staff DML у
`clinical_test_measure_kinds`. Живые `GET/POST/PATCH /api/doctor/measure-kinds` продолжают идти через
`deps.measureKinds` в прямые Drizzle `SELECT/INSERT/UPDATE`, потому что план не назначил этому caller S04
adoption. После промежуточного deploy каталог видов измерений врача получает `permission denied`.

**Evidence.** На `e2187503d`:

- `apps/webapp/src/app/api/doctor/measure-kinds/route.ts` вызывает `deps.measureKinds` на строках
  29, 54 и 86;
- `buildAppDeps.ts` связывает его с `pgClinicalTestMeasureKindsPort` на строках 931–935 и 1837;
- `pgClinicalTestMeasureKinds.ts` делает table access на строках 45, 58, 67, 86 и 93;
- revised matrix на строке 122 утверждает `no live TS caller found` и `S02 removes tenant grant`.

Это нарушает gates 1 и 3 и повторно открывает прежние F1/F3.

### RF2 — F7: неверная owner-column у `user_web_push_subscriptions`

**Достижимый сценарий и impact.** S05a worker копирует указанный predicate
`platform_user_id = app.current_patient_user_id()`. В target schema таблица содержит `user_id`, но не
`platform_user_id`, поэтому migration падает при создании policy и FORCE wall не устанавливается.

**Evidence.** Revised plan, строка 68, называет `platform_user_id`. Target
`apps/webapp/db/schema/schema.ts:4171-4202` объявляет `userId: uuid('user_id')`, индекс и FK по
`user_id`; `platform_user_id` в таблице отсутствует.

Это нарушает gate 7 и повторно открывает прежний F7.

## Единственный bounded fix-round

Править только `V9B_IMPLEMENTATION_SLICES.md` и соответствующий fix-report:

1. Для `clinical_test_measure_kinds` записать фактический route/DI/repository caller, exact seam,
   S04 adoption evidence и S04 contract revoke. Убрать все противоречащие DAG формулировки S02 revoke из
   global matrix; для каждого живого global caller оставить S02 expand → S04 adoption → S04 revoke.
2. Для `user_web_push_subscriptions` заменить owner predicate на
   `user_id = app.current_patient_user_id()` и повторно сверить все десять FORCE owner columns с schema.

Новая поверхность не требуется; после этого нужен только repeat-check названных RF1/RF2 и итоговый
пересчёт 9 gates.

## Exact read-only commands

Матрицы были посчитаны командами:

```bash
awk '/^## Per-table closure matrix — ten FORCE rows/{s=1;next}/^## Per-table closure matrix — 29/{s=0}s&&/^\| `/{n++}END{print n}' docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md
# 10
awk '/^## Per-table closure matrix — 29/{s=1;next}/^## Per-table closure matrix — nine/{s=0}s&&/^\| `/{n++}END{print n}' docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md
# 29
awk '/^## Per-table closure matrix — nine/{s=1;next}/^## D1 pre-principal/{s=0}s&&/^\| `/{n++}END{print n}' docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md
# 9
sed -n '40,54p' docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md | rg '^\| S(01|02 expand|03|04 contract|05a|05b|05c) \|' | wc -l
# 7
```

Итог gate table посчитан командой:

```bash
sed -n '/^| 1\./,/^$/p' docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES_REAUDIT_REPORT.md | rg -c '\*\*PASS\*\*'
# 6
sed -n '/^| 1\./,/^$/p' docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES_REAUDIT_REPORT.md | rg -c '\*\*FAIL\*\*'
# 3
```

Caller и owner-column проверены на target командами:

```bash
git grep -n -E 'measureKinds|clinicalTestMeasureKinds(Service|Port)?|pgClinicalTestMeasureKinds' e2187503d -- \
  apps/webapp/src/app/api/doctor/measure-kinds \
  apps/webapp/src/app-layer/di/buildAppDeps.ts \
  apps/webapp/src/infra/repos/pgClinicalTestMeasureKinds.ts \
  apps/webapp/src/modules/tests
git show e2187503d:apps/webapp/db/schema/schema.ts | sed -n '4171,4202p'
```
