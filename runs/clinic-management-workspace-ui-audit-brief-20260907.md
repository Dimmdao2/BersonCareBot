# Тест или взгляд — independent audit UI completion #1099

Независимо проверь новую UI/composition поверхность commit `1738f2243` в
`/home/dev/dev-projects/bcb-wt-clinic-management-workspace-20260907`, ветка
`wt/clinic-management-workspace-20260907`. Предыдущий blind audit `39271e811` покрывает backend composition и
doctor own-scope; не повторяй его. Новая поверхность — mode switch/nav, Settings/profile placement и specialist
read-only UI.

Authority: `AGENTS.md` (карта, затем полностью §5, §9, §10a, §10b, §11, §16–§17, §21–§22, §24),
`docs/_TODO/CLINIC_MANAGEMENT_WORKSPACE_2026-09-07.md` M2–M4/M6/DoD,
`docs/REPORTS/CLINIC_MANAGEMENT_WORKSPACE_AUDIT_2026-09-07.md`, commit range `c0e6d294f..1738f2243`, doctor UI
style guide и существующие canonical doctor pages/components.

## Сначала классификация

- Mode/nav landing и permission plumbing, если проверяются как повторяемая server/component function behavior,
  могут использовать существующий unit/route oracle. Новый тест допустим только после blind fault и fault
  injection по §10b.
- Видимость/расположение switch, меню, вкладок, кнопок, mobile/desktop composition, reuse containers, тексты и
  timezone geometry — только взгляд по diff/AST/rg. Не писать UI/DOM/text/count/source-shape tests.
- Не выполнять live visual walkthrough: владелец оставил его за собой после landing на DEV.

## Blind faults новой поверхности

- Solo получает management mode/Team либо теряет единый Settings.
- Clinic specialist видит clinic management link, catalog/package-template writer или может открыть management
  direct URL без authority.
- Bound owner/admin не может переключиться между specialist/management mode; management-only user зацикливается
  на doctor landing или видит specialist mode.
- Management desktop/mobile nav ведёт наружу в clinical hidden Setup или оставляет недостижимыми Team, catalog,
  online booking, clinic settings, billing и specialist profile.
- Specialist profile description пишет account/копию вместо существующей specialist entity.
- `appointments.manage_own=false` оставляет доступный create/reschedule/cancel/delete/no-show action в любом
  calendar/panel/mobile entry; либо ошибочно скрывает read/comments/finance/package.
- `availability.manage_own=false` оставляет add/edit/delete own schedule/absence; `true` открывает CRUD общих
  templates вместо только применения.
- Создан новый визуально эквивалентный shell/container вместо reuse либо doctor/patient UI import boundary нарушен.
- Timezone picker/data переписаны вместо минимального общего component geometry fix.

## Проверки и границы

- Прочитать весь candidate diff и фактические consumers props, не принимать worker summary как evidence.
- Проверить прямые route guards для `/app/manage`, `/app/settings` и doctor landing; navigation не является
  authority.
- Проверить, что management sections имеют один существующий component/API writer и нет второго Schedule Setup
  writer в clinic specialist mode.
- Webapp typecheck обязан относиться к итоговому tree. Разрешена только механическая правка typed fixtures в
  существующих test files для новых обязательных context fields; это не повод ослаблять production types или
  добавлять UI assertions. Workspace package build/link проблему диагностировать точной командой; dependencies не
  менять.
- Запустить retained composition/scope oracle и scoped lint/prettier/diff check. Full CI не запускать.
- Не править production code. Временный fault injection полностью откатить. Не выполнять M5, DEV migration apply,
  dev-server, live UI, PROD/deploy, push/land.

## Результат

- Создать/обновить `docs/REPORTS/CLINIC_MANAGEMENT_WORKSPACE_UI_AUDIT_2026-09-07.md` с PASS/FAIL, точными SHA,
  test/view table, commands/results, fault injections и только достижимыми findings с impact/authority.
- Коммитить только допустимые acceptance tests, необходимые typed test fixtures и audit artifact явными путями;
  `git add -A` запрещён. Subject `test(clinic): audit management workspace UI (#1099)`.
- Если постоянные тестовые изменения не нужны, коммитить только artifact как `docs(audit): ... (#1099)`.
- Финал: verdict, commit SHA, findings, точные проверки и подтверждение clean tree. Не заканчивать ход в ожидании.
