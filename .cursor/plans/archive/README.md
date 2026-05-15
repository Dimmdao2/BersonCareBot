# Архив Cursor-планов (`status: completed`)

Закрытые планы хранятся здесь, чтобы в **`.cursor/plans/*.plan.md`** (корень) оставались только **активные** треки.

## Активные планы (корень `.cursor/plans/`)

- `integrator_drizzle_migration_master.plan.md`
- `integrator_drizzle_phase_1_simple_repos.plan.md`
- `integrator_drizzle_phase_2_outbox_job_queue.plan.md`
- `integrator_drizzle_phase_3_domain_repos.plan.md`
- `integrator_drizzle_phase_4_complex_sql.plan.md`

Журнал: `docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`.

## Содержимое этого каталога

Все файлы `*.plan.md` здесь имеют в frontmatter **`status: completed`** (и/или все `todos: completed`). Ссылки из документации обновляйте на путь **`.cursor/plans/archive/<имя-файла>`**.

- **`max_tg_pre-prod_automation.plan.md`** — MAX webhook / игнорируемые `update_type` в `fromMax`, Telegram `reminders.skip.applyPreset` + `postOccurrenceSkip`, CI; журнал: [`docs/ARCHITECTURE/MAX_PREPROD_AUTOMATION_LOG.md`](../../docs/ARCHITECTURE/MAX_PREPROD_AUTOMATION_LOG.md).
- **`telegram_menu_reply_admin.plan.md`** — Telegram: админское меню slash-команд (`setupMenuButton`), reply/inline главное меню (две кнопки), неотвеченные + «пометить все»; см. [`docs/ARCHITECTURE/SCENARIO_LOGIC_SUMMARY.md`](../../docs/ARCHITECTURE/SCENARIO_LOGIC_SUMMARY.md) и [`docs/ARCHITECTURE/CONTENT_AND_SCRIPTS_FLOW.md`](../../docs/ARCHITECTURE/CONTENT_AND_SCRIPTS_FLOW.md).
- **`admin_incident_alerts.plan.md`** — relay TG/Max для инцидентов идентичности (`admin_incident_alert_config`); см. [`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](../../docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md), [`docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/PHASE_D_EVENT_HOOKS.md`](../../docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/PHASE_D_EVENT_HOOKS.md).

При закрытии нового плана: обновить frontmatter по [`.cursor/rules/plan-authoring-execution-standard.mdc`](../../.cursor/rules/plan-authoring-execution-standard.mdc), затем **`git mv`** исходный `*.plan.md` **в этот каталог** (или **`mv`** + `git add`, если файл ещё не в git). **Не** заменять исходник stub-ом во `~/.cursor/plans/` и **не** копировать текст плана в репо вместо физического переноса файла — см. п. **9** того же правила.
