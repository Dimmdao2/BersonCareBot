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

Для актуальной архитектуры и правил слоёв см. корневой `ARCHITECTURE.md` и `docs/DB_STRUCTURE_AND_RECOMMENDATIONS.md`.
