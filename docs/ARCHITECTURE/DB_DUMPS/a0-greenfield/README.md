# A0 PII-free greenfield baseline

Этот пакет — полный структурный bootstrap для disposable PostgreSQL в CI. Он закрывает prerequisite A0 из
`STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md` и не является способом восстановления DEV, TEST или PROD.

**Граница доказательства:** A0 доказывает только воспроизводимость DDL, migration ledgers и минимального
синтетического seed на чистом PostgreSQL. Он намеренно не создаёт canonical runtime ACL/role memberships и не
доказывает RLS от имени прикладных principals. Это задача A1: provision canonical roles/ACL/context, включить
locked/FORCE RLS и выполнить positive/negative matrix от имени non-owner `app_staff` / `app_patient` principals.
Disposable owner `bcb_a0_owner` имеет только bootstrap/migration назначение; использовать его как RLS-conformance
principal запрещено, потому что owner таблиц способен обходить обычный RLS.

## Состав

- `schema.sql` — полный `pg_dump --schema-only --no-owner --no-privileges --no-comments` подготовленной локальной
  `bcb_webapp_dev`: схемы `app`, `app_ext`, `drizzle`, `integrator`, `public`, включая функции, constraints, индексы,
  triggers и RLS policies. Строк данных нет.
- `migration-manifest.json` — hashes миграций, вычисленные из committed integrator discovery и webapp Drizzle
  journal/SQL. Mutable строки ledger из DEV в manifest не копируются.
- `seed.sql` — минимальная детерминированная миграционная fixture: одна синтетическая `.test` identity без телефона,
  canonical historical organization/specialist IDs, owner membership, одна запись и courses override. Она также
  добавляет пустой reference-catalog baseline, нужный текущему organization INSERT hook.

Исторический guard `0204` был привязан к реальному телефону владельца. Он уже представлен записью Drizzle ledger и
на greenfield не переигрывается: реальный телефон в seed запрещён. Нужное post-migration состояние создаётся напрямую
с синтетической identity.

## Проверка

Статический gate сверяет hashes, append-only prefix обоих migration sources, census, допустимые схемы/расширения и
отсутствие data sections, ACL/OWNER, environment roles, email/phone PII и credential-shaped строк:

```bash
pnpm run check:saas-a0-greenfield-baseline
```

Disposable proof создаёт приватный `/tmp/bcb_saas_a0_verify_*` cluster только на Unix socket, очищает ambient
`PG*`/`DATABASE_URL`, восстанавливает baseline, проверяет ноль строк во всех 242 таблицах, загружает manifest+seed,
запускает штатный `scripts/migrate-all.sh`, сверяет полные ledgers и удаляет cluster даже при ошибке/сигнале:

```bash
pnpm run verify:saas-a0-greenfield-baseline
pnpm run test:saas-a0-signal-cleanup
```

Нулевое число pending migrations сразу после refresh нормально. Новые append-only миграции разрешены: verifier
применит хвост поверх baseline. Изменение или вставка в середину уже зафиксированной истории считается drift и
останавливает gate.

## Осознанный refresh

Refresh разрешён только отдельной schema-stage после проверки, что подготовленная локальная DEV-схема соответствует
текущей ветке. Это не шаг обычного code deploy и не повод reset/restore рабочей базы. Команда читает только metadata
точной локальной `bcb_webapp_dev`; URL валидируется, но не печатается. Защищённые `app` tables требуют локального
read-only `postgres` operator transport для `pg_dump`.

```bash
node scripts/refresh-a0-greenfield-baseline.mjs \
  --confirm-local-dev-schema-refresh \
  --env-file=/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
pnpm run check:saas-a0-greenfield-baseline
pnpm run verify:saas-a0-greenfield-baseline
```

Generator делает только две детерминированные нормализации:

1. случайный `pg_dump` `\restrict` token заменяется на фиксированный repo token;
2. роль, реально владеющая `reference_catalog_seed_owner` policies (`provisioning_owner` из
   `deploy/postgres/reference-catalog-rls.sql` — owner `app.provision_specialist_owner`/
   `app.seed_reference_catalog_snapshot`, запрошенный напрямую у DEV через `pg_get_userbyid(proowner)`),
   заменяется на disposable `bcb_a0_owner`. Роль подключения `DATABASE_URL` для этого не используется —
   она может отличаться от роли-владельца policies.

Перед чтением БД refresh fail-closed проверяет, что migration directories, Drizzle journal и A0 generator files
чисты относительно `HEAD`. Manifest строится из exact committed tree записанного `sourceCommit`, а checker повторно
хеширует каждый migration file именно из этого commit; mutable worktree не может незаметно изменить baseline.
Privileged metadata read запускает только absolute root-owned PostgreSQL binaries из `/usr/lib/postgresql`, с
фиксированным очищенным `PATH`, а не с `PATH` вызывающего пользователя. Role normalization допускает ровно шесть
известных позиций в двух `reference_catalog_seed_owner` policies и останавливается при любой иной форме/позиции.

`btree_gist` в `public` и `pgcrypto` в `app_ext` остаются штатными `CREATE EXTENSION`. Любая новая схема, extension,
policy role, data/PII/credential shape или несовпадение ledger frontier останавливает refresh вместо тихого
запекания drift.
