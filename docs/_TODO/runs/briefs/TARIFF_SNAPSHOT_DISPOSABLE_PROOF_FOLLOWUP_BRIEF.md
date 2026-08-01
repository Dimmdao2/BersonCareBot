# Тариф 2.13 — запустить snapshot proof на disposable PostgreSQL (#1069)

Прочитать `AGENTS.md`, особенно §1, §6, §10 и §24. Authority:
`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` 2.13 и accepted disposable harness contract в
`docs/_TODO/runs/testsuite-v2/DISPOSABLE_POSTGRES_HARNESS_BLIND_AUDIT_REPORT.md`.

## Последствие

Исправленный snapshot proof больше не читает снесённую колонку, но его safety guard принимает только shared DEV name
и отвергает канонический disposable `pbt_*`. Поэтому безопасное доказательство нельзя запустить без общей базы.

## Scope

В `saasBillingTariffSnapshot.devDbProof.test.ts` заменить dev-only name guard на fail-closed разрешение только
канонических disposable clone names `pbt_*`, одновременно отвергая `pbt_dev_*`, `pbt_test_*`, `pbt_prod*` и любые
обычные/shared имена по тем же правилам harness. Комментарий/команда должны описывать disposable harness, не DEV.

Не менять assertions, fixture, product, harness implementation, migration или другие proof-файлы. Сам worker не
поднимает DB; лид после commit создаст clone существующим harness и передаст URL ровно этому test.

Это existing test safety fix, новый test не нужен. Проверить scoped lint, webapp typecheck, `git diff --check` и
одноразово продемонстрировать, что name predicate принимает `pbt_tariff_snapshot_<random>` и отвергает
`bcb_webapp_dev`, `pbt_dev_x`, `pbt_test_x`, `pbt_production_x`. Коммитить только test + plan note при необходимости,
не пушить.

## Runtime correction after `7f7847fe2`

Лид запустил proof на clone `pbt_tariff_snapshot_7f7847fe2`: все 3 сценария дошли до настоящих функций, но упали
на `permission denied` для `saas_tariffs`/`saas_billing_subscriptions`. Отдельный Drizzle probe доказал причину:
`app_owner` владеет обеими SECURITY DEFINER-функциями, но `has_table_privilege(..., 'SELECT')=false`; A0 baseline
по своему канону создан через `pg_dump --no-privileges` и не является A1 ACL proof.

Минимальная коррекция в том же test-файле: после privileged-disposable guard восстановить только канонические
SELECT grants, которые production migrations уже выдают `app_owner`: `be_organizations`, `saas_tariffs`,
`saas_organization_trials`, `saas_org_entitlement_overrides`, `saas_billing_subscriptions`. Это fixture bootstrap
для A0 clone, не новый ACL claim и не изменение product/migration/harness. Assertions не менять. Лид повторит
ровно тот же 3-scenario runtime proof; отдельный аудит не нужен, потому что красный oracle уже зафиксирован.
