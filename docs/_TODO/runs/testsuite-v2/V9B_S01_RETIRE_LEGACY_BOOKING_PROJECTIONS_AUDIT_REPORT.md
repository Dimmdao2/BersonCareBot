# V9б S01 — независимый аудит удаления legacy booking projections

Дата: 2026-08-02
Target: `86344858ec5646bd0a3942aafaa82355b5295955` (`refactor(booking): retire legacy booking projections #1081`)

Классификация: одноразовое schema retirement. Проверены diff, структурное итоговое состояние,
migration/journal и разовые gates. Новые test/DB harness не создавались; product, DB/DEV/TEST/PROD,
deploy, taskdb и plan checkbox не менялись.

## Вердикт

**FAIL — 4/5 пунктов PASS.** Пункт 5 не закрыт: обязательный webapp typecheck воспроизводимо
падает на неразрешённых workspace-пакетах до проверки S01-кода. По authority общий PASS невозможен,
пока `pnpm --dir apps/webapp typecheck` не станет зелёным.

| Пункт | Verdict | Evidence |
| --- | --- | --- |
| 1. Пять tables, declarations/backrefs/FK и `0304` | **PASS** | Diff удаляет ровно `booking_branch_services`, `booking_branches`, `booking_services`, `booking_specialists`, `branches`, соответствующие Drizzle declarations/relations/FK и `pgBranches`. `0304` содержит `TEMPORARY LOCAL`; сначала сняты FK `patient_bookings`/`appointment_records`, затем drops идут dependent-first (`booking_branch_services` → `booking_specialists`/`booking_services` → `booking_branches` → `branches`). |
| 2. Canonical booking sources сохранены | **PASS** | В diff нет удалений строк с `patient_bookings`, `appointment_records` или `be_*`; итоговая schema сохраняет обе таблицы и их legacy identifier fields/indices. |
| 3. `pgBranches`/DI удалены, D1/D10 не задеты | **PASS** | `pgBranches.ts` удалён; из `buildAppDeps.ts` убраны только import, factory и returned `branches`. Changed-path census не содержит D1 writer, `writePort`, D10 или `apps/integrator/**`. |
| 4. Grants generator и smoke | **PASS** | Generator excludes all five relations; read-only regenerated output byte-identical committed `p0-5b-grants.sql`; existing `smoke-p0-5b-grants.mjs` завершился `0`. |
| 5. Journal/gates/scope | **FAIL** | `journal`, raw-SQL gate, scoped/full lint, grants smoke и diff scope зелёные. Но required `pnpm --dir apps/webapp typecheck` exits `1`: unresolved `@bersoncare/db-principal`, `@bersoncare/platform-merge`, `@bersoncare/operator-db-schema` trigger the existing downstream TS error cascade. Никакой S01-specific TS error в выводе не установлен, но критерий требует зелёный typecheck. |

## Exact commands

```bash
# Candidate scope and whitespace integrity
git diff --check 86344858e^ 86344858e
git diff-tree --no-commit-id --name-only -r 86344858e

# Exact final-source absence (all exit 0)
if rg -n -e '\b(bookingBranches|bookingBranchServices|bookingServices|bookingSpecialists|createPgBranchesProjectionPort|BranchesProjectionPort|pgBranches)\b' apps/webapp/src apps/webapp/db/schema; then exit 1; fi
if rg -n -e '\b(booking_branch_services|booking_branches|booking_services|booking_specialists)\b' apps/webapp/src apps/webapp/db/schema; then exit 1; fi
if rg -n -e "pgTable\(['\"]branches['\"]" apps/webapp/db/schema; then exit 1; fi
test ! -e apps/webapp/src/infra/repos/pgBranches.ts

# Preservation: zero deleted canonical-booking lines (exit 0)
! git diff --unified=0 86344858e^ 86344858e -- apps/webapp/db/schema apps/webapp/src apps/integrator/src | rg -n '^-.*\b(patient_bookings|appointment_records|be_[a-z_]+)\b'

# Journal/tag/file agreement (exit 0)
node --input-type=module -e "import fs from 'node:fs'; const j=JSON.parse(fs.readFileSync('apps/webapp/db/drizzle-migrations/meta/_journal.json','utf8')); const e=j.entries.at(-1); if(e.idx!==304||e.tag!=='0304_retire_legacy_booking_projections_local'||!fs.existsSync('apps/webapp/db/drizzle-migrations/'+e.tag+'.sql')) throw new Error(JSON.stringify(e)); console.log(JSON.stringify(e));"
bash apps/webapp/scripts/check-drizzle-journal-sync.sh

# Required gates
node scripts/check-no-new-raw-sql.mjs
pnpm --dir apps/webapp exec eslint db/schema/schema.ts db/schema/relations.ts src/app-layer/di/buildAppDeps.ts
pnpm --dir apps/webapp lint
pnpm --dir apps/webapp typecheck
node docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs | cmp -s - deploy/postgres/p0-5b-grants.sql
node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-5b-grants.mjs
```

Observed exits: raw-SQL `0`; journal `0`; scoped lint `0`; full webapp lint `0` (two pre-existing
unused-disable warnings, no errors); generator comparison `0`; grants smoke `0`; webapp typecheck `1`.

Typecheck blocker starts with:

```text
db/schema/operatorHealth.ts(7,8): error TS2307: Cannot find module '@bersoncare/operator-db-schema'
scripts/run-a1-rls-conformance.ts(4,68): error TS2307: Cannot find module '@bersoncare/db-principal'
src/app-layer/integrator/messengerPhoneHttpBindExecute.ts(25,8): error TS2307: Cannot find module '@bersoncare/platform-merge'
```

No product correction was made by the auditor.
