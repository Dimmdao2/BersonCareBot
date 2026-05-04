# MASTER PLAN — Patient App Shadcn Alignment

## 1. Goal

Проверить и аккуратно выровнять patient UI с shadcn primitives там, где это улучшает consistency, accessibility и поддерживаемость.

Это **не** продолжение visual redesign и **не** расширение Style Transfer route matrix. Это отдельный технический UI alignment pass.

Нормативная база по визуальному слою: [`PATIENT_APP_UI_STYLE_GUIDE.md`](../../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md). Любой pass в этой инициативе должен переиспользовать shared patient primitives и shadcn/base-ui, а не вводить одноразовый route-level custom chrome.

## 2. Non-goals

Не делать в рамках этой инициативы:

- не менять новую patient home (`PatientHomeToday`) без отдельного решения;
- не менять content/copy/product structure;
- не менять route paths, query params, links, handlers, server actions;
- не менять business/API/DB/env/integrator code;
- не менять doctor/admin UI;
- не переписывать весь patient UI “на shadcn везде”;
- не трогать deferred/extra routes как полный restyle pass без отдельной фазы.

## 3. Working Definitions

### Shadcn alignment

Использовать shadcn primitives там, где они являются семантически подходящим base:

- `Button` для интерактивных действий; для button-like links — текущий проектный паттерн `Link` + `buttonVariants(...)` / patient action classes, либо отдельный adapter, потому что локальный `Button` сейчас не имеет `asChild`;
- `Card` для reusable card composition;
- `Badge` для статусов;
- `Input`, `Textarea`, `Select`, `Switch` для форм;
- `Dialog`, `Tabs`, `Tooltip` там, где они уже применяются;
- `Accordion` / `Collapsible` — **добавлены** в `apps/webapp/src/components/ui/` (Phase 1, 2026-05-04); **подключение в экранах:** Phase 2–6 выполнены (кабинет, `FeatureCard`, профиль, уведомления, form controls — см. [`LOG.md`](./LOG.md)). ~~Phase 7+~~ — см. §Phase 7 ниже (перенос в мини-инициативы по экранам, 2026-05-05).

### Patient visual layer

`patientVisual.ts` остаётся разрешённым источником patient-specific классов:

- цвета/tokens;
- card surface variants;
- patient action classes;
- text tones;
- link/tile styles.

Shadcn alignment не означает удаление `patientVisual.ts`.

При конфликте решений приоритет у `PATIENT_APP_UI_STYLE_GUIDE.md`: home-specific geometry не переносим на inner pages, reusable слой расширяем только семантическими примитивами.

## 4. Phase Plan

### Phase 0 — Readonly Inventory

**Статус:** выполнено 2026-05-04 (`TASKS.md`, `LOG.md`).

Цель: подтвердить текущее состояние перед кодовыми изменениями.

Проверить:

- список shadcn primitives в `apps/webapp/src/components/ui/`;
- наличие/отсутствие `Accordion` / `Collapsible`;
- подтвердить, есть ли подходящий primitive в текущем stack `@base-ui/react`, а не автоматически планировать Radix;
- проверить API локального `Button` (`@base-ui/react/button` + `buttonVariants`) и не планировать `asChild`, пока adapter явно не добавлен;
- all current imports from `@/components/ui/*` inside `apps/webapp/src/app/app/patient/**`;
- raw controls that are realistic migration candidates.

Deliverables:

- update `TASKS.md` with final exact files;
- update `LOG.md`;
- GO/NO-GO for Phase 1.

### Phase 1 — Optional UI Primitive Infrastructure

**Статус:** выполнено 2026-05-04 — `collapsible.tsx`, `accordion.tsx` в `components/ui/`; маршруты patient не менялись.

Запускать только если Phase 0 подтверждает необходимость.

Candidate:

- add shadcn-compatible `Accordion` or `Collapsible` under `apps/webapp/src/components/ui/`.

Rules:

- no patient route migration in the same commit if primitive addition is non-trivial;
- no doctor/admin visual changes;
- add dependency only if not already available and only through package manager;
- document dependency/package lock impact.

Checks:

- targeted eslint/typecheck for new primitive;
- small unit/render test only if local pattern expects it.

### Phase 2 — Cabinet Alignment

**Статус:** выполнено 2026-05-04 (`CabinetPastBookings.tsx`, `AppointmentStatusBadge.tsx`; тесты `CabinetPastBookings.test.tsx`, `AppointmentStatusBadge.test.tsx`).

Scope:

- `apps/webapp/src/app/app/patient/cabinet/CabinetPastBookings.tsx`
- `apps/webapp/src/app/app/patient/cabinet/AppointmentStatusBadge.tsx`
- only if needed: small follow-up around `CabinetInfoLinks.tsx`

Candidate changes:

- `CabinetPastBookings`: raw accordion-like `<button>` → `Accordion`/`Collapsible` if primitive exists.
- `AppointmentStatusBadge`: custom `<span>` → shadcn `Badge`-based implementation.
- Preserve all labels, statuses, expanded default behavior, tooltips, dates, links.

Checks:

- existing cabinet tests;
- add/adjust focused tests for expand/collapse and status rendering if missing;
- targeted eslint for changed files.

### Phase 3 — Sections / FeatureCard Alignment

**Статус:** выполнено 2026-05-04 — `FeatureCard` переведён на shadcn `Card` с сохранением `patientCardClass`, веток locked / secondary / single-link и пропсов; locked / без `href` — нативный `<article>`, заголовок **`h3`**; неиспользуемый `PatientHomeLessonsSection` удалён; потребители `sections/*` не менялись; расширены `FeatureCard.test.tsx`; прогнаны vitest маршрутов sections.

Scope:

- `apps/webapp/src/shared/ui/FeatureCard.tsx`
- affected consumers:
  - `apps/webapp/src/app/app/patient/sections/page.tsx`
  - `apps/webapp/src/app/app/patient/sections/[slug]/page.tsx`
  - any other current `FeatureCard` consumers found by grep

Candidate changes:

- recompose `FeatureCard` around shadcn `Card` / `CardContent` if it improves consistency;
- keep `Badge` status semantics;
- preserve `href`, `secondaryHref`, `containerId`, `compact`, `status` behavior.

Checks:

- `FeatureCard.test.tsx`;
- section route tests: subscription, warmups gate, slug redirect;
- targeted eslint for changed files.

### Phase 4 — Profile Accordion Alignment

**Статус:** выполнено 2026-05-04 — `ProfileAccordionSection` переведён на `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent` (без локального `useState`); сохранены `defaultOpen`, `statusIcon`, `id`, patient card surface; `aria-expanded` с примитива Base UI; добавлен `ProfileAccordionSection.test.tsx`; `profile/page.tsx` без правок.

Checks (выполнено):

- `ProfileAccordionSection.test.tsx`;
- targeted eslint + `pnpm run typecheck` в `apps/webapp`.

### Phase 5 — Notification Controls Alignment

**Статус:** выполнено 2026-05-04 — `ChannelNotificationToggles` использует `Switch` (`checked`, `onCheckedChange`, `disabled={pending}`); `setChannelNotificationEnabled` и отображение ошибок без изменения контракта; добавлены `ChannelNotificationToggles.test.tsx` и полифилл `PointerEvent` в `vitest.setup.ts` для jsdom (Base UI).

Checks (выполнено):

- `ChannelNotificationToggles.test.tsx` + `parseChannelPreferenceInput.test.ts`;
- targeted eslint + `pnpm run typecheck` в `apps/webapp`.

### Phase 6 — Form Controls Alignment

**Статус:** выполнено 2026-05-04 — patient form surfaces переведены на `Textarea` / `Select` / `Switch` / `RadioGroup` (новый [`radio-group.tsx`](../../../apps/webapp/src/components/ui/radio-group.tsx) на `@base-ui/react/radio-group` + `radio`); контракты `FormData` и server actions сохранены; [`QuickAddPopup`](../../../apps/webapp/src/app/app/patient/diary/QuickAddPopup.tsx) смонтирован на [`diary/page.tsx`](../../../apps/webapp/src/app/app/patient/diary/page.tsx) (FAB).

**Сделано (файлы):**

- [`PatientSupportForm.tsx`](../../../apps/webapp/src/app/app/patient/support/PatientSupportForm.tsx) — `Textarea`;
- [`LfkSessionForm.tsx`](../../../apps/webapp/src/app/app/patient/diary/lfk/LfkSessionForm.tsx), [`QuickAddPopup.tsx`](../../../apps/webapp/src/app/app/patient/diary/QuickAddPopup.tsx) — `Select` + hidden для `complexId` / `trackingId`;
- [`SymptomTrackingRow.tsx`](../../../apps/webapp/src/app/app/patient/diary/symptoms/SymptomTrackingRow.tsx) — тип записи: `Select`;
- [`SymptomsJournalClient.tsx`](../../../apps/webapp/src/app/app/patient/diary/symptoms/journal/SymptomsJournalClient.tsx), [`LfkJournalClient.tsx`](../../../apps/webapp/src/app/app/patient/diary/lfk/journal/LfkJournalClient.tsx) — фильтры журналов: `Select`; редактирование ЛФК: `Textarea` для комментария;
- [`DiaryDataPurgeSection.tsx`](../../../apps/webapp/src/app/app/patient/profile/DiaryDataPurgeSection.tsx) — согласие: `Switch`;
- [`AuthOtpChannelPreference.tsx`](../../../apps/webapp/src/app/app/patient/profile/AuthOtpChannelPreference.tsx) — `RadioGroup` / `RadioGroupItem`;
- [`LfkIntakeClient.tsx`](../../../apps/webapp/src/app/app/patient/intake/lfk/LfkIntakeClient.tsx), [`NutritionIntakeClient.tsx`](../../../apps/webapp/src/app/app/patient/intake/nutrition/NutritionIntakeClient.tsx) — `Textarea` / `Input` (вопросы анкеты).

Checks (выполнено):

- `pnpm run typecheck` в `apps/webapp`; финальный `pnpm run ci` в корне после батча (см. [`LOG.md`](./LOG.md)).

Rules (соблюдены):

- preserve `name`, hidden inputs, action handlers, server action contracts;
- no copy changes;
- no validation behavior changes.

### Phase 7 — ~~Deferred Routes Decision~~ **закрыто как единая фаза (2026-05-05)**

Исходный план Phase 7 предполагал либо отдельную restyle/coverage-инициативу, либо выделенную фазу с матрицей маршрутов (messages, emergency, lessons, address, прочие deferred, расширенный pass по intake и т.д.).

**Решение:** единый «Phase 7» **не выполняется**. Любые дальнейшие выравнивания UI и coverage — **внутри мини-инициатив по конкретному экрану/фиче** (см. [`ROADMAP_2.md`](../../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §1: shadcn/shared-примитивы при переработке страниц). Эта папка инициативы перенесена в **`docs/archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/`** как архив исполнения Phases 0–6.

## 5. Testing Policy

Use targeted checks:

- eslint for changed files;
- typecheck if shared primitives/types changed;
- vitest for affected components/routes;
- no root `pnpm run ci` unless explicitly requested or pre-push.

## 6. Completion Criteria

- No new patient product/copy/flow changes.
- No doctor/admin regressions.
- Shadcn primitives introduced only where useful.
- Patient visual styling remains patient-scoped.
- New patient home remains untouched unless explicitly approved.
- Docs and `LOG.md` updated after every EXEC/FIX.

