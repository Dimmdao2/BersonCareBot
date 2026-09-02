# Database schema B bootstrap

Owner decision 20.08.2026: историческая webapp migration-цепочка и её `0000_b0_baseline.sql` выведены из
активного контура. Schema B для A→B cutover приезжает generated snapshot:

- `deploy/postgres/generated/prod-to-target/schema-pre.sql`;
- `deploy/postgres/generated/prod-to-target/schema-post.sql`;
- `deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql` — начальный ledger;
- `apps/integrator/src/infra/db/migrations/core/20260816_0000_b0_baseline.sql`;
- последующие webapp forward-миграции `YYYYMMDDTHHMMSS_slug.sql`, без исключений старого формата.

Именованные `bcb_webapp_dev` и `bersoncarebot_test` — единственные тестовые базы. A0/A1/greenfield,
scratch/rehearsal/ephemeral базы, приватные PostgreSQL-кластеры и replay старой цепочки не являются
поддерживаемым способом bootstrap или проверки.

Ниже лежат два старых schema-only снимка DEV. Это неисполняемая историческая справка: их нельзя
восстанавливать, обновлять или использовать вместо generated schema B.

| Файл                                                                             | Схема        | Обновлено  |
| -------------------------------------------------------------------------------- | ------------ | ---------- |
| [`integrator_bcb_webapp_dev_schema.sql`](./integrator_bcb_webapp_dev_schema.sql) | `integrator` | 2026-06-10 |
| [`public_bcb_webapp_dev_schema.sql`](./public_bcb_webapp_dev_schema.sql)         | `public`     | 2026-06-10 |

Логическая карта и группировка таблиц — [`../DB_STRUCTURE.md`](../DB_STRUCTURE.md).

---

## DEV в обычной разработке: без restore/refresh

Обычная разработка сохраняет существующую DEV-БД и не копирует TEST; pending общие миграции применяются через:

```bash
bash deploy/host/migrate-dev.sh --preflight
bash deploy/host/migrate-dev.sh --execute
```

Wrapper проверяет точные локальные `bcb_webapp_dev`/`bcb_webapp_dev_user` и не выполняет dump, restore, reset,
role/ACL repair или RLS acceptance.

## DEV после принятого TEST: отдельный owner-gated refresh

Решение владельца в текущем workstream (см. `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`,
шаг 6 исправляющего прохода): **после зелёной живой приёмки TEST** DEV обновляется из принятого TEST-состояния
одним repo-managed действием — DEV сильно отстал и нужен с живыми примерами. Это не обычный dev-шаг и не
разрешение на временные/одноразовые базы: обе базы остаются двумя существующими именованными, историческая
цепочка миграций не проигрывается.

```bash
bash deploy/host/refresh-dev-from-test.sh --check
bash deploy/host/refresh-dev-from-test.sh --execute --confirm-refresh-dev-from-test
```

| Переносится из TEST                                       | Остаётся у DEV                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| принятые данные и живые примеры                           | env-файлы DEV и четыре runtime-пароля DEV                                   |
| текущая schema B, несущая эти данные                      | DEV-строки всех environment-owned ключей `system_settings`                  |
| ledger принятой TEST-схемы (без replay истории)           | принципал-контекстный signing credential DEV (`app.context_signing_secrets`) |
|                                                            | declaration-owned владельцы, ACL и membership DEV                           |

Не переносится: TEST env, TEST runtime credentials, provider delivery credentials, TEST channel/test-account
allowlists, TEST роли/ACL/владельцы (`--no-owner --no-acl` с обеих сторон) и TEST env-lock
(`system_settings_test_lock`). Отбор environment-owned ключей выводится из действующих контрактов —
`apps/webapp/src/modules/system-settings/registry.ts` (класс `storage: 'restricted'`) и
`deploy/postgres/test-settings-override.sql` — через `deploy/host/dev-owned-settings-policy.mjs`, второго
ручного списка секретов нет.

`--check` ничего не меняет. `--execute` перед разрушением снимает защищённый локальный снимок DEV; прерванный
прогон оставляет DEV закрытым (`CONNECTION LIMIT 0`) и печатает точную команду
`--rollback <снимок> --confirm-refresh-dev-from-test`. Права после restore заново раскладывает единственный
штатный `reconcile-access.mjs`; свой генератор прав entrypoint не содержит. Если в текущем checkout есть
миграции поверх принятой TEST-схемы, после refresh их применяет обычный `migrate-dev.sh`.

---

## Где теперь проверяется поведение

- целостность generated schema B и active forwards — `node scripts/check-b0-migration-baseline.mjs`;
- SQL/role/catalog contracts — статические и unit-тесты декларации/генератора;
- реальные роли, RLS, конкурентные записи, настройки, квоты, платежи, приглашения и patient/doctor flows —
  только живой проход именованного DEV, затем именованного TEST по
  [`LOCAL_DEV_AND_AGENT_TESTING.md`](../LOCAL_DEV_AND_AGENT_TESTING.md);
- destructive schema/bootstrap proofs не перенаправляются на DEV: их прежняя disposable-only
  исполняемая поверхность удалена.

**Удалены устаревшие артефакты** (отдельные legacy dev-базы, март–апрель 2026): `integrator_bersoncarebot_dev_schema.sql`, `webapp_bcb_webapp_dev_schema.sql`.
