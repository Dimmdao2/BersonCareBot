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

## Предпочтительный UX refresh: текущая TEST → DEV

Для интерфейсной работы не собирайте restore-команды вручную:

```bash
cd /home/dev/dev-projects/BersonCareBot
pnpm run dev:stop
bash deploy/host/refresh-dev-from-test.sh --execute
```

Wrapper имеет фиксированные source/target guards: читает только `bersoncarebot_test`, удаляет и пересоздаёт
только `bcb_webapp_dev`, восстанавливает с owner `bcb_webapp_dev_user` и запускает миграции текущей ветки.
PROD и `/opt/env` не используются. DEV после этого остаётся изменяемой песочницей.

---

## Исторический ручной PROD-dump → DEV путь — запрещён

Старая инструкция «удалить DEV, вручную выполнить `pg_restore`, затем только `pnpm migrate`» устарела и удалена:
она не восстанавливала per-database owners/ACL, protected P2-B context и runtime overlays. Не реконструируйте её по
git history и не используйте обычный code deploy, build, restart, UI-задачу или standalone `pnpm migrate` как
основание для dump/reset/refresh.

Разрешённые пути теперь разделены:

- обычный deploy кода никогда не пересоздаёт базу;
- pending schema delta на уже подготовленной `bcb_webapp_dev` применяется недеструктивно только через
  `bash deploy/host/migrate-dev.sh --preflight`, затем `bash deploy/host/migrate-dev.sh --execute`; wrapper
  сохраняет данные, владеет временным privilege window, C4D online-index, runtime closure и ledger postchecks;
- уже подготовленную DEV-БД с owner/ACL drift чинит без reset
  `bash deploy/host/dev-runtime-overlay-rehydrate.sh --execute`;
- явный owner-authorized TEST→DEV refresh выполняется только
  `bash deploy/host/refresh-dev-from-test.sh --execute`;
- rehearsal свежего PROD dump выполняется только в disposable БД по
  [`HARD_MIGRATION_PROTOCOL.md`](../../_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md), не в рабочей DEV-БД.

Полная обязательная последовательность любого разрешённого clean restore: restore с `--no-owner --no-acl` →
current-branch migrations → exact P2-B owner/context handoff → P0.5b и единая shared runtime-overlay chain → exact
role/owner/ACL/runtime postchecks → снятие environment-specific locks только после PASS. Для DEV этот порядок
подробно и с точным моментом одноразовой role/context настройки закреплён в
[`LOCAL_DEV_AND_AGENT_TESTING.md`](../LOCAL_DEV_AND_AGENT_TESTING.md#обязательный-разовый-p2-b-ownercontext-handoff-после---no-owner-restore).

Внутри shared chain, непосредственно перед protected overlays, всегда выполняется exact
`deploy/postgres/runtime-overlay-app-owner-handoff.sql`. Он исправляет только восстановленные под owner текущей БД
Web Push accessor и два public-booking resolver, которые затем заменяются под `SET ROLE app_owner`; отсутствующая
функция допустима и создаётся её следующим exact overlay. Процесс останавливает только существующая exact функция с
owner вне `{owner текущей БД, app_owner}`. Это per-restore owner handoff, не повторная настройка глобальных ролей и
не broad `ALTER OWNER`.
Одноразовые C0 login/password роли готовятся вручную по `LOCAL_DEV_AND_AGENT_TESTING.md` и при следующих restore/deploy
не пересоздаются.

**Удалены устаревшие артефакты** (отдельные legacy dev-базы, март–апрель 2026): `integrator_bersoncarebot_dev_schema.sql`, `webapp_bcb_webapp_dev_schema.sql`.
