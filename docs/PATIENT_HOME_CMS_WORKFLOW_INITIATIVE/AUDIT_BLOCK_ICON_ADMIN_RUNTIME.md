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

7. **Decorative images** — Runtime `<img>` use `alt=""` (and eslint-disable where needed for CMS URLs). Leading wrappers for reminder/sos/plan use `aria-hidden` on the icon container. Booking: parent not `aria-hidden`; img has `alt=""`. Progress: img has `alt=""`. Admin preview: wrapper `aria-hidden` + img `alt=""`.

8. **Layout shift** — Leading **outer** dimensions unchanged (`size-11` / `lg:size-14` booking; `patientIconLeading*` unchanged; progress uses same `size-6` / `md:size-7` footprint as `Flame`). Inner swap Lucide ↔ `img` at matched Tailwind sizes reduces CLS risk versus changing outer layout.

9. **Server-side alignment** — `setPatientHomeBlockIcon` in `actions.ts` re-checks whitelist and media URL policy (`API_MEDIA_URL_RE` / `isLegacyAbsoluteUrl`), consistent with CMS hygiene (not only client-side).

10. **Anonymous guest** — `PatientHomeToday` applies `stripApiMediaForAnonymousGuest` to block icon URLs before passing to cards, aligned with other home media policy for guests.

## Verdict

**PASS** — Whitelist gating, shared `MediaLibraryPickerDialog` / shell+panel, preview and clear, no picker on excluded blocks, runtime behavior and a11y/size constraints match the audit checklist. Residual risk is only **manual** exercise of the real picker modal (unit tests stub `MediaLibraryPickerDialog` on the settings card).

## Tests reviewed / run

**Reviewed (files):**

- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.test.tsx` — `booking` shows «Иконка блока» + picker stub; `daily_warmup` does not show «Иконка блока»; clear button disabled without icon.
- `apps/webapp/src/app/app/settings/patient-home/actions.test.ts` — `setPatientHomeBlockIcon`: whitelist success, non-whitelist `block_icon_not_supported`, media policy rejection, forbidden client, `null` clear.
- `apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.test.tsx` — custom `blockIconImageUrl` renders `<img src="…">`.
- `PatientHomeNextReminderCard.test.tsx`, `PatientHomeSosCard.test.tsx`, `PatientHomeProgressBlock.test.tsx`, `PatientHomePlanCard.test.tsx` — custom URL renders leading `<img>` where applicable.

**Executed (this audit):** none (per instructions: no full root CI; targeted vitest not re-run).

**Gap (informational):** no test mounts the full `MediaLibraryPickerDialog` UI in block settings (stub only); acceptable for audit **PASS** with note above.
