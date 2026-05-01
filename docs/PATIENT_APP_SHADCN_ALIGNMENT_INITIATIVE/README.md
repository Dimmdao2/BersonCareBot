# PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE

Документированная follow-up инициатива после `PATIENT_APP_STYLE_TRANSFER_INITIATIVE`.

Цель: отдельно, без смешивания со style-transfer, проверить и при необходимости выровнять patient UI с существующими UI primitives в стиле shadcn (`Button`, `Card`, `Badge`, `Input`, `Textarea`, `Dialog`, `Tabs`, `Switch`, `Select`, `Tooltip`) и аккуратно добавить недостающие primitives (`Accordion` / `Collapsible`) только если они действительно нужны.

Важно: локальный `Button` реализован через `@base-ui/react/button` и `buttonVariants`; на момент аудита у него **нет** `asChild` API. Для link-like кнопок текущий безопасный путь — `Link` + `buttonVariants(...)` / patient action classes, либо отдельный adapter после осознанного решения.

Базовый визуальный стандарт для всех фаз: [`../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`](../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md).

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

