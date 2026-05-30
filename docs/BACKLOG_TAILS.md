# Backlog: хвосты по полноте серверных логов (`debug_forward_to_admin`)

Контекст: флаг `debug_forward_to_admin` (admin `system_settings`) переключает полноту серверных
логов webapp + integrator. Реализация Batch 1 — см. `.cursor/plans/archive/debug-flag-log-verbosity.plan.md`
(перенесённый план) либо `.cursor/plans/debug-flag-log-verbosity_9c77baf5.plan.md`.

Batch 1 (сделано): integrator `writePort.delivery.attempt.log`, `messageLogs.appendMessageLog`,
`max/webhook`, `rubitime/webhook`; webapp `integratorNotifyChannels`, `sendWebPushToSubscriptions`,
`patientWebPushNotify`, `platformUserReminderWebPushNotify`, `notifyPatientDoctorReply`.
Accessors: `apps/webapp/src/modules/observability/operationalVerboseLog.ts`,
`apps/integrator/src/infra/db/repos/operationalVerboseLog.ts` (+ invalidation в settings/sync).

## P2/P3: не входит в Batch 1 (загейтить позже под тот же флаг)

- `apps/webapp/src/modules/auth/authRouteObservability.ts` (`logAuthRouteTiming`) — success-тайминги
  auth-роутов. Вызывается из ~6 route-файлов без доступа к `systemSettings` в сигнатуре; протаскивание
  флага = bloat. Деферрено по правилу «не тащить deps через стек» (plan §5/§6.3). `warn` при denied остаётся.
- retention success ticks, system health probe OK (routine success).
- `pwa_launch`, `playback_resolved`, media preview per-item (per-request success).
- identity resolution `console.info`, auth/service массив `console.info` — заменить на `logger` + gate либо удалить.
- rubitime post-create steps (success-логи шагов после создания записи).
- scheduler / web-push tick success (периодические тики).

Канон уровней: `warn`/`error`/DLQ/retry-fail/constraint/security — всегда; routine `info` success — под verbose.
Verbose-логи не должны содержать сырые `params`/`payload`/PII.

## Runbook: проверка после деплоя

1. Baseline: при `flag=false` снять шум за ~10 мин:
   ```bash
   journalctl -u bersoncarebot-webapp-prod.service -u bersoncarebot-worker-prod.service \
     --since "10 min ago" --no-pager | rg -i "delivery attempt log|webhook received|notify"
   ```
   Ожидание: тихо (только warn/error при инцидентах).
2. Включить «Debug: подробные серверные логи» в кабинете (admin Settings) → подробные `info` появляются
   в integrator и webapp без рестарта (integrator — через invalidation в settings/sync; webapp — TTL ≤30 c).
3. Выключить → поток снова тихий; `warn`/`error`/DLQ остаются.
