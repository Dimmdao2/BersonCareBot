# Fixture retirement — classify and close the remaining current-plan references

Роль: same-branch worker/fixer в `wt/live-fixtures-retirement-20260821`. Это последний active-reference pass по
результату `2b42f5aaf`; не новый blind audit и не новая fixture machinery.

Перед действием прочитать карту `AGENTS.md`, §0, §1/§1a/§1b, §7, §10a, §12 и §24; прочитать
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §10–§11, `docs/OWNER_DECISIONS.md`, актуальный `WORK_ORDER.md` и
`LIVE_DEV_TEST_FIXTURES_RETIREMENT_2026-08-21.md`. Повторить поиск более поздних owner-решений: сначала
`code-search`, затем exact active-path census. Более позднее owner-решение заменяет brief.

Источник оракула: `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` —
«corrects only future persistent-fixture/authenticated-preset instructions and leaves historical reports/evidence/completed records plus local test inputs intact».

## Scope и классификация

- Проверить все оставшиеся matches из lead census после `2b42f5aaf` только вне `docs/archive/**`,
  `docs/REPORTS/**`, audit/evidence/log artifacts и завершённых `[x]` historical records.
- Особо классифицировать активные-looking ссылки в:
  `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-03.md`,
  `docs/_TODO/audits/CUTOVER_COMPLETENESS_AUDIT_2026-08-15.md`,
  `docs/_TODO/NIGHT_PLAN_2026-07-26.md`,
  `docs/DOCTOR_UI_REBUILD_REVIEW/PATIENT_PAGE_BUILD_PLAN.md` и active SAAS roadmap/checklists.
- Если строка является текущей будущей инструкцией, удалённым executable script/callsite или незакрытым
  checkbox, заменить её на обычный вход уже зарегистрированной owner-учётки/клиники либо закрыть отменённую
  fixture-задачу правильным checkbox/evidence. Не строить replacement helper/runbook/seed.
- Если строка только фактическая история выполненного прогона, audit evidence или завершённый `[x]` результат,
  оставить неизменной и перечислить как historical-only в result.
- Active fixture instruction внутри вне-scope owning plan не оставлять молча: этот brief разрешает правку только
  самой противоречащей строки/checklist status, без расширения соседнего product scope.
- Обновить `LIVE_DEV_TEST_FIXTURES_RETIREMENT_2026-08-21.md` exact census и changed paths.

## Acceptance

- В active rules/runbooks/plans/checklists/executable scripts нет будущей инструкции создавать/сидировать/
  reconcile persistent fixture actor, запускать удалённый script или входить через authenticated `dev:*` preset.
- Historical evidence/log/report/archives остаются неизменными; tests, где слово fixture означает локальный
  test input или structural fault-injection, не удалять.
- Никаких новых helper, fixture, account, seed, env/password/cookie machinery, DB write или auth path.
- Только syntax check реально изменённых retained scripts, затем `git diff --check`; без DB/DEV/TEST/PROD,
  live login, migration, deploy, push и full CI.
- Явный staging только related paths, без `git add -A`. Commit сообщает SHA, классификацию, команды/exit codes и
  `NOT DONE: rebuild platform-merge / candidate ordinary owner-login live gate / landing / TEST deploy / push / full CI`.
