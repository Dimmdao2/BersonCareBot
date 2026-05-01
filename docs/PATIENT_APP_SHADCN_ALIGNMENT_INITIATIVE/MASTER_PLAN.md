# MASTER PLAN — Patient App Shadcn Alignment

## 1. Goal

Проверить и аккуратно выровнять patient UI с shadcn primitives там, где это улучшает consistency, accessibility и поддерживаемость.

Это **не** продолжение visual redesign и **не** расширение Style Transfer route matrix. Это отдельный технический UI alignment pass.

Нормативная база по визуальному слою: [`../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`](../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md). Любой pass в этой инициативе должен переиспользовать shared patient primitives и shadcn/base-ui, а не вводить одноразовый route-level custom chrome.

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
- `Accordion` / `Collapsible`, если будет принято добавить недостающий primitive.

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

Run only after Phase 1 if `Accordion`/`Collapsible` exists.

Scope:

- `apps/webapp/src/app/app/patient/profile/ProfileAccordionSection.tsx`
- focused profile tests.

Candidate changes:

- raw button/local state → shared accordion/collapsible primitive.

Preserve:

- `defaultOpen`;
- `aria-expanded` / accessibility behavior;
- `statusIcon`;
- visual patient card surface.

### Phase 5 — Notification Controls Alignment

Scope:

- `apps/webapp/src/app/app/patient/notifications/ChannelNotificationToggles.tsx`

Candidate:

- raw checkbox → shadcn `Switch`, if semantics and keyboard behavior remain correct.

Checks:

- tests around `setChannelNotificationEnabled` behavior if present/needed;
- ensure pending/disabled/error behavior preserved.

### Phase 6 — Form Controls Alignment

Separate careful pass.

Candidate areas:

- `support/PatientSupportForm.tsx` raw textarea → `Textarea`;
- `diary/**/*` native selects/textareas → `Select` / `Textarea` only if form contract stays identical;
- `intake/*` raw inputs/textareas only if route is explicitly included.

Rules:

- preserve `name`, `required`, hidden inputs, action handlers, server action contracts;
- no copy changes;
- no validation behavior changes.

### Phase 7 — Deferred Routes Decision

Not automatically in scope.

Routes:

- `/app/patient/messages`
- `/app/patient/emergency`
- `/app/patient/lessons`
- `/app/patient/address`
- `/app/patient/intake/*`

Decision needed:

- either open a separate restyle/coverage initiative;
- or add a dedicated phase with exact route matrix and tests.

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

