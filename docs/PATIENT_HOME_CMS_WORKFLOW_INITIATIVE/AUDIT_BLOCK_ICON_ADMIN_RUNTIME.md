# Audit: patient home block icon — admin picker + runtime

**Scope:** doctor CMS block settings (`PatientHomeBlockSettingsCard`), `setPatientHomeBlockIcon` action, patient «Сегодня» cards (`PatientHomeToday` + five target components).  
**Branch:** `feat/patient-home-cms-editor-uxlift-2026-04-29` (as of audit).  
**Method:** static review of source and tests; root `pnpm run ci` not executed per instructions.

## Findings

1. **Whitelist-only picker (admin)** — `PatientHomeBlockSettingsCard.tsx` gates the whole «Иконка блока» block with `supportsConfigurablePatientHomeBlockIcon(block.code)` (`apps/webapp/src/modules/patient-home/blocks.ts`: `PATIENT_HOME_LEADING_ICON_BLOCK_CODES` = `sos`, `next_reminder`, `booking`, `progress`, `plan`). No parallel picker path for other codes.

2. **Unified media picker** — Settings use `MediaLibraryPickerDialog` from `apps/webapp/src/app/app/doctor/content/MediaLibraryPickerDialog.tsx` with `kind="image"`. That module imports and composes `MediaPickerShell` + `MediaPickerPanel` (`MediaLibraryPickerDialog.tsx` lines 18–19), matching `.cursor/rules/cms-unified-media-picker-layout.mdc` (no duplicate Dialog/sheet library layout for this scenario).

3. **Preview + clear** — Admin: fixed **40×40** preview slot (`size-10` container; `img` with `size-10 object-cover` when URL set; placeholder «Нет» when empty). «Очистить иконку» calls `handleBlockIconChange(null)` → `setPatientHomeBlockIcon`; disabled when `!block.iconImageUrl` or pending. Picker `onChange` maps empty trim to `null`.

4. **No picker on non-whitelist blocks** — `situations`, `daily_warmup`, `subscription_carousel`, `courses`, `mood_checkin` (and other codes) do not render the icon section because they fail `supportsConfigurablePatientHomeBlockIcon`. No extra `MediaLibraryPickerDialog` on those cards.

5. **Runtime: same leading containers** — `PatientHomeToday.tsx` passes `blockLeadingIconFor(code)` into each of the five cards. Each card keeps the pre-existing outer slot (`inline-flex size-11 …` booking; `patientIconLeading*` for reminder/sos/plan; progress streak row keeps the same flex cell) and swaps **inner** content between `<img>` and Lucide.

6. **Lucide fallback on NULL/empty** — All five components use `blockIconImageUrl?.trim() ? <img …> : <LucideIcon …>` (or equivalent); optional prop omitted behaves as unset.

7. **Decorative images** — Runtime `<img>` use `alt=""` (and eslint-disable where needed for CMS URLs). Leading wrappers for reminder/sos/plan use `aria-hidden` on the icon container. **Booking:** outer leading slot now uses `aria-hidden` (aligned with other cards); inner `<img>` keeps `alt=""`. Progress: img has `alt=""`. Admin preview: wrapper `aria-hidden` + img `alt=""`.

8. **Layout shift** — Leading **outer** dimensions unchanged (`size-11` / `lg:size-14` booking; `patientIconLeading*` unchanged; progress uses same `size-6` / `md:size-7` footprint as `Flame`). Inner swap Lucide ↔ `img` at matched Tailwind sizes reduces CLS risk versus changing outer layout.

9. **Server-side alignment** — `setPatientHomeBlockIcon` in `actions.ts` re-checks whitelist and media URL policy (`API_MEDIA_URL_RE` / `isLegacyAbsoluteUrl`), consistent with CMS hygiene (not only client-side).

10. **Anonymous guest** — `PatientHomeToday` applies `stripApiMediaForAnonymousGuest` to block icon URLs before passing to cards, aligned with other home media policy for guests.

## Verdict

**PASS** — Whitelist gating, shared `MediaLibraryPickerDialog` / shell+panel, preview and clear, no picker on excluded blocks, runtime behavior and a11y/size constraints match the audit checklist. Automated coverage now includes a mount of the **real** `MediaLibraryPickerDialog` inside `PatientHomeBlockSettingsCard` for a whitelist block (see Fix follow-up).

## Fix follow-up (2026-04-30)

- **Gap (stub-only picker in tests):** Added `PatientHomeBlockSettingsCard.realPicker.test.tsx`, which does **not** mock `MediaLibraryPickerDialog`. It asserts «Иконка блока», absence of the old `data-testid="media-library-picker-stub"`, and copy from the real dialog (`Файл не выбран`, `Выбрать изображение`). `window.matchMedia` is stubbed so `MediaPickerShell` uses the desktop `Dialog` branch in jsdom.
- **Finding 7 (booking leading slot a11y):** `PatientHomeBookingCard` — `aria-hidden` on the outer leading icon container (decorative slot; heading remains the accessible name).
- **Collateral test fix:** `PatientHomeBlocksSettingsPageClient.test.tsx` — `getByText("Изменить")` replaced with `getAllByText` / `length >= 1` because the booking block now includes the picker trigger label «Изменить» alongside the CMS items menu on other blocks.

## Tests reviewed / run

**Reviewed (files):**

- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.test.tsx` — `booking` shows «Иконка блока» + picker stub; `daily_warmup` does not show «Иконка блока»; clear button disabled without icon.
- `apps/webapp/src/app/app/settings/patient-home/actions.test.ts` — `setPatientHomeBlockIcon`: whitelist success, non-whitelist `block_icon_not_supported`, media policy rejection, forbidden client, `null` clear.
- `apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.test.tsx` — custom `blockIconImageUrl` renders `<img src="…">`.
- `PatientHomeNextReminderCard.test.tsx`, `PatientHomeSosCard.test.tsx`, `PatientHomeProgressBlock.test.tsx`, `PatientHomePlanCard.test.tsx` — custom URL renders leading `<img>` where applicable.

**Executed (fix follow-up):**

```bash
pnpm --dir apps/webapp exec vitest run \
  src/app/app/settings/patient-home \
  src/app/app/patient/home/PatientHomeBookingCard.test.tsx \
  src/app/app/patient/home/PatientHomeNextReminderCard.test.tsx \
  src/app/app/patient/home/PatientHomeSosCard.test.tsx \
  src/app/app/patient/home/PatientHomeProgressBlock.test.tsx \
  src/app/app/patient/home/PatientHomePlanCard.test.tsx
```

Result: **13 files, 61 tests passed.**

**Gap (informational):** ~~no test mounts the full `MediaLibraryPickerDialog` UI~~ — addressed by `PatientHomeBlockSettingsCard.realPicker.test.tsx`. Full E2E (open shell, pick row, upload tab) remains optional manual / future E2E scope.
