# PRODUCT_PLATFORM — Roadmap

Зеркало плана [`.cursor/plans/archive/product-platform-roadmap_e6f81831.plan.md`](../../.cursor/plans/archive/product-platform-roadmap_e6f81831.plan.md). Подэтапы — [`PHASE_DECOMPOSITION.md`](PHASE_DECOMPOSITION.md).

## Статус этапов

| Этап | Название | Статус |
|------|----------|--------|
| 0 | Каноны и названия | **done** |
| 1 | Channel shell `/app/tg` `/app/max` | pending |
| 2 | Guest/Mass Mode | pending |
| 3 | Product-status + resolver | pending |
| 4 | Mode-aware nav + home | pending |
| 5 | Booking hub | pending (база ~готова) |
| 6 | Уведомления и рассылки | pending |
| 7 | Warmups / SOS | pending |
| 8 | Public programs + access rules | pending |
| 9 | Монетизация | pending |
| 10 | Deep links + сайт | pending |

## Текущий baseline (что уже есть)

- Entry split: `/app/tg`, `/app/max`, `AppEntryRsc`, cookies `bersoncare_platform` / `bersoncare_messenger_surface` — см. [`platform.md`](../../apps/webapp/src/shared/lib/platform.md).
- access-tier: `modules/platform-access`, спека [`PLATFORM_IDENTITY_SPECIFICATION.md`](../ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md).
- Patient nav: «Сегодня / Упражнения / Статистика / Запись / Чат» — [`navigation.ts`](../../apps/webapp/src/app-layer/routes/navigation.ts).
- Booking hub: [`BOOKING_REWORK_INITIATIVE`](../BOOKING_REWORK_INITIATIVE/README.md) — `done`.
- `doctor_patient_support` — источник «на сопровождении» для product patient.
- Patient home blocks (CMS): warmups, SOS cards — переиспользуемы для Mass, но сейчас за guarded layout.

## Рекомендуемый порядок

1. **0–1** — канон + channel shell (малый diff).
2. **2–4** — главный перелом (два режима).
3. **5** — закрепить booking hub.
4. **6** — до расширения каналов (анти-дубли рассылок).
5. **7–9** — mass content и деньги.
6. **10** — внешние входы после стабилизации ядра.

## Definition of Done (весь roadmap)

- [ ] Mass Mode и Patient Mode независимы.
- [x] product-status описан отдельно от access-tier (док).
- [ ] `/app/tg` `/app/max` — channel shells, не кабинеты.
- [ ] Booking hub — записи, история, абонементы, одна точка.
- [ ] Уведомления — один intent, много каналов.
- [ ] SOS/warmups — измеримые сценарии.
- [ ] Customer без product patient.
- [ ] Patient status — специалист/программа, не регистрация.
- [ ] Бот без полного дневника/каталога/статистики.

## Основные риски

См. план §«Основные риски». Критично: не встраивать guest в `patient/layout.tsx`; не делать оплату до access rules; не дублировать CMS/рассылки по каналам.
