# PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE

Документированная follow-up инициатива после `PATIENT_APP_STYLE_TRANSFER_INITIATIVE`.

Цель: отдельно, без смешивания со style-transfer, проверить и при необходимости выровнять patient UI с существующими UI primitives в стиле shadcn (`Button`, `Card`, `Badge`, …). Недостающие **`Accordion` / `Collapsible`** добавлены в shared-слой (Phase 1); кабинет — Phase 2; **`FeatureCard` на `Card`** — Phase 3 (2026-05-04); профиль **`ProfileAccordionSection` → `Collapsible`** — Phase 4 (2026-05-04); уведомления **`ChannelNotificationToggles` → `Switch`** — Phase 5 (2026-05-04); **form controls** (support, diary + FAB `QuickAddPopup`, профиль OTP/purge, intake) — Phase 6 (2026-05-04); далее — Phase 7+ (`MASTER_PLAN`).

Важно: локальный `Button` реализован через `@base-ui/react/button` и `buttonVariants`; на момент аудита у него **нет** `asChild` API. Для link-like кнопок текущий безопасный путь — `Link` + `buttonVariants(...)` / patient action classes, либо отдельный adapter после осознанного решения.

Базовый визуальный стандарт для всех фаз: [`../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`](../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md).

## Статус исполнения (сводка)

| Фаза | Статус | Где зафиксировано |
|------|--------|-------------------|
| Phase 0 — инвентаризация | ✅ 2026-05-04 | [`TASKS.md`](TASKS.md) (чеклист + таблицы), [`LOG.md`](LOG.md) |
| Phase 1 — примитивы `Collapsible` / `Accordion` | ✅ 2026-05-04 | Код: `apps/webapp/src/components/ui/collapsible.tsx`, `accordion.tsx` (обёртки `@base-ui/react`, без новых npm-зависимостей; **без** правок patient routes). [`LOG.md`](LOG.md), [`TASKS.md`](TASKS.md) §Phase 1 |
| Phase 2 — кабинет (журнал прошлых приёмов + бейдж статуса) | ✅ 2026-05-04 | `CabinetPastBookings.tsx`, `AppointmentStatusBadge.tsx` + vitest |
| Phase 3 — `FeatureCard` / `Card` (sections) | ✅ 2026-05-04 | [`FeatureCard.tsx`](../../apps/webapp/src/shared/ui/FeatureCard.tsx), vitest + маршруты sections; follow-up: `<article>` + `h3` для locked, удалён неиспользуемый `PatientHomeLessonsSection` (см. `LOG.md`) |
| Phase 4 — профиль (`ProfileAccordionSection` / `Collapsible`) | ✅ 2026-05-04 | [`ProfileAccordionSection.tsx`](../../apps/webapp/src/app/app/patient/profile/ProfileAccordionSection.tsx), [`ProfileAccordionSection.test.tsx`](../../apps/webapp/src/app/app/patient/profile/ProfileAccordionSection.test.tsx); см. `LOG.md` |
| Phase 5 — уведомления (`ChannelNotificationToggles` / `Switch`) | ✅ 2026-05-04 | [`ChannelNotificationToggles.tsx`](../../apps/webapp/src/app/app/patient/notifications/ChannelNotificationToggles.tsx), [`ChannelNotificationToggles.test.tsx`](../../apps/webapp/src/app/app/patient/notifications/ChannelNotificationToggles.test.tsx); см. `LOG.md` |
| Phase 6 — form controls (`Textarea` / `Select` / `Switch` / `RadioGroup`, intake) | ✅ 2026-05-04 | [`TASKS.md`](TASKS.md) §Phase 6, [`LOG.md`](LOG.md); примитив [`radio-group.tsx`](../../apps/webapp/src/components/ui/radio-group.tsx) |
| Phase 7+ | не начаты | [`MASTER_PLAN.md`](MASTER_PLAN.md) §Phase 7 |

Связь с глобальным roadmap: [`../APP_RESTRUCTURE_INITIATIVE/README.md`](../APP_RESTRUCTURE_INITIATIVE/README.md), [`../APP_RESTRUCTURE_INITIATIVE/LOG.md`](../APP_RESTRUCTURE_INITIATIVE/LOG.md) (запись 2026-05-04).

## Почему отдельная инициатива

В global audit Style Transfer зафиксировано:

- широкого ухода от shadcn primitives в текущей инициативе **не произошло**;
- shadcn primitives продолжают использоваться в patient routes;
- часть patient UI построена поверх `patientVisual.ts` / patient-specific style classes, что соответствует цели Style Transfer;
- отдельные raw controls и custom surfaces лучше рассматривать как отдельный UI consistency/refactor pass, а не как mandatory fix Style Transfer.

## Не трогаем в этой инициативе без отдельного решения

- Новую `PatientHomeToday` / текущую новую главную пациента (`/app/patient`) как продуктовый экран.
- Контент, copy, порядок блоков, IA, routes и product flow.
- Business/API/DB/env/integrator logic.
- Doctor/admin UI.
- Deferred/extra routes как полный restyle scope, если это не выделено отдельной фазой.

## Основные документы

- `MASTER_PLAN.md` — поэтапный план.
- `AUDIT_RESULTS.md` — текущие результаты аудита и обсуждения.
- `TASKS.md` — конкретные candidate tasks / passes.
- `LOG.md` — журнал исполнения этой инициативы.
- `../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md` — общий стандарт shared/shadcn/patient layer, который эта инициатива не должна нарушать.

