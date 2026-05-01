# TASKS — Patient App Shadcn Alignment

## Priority 0 — Inventory

- [ ] Confirm current `apps/webapp/src/components/ui/` primitive list.
- [ ] Confirm whether `@base-ui/react` already provides a suitable `Accordion` / `Collapsible` primitive, or whether a project-local adapter is needed.
- [ ] Confirm local `Button` API; do not assume `asChild` support (currently not present).
- [ ] Re-run grep for `@/components/ui/*` imports in `apps/webapp/src/app/app/patient/**`.
- [ ] Re-run grep for raw controls: `<button>`, `<input>`, `<textarea>`, `<select>` in patient routes.
- [ ] Freeze exact Phase 1 / Phase 2 file scope before code changes.

## Priority 1 — Cabinet

### `CabinetPastBookings`

Current:

- raw `<button>` controls expanded/collapsed state;
- local `useState`;
- `Card` / `CardHeader` / `CardContent` already used.

Candidate:

- convert to shadcn `Collapsible` or `Accordion` if primitive is added.

Must preserve:

- default open state (`items.length > 0`);
- visible title `Журнал прошедших приёмов`;
- Chevron rotation or equivalent visual state;
- existing rows and status rendering.

### `AppointmentStatusBadge`

Current:

- custom `<span>` with manual status tone classes;
- `Tooltip` already used for cancelled reason.

Candidate:

- base status UI on `Badge` with patient-specific className/tone.

Must preserve:

- `mode="history"` suppression behavior;
- `Записан` label for upcoming created/confirmed;
- cancelled tooltip behavior.

## Priority 2 — Sections / FeatureCard

### `FeatureCard`

Current:

- custom `article` / `div` / `Link` card abstraction;
- uses shadcn `Badge`, but not shadcn `Card`;
- consumed by `/app/patient/sections`, `/app/patient/sections/[slug]`, and legacy/home-side consumers.

Candidate:

- recompose with `Card` / `CardContent`;
- keep clickable card behavior via `Link` wrapper / `buttonVariants(...)` strategy; do not use `asChild` unless a local adapter is added first.

Must preserve:

- `href`;
- `secondaryHref`;
- `status === "locked"` not clickable;
- `containerId`;
- `compact` layout;
- visible status labels.

Tests to run/review:

- `FeatureCard.test.tsx`;
- section page route tests that depend on cards.

## Priority 3 — Profile Accordions

### `ProfileAccordionSection`

Current:

- raw `<button>` + local open state;
- patient card style;
- used by profile sections.

Candidate:

- migrate to `Collapsible`/`Accordion` after primitive infrastructure exists.

Must preserve:

- `defaultOpen`;
- `statusIcon`;
- visual patient card chrome;
- content visibility behavior.

## Priority 4 — Notification Switches

### `ChannelNotificationToggles`

Current:

- native checkbox for notification enable/disable.

Candidate:

- migrate to existing `Switch`.

Must preserve:

- `checked` state;
- disabled/pending behavior;
- server action call `setChannelNotificationEnabled`;
- error display.

## Priority 5 — Form Controls

Candidate areas:

- `support/PatientSupportForm.tsx` raw textarea → `Textarea`.
- `diary/**/*` native select/textarea controls → maybe `Select`/`Textarea`.
- `intake/*` raw inputs/textarea → maybe `Input`/`Textarea`, only if intake routes are in scope.

Do not do as casual cleanup:

- field `name` changes;
- hidden input changes;
- form action changes;
- validation wording changes;
- submit behavior changes.

## Deferred / Separate Initiative Candidates

### Deferred extra routes restyle

Routes:

- `/app/patient/messages`
- `/app/patient/emergency`
- `/app/patient/lessons`
- `/app/patient/address`
- `/app/patient/intake/lfk`
- `/app/patient/intake/nutrition`

Reason separate:

- not part of Style Transfer matrix;
- each route has distinct behavior and needs route-specific tests/QA.

### New patient home

Current new home pipeline:

- `PatientHomeToday`;
- block codes: `daily_warmup`, `useful_post`, `booking`, `situations`, `progress`, `next_reminder`, `mood_checkin`, `sos`, `plan`, `subscription_carousel`, `courses`.

Rule:

- do not touch in this shadcn alignment initiative without explicit product/design instruction.

