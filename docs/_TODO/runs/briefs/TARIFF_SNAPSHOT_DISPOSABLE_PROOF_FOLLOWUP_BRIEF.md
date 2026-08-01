# Тариф 2.13 — snapshot proof на DEV, не на A0 disposable (#1069)

Прочитать `AGENTS.md`, особенно §1, §6, §10 и §24. Authority:
`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` 2.13 и `AGENTS.md` §1b «Как выбирать DEV, TEST и
disposable PostgreSQL».

## Последствие

Исправленный snapshot proof больше не читает снесённую колонку и предназначен для быстрой product-проверки на
`bcb_webapp_dev`. Попытка перенести его на A0 clone дала ложный ACL-контур: A0 канонически вырезает privileges, а
обе проверяемые функции работают как SECURITY DEFINER от `app_owner`.

## Scope

Сохранить dev-only fail-closed guard: принимать только `bcb_webapp_dev`/каноническое DEV-имя и privileged connection,
отвергать TEST/PROD/disposable. Не добавлять fixture GRANT, новую роль, harness или A1-claim.

Лид применяет pending migrations только `migrate-dev.sh --preflight` → `--execute`, затем запускает существующие
три сценария на DEV и проверяет cleanup фиксированных fixture UUID. Assertions, product, migration и harness не
менять. RLS/ACL и TEST parity этим прогоном не заявлять.

Новый test не нужен. Guard `7f7847fe2`, ошибочно разрешивший только disposable, отменён `060f7729e`; exact diff
возвращён к исходному DEV-proof, scoped lint/typecheck/diff зелёные. Отдельный аудит отмены не нужен.

## Runtime correction after `7f7847fe2`

Лид запустил proof на clone `pbt_tariff_snapshot_7f7847fe2`: все 3 сценария дошли до настоящих функций, но упали
на `permission denied` для `saas_tariffs`/`saas_billing_subscriptions`. Отдельный Drizzle probe доказал причину:
`app_owner` владеет обеими SECURITY DEFINER-функциями, но `has_table_privilege(..., 'SELECT')=false`; A0 baseline
по своему канону создан через `pg_dump --no-privileges` и не является A1 ACL proof.

Решение «добавить fixture GRANT в A0» отменено оркестратором 02.08 после owner correction маршрутизации сред: это
маскировало бы неверно выбранную среду. A0 остаётся DDL/ledger/isolation harness; snapshot product-proof идёт на DEV,
а точная runtime-role проверка — A1/TEST.
