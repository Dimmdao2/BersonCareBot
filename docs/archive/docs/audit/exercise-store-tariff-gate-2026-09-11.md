# Единый тарифный рубильник домена ЛФК — независимый аудит 11.09.2026

Authority: `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_PLAN.md`, раздел «Тариф и охват (владелец, 11.09 —
отменяет ruling 05.08 #1069)», пункты 22–23. Слайс 1 плана магазина упражнений (taskdb #1103).

- Кандидат: `35faeac3d` («feat(entitlements): gate the full LFK domain by tariff») от базы
  `feat/doctor-ui-rebuild@0322b455d`, клон `/home/dev/dev-projects/bcb-wt-exercise-store-tariff-gate`,
  ветка `wt/exercise-store-tariff-gate`.
- Независимый аудит: роль `auditor-live`, `gpt-5.6-sol` `xhigh` (строго сильнее автора кандидата,
  `gpt-5.6-sol high`), run `/home/dev/brain/runs/agent-port/exercise-store-tariff-gate-audit-20260911T2048.json`,
  сохранённые acceptance-тесты — коммит `3d80fec56`.
- Коррекции ведущего: `ee652825b`.

## Слепой kill-set аудитора: убито 3 / непойманных 0

Аудитор составлял список поломок по authority ДО чтения тестов кандидата (§10b). Три достижимых
дефекта были красными на кандидате и зелёными после коррекций; ни один дефект не был пропущен и позже
найден ведущим.

| # | класс | состояние на `35faeac3d` | состояние на `ee652825b` |
|---|---|---|---|
| 1 | Пациентская сторона не спрашивает тариф | FAIL — `resolveOrganizationWorkspaceModules` строила модули из `ALL_WORKSPACE_MODULES_AVAILABLE`, поэтому `requirePatientWorkspaceModuleForApi` отвечал `ok: true` при выключенном `exercise_catalog`; пациент продолжал видеть уже назначенную программу | PASS — резолвер сужает `rehabilitation` тем же `resolveMechanicAccess`, что и врачебный; тест «refuses the patient rehabilitation API when the organization exercise catalog is disabled» зелёный |
| 3 | Уже назначенные программы у пациента | FAIL — тот же корень, что и #1 | PASS — закрыт тем же сужением |
| 5 | `exercise_packages` — второй независимый переключатель | FAIL — acceptance-тест получал расходящиеся состояния в обе стороны (`{catalog: true, packages: false}` и `{catalog: false, packages: true}`); точечный override оставлял платформенные комплексы включёнными при выключенном каталоге | PASS — `isMechanicIncludedFromSnapshot` сворачивает ключ в `exercise_catalog` ДО поиска override; расхождение невозможно ни в одну сторону |

Следствие #4 («включённый `exercise_catalog` не гарантирует платформенную базу LFK-шаблонов») снято тем
же алиасом: `requireEntitlementForReadAction(workspace, 'exercise_packages')` на страницах
`doctor/lfk-templates` теперь отвечает ровно тем же, чем каталог.

## PASS без правок

- 2 → прямой заход на URL пяти врачебных страниц даёт `NEXT_NOT_FOUND` при выключенной механике.
- 6 → override организации A не течёт на организацию B.
- 9 → легаси-совместимость со старым ключом `clinical_tests` не тронута и не ожила как второй активный
  переключатель.
- 10 → в диффе нет запрещённого скоупа: ни личного тумблера доктора (п.24), ни кабинета автора, ни
  витрины/модерации/биллинга.

## Находка 7 — не дефект кандидата, а свойство чекера по всему репозиторию

Аудитор внёс временный `bulkActions.ts` с экспортируемой мутацией в три каталога и показал, что
`scripts/check-s4-entitlement-coverage.ts` остаётся зелёным. Ведущий воспроизвёл инъекцию на давно
гейтнутом семействе `doctor-broadcasts` — чекер слеп там ровно так же: `PROTECTED_ACTION_FAMILIES`
отбирает файлы по `filePattern` (`actions\.ts$` и т.п.), и любое имя вне конвенции не сканируется ни у
одного семейства. Это не дыра, открытая этим кандидатом, и в плане владельца соответствующего пункта
нет — по §24 это вопрос владельцу/отдельная работа, а не скоуп слайса.

Заявленное кандидатом снятие слепой зоны при этом реально: временный `blindZoneProbeAction` в
`src/app/app/doctor/recommendations/actions.ts` чекер поймал —
`unregistered exported action in mechanic-bearing file`. До кандидата семейства
`doctor/exercises`, `doctor/lfk-templates`, `doctor/recommendations` в `PROTECTED_ACTION_FAMILIES`
отсутствовали и не сканировались вовсе. Обе инъекции откачены, дерево чистое.

## Находка 8 — закрыта по §10a

Зеркальный registry-composition тест («mapping теперь ЕСТЬ») удалён аудитором: он утверждал состав
реестра, а не поведение, и оставался зелёным при снятых продуктовых guard'ах. Реальную силу держит
`tariffMechanics.route.test.ts` — он краснеет при снятии гейтов.

## Проверки на финальном кандидате `ee652825b`

- `pnpm --dir apps/webapp typecheck` — PASS.
- `pnpm --dir apps/webapp exec vitest run src/app-layer/guards src/app-layer/entitlements
  src/modules/org-entitlements src/app/api/tariffMechanics.route.test.ts
  src/app/api/integrator/workspace-module-status` — 256 passed, 1 skipped, 20 файлов.
- `pnpm --dir apps/webapp exec tsx scripts/check-s4-entitlement-coverage.ts` — PASS,
  `206 protected actions mapped`.
- Полный `pnpm run ci` на этом слайсе не гонялся; живой приём владельцем не проводился — «готово»
  этим документом не объявляется.
