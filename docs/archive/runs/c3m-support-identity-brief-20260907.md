# C3M worker B — organization-scoped support identity

Read `AGENTS.md` by route before any action: full migration section in §1, §4a, §5, §10/§10a/§10b, §12 and §24. Read `README.md`, `docs/RULES/SAAS_FOUNDATION_AWARE_DEVELOPMENT.md`, `deploy/postgres/privileges/README.md`, and the full C3M section in `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`.

Taskdb workstream: `#1098`. Authority is `docs/OWNER_DECISIONS.md` and this exact checklist item:

- **C3M-02 — organization-scoped client controls.** `Закрепить onSupport как единственный источник группы «Избранные / На сопровождении»; исправить composite identity support profile, миграцию/backfill/ambiguity report, ports/infra/in-memory parity и tenant negatives до добавления новых client overrides. Не создавать отдельный favorite.`

This worker implements the product/schema correction only. Lead closes the checkbox after independent audit and pre-landing evidence.

## Required behavior

1. `doctor_patient_support.on_support` remains the sole support/favorite-group property. Do not add `favorite`, another group, another star state, another support profile, or terminology UI.
2. Support profile identity becomes exact `(organization_id, patient_user_id)`. All reads, creates, updates and upserts must require and use the proven organization principal/context plus patient id; no fallback to first/single organization.
3. Bring module ports, service/application callers, PostgreSQL repo and in-memory repo parity to the composite identity. Do not expose infra types to modules and do not call DB outside the port.
4. Make `organization_id` non-null only through a forward timestamp migration that preserves deterministic existing data. Inspect current schema, callers and existing migration conventions first. Any row that cannot be assigned to exactly one organization must not be copied or guessed; the migration/preflight must report/refuse ambiguity in the established repo pattern.
5. Replace the unique patient-only index with the composite unique identity and keep the indexes needed by exact-org lookups. Do not add a new table.
6. Do not add chat/comments/media/portal overrides yet; do not alter their product semantics in this worker. Preserve existing data and behavior within the correct organization.
7. No UI, navigation, terminology, symptoms, encounters, medical-record, tariffs, billing, presets or unrelated cleanup.

## Mandatory architecture/migration constraints

- `AGENTS.md` §5: «К базе — только через порт своего приложения на drizzle» and «Там, где к чувствительному ресурсу или проверке ведёт несколько путей, оставлять ОДИН общий проход». Parameterize the existing doctor-client support port/repository path; do not create a sibling repo/service.
- Migration filename is UTC timestamp format; every statement has the required owner/backfill marker and verification probe. No `GRANT`, `REVOKE`, role or policy statements in migrations. Privileges live only in `deploy/postgres/privileges/declaration.ts`; change it only if the altered object truly needs a declaration change.
- Do not apply a migration, touch DEV/TEST/PROD, create a disposable DB, or run owner-aware preflight in this isolated worker. Report those as pre-landing auditor/lead work.

## Test policy and validation

The product worker writes **no tests** (`AGENTS.md` §10b). The independent auditor will derive tenant-negative kill-set before reading tests and may add the minimum behavioral/DEV proof. Do not add source-text, migration-SQL-text, UI or implementation-detail tests. Run only existing targeted tests for the touched support port/service/repositories, migration-order/generator checks required by the migration, webapp typecheck and scoped lint. No full CI.

Inspect the final diff, run `git diff --check`, and commit only explicit in-scope paths with a message containing `#1098`, why, evidence, `C3M-02`, and what remains (independent audit + owner-aware preflight). Never `git add -A`; do not push. Work in one turn and do not finish before the commit exists.
