# Execution log — DB access chokepoint

Обязателен по `.cursor/rules/plan-authoring-execution-standard` (§12.5). По одной записи на этап:
что сделано, какие проверки (+результат), решения, что сознательно НЕ делали.

| Дата | Этап | Сделано | Проверки (результат) | Решения / пропущено |
|---|---|---|---|---|
| 2026-06-30 | S0 | Старт инициативы по команде владельца. Прочитаны core docs/rules, R0/R1 планы и prior art `INTEGRATOR_DRIZZLE_MIGRATION`. Создан `db-access-map.md`: карта process trunks, runtime `.connect()`, `new Pool`, S1 layer-bypass кандидатов, `system_settings` bypassers, KEEP-зон по ADR. Исправлена базовая трактовка старого SAAS raw-SQL аудита: текущий integrator direct `db.query` в runtime — транспорт/health + мигратор/ops, не десятки repo-файлов. | Docs-only stage: `rg` inventory по `.connect()`, `new Pool`, `system_settings`, integrator `db.query`; кодовые тесты не запускались, потому что код не менялся. | Кода, миграций, DB write/read к dev/prod БД не было. Org/RLS/tenancy не трогались. KEEP-зоны не считаются кандидатами на Drizzle rewrite; они должны быть отражены в будущих guard allowlist. |
| 2026-06-17 | — | Инициатива заведена как заготовка в `_TODO/` (REQUIREMENTS + MASTER_PLAN + log). Источник scope — аудит `../SAAS_FOUNDATION/RAW_SQL_AUDIT.md`. | n/a (доки) | Кода нет (staging). Стартует по команде владельца, ДО SAAS. |
