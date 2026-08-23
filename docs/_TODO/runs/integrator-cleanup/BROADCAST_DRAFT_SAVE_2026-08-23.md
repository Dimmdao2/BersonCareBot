# BROADCAST_DRAFT_SAVE — 2026-08-23

## Итог

Исправлен путь `Сохранить черновик`: запрос теперь записывает принятый `organization_id`, а декларация выдаёт
`app_staff` ровно колонковый `INSERT (organization_id)`. Межклинический предикат RLS не ослаблен. Миграций и
именованных корней нет: существующий direct relation path достаточен, а tenant discriminator остаётся неизменяемым
через `UPDATE`.

Единственный незелёный обязательный gate — штатный DEV preflight: linked worktree не содержит канонических
`.env`/`apps/webapp/.env.dev`, поэтому path guard остановил wrapper до обращения к БД. `--execute` не запускался.

## Причина, а не симптом

`saveDraft` входит через webapp relation-port. Живая rollback-only проба после принятия staff-контекста показала
`current_user=app_staff`. У роли был колонковый `INSERT` только на
`audience, body, category, channels, doctor_user_id, media_type, media_url, title, updated_at`; на
`organization_id` права не было (`has_column_privilege(...)=f`). Старый `INSERT` также не передавал
`organization_id`, поэтому новая строка получала `NULL`.

Каталог измерен командой:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN READ ONLY; SELECT privilege_type, string_agg(column_name, ', ' ORDER BY column_name) AS columns FROM information_schema.column_privileges WHERE grantee = 'app_staff' AND table_schema = 'public' AND table_name = 'broadcast_drafts' AND privilege_type = 'INSERT' GROUP BY privilege_type; SELECT has_column_privilege('app_staff', 'public.broadcast_drafts', 'organization_id', 'INSERT') AS can_insert_organization_id; SELECT polname, polcmd, coalesce(pg_get_expr(polwithcheck, polrelid), pg_get_expr(polqual, polrelid)) AS write_check FROM pg_policy WHERE polrelid = 'public.broadcast_drafts'::regclass ORDER BY polname; ROLLBACK;"
```

Результат: обе политики имеют `polcmd='*'`; restrictive `rev10_context_gate_67` требует принятый relation-контекст,
а tenant policy `rev10_saas_org_dormant_p0_8_3` проверяет
`CURRENT_USER='app_staff' AND app.current_org_id() IS NOT NULL AND organization_id=app.current_org_id()`.
Именно последний предикат отклонял `NULL`; сообщение RLS было следствием.

## Изменение

- `apps/webapp/src/infra/repos/pgBroadcastDrafts.ts`: `INSERT` явно пишет
  `organization_id = app.current_org_id()`.
- `deploy/postgres/privileges/declaration.ts`: для `public.broadcast_drafts` добавлен только
  `app_staff INSERT (organization_id)`.
- `node deploy/postgres/privileges/generate-cli.mjs --all` обновил DEV/TEST privilege-шаблоны; единственная
  смысловая строка — `GRANT INSERT ("organization_id") ... TO "app_staff"`.
- `node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only` пересобрал port-context артефакты;
  Git-diff для них пуст.
- `node deploy/postgres/privileges/generate-cli.mjs --all --check` → exit `0`, все четыре privilege/allowlist
  артефакта совпадают с декларацией побайтово.

Миграционные файлы не менялись; следовательно, в миграции нет `GRANT`, `REVOKE` или `CREATE POLICY`.

## Поведенческое доказательство на именованной DEV

Тест `deploy/postgres/privileges/broadcast-draft-save.devDbProof.test.mjs` использует реальную активную staff-
фикстуру и реальный relation capability. Кандидатный грант, пробные записи и fault-injection выполняются внутри
транзакций с явным `ROLLBACK`; финальная проверка подтверждает ноль пробных строк и отсутствие живого гранта после
отката.

Красный fault injection №1 — убран `organization_id` из production-shape INSERT:

```bash
BROADCAST_DRAFT_SAVE_FAULT=omit-org RUN_BROADCAST_DRAFT_SAVE_DB=1 node --test deploy/postgres/privileges/broadcast-draft-save.devDbProof.test.mjs
```

Exit `1`: собственная клиника получила
`own_probe=42501|app_staff|26aca960-950d-4f39-b67d-fcfbe06a6530` вместо ожидаемого `00000`.

Красный fault injection №2 — tenant policy временно ослаблена до `WITH CHECK (true)`:

```bash
BROADCAST_DRAFT_SAVE_FAULT=weaken-org-policy RUN_BROADCAST_DRAFT_SAVE_DB=1 node --test deploy/postgres/privileges/broadcast-draft-save.devDbProof.test.mjs
```

Exit `1`: чужая клиника получила
`foreign_probe=00000|app_staff|26aca960-950d-4f39-b67d-fcfbe06a6530` вместо ожидаемого `42501`.

Зелёный штатный прогон:

```bash
RUN_BROADCAST_DRAFT_SAVE_DB=1 node --test deploy/postgres/privileges/broadcast-draft-save.devDbProof.test.mjs
```

Exit `0`, `3` теста прошли: собственная клиника —
`own_probe=00000|app_staff|26aca960-950d-4f39-b67d-fcfbe06a6530`; чужая —
`foreign_probe=42501|app_staff|26aca960-950d-4f39-b67d-fcfbe06a6530`; rollback-postcheck зелёный.

Дополнительный контракт декларации:

```bash
node --test deploy/postgres/privileges/relation-access.test.mjs
```

Exit `0`: `43`/`43` теста прошли.

## Остальные проверки

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
```

Все три команды завершились с exit `0`. Lint оставил `2` существующих warning в
`AppointmentPaymentSection.tsx` (hook dependency и `<img>`); ошибок нет.

```bash
bash deploy/host/migrate-dev.sh --preflight
```

Exit `1`: `FATAL: DEV API env path guard failed`. Это ожидаемое ограничение linked worktree, прямо описанное в
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` §3в; wrapper остановился до DB. Запуск из канонического дерева
проверил бы другой checkout без этой правки, поэтому не подменял им доказательство candidate-кода.

TEST и PROD не затрагивались. `--execute`, deploy и push не запускались. Галочки плана не менялись.
