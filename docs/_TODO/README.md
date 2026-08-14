# 🅣 \_TODO — заготовки инициатив (staging)

По умолчанию это папка-**стейджинг**: инициативы здесь готовятся и не становятся очередью сами по себе.
Исключение — уже явно запущенные владельцем долгоживущие каноны, перечисленные в таблице ниже; их оперативный
статус workstream хранится в taskdb, а этапы и чекбоксы — в каноническом плане под `_TODO/`.
Связь «одна карточка = один workstream; детали = план»: [`../TASKDB_RULES.md`](../TASKDB_RULES.md).

## Поток

1. Готовим инициативу здесь (полная папка: `REQUIREMENTS.md` + `MASTER_PLAN.md` + `log.md`).
2. Владелец подтверждает запуск: одна taskdb-карточка ссылается на канонический план, а roadmap, этапы и
   чекбоксы остаются в этом плане.
3. Перенос в `docs/_INBOX/` применяется только если конкретный канон инициативы всё ещё использует inbox-flow;
   уже активные owner-roadmap не копировать и не размножать.

⚠️ Само нахождение здесь не означает `ACTIVE`; активность подтверждается owner decision + taskdb.

## Содержимое + ПОСЛЕДОВАТЕЛЬНОСТЬ

| #   | Инициатива                                                                                                                                                                   | Когда                                                                                           | Зависимость                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | `DB_ACCESS_CHOKEPOINT_INITIATIVE/` — единый перехватываемый ствол доступа к БД (консолидация сырого SQL)                                                                     | **ЗАВЕРШЕНО для R0**                                                                            | нет                                                         |
| 2   | `SAAS_FOUNDATION/` — мультитенантность (shared-DB + Postgres RLS)                                                                                                            | **Phase 0/R1 завершена; текущий next = T0/R2 audit/cutover checklist**                          | использует готовый chokepoint из #1                         |
| —   | [`DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`](DB_PRIVILEGE_LAYER_REBUILD/PLAN.md) — текущая система DB logins/roles/grants/RLS/DB-port context                                     | **ACTIVE; отдельный workstream, не часть infrastructure plan**                                  | owner decisions + live DEV cutover                          |
| —   | [`SAAS_PRODUCT_UX_INITIATIVE/`](SAAS_PRODUCT_UX_INITIATIVE/README.md) — owner-reviewed product/SaaS execution DAG                                                            | **ACTIVE; stages только по `IMPLEMENTATION_ROADMAP.md`, taskdb хранит workstream-status**       | Foundation authority в tenant/security областях             |
| —   | [`INFRASTRUCTURE_SECURITY_PLAN.md`](INFRASTRUCTURE_SECURITY_PLAN.md) — host/LUKS/S3/backup/DR/secrets/TLS/logs/incident response/Security CI                                 | **Единственный infrastructure-security plan; production actions owner-gated**                   | DB access использует результат отдельного плана выше        |
| —   | [`RU_PRIVACY_AND_PRODUCTION_READINESS/`](RU_PRIVACY_AND_PRODUCTION_READINESS/README.md) — 152-ФЗ/health-data evidence, privacy/legal/product stages                         | **ACTIVE planning/dev-readiness (workstream `#898`)**                                           | app/DB stages после D4 + S5-7; payment retention после #751 |
| —   | [`DOCTOR_DNA_MIGRATION/`](../archive/2026-07-plans/DOCTOR_DNA_MIGRATION/PLAN.md) — owner-controlled doctor UI design migration                                                                        | **АРХИВ: отменён владельцем (`#885`)**                                                        | historical record; не заменяет Product UX roadmap           |

#1 — поведение-сохраняющий рефактор, который делает БД-доступ перехватываемым. Phase 0/R1
`SAAS_FOUNDATION` завершена; дальнейшая работа начинается с
`SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` и не включает production enforcement без
отдельного approval владельца.

Актуальный сводный registry и датированный branch/worktree census: [`../INITIATIVES.md`](../INITIATIVES.md).
Workstream-status хранится в taskdb; детальный статус — в чекбоксах канонического плана. Эта папка не является
самостоятельной очередью запуска.
