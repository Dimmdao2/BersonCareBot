# Rubitime retirement R5 — TEST proof template

> **SUPERSEDED 2026-07-15.** The former template was for an external operation and must not be executed.
> Authority: [`OWNER_RULINGS_2026-07-15.md:87-104`](OWNER_RULINGS_2026-07-15.md).

## Required TEST evidence

- TEST integrated SHA and declared monitoring-window start/end.
- aggregate v1 `/api/bersoncare/rubitime/slots` request count and aggregate v1 `/api/bersoncare/rubitime/create-record` request count.
- TEST negative/unmounted result for the retired v1 routes, without assuming `legacy_resolve_disabled`.
- canonical slots/create/reschedule/cancel and doctor Today/KPI/calendar/list smoke.
- aggregate-only source of route/error counts without secrets or PII.
- incremental code rollback boundary, if tested, without re-enabling the removed resolver.

Do not rename this template into a final proof until all TEST evidence is present.
