# Онлайн-запись: реабилитация и нутрициология

Инициатива: **запись пациента на онлайн-консультации** по направлениям **реабилитация** и **нутрициология** — отдельный продуктовый и технический контур, **не** опирающийся на Rubitime (очередь слотов через `rubitime_booking_profiles` / M2M v1 к `/rubitime/slots`).

## Зафиксированный разрыв (prod-симптом)

В логах webapp при попытках онлайн-записи появляется `slots_mapping_not_configured` / `[booking/slots] getSlots failed`, потому что запрос уходит в интеграторный путь слотов Rubitime. **Онлайн-консультации по этим категориям не должны идти в Rubitime** — текущее поведение считается ошибкой маршрутизации/модели, а не «не настроили маппинг».

## Документы инициативы

- **Журнал исполнения:** [`LOG.md`](LOG.md)
- **Структура целевого решения (ТЗ, этапы, контракты):** *будет добавлена позже владельцем инициативы.*

## Связанные материалы репозитория

- Текущий Rubitime-пайплайн (вебхук, события): [`docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md)
- Чеклист по логам prod (см. пункты слотов / v1): [`.cursor/plans/production_log_findings_2026-05-14.plan.md`](../../.cursor/plans/production_log_findings_2026-05-14.plan.md)
- Legacy-маппинг v1 → Rubitime IDs: `apps/integrator/src/integrations/rubitime/bookingScheduleMapping.ts`, `LEGACY_BOOKING_PROFILES.md`
