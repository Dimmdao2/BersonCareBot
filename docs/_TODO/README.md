# 🅣 \_TODO — заготовки инициатив (staging)

По умолчанию это папка-**стейджинг**: инициативы здесь готовятся и не становятся очередью сами по себе.
Исключение — уже явно запущенные владельцем долгоживущие каноны, перечисленные в таблице ниже; их оперативный
статус хранится в taskdb, а не выводится из расположения под `_TODO/`.

## Поток

1. Готовим инициативу здесь (полная папка: `REQUIREMENTS.md` + `MASTER_PLAN.md` + `log.md`).
2. Владелец подтверждает запуск и taskdb-карточки/roadmap становятся execution authority.
3. Перенос в `docs/_INBOX/` применяется только если конкретный канон инициативы всё ещё использует inbox-flow;
   уже активные owner-roadmap не копировать и не размножать.

⚠️ Само нахождение здесь не означает `ACTIVE`; активность подтверждается owner decision + taskdb.

## Содержимое + ПОСЛЕДОВАТЕЛЬНОСТЬ

| #   | Инициатива                                                                                                                                                                   | Когда                                                                                           | Зависимость                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | `DB_ACCESS_CHOKEPOINT_INITIATIVE/` — единый перехватываемый ствол доступа к БД (консолидация сырого SQL)                                                                     | **ЗАВЕРШЕНО для R0**                                                                            | нет                                                         |
| 2   | `SAAS_FOUNDATION/` — мультитенантность (shared-DB + Postgres RLS)                                                                                                            | **Phase 0/R1 завершена; текущий next = T0/R2 audit/cutover checklist**                          | использует готовый chokepoint из #1                         |
| —   | [`SAAS_PRODUCT_UX_INITIATIVE/`](SAAS_PRODUCT_UX_INITIATIVE/README.md) — owner-reviewed product/SaaS execution DAG                                                            | **ACTIVE; stages только по `IMPLEMENTATION_ROADMAP.md` и taskdb**                               | Foundation authority в tenant/security областях             |
| —   | [`RU_PRIVACY_AND_PRODUCTION_READINESS/`](RU_PRIVACY_AND_PRODUCTION_READINESS/README.md) — 152-ФЗ/health-data evidence, host security, secrets, backup/DR и incident response | **ACTIVE planning/dev-readiness (`#898`/`#899`); production host actions отдельно owner-gated** | app/DB stages после D4 + S5-7; payment retention после #751 |
| —   | [`DOCTOR_DNA_MIGRATION/`](../archive/2026-07-plans/DOCTOR_DNA_MIGRATION/PLAN.md) — owner-controlled doctor UI design migration                                                                        | **АРХИВ: отменён владельцем (`#885`)**                                                        | historical record; не заменяет Product UX roadmap           |

#1 — поведение-сохраняющий рефактор, который делает БД-доступ перехватываемым. Phase 0/R1
`SAAS_FOUNDATION` завершена; дальнейшая работа начинается с
`SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` и не включает production enforcement без
отдельного approval владельца.

Актуальный сводный registry и датированный branch/worktree census: [`../INITIATIVES.md`](../INITIATIVES.md).
Task status хранится только в taskdb; эта папка не является самостоятельной очередью запуска.
