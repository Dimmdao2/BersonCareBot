# Phase 4 — Booking And Cabinet Style Pass

## Goal

Apply patient visual chrome to booking wizard and appointment cabinet surfaces without changing booking flow or Rubitime behavior.

## Scope

Candidate files:

- `booking/new/BookingWizardShell.tsx`
- `booking/new/FormatStepClient.tsx`
- `booking/new/city/CityStepClient.tsx`
- `booking/new/service/ServiceStepClient.tsx`
- `booking/new/slot/SlotStepClient.tsx`
- `booking/new/confirm/ConfirmStepClient.tsx`
- `cabinet/BookingCalendar.tsx`
- `cabinet/BookingSlotList.tsx`
- `cabinet/CabinetActiveBookings.tsx`
- `cabinet/CabinetUpcomingAppointments.tsx`
- `cabinet/CabinetPastBookings.tsx`
- `cabinet/CabinetBookingEntry.tsx`
- `cabinet/CabinetIntakeHistory.tsx`
- other cabinet booking components listed by `PLAN_INVENTORY.md`.

## Allowed Changes

- Replace card/chip/button visual classes with patient primitives.
- Align wizard step surfaces visually.
- Align slot/date buttons visually while preserving selected/disabled semantics.
- Preserve all route query params, handlers, API calls and labels.

## Forbidden

- No booking step changes.
- No route/query param changes.
- No booking catalog behavior changes.
- No Rubitime integration behavior changes.
- No validation/confirmation behavior changes.
- No copy rewrite.
- No new appointment states.

## Checklist

- [ ] Wizard shell uses patient spacing/text style.
- [ ] Format/city/service selection controls use patient chrome.
- [ ] Calendar date chips use patient chrome.
- [ ] Slot chips use patient chrome.
- [ ] Confirm card surfaces use patient chrome.
- [ ] Appointment cards/lists use patient chrome.
- [ ] Loading/error/pending states preserved.
- [ ] Existing booking tests updated only if class/markup wrappers changed.
- [ ] `LOG.md` updated.

## Checks

Examples; choose based on changed files:

```bash
pnpm --dir apps/webapp exec vitest run src/app/app/patient/booking/new/FormatStepClient.test.tsx
pnpm --dir apps/webapp exec vitest run src/app/app/patient/booking/new/city/CityStepClient.test.tsx
pnpm --dir apps/webapp exec vitest run src/app/app/patient/booking/new/service/ServiceStepClient.test.tsx
pnpm --dir apps/webapp exec vitest run src/app/app/patient/booking/new/slot/SlotStepClient.test.tsx
pnpm --dir apps/webapp exec vitest run src/app/app/patient/booking/new/confirm/ConfirmStepClient.test.tsx
pnpm --dir apps/webapp exec vitest run src/app/app/patient/cabinet/CabinetActiveBookings.test.tsx src/app/app/patient/cabinet/CabinetBookingEntry.test.tsx
pnpm --dir apps/webapp exec eslint <changed-files>
```

Run typecheck if shared props/classes changed:

```bash
pnpm --dir apps/webapp typecheck
```

## Acceptance

- Booking/cabinet visual chrome is patient-aligned.
- Existing booking behavior is unchanged.
- Audit confirms no flow/product scope leak.
