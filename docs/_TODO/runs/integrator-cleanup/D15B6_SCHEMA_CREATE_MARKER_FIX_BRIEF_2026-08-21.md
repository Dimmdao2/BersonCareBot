# D15b/6 — close the named-DEV schema CREATE preflight failure

Роль: same-branch worker/fixer в `wt/d15b6-audit-20260821`. Это механическое исправление сохранённого live
finding, не новый audit-cycle и не применение миграции.

Перед действием прочитать карту `AGENTS.md`, затем §1/§1b migration markers, §5, §7, §9–§10 и §24; прочитать
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/HOST_DEPLOY_README.md`, сохранённый результат
`D15B6_CANDIDATE_NAMED_DEV_PREFLIGHT_RETRY2_RESULT_2026-08-21.md` и повторить поиск более поздних решений в
`docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`, текущем `WORK_ORDER.md`. Сначала
`code-search`, затем точный `rg`. Более позднее owner-решение заменяет этот brief.

Источник оракула: `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` — «It then failed at the first `CREATE OR REPLACE FUNCTION app.*` with `permission denied for schema app`».

## Scope и точное исправление

- Единственный production path: `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql`.
- Для каждого statement этой миграции, который выполняет `CREATE OR REPLACE FUNCTION app.*`, добавить ровно
  `-- BCB-MIGRATION-SCHEMA-CREATE: app` сразу после существующего `-- BCB-MIGRATION-OWNER: ...` и до
  `-- BCB-MIGRATION-LANGUAGE-USAGE: ...`, как в соседних timestamp-forward миграциях.
- Ожидаемый census: 34 function statements; после исправления у каждого из них ровно один schema-create marker.
- Не менять SQL bodies, signatures, owners, languages, statement breakpoints, backfill, constraints, VERIFY,
  порядок statement или другие файлы продукта. Не добавлять GRANT/REVOKE и не менять migrator/wrapper.
- Создать результат
  `docs/_TODO/runs/integrator-cleanup/D15B6_SCHEMA_CREATE_MARKER_FIX_RESULT_2026-08-21.md` с exact census,
  diff и командами.

## Проверки

- Повторить релевантные статические migration/parser/order/privilege gates из принятого D15b/6 evidence.
- Точный структурный census доказывает 34/34 корректно упорядоченных marker blocks и отсутствие marker у
  statement, который не создаёт/заменяет функцию `app.*`.
- `git diff --check` и exact diff inspection.
- Не обращаться к DB вообще: запрещены прямой `psql`, wrapper preflight/execute/reapply, ручной SQL, fixture,
  disposable DB, DEV/TEST/PROD, landing, deploy, push и full CI. Повторный rollback-only named-DEV preflight
  после статического PASS запускает отдельно lead/auditor-live по exact candidate SHA.

Закоммитить только migration и result path явным staging, без `git add -A`. В конце сообщить SHA, census,
команды/exit codes и `NOT DONE: candidate named-DEV rollback-only preflight / landing / execute / D31 combined preflight / TEST / deploy / push / full CI`.
