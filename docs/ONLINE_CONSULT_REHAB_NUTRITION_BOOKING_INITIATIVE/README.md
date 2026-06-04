# Онлайн-запись: реабилитация и нутрициология

**Статус (2026-06): инициатива автозаписи отменена.**

Продуктовое решение: **не** делать онлайн-автозапись по реабилитации и нутрициологии (ни Rubitime, ни отдельный контур слотов). Пациент обращается **через запрос** (существующие каналы поддержки/заявки), не через выбор слотов в кабинете.

Исторический контекст: в логах prod (14–15.05.2026) при попытках автозаписи уходили запросы в Rubitime → `slots_mapping_not_configured`; это больше не трактуется как задача на доработку интеграции.

## Документы

- **Журнал:** [`LOG.md`](LOG.md)
- Чеклист prod-логов (архив): [`.cursor/plans/archive/production_log_findings_2026-05-14.plan.md`](../../.cursor/plans/archive/production_log_findings_2026-05-14.plan.md) (пункт `online-consult-slots-rubitime-misroute` — cancelled)

## Связанные материалы

- Запись очная / BOOKING_REWORK: [`docs/BOOKING_REWORK_INITIATIVE/README.md`](../BOOKING_REWORK_INITIATIVE/README.md)
- Rubitime-пайплайн: [`docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md)
