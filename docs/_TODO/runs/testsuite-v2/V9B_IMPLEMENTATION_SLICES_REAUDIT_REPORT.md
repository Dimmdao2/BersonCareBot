# В9б — fix-report RF1/RF2 исполнимой декомпозиции tenant-wall

Дата: 2026-08-02

Проверенный artifact: текущий `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md`.

Классификация: разовая docs-only security/deploy inspection. Product-тесты, миграции,
DB/DEV/TEST/PROD/deploy, taskdb/checkbox и push не выполнялись.

## Вердикт

**PASS: 9/9 gates PASS.** Bounded fix исправляет только RF1/RF2; остальные семь
первичных gate evidence повторно не расширялись.

| Gate | Verdict | Evidence |
| --- | --- | --- |
| 1. `10 + 29 + 9` closure matrices | **PASS** | Матрицы содержат соответственно 10/29/9 строк. `clinical_test_measure_kinds` теперь называет живой route → DI → repository caller, три exact catalog seams, S04 adoption evidence и только затем S04 revoke. |
| 2. Existing D1 writer | **PASS** | План включает `writeIdentityAndPreferencesDirect.ts`, `writePort.ts`, existing tests и grant overlay; запрещает второй writer; D10 явно не prerequisite. |
| 3. Expand → adopt → contract | **PASS** | Для `clinical_test_measure_kinds` S02 только expands/`EXECUTE`; S04 переводит `pgClinicalTestMeasureKindsPort` на три exact seams и доказывает GET/POST/PATCH, после чего S04 revokes direct ACL. S02 revoke для этого живого caller отсутствует. |
| 4. Backfill fail-closed | **PASS** | S03 aborts всю migration при любом non-zero reason; quarantine relation и удаление/denial booking rows явно запрещены. |
| 5. S01 readiness | **PASS** | `WAIT_OVERLAP`/owner gate отсутствуют; S01 — `READY NOW`, collision condition измеряется active branch + SHA + `buildAppDeps.ts` path/hunk. |
| 6. Exact A1/TEST actors | **PASS** | Названы существующие TEST logins и пять terminal operational roles; `app_worker` явно запрещён как oracle/fallback. |
| 7. FORCE predicates | **PASS** | `user_web_push_subscriptions` использует существующий `user_id = app.current_patient_user_id()`; повторная exact-сверка всех десяти FORCE owner columns с schema совпала. |
| 8. Seven migration files | **PASS** | Таблица file assignment содержит ровно S01/S02/S03/S04/S05a/S05b/S05c; S06/S07 определены как harness/TEST evidence без migration. |
| 9. First-worker S01 | **PASS** | Brief удаляет только пять legacy projections и явно сохраняет canonical `be_*`, `patient_bookings`, `appointment_records`, D1 writer и D10; product wall запрещён до audit PASS. |

## Named findings

### RF1 — F1/F3: fixed live global caller and revoke order

**Исправление.** Global row теперь фиксирует живой `GET/POST/PATCH /api/doctor/measure-kinds` →
`buildAppDeps().measureKinds` → `pgClinicalTestMeasureKindsPort` путь (`SELECT`, idempotent
label `SELECT/INSERT`, bulk `UPDATE`). S02 создаёт три named `SECURITY DEFINER` catalog seams;
S04 переводит port на них и требует green adoption evidence для всех трёх route operations,
лишь затем S04 отзывает direct ACL. Формулировок S02 revoke для этой таблицы больше нет.

**Evidence.** Current-worktree `git grep` named the route, DI construction/returned
`measureKinds` dependency and repository. The global row carries the exact S02 → S04
adoption → S04 revoke order.

### RF2 — F7: fixed owner-column у `user_web_push_subscriptions`

**Исправление.** S05a теперь задаёт
`user_id = app.current_patient_user_id()`, совпадающий с единственной owner-column этой
таблицы. Таблица всех десяти FORCE rows повторно сверена с их schema declarations.

**Evidence.** `userWebPushSubscriptions` declares `userId: uuid('user_id')`; there is no
`platform_user_id` in that relation. The other nine owner predicates retain their matching
`organization_id`, `platform_user_id`, `id`, or `user_id` declarations.

## Выполненный bounded fix-round

Править только `V9B_IMPLEMENTATION_SLICES.md` и соответствующий fix-report:

1. Для `clinical_test_measure_kinds` записаны фактический route/DI/repository caller, three exact seams,
   S04 GET/POST/PATCH adoption evidence и S04 contract revoke. Global matrix теперь задаёт
   S02 expand → S04 adoption → S04 revoke.
2. Для `user_web_push_subscriptions` owner predicate исправлен на
   `user_id = app.current_patient_user_id()`; все десять FORCE owner columns сверены с schema.

Новая поверхность не требуется. Repeat-check RF1/RF2 и итоговый пересчёт дали `9/9 PASS`.

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
# 9
sed -n '/^| 1\./,/^$/p' docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES_REAUDIT_REPORT.md | rg -c '\*\*FAIL\*\*'
# 0
```

Caller и owner-column проверены в current worktree командами:

```bash
git grep -n -E 'measureKinds|clinicalTestMeasureKinds(Service|Port)?|pgClinicalTestMeasureKinds' -- \
  apps/webapp/src/app/api/doctor/measure-kinds \
  apps/webapp/src/app-layer/di/buildAppDeps.ts \
  apps/webapp/src/infra/repos/pgClinicalTestMeasureKinds.ts \
  apps/webapp/src/modules/tests
sed -n '4171,4202p' apps/webapp/db/schema/schema.ts
```
