# BersonCareBot

## Database migrations workflow

### Standard

- All migrations are created in `/migrations`
- Filename format: `00X_description.sql`
- Number is sequential
- Old migrations are never edited
- Any DB schema change must be via a new migration

---

### Local workflow

#### Creating a migration

Example:

```bash
touch migrations/003_add_phone_to_telegram_users.sql
```

Inside the file:

```sql
ALTER TABLE telegram_users
ADD COLUMN IF NOT EXISTS phone text;
```

#### Applying locally

```bash
set -a
source .env
set +a

pnpm run db:migrate
```

#### Checking

```bash
psql "$DATABASE_URL" -c "\dt"
psql "$DATABASE_URL" -c "\d telegram_users"
psql "$DATABASE_URL" -c "select * from schema_migrations order by version;"
```

---

### Production workflow

Never do anything manually on the server.

Process:
1. `git add .`
2. `git commit -m "feat: add phone column"`
3. `git push`

Deploy:
- `pnpm install`
- `pnpm build`
- `pnpm exec tsx src/db/migrate.ts`
- restart service

---

### Important

Copilot must NOT:
- edit old migrations
- run DROP TABLE
- change existing versions

Only new files.
