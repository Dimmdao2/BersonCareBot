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

---

## Пересоздание dev-базы из prod-дампа (refresh `bcb_webapp_dev`)

**Когда:** нужно обновить данные dev на свежий прод-снапшот, либо `bcb_webapp_dev` повреждена/дропнута.

**Контекст хоста:** prod и dev живут в **одной** PostgreSQL `127.0.0.1:5432` (`bcb_webapp_prod` + `bcb_webapp_dev`). Прод трогать нельзя. Почасовые прод-дампы: `/opt/backups/postgres/hourly/unified_bcb_webapp_prod_*.dump` (custom format).

### Грабли (почему «просто залить дамп» ломается)

1. **`pg_restore --clean` поверх живой dev-схемы** падает: прод-дамп не знает про новые таблицы ветки (например `be_working_days`, `be_schedule_templates` с FK на `be_*`) → не может дропнуть родителей. Правильный путь — **чистая** заливка в пустую базу, не `--clean`.
2. **`pg_restore --single-transaction`** откатывает **весь** restore из-за одной косметической ошибки `COMMENT ON EXTENSION btree_gist` (под `--role` прикладная роль не владелец расширения). Эту опцию **не** использовать — ошибка `COMMENT` ожидаема и игнорируется (`errors ignored: 1`).
3. **Пересоздать базу может только суперюзер** `postgres` — ни одна роль `bcb_*` не имеет `CREATEDB`.
4. **Нельзя `REASSIGN OWNED BY bcb_webapp_prod`** — задевает shared objects, т.е. переназначит владельца самой **боевой** базы. Владельца задаём через `pg_restore --no-owner --role=bcb_webapp_dev_user`.
5. Миграции **не** собираются с абсолютного нуля (кросс-скоуп порядок: telegram-миграция ждёт core-таблицу `identities`). Базу+леджер даёт дамп, `pnpm migrate` накатывает только дельту ветки.

### Шаги

Под `postgres` (root):

```bash
DUMP=$(ls -1t /opt/backups/postgres/hourly/unified_bcb_webapp_prod_*.dump | head -1); echo "Using: $DUMP"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS bcb_webapp_dev;"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
  "CREATE DATABASE bcb_webapp_dev OWNER bcb_webapp_dev_user TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8';"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d bcb_webapp_dev -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
# restore БЕЗ --single-transaction (ожидаемая 1 ошибка: COMMENT ON EXTENSION — игнор)
sudo -u postgres pg_restore --no-owner --role=bcb_webapp_dev_user -d bcb_webapp_dev "$DUMP"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
  "ALTER ROLE bcb_webapp_dev_user IN DATABASE bcb_webapp_dev SET search_path = public, integrator;"
```

Под `dev` (накатить дельту миграций ветки):

```bash
cd /home/dev/dev-projects/BersonCareBot
pnpm run migrate
```

### Проверка

```bash
# владелец всех таблиц = dev-роль (ждём 0)
sudo -u postgres psql -d bcb_webapp_dev -Atc \
  "SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','integrator') AND tableowner <> 'bcb_webapp_dev_user';"
# таблицы ветки на месте
set -a && source apps/webapp/.env.dev && set +a
psql "$DATABASE_URL" -Atc \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('be_working_days','be_schedule_templates') ORDER BY 1;"
```

**Удалены устаревшие артефакты** (отдельные legacy dev-базы, март–апрель 2026): `integrator_bersoncarebot_dev_schema.sql`, `webapp_bcb_webapp_dev_schema.sql`.
