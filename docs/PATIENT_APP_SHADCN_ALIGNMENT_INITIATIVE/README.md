# PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE

Документированная follow-up инициатива после `PATIENT_APP_STYLE_TRANSFER_INITIATIVE`.

Цель: отдельно, без смешивания со style-transfer, проверить и при необходимости выровнять patient UI с существующими UI primitives в стиле shadcn (`Button`, `Card`, `Badge`, …). Недостающие **`Accordion` / `Collapsible`** добавлены в shared-слой (Phase 1); первое подключение на экранах — **кабинет** (Phase 2, 2026-05-04); далее — `MASTER_PLAN` Phase 3+.

Важно: локальный `Button` реализован через `@base-ui/react/button` и `buttonVariants`; на момент аудита у него **нет** `asChild` API. Для link-like кнопок текущий безопасный путь — `Link` + `buttonVariants(...)` / patient action classes, либо отдельный adapter после осознанного решения.

Базовый визуальный стандарт для всех фаз: [`../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`](../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md).

## Статус исполнения (сводка)

| Фаза | Статус | Где зафиксировано |
|------|--------|-------------------|
| Phase 0 — инвентаризация | ✅ 2026-05-04 | [`TASKS.md`](TASKS.md) (чеклист + таблицы), [`LOG.md`](LOG.md) |
| Phase 1 — примитивы `Collapsible` / `Accordion` | ✅ 2026-05-04 | Код: `apps/webapp/src/components/ui/collapsible.tsx`, `accordion.tsx` (обёртки `@base-ui/react`, без новых npm-зависимостей; **без** правок patient routes). [`LOG.md`](LOG.md), [`TASKS.md`](TASKS.md) §Phase 1 |
| Phase 2 — кабинет (журнал прошлых приёмов + бейдж статуса) | ✅ 2026-05-04 | `CabinetPastBookings.tsx`, `AppointmentStatusBadge.tsx` + vitest |
| Phase 3+ | не начаты | [`MASTER_PLAN.md`](MASTER_PLAN.md) |

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

