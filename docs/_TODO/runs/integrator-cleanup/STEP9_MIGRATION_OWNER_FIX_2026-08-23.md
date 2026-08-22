# D15b/7a Ш9 — проверка владельцев секций миграции

Дата: 2026-08-23.
Workstream: `#987`, `WORK_ORDER.md` D15b/7a, шаг Ш9.

## Итог

Первичный диагноз по последней строке `NOTICE` оказался неточным: миграция
`20260822T200000_patient_demographics_leave_the_actor_root.sql` исполняется на DEV целиком, включая все три
перезаписи функций в схеме `app`. Отказ воспроизвёлся в следующей pending-миграции того же timestamp —
`20260822T200000_tenant_definer_roots_validate_their_organization.sql`.

В целевой миграции владельцы выбраны штатно, а нужные временные маркеры уже присутствуют. Постоянные права не
расширялись. В реально падавшей соседней миграции добавлены четыре отсутствовавших
`BCB-MIGRATION-SCHEMA-CREATE: app`: runner выдаёт соответствующему владельцу `CREATE` только внутри транзакции
конкретной секции и отзывает его до завершения транзакции.

Смысл Ш9 не менялся: демографические поля, backfill, чтение и запись не затронуты.

## Замер DEV

Права и фактические владельцы замерены read-only запросом:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -F '|' -A -c "BEGIN READ ONLY; SELECT 'schema_owner', pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname='app'; SELECT role_name, has_schema_privilege(role_name,'app','USAGE') AS usage, has_schema_privilege(role_name,'app','CREATE') AS create_priv FROM (VALUES ('app_object_owner'),('app_seam_public_booking_owner'),('app_seam_identity_lookup_owner'),('app_seam_phone_binding_owner')) AS roles(role_name); SELECT p.oid::regprocedure::text AS function, pg_catalog.pg_get_userbyid(p.proowner) AS owner FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace WHERE p.oid IN ('app.resolve_public_booking_client_by_phone(text,text,boolean)'::regprocedure,'app.pre_session_phone_confirm_resolve(text,text,boolean,text)'::regprocedure,'app.pre_session_messenger_channel_resolve(text,text,text,text,text,uuid)'::regprocedure,'app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)'::regprocedure) ORDER BY 1; ROLLBACK;"
```

Результат:

| Объект / роль | Факт |
| --- | --- |
| schema `app` | owner = `app_object_owner` |
| `app_object_owner` | `USAGE=t`, `CREATE=f` |
| `app_seam_public_booking_owner` | `USAGE=t`, `CREATE=f` |
| `app_seam_identity_lookup_owner` | `USAGE=t`, `CREATE=f` |
| `app_seam_phone_binding_owner` | `USAGE=t`, `CREATE=f` |
| `app.resolve_public_booking_client_by_phone(...)` | owner = `app_seam_public_booking_owner` |
| обе `app.pre_session_*_resolve(...)` | owner = `app_seam_identity_lookup_owner` |
| `app.integrator_bind_bootstrap_channel_phone(...)` | owner = `app_seam_phone_binding_owner` |

Это совпадает с `deploy/postgres/privileges/declaration.ts`: тела функций штатно правит владелец функции, а не
`app_object_owner`. Постоянный `CREATE` seam-владельцам был бы лишним широким правом на создание произвольных
объектов в `app`; законный механизм здесь — ограниченный транзакцией grant runner-а по маркеру миграции.

## Проверка каждой секции целевой миграции

| Секция | Владелец выполнения | Результат rollback-only materialization |
| --- | --- | --- |
| Добавление четырёх колонок в `public.doctor_patient_support` | `app_object_owner` | прошла |
| Backfill четырёх демографических полей | admin/backfill context | прошла; `height_cm=0`, `weight_kg=0`, `gender=1`, `birth_date=0` |
| `app.resolve_public_booking_client_by_phone(...)` | `app_seam_public_booking_owner` | прошла |
| две `app.pre_session_*_resolve(...)` | `app_seam_identity_lookup_owner` | прошла |
| `app.integrator_bind_bootstrap_channel_phone(...)` | `app_seam_phone_binding_owner` | прошла |
| Удаление четырёх колонок из `public.platform_users` | `app_object_owner` | прошла |

Каждая секция `CREATE OR REPLACE FUNCTION app...` целевой миграции уже имела
`BCB-MIGRATION-SCHEMA-CREATE: app` и `BCB-MIGRATION-LANGUAGE-USAGE: plpgsql`.

## Фактический отказ и исправление

До правки прямая owner-ordered материализация:

```bash
BCB_MIGRATION_ENTRYPOINT=migrate-dev.sh node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only
```

дала `EXIT=3`. В журнале целевая миграция дошла до финального `ALTER TABLE` и своей ledger-вставки
`INSERT 0 1`; затем следующая миграция выполнила `DROP FUNCTION` и упала на первом
`CREATE OR REPLACE FUNCTION app.apply_paid_saas_billing_tariff(...)` под
`app_seam_org_commerce_owner` с `permission denied for schema app`.

В `20260822T200000_tenant_definer_roots_validate_their_organization.sql` добавлен временный schema-create
маркер для всех четырёх создающих секций:

1. `app.apply_paid_saas_billing_tariff(...)` — `app_seam_org_commerce_owner`.
2. `app.record_reminder_occurrence_finalized_projection(...)` — `app_seam_reminder_patient_owner`.
3. `app.refresh_saas_billing_invoice_purchased_tariff(...)` — `app_seam_org_commerce_owner`.
4. `app.release_carried_seat_debt(...)` — `app_seam_org_commerce_owner`.

После правки та же команда дала `EXIT=0`, материализовала все три pending-миграции (`pending=3`, `total=51`) и
закончилась `ROLLBACK`. Ни одна секция не упала по правам; состояние DEV не было зафиксировано.

## Отдельная находка preflight

Исторический зелёный `--preflight` из брифа не предотвратил ошибочный вывод о месте execute-отказа. В текущем
checkout owner-aware rollback runner воспроизвёл реальный downstream-отказ, но его вывод не маркирует каждую
SQL-секцию именем migration-файла; поэтому последняя строка `NOTICE` от Ш9 была принята за источник следующей
ошибки. По границам задачи диагностика preflight не менялась.

## Проверки

- `bash deploy/host/migrate-dev.sh --preflight` — `EXIT=0`; `ROLLBACK`; `pending=3`, `total=51`;
  `migrate-dev preflight: PASS`.
- `BCB_MIGRATION_ENTRYPOINT=migrate-dev.sh node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only` — `EXIT=0`; все pending-секции материализованы, затем `ROLLBACK`.
- `pnpm test:db-privileges` — `EXIT=0`; `259` тестов: `162 pass`, `0 fail`, `97 skip`.
- `pnpm run typecheck` — `EXIT=0`.
- `node deploy/postgres/privileges/generate-cli.mjs --check` — `EXIT=0`; DEV и TEST privileges/allowlist совпадают побайтно.
- `node deploy/postgres/privileges/generate-cli.mjs --check --port-context-only` — `EXIT=0`; DEV и TEST port-context совпадают побайтно.
- `git diff --check` — `EXIT=0`.

Для запуска wrapper-а в isolated worktree штатные env-файлы были временно скопированы из canonical checkout без
чтения и печати содержимого, затем удалены. `--execute`, TEST, PROD, deploy, push и full CI не запускались.
