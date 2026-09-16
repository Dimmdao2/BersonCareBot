# Правила и операционные каноны

Каталог **`docs/RULES/`** — нормативные документы исполнения и журналы выката, сгруппированные отдельно от **`docs/ARCHITECTURE/`** (устойчивое описание платформы и рантайма).

## Содержимое

- **[`TREATMENT_PROGRAM_EXECUTION_RULES.md`](./TREATMENT_PROGRAM_EXECUTION_RULES.md)** — абсолюты по программам лечения / ЛФК / фазам / Drizzle; отражены в `.cursor/rules/clean-architecture-module-isolation.mdc`.
- **[`SAAS_FOUNDATION_AWARE_DEVELOPMENT.md`](./SAAS_FOUNDATION_AWARE_DEVELOPMENT.md)** — обязательное правило для новых разработок и изменений БД/кода: учитывать `SAAS_FOUNDATION`, не добавлять unscoped данные по умолчанию, явно выбирать `organization_id` / `specialist_id` / scoped ownership path.
- **[`REMINDERS_SETTINGS_DRIZZLE_ONLY/`](./REMINDERS_SETTINGS_DRIZZLE_ONLY/README.md)** — DDL и процесс для `reminder_*`, projection и `system_settings` в webapp (только Drizzle + согласование с integrator).
- **[`OPERATIONS/`](./OPERATIONS/REMINDER_SCHEDULER_ROLLOUT_LOG.md)** — пошаговые журналы прод-выката (сейчас: scheduler напоминаний).

Сводный указатель всей документации: [`../README.md`](../README.md).
