# Operator Health & Alerting

Инициатива: регулярный мониторинг здоровья интеграций и инфраструктуры, разовые уведомления администратору (Telegram, email, UI), явное разделение **исходящих проб** и **входящих вебхуков**, восстановление после инцидента.

**Канонический план:** [`MASTER_PLAN.md`](MASTER_PLAN.md).

**MVP (улучшенный план реализации):** [`MVP_IMPLEMENTATION_PLAN.md`](MVP_IMPLEMENTATION_PLAN.md)

**Фазы (детальные планы):** [A](PHASE_A_DATA_MODEL_AND_CORE_ALERTING.md) · [B](PHASE_B_SYNTHETIC_PROBES_CRON.md) · [C](PHASE_C_INBOUND_WEBHOOK_LAST_STATUS.md) · [D](PHASE_D_EVENT_HOOKS.md) · [E](PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md) · [F](PHASE_F_UI_AND_ADMIN_API.md) · [G](PHASE_G_TESTS_AND_DOCS.md).

**Журнал исполнения:** [`LOG.md`](LOG.md) (ведётся по мере работы).

Связанные документы:

- Текущая вкладка «Здоровье системы»: [`SystemHealthSection.tsx`](../../apps/webapp/src/app/app/settings/SystemHealthSection.tsx), сбор [`collectAdminSystemHealthData.ts`](../../apps/webapp/src/app-layer/health/collectAdminSystemHealthData.ts) → `GET /api/admin/system-health`.
- Очередь **`integrator_push_outbox`** (карточка health, аудит, proactive guard-tick): закрытый план [`.cursor/plans/archive/admin_db_guard_monitoring.plan.md`](../../.cursor/plans/archive/admin_db_guard_monitoring.plan.md), запись в [`LOG.md`](LOG.md) § 2026-05-15.
- Пороги **`videoTranscode.status`** (`ok` \| `degraded` \| `error`): [`adminHealthThresholds.ts`](../../apps/webapp/src/modules/operator-health/adminHealthThresholds.ts); тик reconcile в **`operator_job_status`**: [`reconcile/route.ts`](../../apps/webapp/src/app/api/internal/media-transcode/reconcile/route.ts) + [`pgOperatorHealthWrite.ts`](../../apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts).
- План cron reconcile HLS backlog + расширения health/UI: [`.cursor/plans/archive/cron_and_system_health.plan.md`](../../.cursor/plans/archive/cron_and_system_health.plan.md).
- Архив метрик reconcile / system-health (команды проверок): [`docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/HLS_RECONCILE_METRICS_LOG.md`](../archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/HLS_RECONCILE_METRICS_LOG.md).
- Рубитайм / вебхук: `docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`.
- Конфигурация: `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` (ключи интеграций в `system_settings`, не в env).
- **Инциденты идентичности (внешняя доставка TG/Max):** ключ **`admin_incident_alert_config`** (admin) — relay для channel-link, первого открытия `auto_merge_conflict`, projection anomaly, messenger phone bind; **не** смешивать с пробами operator health. Закрытый план: [`.cursor/plans/archive/admin_incident_alerts.plan.md`](../../.cursor/plans/archive/admin_incident_alerts.plan.md); дедуп и хуки — [`PHASE_D_EVENT_HOOKS.md`](PHASE_D_EVENT_HOOKS.md).
