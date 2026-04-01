# Legacy `rubitime_booking_profiles` mapping

Интегратор хранит таблицы `rubitime_*` и профили `rubitime_booking_profiles`, которые маппят **v1** запросы `(booking_type, category_code, city_code)` на Rubitime `branch_id` / `cooperator_id` / `service_id`.

- **Hot path очной записи v2:** webapp передаёт явные Rubitime ID в M2M (`version: "v2"`); `resolveBookingProfile` не вызывается.
- **Отключение legacy:** переменная окружения `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false` — v1 запросы к `/slots` и `/create-record`, которые полагаются на профили, получают `legacy_resolve_disabled` (v2 не затрагивается).

См. также `bookingScheduleMapping.ts`, `legacyResolveFlag.ts`, `STAGE_5_INTEGRATOR_BRIDGE_AND_CUTOVER.md`.
