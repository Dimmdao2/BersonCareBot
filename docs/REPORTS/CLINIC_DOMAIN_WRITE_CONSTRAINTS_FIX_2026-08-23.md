# B1a: цифровая метка на DB boundary — 23.08.2026

Оракул: `THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, `B1a`.

## Исправление

`20260823T011000_reject_numeric_organization_slug_claims.sql` добавляет
`organization_slug_claims_slug_numeric_check` с `CHECK (slug !~ '^[0-9]+$')`.
Существующий `organization_slug_claims_slug_reserved_check` остаётся единственным хранителем перечня
служебных меток: новый файл не копирует этот список. Гранты, роли и privilege declarations не изменялись.

## DEV и откат

В точном worktree выполнены штатные:

```bash
bash deploy/host/migrate-dev.sh --preflight
bash deploy/host/migrate-dev.sh --execute
```

Оба завершили pending migration `20260823T011000_reject_numeric_organization_slug_claims.sql`; preflight
откатил DDL, execute закоммитил его в `bcb_webapp_dev`. Откат допускается только на DEV отдельной
timestamped follow-up migration, которая удаляет `organization_slug_claims_slug_numeric_check`, через те
же `--preflight` и `--execute`; ручной `psql`-накат не используется.

## Проверки

```bash
RUN_CLINIC_DOMAIN_WRITE_CONSTRAINTS_DB=1 node --test deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs
```

Результат: `3 pass, 0 fail`. Независимая rollback-only инъекция `ALTER TABLE ... DROP CONSTRAINT
organization_slug_claims_slug_numeric_check` внутри транзакции теста дала `2 pass, 1 fail`; rollback
вернул constraint, что подтверждено catalog probe.

Также зелёные: `pnpm --dir apps/webapp run typecheck`, scoped ESLint для DB proof, три B1 unit test files,
`node scripts/check-migration-privileges.mjs`, его `--self-test` и migration-order gate.

## OWNER QUESTION — вне scope

Плановое «и т.п.» не задаёт исчерпывающий набор служебных меток. Нужно решение владельца, включать ли
`mta-sts`, `mx`, `mta`, `relay`, `webmail`, `ns`, `www1`, `www2`. В этой правке они намеренно не добавлялись.
