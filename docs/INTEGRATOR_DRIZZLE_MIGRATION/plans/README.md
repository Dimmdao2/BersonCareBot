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

## Wave 3 — финальный closeout

Индекс: [wave3_INDEX.md](./wave3_INDEX.md). Решения до старта: [wave3_DECISIONS.md](./wave3_DECISIONS.md) (**зафиксированы**; фаза 16 остаётся условной по результатам 09–15).

| Фаза | Файл плана | Статус |
|------|------------|--------|
| 00 — baseline + ADR | [wave3_phase_00_baseline_adr.plan.md](./wave3_phase_00_baseline_adr.plan.md) | **completed** (2026-06-05) |
| 08 — integrator schema reduction | [wave3_phase_08_integrator_schema_reduction.plan.md](./wave3_phase_08_integrator_schema_reduction.plan.md) | **completed** (2026-06-06; non-destructive) |
| 09 — integrator P1+ (09A-09E) | [wave3_phase_09_integrator_p1plus.plan.md](./wave3_phase_09_integrator_p1plus.plan.md) | **completed** (2026-06-06; post-audit closure) |
| 10 — media-worker IX (10A-10C) | [wave3_phase_10_media_worker_ix.plan.md](./wave3_phase_10_media_worker_ix.plan.md) | **completed** (2026-06-06) |
| 11 — webapp app-layer / auth tail | [wave3_phase_11_webapp_app_layer_auth.plan.md](./wave3_phase_11_webapp_app_layer_auth.plan.md) | **completed** (2026-06-06; `runPgPoolPgText`, Zod config/idempotency, post-audit RAW_SQL) |
| 12 — intake / purge / identity (12A-12E) | [wave3_phase_12_webapp_intake_purge_identity.plan.md](./wave3_phase_12_webapp_intake_purge_identity.plan.md) | in progress (**12A–12B done** 2026-06-06) |
| 13 — booking / doctor (13A-13E) | [wave3_phase_13_webapp_booking_doctor.plan.md](./wave3_phase_13_webapp_booking_doctor.plan.md) | pending |
| 14 — comms / projection (14A-14E) | [wave3_phase_14_webapp_comms_projection.plan.md](./wave3_phase_14_webapp_comms_projection.plan.md) | pending |
| 15 — webapp long tail (15A-15F) | [wave3_phase_15_webapp_long_tail.plan.md](./wave3_phase_15_webapp_long_tail.plan.md) | pending |
| 16 — условный legacy cutover | [wave3_phase_16_legacy_cutover.plan.md](./wave3_phase_16_legacy_cutover.plan.md) | pending |
| 17 — closeout | [wave3_phase_17_closeout.plan.md](./wave3_phase_17_closeout.plan.md) | pending |

Детальная рабочая декомпозиция зафиксирована в `wave3_INDEX.md` и внутри phase-файлов:

- 09: `09A-09E`
- 10: `10A-10C`
- 12: `12A-12E`
- 13: `13A-13E`
- 14: `14A-14E`
- 15: `15A-15F`

После выполнения этапа: обновить `todos.status` в соответствующем plan-файле, секцию «Закрытие» (если есть), индекс таблицы ниже, [DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md) и кратко зафиксировать в [../LOG.md](../LOG.md).

## Исполнение через composer (Wave 3: 09/10)

- `1 composer run = 1 PR = 1 фаза`; фазы **09** и **10** запускать отдельными прогонами/PR.
- Порядок внутри фаз обязателен: `09A→09B→09C→09D→09E`; `10A→10B→10C`.
- Для DB/json-границ в фазах **09–15** обязательна Zod-валидация; новый `JSON.parse(... ) as unknown` запрещён.
- Staging smoke gate обязателен перед closeout (фаза 17), но не блокирует старт фаз 09/10.

## Решения перед исполнением Wave 2

- **Drizzle сначала, дедуп позже:** Wave 2 не меняет модель данных и не удаляет дублирующие сущности. Дедуп `integrator.rubitime_*`, перевод чтений на `public.booking_*` и удаление зеркал — отдельный cutover после стабилизации Drizzle-волны.
- **`bookingProfilesRepo`:** в этапе 1 переводится на Drizzle поверх текущих `integrator.rubitime_*`; cutover v1/v2 и отказ от legacy v1 не входят в этап.
- **`system_settings`:** в этапе 1 `settingsSyncRoute` меняет только реализацию upsert на Drizzle. HTTP sync и зеркало `integrator.system_settings` сохранялись до Wave 3 phase 08; после phase 08 runtime-readers читают `public.system_settings`, а sync route — только legacy compatibility.
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
| Зеркало `system_settings` выглядит лишним при unified DB | Wave 2 не снимала. Wave 3 phase 08 сняла runtime-зависимость: reads → `public.system_settings`; legacy sync route не удалён без owner-approved M2M cleanup. |
| Claim-запросы с `SKIP LOCKED` плохо ложатся в builder | Оставлять `execute(sql)` и тестировать SQL/поведение claim. |
| Advisory locks зависят от connection/transaction | Менять только call wrapper, не ключи и не session/xact режим. |
| Общий schema package может понадобиться в `media-worker` | В этапе 8 под-PR C сначала принимается schema decision; при необходимости shared package оформляется отдельным планом до runtime-кода. |
| Ops scripts неоднородны | Runtime scripts должны использовать core/repo; one-off/backfill/report scripts могут остаться `pg-only` с записью в LOG. |
