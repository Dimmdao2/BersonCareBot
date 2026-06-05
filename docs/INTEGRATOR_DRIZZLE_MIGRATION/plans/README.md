# Wave 2 — планы по этапам (SQL → Drizzle / сырой pg)

Канон порядка и рисков: [../DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md). Инвентаризация файлов: [../RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md).

| Этап | Файл плана | Статус |
|------|------------|--------|
| 1 — хвост интегратора | [wave2_phase_01_integrator_tail.plan.md](./wave2_phase_01_integrator_tail.plan.md) | completed (ядро; мелкие repos — backlog P1+) |
| 2 — projection health + CLI | [wave2_phase_02_projection_health_sync.plan.md](./wave2_phase_02_projection_health_sync.plan.md) | completed |
| 3 — advisory locks | [wave2_phase_03_advisory_locks.plan.md](./wave2_phase_03_advisory_locks.plan.md) | completed |
| 4 — webapp напоминания | [wave2_phase_04_webapp_reminders.plan.md](./wave2_phase_04_webapp_reminders.plan.md) | completed |
| 5 — webapp медиа | [wave2_phase_05_webapp_media.plan.md](./wave2_phase_05_webapp_media.plan.md) | completed (2026-06-05) |
| 6 — webapp ЛФК | [wave2_phase_06_webapp_lfk.plan.md](./wave2_phase_06_webapp_lfk.plan.md) | completed (2026-06-05) |
| 7 — webapp auth / rate limits | [wave2_phase_07_webapp_auth_rate_limits.plan.md](./wave2_phase_07_webapp_auth_rate_limits.plan.md) | completed (2026-06-05) |
| 8 — пакеты, media-worker, скрипты | [wave2_phase_08_packages_worker_scripts.plan.md](./wave2_phase_08_packages_worker_scripts.plan.md) | **completed** (2026-06-05) |

После выполнения этапа: обновить `todos.status` в соответствующем plan-файле, секцию «Закрытие» (если есть), индекс таблицы ниже, [DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md) и кратко зафиксировать в [../LOG.md](../LOG.md).

## Решения перед исполнением Wave 2

- **Drizzle сначала, дедуп позже:** Wave 2 не меняет модель данных и не удаляет дублирующие сущности. Дедуп `integrator.rubitime_*`, перевод чтений на `public.booking_*` и удаление зеркал — отдельный cutover после стабилизации Drizzle-волны.
- **`bookingProfilesRepo`:** в этапе 1 переводится на Drizzle поверх текущих `integrator.rubitime_*`; cutover v1/v2 и отказ от legacy v1 не входят в этап.
- **`system_settings`:** в этапе 1 `settingsSyncRoute` меняет только реализацию upsert на Drizzle. HTTP sync и зеркало `integrator.system_settings` сохраняются до отдельного refactor/cutover.
- **Projection health CLI:** этап 2 делает один runtime-канон метрик. Исполняемый CLI переносится в `src/infra/scripts/projection-health.ts` и импортирует общий core; `scripts/projection-health.mjs` остаётся только thin compatibility wrapper без SQL.
- **Drizzle builder для projection health:** не входит в DoD этапа 2. Цель этапа — единые цифры CLI/HTTP; builder-миграция агрегатов допускается отдельным follow-up.
- **Advisory в медиа:** этап 3 трогает только lock wrapper/семантику advisory. Остальной SQL `s3MediaStorage` и медиа-репозиториев остаётся этапу 5.
- **Webapp reminders scope:** этап 4 включает все reminder repos с `pool.query` / `client.query`, включая `pgWebPushOnlyReminders.ts` и `pgReminderTransactionalEmailCooldown.ts`.
- **Integrator tail (этап 1):** закрыт по **ядру** (очередь, booking profiles, settings sync, audit/attempts, worker SQL); полный список «мелких repos» из ранней декомпозиции — **backlog P1+**, не блокирует `status: completed` (см. план §Закрытие).
- **Auth scope:** этап 7 меняет только ветки с сырой SQL; modules не импортируют infra напрямую, новые SQL-порты идут через существующую DI/ports схему.
- **Этап 8:** исполняется под-PR/под-задачами: `platform-merge`, `booking-rubitime-sync`, `media-worker`, scripts — **закрыт (2026-06-05)**; см. [wave2_phase_08](./wave2_phase_08_packages_worker_scripts.plan.md). Дальше: фаза **IX** (`processTranscodeJob`), фаза **X** (прочие `pg*`).

## Gate-контракт для каждого этапа

1. **Перед кодом:** выполнить `rg` из phase-plan, сверить с `RAW_SQL_INVENTORY.md`, записать в LOG фактический scope и явные out-of-scope.
2. **Во время кода:** менять только слой, указанный в `Scope`; route handlers остаются thin, webapp modules не импортируют infra/db/repos.
3. **Escape hatch:** claim/advisory/сложный dynamic SQL не переводить в builder, если это ухудшает эквивалентность; использовать Drizzle `execute(sql)` с комментарием и тестом на ключевую семантику.
4. **После кода:** targeted `rg` на остатки `pool.query`/`client.query`/`db.query`, typecheck/test по затронутому пакету, запись в LOG.
5. **Статусы:** не помечать todo/DoD закрытыми без фактической проверки. Отменённые части фиксировать `status: cancelled` с причиной, а не оставлять как “на потом”.

## Решённые сложности для агентов

| Сложность | Решение Wave 2 |
|-----------|----------------|
| Дедуп `rubitime_*` напрашивается рядом с `bookingProfilesRepo` | Не делать в Wave 2. Только Drizzle-эквивалент текущих таблиц. |
| Зеркало `system_settings` выглядит лишним при unified DB | Не снимать. Только Drizzle upsert в `settingsSyncRoute`; refactor/cutover отдельно. |
| Claim-запросы с `SKIP LOCKED` плохо ложатся в builder | Оставлять `execute(sql)` и тестировать SQL/поведение claim. |
| Advisory locks зависят от connection/transaction | Менять только call wrapper, не ключи и не session/xact режим. |
| Общий schema package может понадобиться в `media-worker` | В этапе 8 под-PR C сначала принимается schema decision; при необходимости shared package оформляется отдельным планом до runtime-кода. |
| Ops scripts неоднородны | Runtime scripts должны использовать core/repo; one-off/backfill/report scripts могут остаться `pg-only` с записью в LOG. |
