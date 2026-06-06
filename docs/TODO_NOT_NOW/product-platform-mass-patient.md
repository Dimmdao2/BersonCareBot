# Product Platform — mass/patient/guest (отложено)

**Статус:** `deferred` · **On hold** · **Revisit later**

**Дата решения:** 2026-06-06

## Суть

Roadmap «платформы с двумя режимами» (Guest/Mass Mode + Patient Mode, product-status resolver, отдельная навигация, монетизация, CRM-воронки) **не продолжаем** на текущем этапе. Приложение ориентировано на **зарегистрированных** пользователей; **гостевой анонимный режим отменён**.

Инициатива и канон **не удаляются** — архитектурная заготовка на будущее, когда появятся контентная библиотека, платные продуктовые линии, воронки и существенные различия UX «обычный пользователь» vs «пациент на сопровождении».

## План и доки

- План: [`.cursor/plans/archive/product-platform-roadmap_e6f81831.plan.md`](../../.cursor/plans/archive/product-platform-roadmap_e6f81831.plan.md) — этапы 1–10 **cancelled**
- Инициатива: [`../PRODUCT_PLATFORM_INITIATIVE/README.md`](../PRODUCT_PLATFORM_INITIATIVE/README.md)
- Канон tier vs status (справочно): [`../ARCHITECTURE/PLATFORM_ACCESS_TIER_VS_PRODUCT_STATUS.md`](../ARCHITECTURE/PLATFORM_ACCESS_TIER_VS_PRODUCT_STATUS.md)

## Что уже сделано

- Этап 0: терминология access-tier vs product-status зафиксирована в docs (без кода resolver/mass routes).

## Что явно не делать в ближайших волнах

- guest flow, mass mode, отдельные маршруты для анонимов;
- product_status resolver и mode-aware nav;
- монетизация, курсы, CRM-воронки в рамках этой инициативы;
- дополнительная инфраструктура под этапы 2–10.

## Когда брать снова

После появления **нескольких** из: развитая контент-система, уроки/образовательные продукты, автоматические воронки, CRM, продуктовая аналитика, несколько типов подписок, явные различия UX mass vs clinical patient.

## Ближайший приоритет вместо этого

[`../DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/README.md`](../DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/README.md) — hardening Doctor Cabinet runtime (**Patient PWA не трогаем**).
