# TASKS — Patient App Shadcn Alignment

## Phase 0 — Inventory (completed 2026-05-04)

### Checklist

- [x] Confirm current `apps/webapp/src/components/ui/` primitive list.
- [x] Confirm whether `@base-ui/react` provides `Accordion` / `Collapsible` (vs planning Radix).
- [x] Confirm local `Button` API (`asChild` not present).
- [x] Grep `@/components/ui/*` imports in `apps/webapp/src/app/app/patient/**`.
- [x] Grep raw `<button>`, `<input>`, `<textarea>`, `<select>` in patient routes.
- [x] Freeze Phase 1 / Phase 2 file scope for upcoming code changes.

### `apps/webapp/src/components/ui/` — exact files (19)

| File | Notes |
|------|--------|
| `accordion.tsx` | `@base-ui/react/accordion` (Phase 1) |
| `badge.tsx` | `@base-ui/react` merge-props + use-render |
| `button-variants.ts` | CVA variants (shared with `Button`) |
| `button.tsx` | `@base-ui/react/button` + `buttonVariants` |
| `card.tsx` | Styled `div` composition (no Base UI root) |
| `collapsible.tsx` | `@base-ui/react/collapsible` (Phase 1) |
| `dialog.tsx` | `@base-ui/react/dialog` |
| `dropdown-menu.tsx` | `@base-ui/react/menu` |
| `input.tsx` | `@base-ui/react/input` |
| `label.tsx` | Styled native `<label>` |
| `popover.tsx` | `@base-ui/react/popover` |
| `scroll-area.tsx` | `@base-ui/react/scroll-area` |
| `select.tsx` | `@base-ui/react/select` |
| `separator.tsx` | `@base-ui/react/separator` |
| `sheet.tsx` | `@base-ui/react/dialog` |
| `switch.tsx` | `@base-ui/react/switch` |
| `tabs.tsx` | `@base-ui/react/tabs` |
| `textarea.tsx` | Styled native `<textarea>` |
| `tooltip.tsx` | `@base-ui/react/tooltip` |

### Phase 2 — Cabinet alignment (completed 2026-05-04)

- [x] `CabinetPastBookings.tsx` — `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent` вместо `useState` + сырой `<button>`; `defaultOpen={items.length > 0}`; шеврон по `group-data-[panel-open]`.
- [x] `AppointmentStatusBadge.tsx` — оболочка статуса на `Badge variant="outline"` + прежние tone-классы; `Tooltip` для отмены с причиной сохранён.
- [x] Тесты: `CabinetPastBookings.test.tsx`, `AppointmentStatusBadge.test.tsx`.
- [x] `CabinetInfoLinks.tsx` — без правок (follow-up не понадобился).

### Phase 3 — FeatureCard / `Card` (completed 2026-05-04)

- [x] [`FeatureCard.tsx`](../../apps/webapp/src/shared/ui/FeatureCard.tsx) — оболочка `Card` + `patientCardClass` + overrides `ring`/`gap`/`py`; три ветки: locked / без `href` — нативный **`<article>`** + `id`; `secondaryHref` — `Card` + два соседних `Link`; один `Link` оборачивает `Card`; заголовок **`h3`**; без `CardContent` (избежать лишних px).
- [x] Потребители страниц: [`sections/page.tsx`](../../apps/webapp/src/app/app/patient/sections/page.tsx), [`sections/[slug]/page.tsx`](../../apps/webapp/src/app/app/patient/sections/[slug]/page.tsx) — без правок при Phase 3.
- [x] [`FeatureCard.test.tsx`](../../apps/webapp/src/shared/ui/FeatureCard.test.tsx) — locked / без `href` / `secondaryHref` + `containerId` на корне `Card`, single-link, full card + badge; маршруты sections — vitest прогон.
- [x] Блок «Уроки» на главной через `PatientHomeLessonsSection` — **не используется**; компонент удалён 2026-05-04 (см. `LOG.md`).

### Phase 4 — Profile accordion / `Collapsible` (completed 2026-05-04)

- [x] [`ProfileAccordionSection.tsx`](../../apps/webapp/src/app/app/patient/profile/ProfileAccordionSection.tsx) — `Collapsible` + `CollapsibleTrigger` + `CollapsibleContent`; без локального `useState`; шеврон по `group-data-[panel-open]`; контент всегда в `CollapsibleContent`.
- [x] [`ProfileAccordionSection.test.tsx`](../../apps/webapp/src/app/app/patient/profile/ProfileAccordionSection.test.tsx) — свёрнуто/развернуто, `defaultOpen`, `aria-expanded`, `id`, `statusIcon`.
- [x] `profile/page.tsx` — без правок.

### Phase 5 — Notifications / `Switch` (completed 2026-05-04)

- [x] [`ChannelNotificationToggles.tsx`](../../apps/webapp/src/app/app/patient/notifications/ChannelNotificationToggles.tsx) — `Switch` вместо checkbox; `disabled={pending}`; тот же server action и ошибки.
- [x] [`ChannelNotificationToggles.test.tsx`](../../apps/webapp/src/app/app/patient/notifications/ChannelNotificationToggles.test.tsx).
- [x] [`vitest.setup.ts`](../../apps/webapp/vitest.setup.ts) — `PointerEvent` в jsdom для Base UI.

### `@base-ui/react` (webapp `^1.3.0`)

- **Ships with:** `@base-ui/react/accordion` and `@base-ui/react/collapsible` (confirmed via package `exports` and installed `node_modules`).
- **Phase 1 implication:** adding UI wrappers does **not** require a new npm dependency — only new files under `components/ui/` styled like existing primitives.

### Local `Button` API

- Implementation: `ButtonPrimitive.Props` from `@base-ui/react/button` + `buttonVariants`.
- **No `asChild`:** re-export is `{ Button, buttonVariants }` only; link-like actions stay on `Link` + `buttonVariants(...)` / patient classes until an adapter exists.

### Patient routes — files importing `@/components/ui/*` (47)

Paths relative to `apps/webapp/src/app/app/patient/`:

- `PatientMaintenanceScreen.tsx`
- `bind-phone/PatientBrowserMessengerBindPanel.tsx`, `bind-phone/page.tsx`
- `booking/new/FormatStepClient.tsx`, `booking/new/city/CityStepClient.tsx`, `booking/new/confirm/ConfirmStepClient.tsx`, `booking/new/service/ServiceStepClient.tsx`, `booking/new/slot/SlotStepClient.tsx`
- `cabinet/AppointmentStatusBadge.tsx`, `cabinet/BookingCalendar.tsx`, `cabinet/BookingConfirmationForm.tsx`, `cabinet/BookingFormatGrid.tsx`, `cabinet/BookingSlotList.tsx`, `cabinet/CabinetActiveBookings.tsx`, `cabinet/CabinetBookingEntry.tsx`, `cabinet/CabinetInfoLinks.tsx`, `cabinet/CabinetIntakeHistory.tsx`, `cabinet/CabinetPastBookings.tsx`, `cabinet/CabinetUpcomingAppointments.tsx`
- `content/[slug]/PatientContentAdaptiveVideo.tsx`, `content/[slug]/PatientContentPracticeComplete.tsx`
- `diary/DiaryTabsClient.tsx`, `diary/JournalMonthNav.tsx`, `diary/QuickAddPopup.tsx`, `diary/page.tsx`
- `diary/lfk/LfkComplexCard.tsx`, `diary/lfk/LfkSessionForm.tsx`, `diary/lfk/journal/LfkJournalClient.tsx`, `diary/lfk/journal/page.tsx`
- `diary/symptoms/CreateTrackingForm.tsx`, `diary/symptoms/SymptomTrackingRow.tsx`, `diary/symptoms/SymptomsTrackingSectionClient.tsx`, `diary/symptoms/journal/SymptomsJournalClient.tsx`, `diary/symptoms/journal/page.tsx`
- `intake/lfk/LfkIntakeClient.tsx`, `intake/nutrition/NutritionIntakeClient.tsx`
- `messages/PatientMessagesClient.tsx`
- `profile/AuthOtpChannelPreference.tsx`, `profile/DiaryDataPurgeSection.tsx`, `profile/LogoutSection.tsx`, `profile/PinSection.tsx`, `profile/ProfileForm.tsx`
- `reminders/ReminderRulesClient.tsx`, `reminders/page.tsx`, `reminders/journal/[ruleId]/page.tsx`
- `sections/SectionWarmupsReminderBar.tsx`
- `support/PatientSupportForm.tsx`
- `treatment-programs/PatientTreatmentProgramDetailClient.tsx`

**Note:** `sections/page.tsx` and `sections/[slug]/page.tsx` use `FeatureCard` from `@/shared/ui/FeatureCard` only (no direct `@/components/ui/` import). Ранее существовал `home/PatientHomeLessonsSection.tsx` (не был подключён к текущей главной) — **удалён** 2026-05-04; блок «Уроки» на главной при появлении — новая реализация.

### Raw controls — migration candidates (by phase)

| Area | File(s) | Control | Initiative phase |
|------|---------|---------|------------------|
| Cabinet | `cabinet/CabinetPastBookings.tsx` | ~~`<button>`~~ → `Collapsible` (Phase 2 ✅) |
| Profile | `profile/ProfileAccordionSection.tsx` | ~~`<button>`~~ → `Collapsible` (Phase 4 ✅) |
| Notifications | `notifications/ChannelNotificationToggles.tsx` | ~~`<input type="checkbox">`~~ → `Switch` (Phase 5 ✅) |
| Support | `support/PatientSupportForm.tsx` | `<textarea>` | Phase 6 |
| Diary | `diary/symptoms/journal/SymptomsJournalClient.tsx`, `SymptomTrackingRow.tsx` | `<select>` | Phase 6 |
| Diary | `diary/lfk/journal/LfkJournalClient.tsx`, `LfkSessionForm.tsx`, `QuickAddPopup.tsx` | `<select>`, `<textarea>`, hidden `<input>` | Phase 6 (preserve names/actions) |
| Profile | `profile/AuthOtpChannelPreference.tsx`, `DiaryDataPurgeSection.tsx` | `<input type="radio">`, file/consent inputs | Phase 6 or separate pass (a11y semantics) |
| Intake | `intake/lfk/LfkIntakeClient.tsx`, `intake/nutrition/NutritionIntakeClient.tsx` | `<textarea>`, `<input>` | Deferred (Phase 7 / explicit scope) |
| Home | `home/PatientHomeMoodCheckin.tsx` | `<button>` | Out of scope per `MASTER_PLAN` (new home) unless explicitly approved |
| Courses | `courses/PatientCoursesCatalogClient.tsx` | `<button>` | Not in Phase 2–6 matrix; treat as deferred unless added |
| Bind / logout | `bind-phone/PatientBrowserMessengerBindPanel.tsx`, `profile/LogoutSection.tsx` | `<button>` | Low priority; often intentional native pattern |

Hidden inputs and form `name` attributes in diary flows: **do not migrate casually** (Phase 6 rules).

### Frozen scope for next phases

- **Phase 1 (infra only):** new `apps/webapp/src/components/ui/accordion.tsx` and/or `collapsible.tsx` wrapping `@base-ui/react/accordion` / `@base-ui/react/collapsible`; no patient route edits in the same commit if the primitive work is non-trivial (`MASTER_PLAN` §Phase 1). *(✅ выполнено 2026-05-04.)*
- **Phase 2 (cabinet):** `cabinet/CabinetPastBookings.tsx`, `cabinet/AppointmentStatusBadge.tsx`; optional small follow-up: `cabinet/CabinetInfoLinks.tsx` only if needed. *(✅ выполнено 2026-05-04.)*
- **Phase 3–4:** `FeatureCard` (sections), `ProfileAccordionSection` (profile) — см. чеклисты Phase 3–4 выше и `LOG.md`. *(✅ выполнено 2026-05-04.)*
- **Phase 5:** `notifications/ChannelNotificationToggles.tsx` — см. чеклист Phase 5 выше. *(✅ выполнено 2026-05-04.)*
- **Следующий frozen scope по плану:** Phase 6 — form controls (`MASTER_PLAN`).

### Phase 0 — GO / NO-GO for Phase 1

**GO.** Stack already depends on `@base-ui/react@1.3.0`, which exposes **Accordion** and **Collapsible**. Local `Button` has no `asChild`. Patient `components/ui` usage and raw-control hotspots are enumerated above; Phase 1 can proceed as optional infrastructure without new packages.

### Phase 1 — Infrastructure (completed 2026-05-04)

- [x] `collapsible.tsx` — `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent`.
- [x] `accordion.tsx` — full item/header/trigger/content stack.
- [x] No new npm dependencies; no patient route edits in this batch.

## Priority 1 — Cabinet

**Выполнено (Phase 2, 2026-05-04):** см. блок «Phase 2 — Cabinet alignment» выше. Ниже — архив критериев приёмки.

### `CabinetPastBookings` (done)

- ~~raw `<button>`~~ → `Collapsible` + `CollapsibleTrigger` + `CollapsibleContent`; ~~local `useState`~~ → `defaultOpen` у `Collapsible`.
- Сохранено: `defaultOpen={items.length > 0}`, заголовок, строки и статусы в списке, шеврон.

### `AppointmentStatusBadge` (done)

- ~~custom `<span>`~~ → `Badge variant="outline"` + tone `className`.
- Сохранено: `mode="history"`, «Записан», tooltip при отмене с причиной.

## Priority 2 — Sections / FeatureCard

**Выполнено (Phase 3, 2026-05-04):** см. блок «Phase 3 — FeatureCard / `Card`» выше.

### `FeatureCard` (done)

- Корень: shadcn `Card` + прежний `patientCardClass` / ссылки / `Badge` / `compact` / `containerId` / `status`.
- Потребители: `sections/page.tsx`, `sections/[slug]/page.tsx` — без правок файлов при Phase 3.

## Priority 3 — Profile Accordions

**Выполнено (Phase 4, 2026-05-04):** см. блок «Phase 4 — Profile accordion / `Collapsible`» выше.

### `ProfileAccordionSection` (done)

- `Collapsible` из `@/components/ui/collapsible`; потребитель — `profile/page.tsx`.

## Priority 4 — Notification Switches

**Выполнено (Phase 5, 2026-05-04):** см. блок «Phase 5 — Notifications / `Switch`» выше.

### `ChannelNotificationToggles` (done)

- `Switch` из `@/components/ui/switch`; потребитель — `notifications/page.tsx` без правок API компонента.

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

