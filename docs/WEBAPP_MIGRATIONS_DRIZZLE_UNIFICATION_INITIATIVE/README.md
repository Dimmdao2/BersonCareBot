# WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_INITIATIVE

Инициатива по устранению двухконтурной схемы webapp-миграций (`Drizzle` + `legacy SQL`) и переходу к одному каналу применения миграций.

## Цель

- Убрать класс инцидентов вида "код ожидает новую колонку, но auto-deploy ее не применил".
- Сделать `pnpm --dir apps/webapp run migrate` единственным каноническим путем schema-изменений webapp.
- Зафиксировать guardrails в deploy, чтобы рассинхрон схемы ловился до рестарта сервиса.

## Статус

- `draft` (инициатива подготовлена, этапы не стартовали).

## План выполнения по агентам

| Этап | Содержание | Основной агент | Проверка/приемка |
|---|---|---|---|
| A | Инвентаризация legacy SQL vs Drizzle, карта соответствия, риски повторного применения | Composer (`composer-2`) | Codex review |
| B | Нормализация Drizzle-миграций и безопасная стратегия ledger/compat | Codex (`gpt-5.3-codex`) | Codex self-check + targeted tests |
| C | Изменения deploy-скриптов и post-migrate guardrails | Codex (`gpt-5.3-codex`) | Host-safe dry-run checklist |
| D | Очистка legacy runner/документации и финальная стабилизация | Composer + Codex | Global audit |

## Документы инициативы

- [`STAGE_PLAN.md`](./STAGE_PLAN.md)
- [`STAGE_A.md`](./STAGE_A.md)
- [`STAGE_B.md`](./STAGE_B.md)
- [`STAGE_C.md`](./STAGE_C.md)
- [`STAGE_D.md`](./STAGE_D.md)
- [`PROMPTS_COPYPASTE.md`](./PROMPTS_COPYPASTE.md)
- [`LOG.md`](./LOG.md)
