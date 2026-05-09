# LOG — WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE

## 2026-05-09 — bootstrap

- Создана папка инициативы и базовый комплект документов: `README`, `STAGE_PLAN`, `STAGE_A..D`, `PROMPTS_COPYPASTE`, `LOG`.
- Статус: `draft`.
- Этапы не запускались.

## 2026-05-09 — planning decisions

- Уточнен Stage A: runtime-critical DDL определяется по фактическому использованию в webapp runtime, production scripts/backfill/reconcile flow, media-worker public schema access и deploy/ops checks.
- Уточнен Stage A: Drizzle coverage классифицируется как `exact` / `logical` / `partial` / `missing` / `unknown`; все `partial` / `missing` / `unknown` уходят в risk list.
- Уточнен ledger scope: Composer фиксирует риск разных ledger (`webapp_schema_migrations` vs Drizzle metadata), Codex решает стратегию на Stage B.
- Уточнен Stage D: Composer делает discovery по всему репозиторию, но не меняет code/deploy/package/test scripts; такие refs записываются как residual для Codex.
- Уточнен audit format: findings пишутся в `LOG.md` с severity `critical` / `major` / `minor` / `unknown`.
