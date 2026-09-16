# Correction worker brief — clinic management workspace #1099

Работай одним stateful проходом в `/home/dev/dev-projects/bcb-wt-clinic-management-workspace-20260907`, ветка
`wt/clinic-management-workspace-20260907`. Это исправление независимо проверенного FAIL и завершение уже
порученного candidate, не новый scope.

Authority:

1. `AGENTS.md`: карта заголовков, затем полностью §1, §5, §7, §9–§12, §16–§17, §21–§22, §24.
2. `docs/_TODO/CLINIC_MANAGEMENT_WORKSPACE_2026-09-07.md`: текущий candidate M1–M4/M6 и M7.
3. `docs/REPORTS/CLINIC_MANAGEMENT_WORKSPACE_AUDIT_2026-09-07.md`: два MUST FIX и сохранённый oracle.
4. `docs/_TODO/CLINIC_SCHEDULE_ROLE_SCOPE_1028.md`, doctor UI guide и существующие module docs.

## Обязательный результат

- Исправить `solo|clinic` composition точно по §3.1: team entitlement ИЛИ configured effective seat limit >1
  дают clinic; retained team/invites сохраняют clinic после downgrade; legacy unconfigured без команды остаётся
  solo. Использовать один resolver, не второй параллельный гейт.
- Удалить dead links management Catalog/Online booking. Собрать реально достижимые management sections из уже
  существующих Team, branches, services, specialists, packages, public form, rules, notifications, payments,
  integrations, branding и billing components. Одинаковая настройка имеет один existing component/API writer;
  не копировать Schedule Setup и не возвращать clinic-admin writer в specialist schedule.
- Довести до конца заявленную воркером незавершённую перекомпоновку Settings:
  - solo видит единый Settings без Team/admin mode и целевую структуру плана;
  - clinic specialist не видит catalog/clinic settings/package-template writers;
  - owner/admin получает отдельный management mode и переключатель при specialist binding;
  - management-only пользователь попадает прямо в management mode;
  - specialist description редактирует существующую specialist entity в правильном solo/clinic месте.
- Довести UI read-only до server authority: при `appointments.manage_own=false` скрыть/отключить все create,
  reschedule, cancel, delete, no-show actions; при `availability.manage_own=false` скрыть/отключить own schedule
  mutations. Read/comments/financial/package actions не блокировать этим флагом. Общий template CRUD остаётся
  только management authority.
- Исправить любые оставшиеся production type/mapping gaps, но не ослаблять типы optional-полями ради fixtures.
- Проверить миграционный шов после последних merge изменений privilege declaration; не дублировать чужие
  custom-domain surfaces.
- `DoctorTimezoneSelect` оставить общей реализацией; только ранее локализованная geometry/integration correction,
  без нового picker/data.

## Запреты

- M5 и многоспециалистный calendar не выполнять; dependencies и самописный substitute запрещены.
- Не создавать и не изменять тесты. Сохранённые acceptance tests принадлежат аудитору; только запускать их.
- Никаких UI/DOM/text/count/source-shape/format/gate tests.
- Не делать live visual walkthrough, не запускать общий dev-server, не применять migration на DEV/TEST, не
  трогать PROD/deploy runtime, patient UI, integrator или global platform-admin.
- Не заканчивать ход при незавершённых Settings/UI действиях, которые первый воркер явно назвал оставшимися.

## Проверки и сдача

- Сначала запустить красный composition oracle из audit report и довести тот же тест до green production fix.
- Затем targeted own-scope tests из audit commit, webapp typecheck, scoped ESLint/formatter и `git diff --check`.
- Для migration выполнить owner-aware rollback-only candidate preflight без DEV apply и нужные privilege
  generation/checks по §1; назвать точные команды и результаты.
- Не запускать full CI без обнаруженного repo-level integration риска.
- Обновить чекбоксы плана только по фактически законченным пунктам, с evidence в тех же строках; M5 оставить
  открытым owner-blocked.
- Коммитить только явные task paths (`git add -A` запрещён), message с `#1099`, не push/land.
- Финал: base/tip/commits, что переиспользовано, что стало достижимо в solo/clinic UI, точные проверки, migration
  evidence, оставшиеся blockers. Дерево чистое; не завершать ход в ожидании процесса.
