# Архив отчётов и аудитов

В этой папке лежат **исторические** отчёты и аудиты (2026-03). Они фиксировали состояние кодовой базы и сценариев на момент создания и могут быть неактуальны.

| Файл | Содержание |
|------|------------|
| `script_scenarios_execution_report.md` | Отчёт о выполнении сценариев, известные проблемы (callback Loading, Rubitime path). |
| `telegram_callback_diag_report.md` | Диагностика callback-зависаний, логирование. |
| `telegram_execution_audit.md` | Статус экшенов и скриптов (EXECUTABLE_NOW / BLOCKED_*). |
| `business_scripts_format_audit.md` | Аудит формата бизнес-скриптов, сильные/слабые стороны. |
| `orchestrator_matching_audit.md` | Текущий поток выбора сценария и ограничения. |
| `core_usage_audit.md` | Наличие и использование core content. |
| `orchestrator_migration_audit.md` | Аудит миграции оркестратора (STEP 1–5), branch ARCHITECTURE-V3-REAL-CLEAN. |
| `REFACTOR_V3.md` | План рефакторинга V3 (выполнен). |
| `REFACTOR_STEPS_DONE.md` | Отметки выполненных шагов рефакторинга (STEP 0–14). |

Для актуальной архитектуры и правил слоёв см. корневой `ARCHITECTURE.md` и `docs/DB_STRUCTURE_AND_RECOMMENDATIONS.md`.

## 2026-04 — уборка отчётов и аудитов

Разовые журналы агентов, UX-снимки и закрытый пакет аудита **TEST_AND_API_DI_OPTIMIZATION** (discovery + `AUDIT_*`): см. [`2026-04-docs-cleanup/README.md`](2026-04-docs-cleanup/README.md).

Завершённые продуктовые инициативы (AUTH, phone bind, identity, merge v2, timezone, booking, …): [`2026-04-initiatives/README.md`](2026-04-initiatives/README.md).

## 2026-05 — вынесенные закрытые пункты project backlog

Записи, удалённые из [`../TODO.md`](../TODO.md) как история: [`TODO_BACKLOG_CLOSED_HISTORY.md`](TODO_BACKLOG_CLOSED_HISTORY.md).
