# Correction worker — clinic management workspace UI audit #1099

Работай в существующем candidate clone
`/home/dev/dev-projects/bcb-wt-clinic-management-workspace-20260907`, ветка
`wt/clinic-management-workspace-20260907`, от merge-base `ab858f896`. Исправь ровно два MUST FIX из
`docs/REPORTS/CLINIC_MANAGEMENT_WORKSPACE_UI_AUDIT_2026-09-07.md`; весь предыдущий backend scope и принятые
решения сохраняются.

Authority: `AGENTS.md` (сначала карта; затем полностью относящиеся §5, §7, §9–§12, §16–§17, §21–§22, §24),
`docs/_TODO/CLINIC_MANAGEMENT_WORKSPACE_2026-09-07.md` §§3–5, M2/M4/DoD, audit report выше. Owner requirements:
solo не имеет management mode/Team; clinic bound owner/admin может переключать specialist/management;
`appointments.manage_own=false` убирает все specialist-mode действия создания/изменения записи, но не read,
comments, finance или package actions.

Источник оракула: `docs/_TODO/CLINIC_MANAGEMENT_WORKSPACE_2026-09-07.md` — «У solo нет отдельного режима администратора и нет раздела „Команда“»; «Создать собственную запись | `appointments.manage_own` | серверный отказ, действие отсутствует в UI».

## Исправить

1. Management authority должна включать clinic composition, а не только `organization.management`.
   - `/app/manage` direct URL для solo должен перенаправляться в единственный solo Settings/doctor workspace.
   - Mode switch не показывается solo даже если у него есть organization-management capability и specialist
     binding.
   - Clinic bound owner/admin сохраняет switch; management-only clinic member сохраняет management landing.
   - Используй существующий `resolveDoctorWorkspaceComposition` и уже полученные entitlement/seat facts; не
     создавай второй role/composition resolver и не делай клиентский switch authority boundary.

2. Протяни уже server-resolved `appointmentsManageOwn` во все существующие specialist-mode entry points,
   названные аудитом: `DoctorGlobalQuickActions`, `DoctorTodayQuickActions`, `PatientTabRecords`,
   `PatientEncounterStartModal`, и их фактические parents/consumers.
   - При false форма/кнопка/quick action создания записи недоступна до открытия modal/panel, а не только получает
     отказ после submit.
   - Не меняй server mutation guard и не скрывай независимые read/comments/finance/package действия.
   - Расширяй существующий workspace/shell props/context и существующие appointment components. Не заводи второй
     permission lookup, новый визуальный контейнер или дубликат modal/panel.
   - Проверь фактические desktop/mobile/empty-state consumers, чтобы не оставить обход рядом с четырьмя найденными
     точками.

## Границы и проверка

- Worker тесты не пишет и существующие тесты не меняет. Запрещены UI/DOM/text/count/source-shape/format/gate tests.
  Audit fixture/report commit `8fee45039` сохраняется как evidence.
- Не выполнять M5, live UI/dev-server, DEV/TEST migration apply, PROD/deploy, dependency changes, patient UI redesign,
  push или land.
- Максимально переиспользовать существующие doctor shell/workspace/appointment primitives; минимальный coherent diff.
- Запустить formatter только по своим production files, scoped ESLint, webapp typecheck, `git diff --check` и
  retained composition/scope oracle из audit report. Долгие команды — foreground, дождаться результата.
- Закоммитить только явные изменённые production/plan paths (`git add -A` запрещён), subject
  `fix(clinic): close management UI audit #1099`. Рабочее дерево в конце чистое.
- Финал: base/tip, как закрыт каждый finding, изменённые files, reuse decisions, точные команды/результаты и остаток.
  Не объявлять live acceptance и не заканчивать ход в ожидании процесса.
