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

При закрытии нового плана: обновить frontmatter по [`.cursor/rules/plan-authoring-execution-standard.mdc`](../../.cursor/rules/plan-authoring-execution-standard.mdc), затем `git mv` файл в этот каталог.
