# Schema dumps (dev, unified Postgres)

Снимки **только DDL** (`pg_dump --schema-only`) с dev-базы **`bcb_webapp_dev`** после `pnpm run migrate`.

| Файл | Схема | Обновлено |
|------|--------|-----------|
| [`integrator_bcb_webapp_dev_schema.sql`](./integrator_bcb_webapp_dev_schema.sql) | `integrator` | 2026-06-10 |
| [`public_bcb_webapp_dev_schema.sql`](./public_bcb_webapp_dev_schema.sql) | `public` | 2026-06-10 |

Переснять на хосте разработки:

```bash
set -a && source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev && set +a
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges -n integrator \
  -f docs/ARCHITECTURE/DB_DUMPS/integrator_bcb_webapp_dev_schema.sql
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges -n public \
  -f docs/ARCHITECTURE/DB_DUMPS/public_bcb_webapp_dev_schema.sql
```

Логическая карта и группировка таблиц — [`../DB_STRUCTURE.md`](../DB_STRUCTURE.md).

**Удалены устаревшие артефакты** (отдельные legacy dev-базы, март–апрель 2026): `integrator_bersoncarebot_dev_schema.sql`, `webapp_bcb_webapp_dev_schema.sql`.
