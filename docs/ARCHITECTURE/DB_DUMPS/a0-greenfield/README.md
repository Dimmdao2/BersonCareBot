# A0 PII-free greenfield baseline

Этот пакет — полный структурный bootstrap для disposable PostgreSQL в CI. Он закрывает prerequisite A0 из
`STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md` и не является способом восстановления DEV, TEST или PROD.

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
2. exact DEV migration-owner в двух reference-catalog policies заменяется на disposable `bcb_a0_owner`.

`btree_gist` в `public` и `pgcrypto` в `app_ext` остаются штатными `CREATE EXTENSION`. Любая новая схема, extension,
policy role, data/PII/credential shape или несовпадение ledger frontier останавливает refresh вместо тихого
запекания drift.
