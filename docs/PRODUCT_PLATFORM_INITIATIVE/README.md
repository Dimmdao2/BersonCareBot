# PRODUCT_PLATFORM_INITIATIVE — платформа: режимы, каналы, массовый вход

**Статус:** `active` (этап 0 — `done`; этапы 1–10 — `pending`)
**Дата старта:** 2026-06-06

Одна платформа: единый пользователь, единый контент, несколько каналов (PWA, Telegram, MAX, сайт). Текущий клинический кабинет **не переписываем** — он становится **Patient Mode**. Вокруг него — **Mass Mode** (guest/lead/customer), channel shells и **product-status** отдельно от **access-tier**.

## Документы

1. [`ROADMAP.md`](ROADMAP.md) — этапы 0–10, DoD, риски, порядок запуска.
2. [`PHASE_DECOMPOSITION.md`](PHASE_DECOMPOSITION.md) — подэтапы для исполнения агентами (обязательные чеклисты).
3. [`LOG.md`](LOG.md) — журнал выполнения.
4. Канон терминов: [`../ARCHITECTURE/PLATFORM_ACCESS_TIER_VS_PRODUCT_STATUS.md`](../ARCHITECTURE/PLATFORM_ACCESS_TIER_VS_PRODUCT_STATUS.md).
5. План Cursor: [`.cursor/plans/archive/product-platform-roadmap_e6f81831.plan.md`](../../.cursor/plans/archive/product-platform-roadmap_e6f81831.plan.md).

## Границы (кратко)

**В scope:** channel shell `/app/tg` `/app/max`, Mass shell, product-status resolver, mode-aware nav/home, booking hub как единая точка, единые уведомления, warmups/SOS, access rules, deep links.

**Вне scope без решения:** отдельный кабинет в боте; дубли CMS под каналы; оплата до guest/mass + access rules; смешение `accessTier patient` с product `patient`.

## Связанные инициативы

- Booking hub (уже `done`): [`../BOOKING_REWORK_INITIATIVE/README.md`](../BOOKING_REWORK_INITIATIVE/README.md)
- Identity / tier: [`../ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md`](../ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md)
- Курсы (отложены): [`../COURSES_INITIATIVE/README.md`](../COURSES_INITIATIVE/README.md)
- APP restructure IA: [`../APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md`](../APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md)
