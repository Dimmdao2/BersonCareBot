# Database baseline B0

Единственный активный начальный контракт схемы — baseline `B0`:

- `apps/webapp/db/drizzle-migrations/0000_b0_baseline.sql`;
- `apps/integrator/src/infra/db/migrations/core/20260816_0000_b0_baseline.sql`;
- последующие короткие forward-миграции в этих же двух каталогах.

Именованные `bcb_webapp_dev` и `bersoncarebot_test` — единственные тестовые базы. A0/A1/greenfield,
scratch/rehearsal/ephemeral базы, приватные PostgreSQL-кластеры и replay старой цепочки не являются
поддерживаемым способом bootstrap или проверки.

Ниже лежат два старых schema-only снимка DEV. Это неисполняемая историческая справка: их нельзя
восстанавливать, обновлять или использовать вместо B0.

| Файл                                                                             | Схема        | Обновлено  |
| -------------------------------------------------------------------------------- | ------------ | ---------- |
| [`integrator_bcb_webapp_dev_schema.sql`](./integrator_bcb_webapp_dev_schema.sql) | `integrator` | 2026-06-10 |
| [`public_bcb_webapp_dev_schema.sql`](./public_bcb_webapp_dev_schema.sql)         | `public`     | 2026-06-10 |

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
role/ACL repair или RLS acceptance.

---

## Где теперь проверяется поведение

- целостность активных корней `B0 + forwards` — `node scripts/check-b0-migration-baseline.mjs`;
- SQL/role/catalog contracts — статические и unit-тесты декларации/генератора;
- реальные роли, RLS, конкурентные записи, настройки, квоты, платежи, приглашения и patient/doctor flows —
  только живой проход именованного DEV, затем именованного TEST по
  [`LOCAL_DEV_AND_AGENT_TESTING.md`](../LOCAL_DEV_AND_AGENT_TESTING.md);
- destructive schema/bootstrap proofs не перенаправляются на DEV: их прежняя disposable-only
  исполняемая поверхность удалена.

**Удалены устаревшие артефакты** (отдельные legacy dev-базы, март–апрель 2026): `integrator_bersoncarebot_dev_schema.sql`, `webapp_bcb_webapp_dev_schema.sql`.
