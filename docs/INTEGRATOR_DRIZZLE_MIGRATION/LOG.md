# Integrator Drizzle migration — execution log

## 2026-05-14

- Заведена инициатива: мастер-план и поэтапные планы в `.cursor/plans/integrator_drizzle_migration_*.plan.md`.
- Контекст: в интеграторе уже есть Drizzle только для операторских таблиц через `@bersoncare/operator-db-schema` (`getIntegratorDrizzle`); остальные репозитории пока на `DbPort` / сырой SQL.
