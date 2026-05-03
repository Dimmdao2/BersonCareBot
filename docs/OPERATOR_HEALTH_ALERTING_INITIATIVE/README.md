# Operator Health & Alerting

Инициатива: регулярный мониторинг здоровья интеграций и инфраструктуры, разовые уведомления администратору (Telegram, email, UI), явное разделение **исходящих проб** и **входящих вебхуков**, восстановление после инцидента.

**Канонический план:** [`MASTER_PLAN.md`](MASTER_PLAN.md).

**Фазы (детальные планы):** [A](PHASE_A_DATA_MODEL_AND_CORE_ALERTING.md) · [B](PHASE_B_SYNTHETIC_PROBES_CRON.md) · [C](PHASE_C_INBOUND_WEBHOOK_LAST_STATUS.md) · [D](PHASE_D_EVENT_HOOKS.md) · [E](PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md) · [F](PHASE_F_UI_AND_ADMIN_API.md) · [G](PHASE_G_TESTS_AND_DOCS.md).

**Журнал исполнения:** [`LOG.md`](LOG.md) (ведётся по мере работы).

Связанные документы:

- Текущая вкладка «Здоровье системы»: `apps/webapp/src/app/app/settings/SystemHealthSection.tsx`, `GET /api/admin/system-health`.
- Рубитайм / вебхук: `docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`.
- Конфигурация: `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` (ключи интеграций в `system_settings`, не в env).
