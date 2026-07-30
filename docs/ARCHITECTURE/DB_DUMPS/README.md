# Schema dumps (dev, unified Postgres)

Снимки **только DDL** (`pg_dump --schema-only`) с dev-базы **`bcb_webapp_dev`** после `pnpm run migrate`.

| Файл                                                                             | Схема        | Обновлено  |
| -------------------------------------------------------------------------------- | ------------ | ---------- |
| [`integrator_bcb_webapp_dev_schema.sql`](./integrator_bcb_webapp_dev_schema.sql) | `integrator` | 2026-06-10 |
| [`public_bcb_webapp_dev_schema.sql`](./public_bcb_webapp_dev_schema.sql)         | `public`     | 2026-06-10 |

Переснять на хосте разработки:

```bash
set -a && source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev && set +a
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges -n integrator \
  -f docs/ARCHITECTURE/DB_DUMPS/integrator_bcb_webapp_dev_schema.sql
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges -n public \
  -f docs/ARCHITECTURE/DB_DUMPS/public_bcb_webapp_dev_schema.sql
```

Логическая карта и группировка таблиц — [`../DB_STRUCTURE.md`](../DB_STRUCTURE.md).

---

## DEV: без restore/refresh

Решением владельца 2026-07-30 TEST→DEV refresh и пересоздание `bcb_webapp_dev` удалены из рабочего процесса.
Обычная разработка сохраняет существующую DEV-БД; pending общие миграции применяются через:

```bash
bash deploy/host/migrate-dev.sh --preflight
bash deploy/host/migrate-dev.sh --execute
```

Wrapper проверяет точные локальные `bcb_webapp_dev`/`bcb_webapp_dev_user` и не выполняет dump, restore, reset,
role/ACL repair или RLS acceptance. Fresh-copy доказательства выполняются только в отдельной disposable-БД по
[`HARD_MIGRATION_PROTOCOL.md`](../../_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md).

---

## PII-free greenfield baseline для ephemeral CI

Полный CI-only структурный baseline хранится отдельно в
[`a0-greenfield/`](./a0-greenfield/README.md). Он не заменяет два исторических DEV schema dumps выше и не является
runbook для DEV/TEST/PROD restore. Пакет содержит полный текущий DDL всех пяти application schemas, repo-derived
manifest integrator+Drizzle ledgers и минимальный синтетический `.test` seed.

A0 проверяет только DDL/migration reproducibility. Следующий A1 отдельно создаёт canonical ACL/runtime roles и
memberships/context, включает locked/FORCE режим и проверяет RLS от имени non-owner principals. Bootstrap-owner
`bcb_a0_owner` для RLS-conformance не используется.

Проверка и disposable restore выполняются командами:

```bash
pnpm run check:saas-a0-greenfield-baseline
pnpm run verify:saas-a0-greenfield-baseline
```

Refresh выполняется только как отдельная осознанная schema-stage по инструкции пакета. Обычный deploy кода,
incremental migration или запуск тестов baseline автоматически не переснимают.

**Удалены устаревшие артефакты** (отдельные legacy dev-базы, март–апрель 2026): `integrator_bersoncarebot_dev_schema.sql`, `webapp_bcb_webapp_dev_schema.sql`.
