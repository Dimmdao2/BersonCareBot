# Operator Health & Alerting

Инициатива: регулярный мониторинг здоровья интеграций и инфраструктуры, разовые уведомления администратору (Telegram, email, UI), явное разделение **исходящих проб** и **входящих вебхуков**, восстановление после инцидента.

**Канонический план:** [`MASTER_PLAN.md`](MASTER_PLAN.md).

**Журнал исполнения:** [`LOG.md`](LOG.md) (ведётся по мере работы).

Связанные документы:

- Текущая вкладка «Здоровье системы»: `apps/webapp/src/app/app/settings/SystemHealthSection.tsx`, `GET /api/admin/system-health`.
- Рубитайм / вебхук: `docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`.
- Конфигурация: `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` (ключи интеграций в `system_settings`, не в env).
