# TREATMENT_PROGRAM_INITIATIVE

Единый движок программ лечения: библиотека блоков → шаблон программы → экземпляр программы пациента → прохождение. Отдельно: курс → выдаёт экземпляр программы.

## Состав папки

| Файл | Назначение |
|------|------------|
| `MASTER_PLAN.md` | Цели, фазы, критерии входа/выхода, порядок работ |
| `SYSTEM_LOGIC_SCHEMA.md` | **Эталон логики системы** — таблицы, потоки данных, статусы, типы. Отклонение = REWORK |
| `EXECUTION_RULES.md` | Жёсткие правила для агентов и разработчиков |
| `PROMPTS_EXEC_AUDIT_FIX.md` | Copy-paste промпты для агентов: EXEC / AUDIT / FIX по каждой фазе |
| `LEGACY_CLEANUP_BACKLOG.md` | Allowlist текущих нарушений boundaries DB/repos в `modules/*` (29 файлов); секция B — исторический снимок по маршрутам (48 — не текущее число API routes) |
| `AUDIT_PHASE_0.md` | Аудит фазы 0 (enforcement); MANDATORY FIX и статус закрытия |
| `LOG.md` | Журнал выполнения (создаётся при начале работы) |

## Фазы

| # | Фаза | Prerequisite |
|---|------|-------------|
| 0 | Enforcement (ESLint, cursor rule, backlog) | — |
| 1 | Drizzle ORM setup | Фаза 0 |
| 2 | Библиотека блоков (tests, recommendations) | Фаза 1 |
| 3 | Шаблон программы (конструктор этапов) | Фаза 2 |
| 4 | Экземпляр программы (назначение, snapshot, override) | Фаза 3 |
| 5 | Комментарии (единая таблица) | Фаза 4 |
| 6 | Прохождение и тесты (статусы, результаты) | Фаза 4 |
| 7 | История изменений (events) | Фаза 4 |
| 8 | Курс (коммерческий слой) | Фаза 3 + 4 |
| 9 | Гибкие правки + интеграторная проекция | Фаза 4 + 7 |

Строго последовательно. Не параллельно.

## Связанные документы

| Документ | Связь |
|----------|-------|
| `.cursor/rules/clean-architecture-module-isolation.mdc` | Правило для агентов |
| `apps/webapp/eslint.config.mjs` | ESLint enforcement |
| `docs/archive/2026-04-docs-cleanup/test-api-di-optimization/` | Завершённый track B (route.ts / DI; allowlist в `api-di-boundary-normalization/`) |
| `docs/ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md` | Архитектурный аудит |

## Порядок чтения

1. `SYSTEM_LOGIC_SCHEMA.md` — понять что строим
2. `MASTER_PLAN.md` — понять порядок
3. `EXECUTION_RULES.md` — понять ограничения
4. `PROMPTS_EXEC_AUDIT_FIX.md` — взять промпт для нужной фазы
