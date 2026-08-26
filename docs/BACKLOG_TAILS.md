# Backlog: хвосты по полноте серверных логов

Контекст: подробные диагностические логи webapp + integrator включаются средой автоматически на DEV/TEST и
выключены на PROD. Админского флага для этого нет. Историческая реализация Batch 1 — см.
`.cursor/plans/archive/debug-flag-log-verbosity.plan.md`.

Batch 1 (сделано): integrator `writePort.delivery.attempt.log`, `messageLogs.appendMessageLog`,
`max/webhook`, `rubitime/webhook`; webapp `integratorNotifyChannels`, `sendWebPushToSubscriptions`,
`patientWebPushNotify`, `platformUserReminderWebPushNotify`, `notifyPatientDoctorReply`.
Accessors: `apps/webapp/src/modules/observability/operationalVerboseLog.ts`,
`apps/integrator/src/infra/db/repos/operationalVerboseLog.ts` (+ invalidation в settings/sync).

Batch 1+ (добавлено): `apps/webapp/src/modules/auth/authRouteObservability.ts` (`logAuthRouteTiming`)
загейтен через environment diagnostics (fire-and-forget — без изменений в 6 route-файлах).
`auth/exchange/route.ts`: `console.info success` →
verbose-gated `logger.info`; `console.info access_denied` → всегда `logger.warn` (security reject, без PII).

## Уже НЕ являются prod-шумом (проверено, трогать не нужно)

- `modules/integrator/events.ts` «event received», `modules/integrator/reminderDispatch.ts` — guard
  `NODE_ENV !== "production"` (только dev).
- `auth/service.ts` `resolution_hints_from=…` (3 шт.) — двойной guard `!== "test" && DEBUG_AUTH === "1"`.
- `auth/service.ts` `session_cookie_invalid_or_expired` — guard `!== "production"` (только dev).
- Client-side `console.info` (браузер, не journalctl): `shared/ui/AuthBootstrap.tsx`,
  `shared/ui/media/PatientMediaPlaybackVideo.tsx`, `shared/lib/safeReload.ts`, `modules/auth/authFlowObservability.ts`.

## P2/P3: отдельный батч (prod-active server `console.info`, нужна аккуратность)

Эти строки пишутся в prod (guard `!== "test"`) и содержат PII/printf — требуют решения warn-vs-verbose
и редакции PII, поэтому это отдельный reviewed-батч (не смешивать с feature-флагом; правило «no mixed big sweeps»):

- `auth/service.ts`: `parseToken rejected` (sub), `token_parse_failed`, `whitelist_rejected` (sub, telegramId),
  `uuid_sub_no_platform_row`, `client_session_transport=…`. Reject/fail → канонически `warn` (всегда) со
  структурой без сырых PII; routine — под verbose.
- `infra/repos/pgIdentityResolution.ts`: `path=existing_binding|merge_before_bind|insert_new` (routine; infra
  не должен импортировать `modules/*` → читать флаг через свой pool-путь, а не через `configAdapter`).
- notify-relays/прочее: `modules/messaging/doctorNotifyTargets.ts`, `online-intake/intakeNotificationRelay.ts`,
  `infra/integrations/sms/integratorSmsAdapter.ts`, `modules/platform-access/*` — per-operation success.
- `app/api/admin/settings/route.ts` audit `console.info` — низкочастотный audit; оставить как есть либо
  перевести в `logger.info` (audit, не verbose).
- retention/health/scheduler/web-push tick success, `pwa_launch`, `playback_resolved`, media preview per-item.

Канон уровней: `warn`/`error`/DLQ/retry-fail/constraint/security — всегда; routine `info` success — под verbose.
Verbose-логи не должны содержать сырые `params`/`payload`/PII.

## Runbook: проверка после деплоя

1. На PROD снять baseline шума за ~10 мин:
   ```bash
   journalctl -u bersoncarebot-webapp-prod.service -u bersoncarebot-scheduler-prod.service \
     --since "10 min ago" --no-pager | rg -i "delivery attempt log|webhook received|notify"
   ```
   Ожидание: тихо (только warn/error при инцидентах).
2. На DEV/TEST подробные `info` включены самим режимом среды; в кабинете отдельного переключателя нет.
3. На PROD поток остаётся тихим; `warn`/`error`/DLQ пишутся во всех средах.
