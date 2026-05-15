# Wave 2 — планы по этапам (SQL → Drizzle / сырой pg)

Канон порядка и рисков: [../DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md). Инвентаризация файлов: [../RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md).

| Этап | Файл плана |
|------|------------|
| 1 — хвост интегратора | [wave2_phase_01_integrator_tail.plan.md](./wave2_phase_01_integrator_tail.plan.md) |
| 2 — projection health + CLI | [wave2_phase_02_projection_health_sync.plan.md](./wave2_phase_02_projection_health_sync.plan.md) |
| 3 — advisory locks | [wave2_phase_03_advisory_locks.plan.md](./wave2_phase_03_advisory_locks.plan.md) |
| 4 — webapp напоминания | [wave2_phase_04_webapp_reminders.plan.md](./wave2_phase_04_webapp_reminders.plan.md) |
| 5 — webapp медиа | [wave2_phase_05_webapp_media.plan.md](./wave2_phase_05_webapp_media.plan.md) |
| 6 — webapp ЛФК | [wave2_phase_06_webapp_lfk.plan.md](./wave2_phase_06_webapp_lfk.plan.md) |
| 7 — webapp auth / rate limits | [wave2_phase_07_webapp_auth_rate_limits.plan.md](./wave2_phase_07_webapp_auth_rate_limits.plan.md) |
| 8 — пакеты, media-worker, скрипты | [wave2_phase_08_packages_worker_scripts.plan.md](./wave2_phase_08_packages_worker_scripts.plan.md) |

После выполнения этапа: обновить `todos.status` в соответствующем plan-файле и кратко зафиксировать в [../LOG.md](../LOG.md).
