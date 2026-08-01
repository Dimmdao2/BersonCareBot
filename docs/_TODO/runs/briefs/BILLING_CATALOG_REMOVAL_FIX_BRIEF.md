# B1.4 — bounded fix-round удаления каталога (#1057)

## Authority

- `AGENTS.md` §4a, §5, §10a–§10b, §24.
- `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md`, B1.4.
- Product `82879072e`, integration `9ba46b865`, acceptance/audit `b7ce6e033`.
- Findings F1–F2: `docs/_TODO/SAAS_FOUNDATION/BILLING_CATALOG_REMOVAL_AUDIT_REPORT.md`.

Источник оракула: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` B1.4 — «КАТАЛОГ ТОВАРОВ ВЫРЕЗАЕТСЯ ЦЕЛИКОМ» и «Абонементы существуют своим кодом, их продажа остаётся у них».

## Разрешённый fix

1. Удалить только ожидания удалённых `be_product_history_events`/`be_products` из active P0.12 JSON census и согласовать точные связанные expectations.
2. Удалить orphan `BookingPatientProductsSection` и неиспользуемый `grantPrepaidCatalogPackage` без изменения живого subscription-package purchase/consume path.
3. Обновить только текущие `memberships.md`, `api.md` и DEV-ops comments, чтобы они не объявляли удалённый product layer.
4. Переиспользовать готовый kill-set `catalogRemovalB14.unit.test.ts`; новый blind audit и новые сущности не нужны.

## Запрещено

- Не менять исторические migrations, архивные планы/provenance, `0298`, journal, subscription-package schema, booking behavior, course sales, DB/DEV/TEST/PROD/deploy.
- Не чинить найденное вне F1–F2 и не переписывать acceptance test под реализацию.

## Done

- F1: `check-p0-12-json-payloads.mjs` и `check-saas-db-regression.mjs` зелёные.
- F2: exact caller/search census не находит orphan component, dead bridge или active contract старого product layer.
- `catalogRemovalB14.unit.test.ts` — 3/3; webapp typecheck, scoped lint, raw-SQL gate и `git diff --check` зелёные.
- Один product commit и bounded report; push/land не делать.

