# CURSOR_PLANS_REVIEW_2026-05-01

Ревизия планов из `/home/dev/.cursor/plans` с раскладкой на активные, закрытые и морально устаревшие.

## Что сделано по архивированию

- Перенесены **181** плана с явным признаком закрытия (`todos.status = completed` без `pending`) в:
  - `/home/dev/.cursor/plans/archive/2026-05-01-closed/`
- Перенесены явно устаревшие дубликаты (не закрытые, но потерявшие актуальность) в:
  - `/home/dev/.cursor/plans/archive/2026-05-01-obsolete/`

## Ответ по двум запрошенным планам

### `webapp_startup_optimization_71cef5bc.plan.md`

Статус: **морально устаревший**.  
Причина: план пересекается с уже закрытыми/зафиксированными работами по server-first auth, miniapp стабилизации и auth UX; в рабочем наборе есть более свежий одноимённый трек (`лёгкий,_быстрый_и_стабильный_вход_на_всех_платформах_edb6e13c.plan.md`), а также закрытые инициативы по auth hardening.

Действие: **перенесён в архив**  
`/home/dev/.cursor/plans/archive/2026-05-01-obsolete/webapp_startup_optimization_71cef5bc.plan.md`

### `integration-keys-db-admin_fffecfed.plan.md`

Статус: **актуальный**.  
Причина: в текущем коде integrator всё ещё в ряде мест читает интеграционные ключи из env/runtime config (например Telegram/Rubitime/MAX/SMSC), значит план полного перехода на DB-backed runtime + UI/admin sync остаётся релевантным.

Действие: **оставлен в активных**  
`/home/dev/.cursor/plans/integration-keys-db-admin_fffecfed.plan.md`

## Что осталось в активных `.cursor/plans`

После ревизии осталось:

- **18** планов со статусами `pending/in_progress`;
- **44** планов без явной метки закрытия (не помечены как завершённые, требуют точечной ручной оценки при запуске конкретной задачи).

## Какие файлы признаны морально устаревшими и убраны

Перенесены в `/home/dev/.cursor/plans/archive/2026-05-01-obsolete/`:

- `bigbang-restructure-step1_60c7cfb1.plan.md`
- `bigbang-restructure-step1_b4bd2d76.plan.md`
- `bigbang-restructure-step1_b7788a2d.plan.md`
- `bigbang-restructure-step1_caf49e34.plan.md`
- `isolation-orchestration-rules_205f6bbb.plan.md`
- `isolation-orchestration-rules_71adf76e.plan.md`
- `isolation-orchestration-rules_9ac2bd95.plan.md`
- `isolation-orchestration-rules_a876cb6e.plan.md`
- `worker_retries_architecture_1e4f9d36.plan.md`
- `worker_retries_architecture_871fa162.plan.md`
- `webapp_v1_plan_1f113ea9.plan.md`
- `webapp_v1_plan_4b3e1395.plan.md`
- `landing_redesign_c26be946.plan.md`
- `finalize_domain_migration_7ac50ec4.plan.md`
- `webapp_startup_optimization_71cef5bc.plan.md`

## Примечание по методике

Автоматически в архив ушли только явно закрытые планы.  
Планы без явного флага закрытия не удалялись автоматически, чтобы не потерять потенциально полезные наработки.
