# PRODUCT_PLATFORM — Roadmap

**Статус инициативы:** `deferred` (2026-06-06). Этапы 1–10 **не реализовывать** до отдельного решения.

План: [`.cursor/plans/archive/product-platform-roadmap_e6f81831.plan.md`](../../.cursor/plans/archive/product-platform-roadmap_e6f81831.plan.md).

## Статус этапов

| Этап | Название | Статус |
|------|----------|--------|
| 0 | Каноны и названия | **done** (только docs) |
| 1 | Channel shell | **cancelled** (deferred) |
| 2 | Guest/Mass Mode | **cancelled** — guest снят с roadmap |
| 3 | Product-status + resolver | **cancelled** (deferred) |
| 4 | Mode-aware nav + home | **cancelled** (deferred) |
| 5 | Booking hub | **cancelled** здесь — см. [`BOOKING_REWORK`](../BOOKING_REWORK_INITIATIVE/README.md) (`done`) |
| 6–10 | Уведомления, SOS, access, money, deep links | **cancelled** (deferred) |

## Что остаётся актуальным без Product Platform

- Только зарегистрированные пользователи; текущий `/app/patient/**` guarded layout.
- access-tier канон: [`PLATFORM_IDENTITY_SPECIFICATION.md`](../ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md) — **без** product_status.
- Entry tg/max как есть — без отдельной «платформенной» волны.
- Booking hub — [`BOOKING_REWORK_INITIATIVE`](../BOOKING_REWORK_INITIATIVE/README.md).

## Ближайшая волна (не этот roadmap)

[`DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE`](../DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/README.md) — Doctor Cabinet runtime (Patient PWA не трогаем).
