# Документация проекта BersonCareBot

## Основные документы (корень репозитория)

| Файл | Назначение |
|------|------------|
| **ARCHITECTURE.md** | Главный контракт: слои, запреты, pipeline, правила изоляции, текущие отклонения. |
| **README.md** | Запуск, конфиг, команды, endpoints. |
| **REFACTOR_V3.md** | План рефакторинга V3 (выполнен). Не редактировать .md-спеки слоёв. |
| **REFACTOR_STEPS_DONE.md** | Отметки выполненных шагов рефакторинга (STEP 0–14 DONE). |
| **SCENARIO_LOGIC_SUMMARY.md** | Человеческое описание логики сценариев (Telegram user/admin, Rubitime). |

## Документы в docs/

| Файл | Назначение |
|------|------------|
| **DB_STRUCTURE_AND_RECOMMENDATIONS.md** | Целевая модель БД (user, identities, contacts, состояние по каналу), принцип «нет главной интеграции», правила добавления интеграций, текущие отступления. |
| **archive/** | Исторические отчёты и аудиты (см. `archive/README.md`). |

## Спеки слоёв (src/)

Описание ответственности и границ каждого слоя — в `*.md` рядом с кодом:

- `src/app/app.md`
- `src/content/content.md`
- `src/kernel/domain/domain.md`
- `src/kernel/eventGateway/eventGateway.md`
- `src/kernel/orchestrator/orchestrstor.md`
- `src/integrations/integrations.md`
- `src/infra/db/db.md`, `src/infra/db/schema.md`
- `src/infra/dispatcher/dispatcher.md`
- `src/infra/queue/queue.md`
- `src/infra/runtime/*.md`, `src/infra/observability/observability.md`

## Deploy и инфраструктура

- **Host deploy:** `deploy/HOST_DEPLOY_README.md`, скрипты в `deploy/host/`.
- **Интеграции БД:** `src/integrations/<name>/db/schema.md`, `src/infra/db/schema.md`.

## Соответствие архитектуре и чистота слоёв

- **Ядро (kernel)** не импортирует инфраструктуру в production-коде; контракты и порты — единственная граница. В тестах kernel допустим wiring адаптеров.
- **Интеграции** не обращаются к `infra/db/repos` напрямую; вход — нормализация в `IncomingEvent`, выход — через dispatch/порты.
- **Известные отклонения** (допустимые на текущем этапе) перечислены в конце `ARCHITECTURE.md`: transport/delivery в content, legacy hooks в eventGateway, политика доставки Rubitime в domain (знание каналов `telegram`/`rubitime` в `deliveryPolicy.ts`).

При изменениях сверяться с `ARCHITECTURE.md` и со спеками слоёв, чтобы не нарушать изоляцию.
