# HLS reconcile + transcode health metrics (2026-05)

## Решения

- **`video_hls_reconcile_enabled`:** default в миграции **`false`**; включение в админке + cron на хосте после деплоя webapp/media-worker.
- **Reconcile batch:** `POST /api/internal/media-transcode/reconcile` — один вызов = один срез `runVideoHlsLegacyBackfill` с `includeFailed: false`, cap **`limit`** 200, `sleepMsBetweenBatches: 0`, max media size **3 GiB** (как CLI backfill).
- **Метрики транскода в system-health:** из `media_transcode_jobs`; `avgProcessingMsDoneLastHour` только для **`done`** с `processing_started_at` + `finished_at` в последнем часе UTC; `done`/`failed` last hour по **`finished_at`**; stale reclaim / retry сбрасывают timestamps в media-worker (см. `apps/media-worker`).
- **Аудит (хвосты):** reconcile читает тело через `JSON.parse` (битый JSON → `invalid_body`); логи воркера — короткий `errorCode` без полотен stderr; вкладка админки **`?adminTab=system-health`**; ссылка из блока видео на «Здоровье системы»; сжаты пояснения в `SystemHealthSection` для playback.

## Связано (закрытие плана 2026-05)

Инвентари «cron reconcile + транскод + UI health» описаны и закрыты в **`.cursor/plans/cron_and_system_health.plan.md`**; журнал инициативы операторского мониторинга — **`docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md`**. После аудита добавлен **`SYSTEM_HEALTH_TECH_DIAGNOSTICS_TESTID`** и **`SystemHealthSection.primaryLayerInvariants.test.tsx`**.

## Проверки

- `pnpm --dir apps/webapp exec vitest run src/app-layer/media/adminTranscodeHealthMetrics.test.ts src/app/api/internal/media-transcode/reconcile/route.test.ts src/app/api/admin/system-health/route.test.ts src/app/app/settings/SystemHealthSection.test.tsx src/app/app/settings/SystemHealthSection.operatorIncidents.test.tsx src/app/app/settings/SystemHealthSection.primaryLayerInvariants.test.tsx`
- Перед merge: `pnpm run ci`

## Не делали

- Heartbeat systemd для media-worker в этом ответе API.
- Приоритет очереди upload vs backfill (отдельное ТЗ).
