# Тест или взгляд

Repeatable behavior is verified by behavioral tests and a blind kill-set; one-time structure/layout is verified
by inspection. Visual taste is not part of this audit.

# Independent audit: common encounter actions and start modal

## Role and authority

You are the independent `auditor-live` of current integration candidate `f4c2d4f3a` on branch
`wt/encounter-start-owner-audit-20260906`. The product correction under focus is commit `63e3860c9`; earlier
encounter-page evidence in `.lead/runs/clinical-encounter-page-audit-20260906/90-final-audit-report.md` may be
reused only after confirming the current tree still satisfies it.

Before acting, read the `AGENTS.md` heading map and fully read §10a, §10b, §16, §17, §21, §22 and §24.
Owner authority is the complete P4.4–P4.6 checklist in
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`, especially every `ENCOUNTERS-ACTION-*`,
`ENCOUNTER-PAGE-02A/02B/02C`, `ENCOUNTER-START-*`, `ENCOUNTER-LINK-*`, `ENCOUNTER-CREATE-*`,
`ENCOUNTER-NOLINK-*` and `ENCOUNTER-PAGE-LINK-*` item.

Oracle quote: «Любое действие `Начать приём` сначала открывает общую doctor-модалку, а не сразу
переводит на страницу приёма».

Do not change product code. You may add/adjust and commit only genuinely missing behavioral acceptance tests in
the named existing test files and concise audit artifacts. Revert every fault injection. Do not push, land,
deploy, run full CI, or perform screenshot/taste review; the owner accepts visual presentation on TEST.

## Test or inspection — classify before reading tests

- Repeatable behavior: every entry opens the start modal; correct prebound/today auto-selection; one-of-three mode
  transitions; selected appointment id reaches the encounter page; canonical manual form returns the id used by
  the encounter; no-link mode performs no booking/finance write; patient tabs navigate correctly. Prepare a blind
  kill-set before reading tests and use the cheapest behavioral layer.
- One-time structure/layout: one shared identity-header action row; no Karta summary; no copied per-tab actions;
  common `DoctorModal`, `Select`, `DoctorAppointmentForm` and page shell are reused. Inspect the final diff and
  rendered structure; do not write tests against source strings, CSS classes or DOM placement.
- Visual sizes/colors/spacing are owner live-review territory and not findings.

## Blind kill-set authority

Prepare before opening existing tests. Cover these independent failures:

1. Any old label `Создать визит`/`Новый визит` remains in an active encounter-start entry, or an
   entry bypasses the modal and navigates directly.
2. Header actions are absent from any patient tab, duplicated per tab, or the old Karta `Приёмы: N` card remains.
3. Encounter create/edit page loses patient tabs, adds a fake `Приём` tab, marks a patient tab active, or global nav
   stops identifying the patient section.
4. The main selector exposes anything other than the three exact human labels, exposes an internal key, or does
   not use the canonical Select/displayLabel behavior.
5. A trusted appointment-detail entry loses/preselects the wrong appointment id.
6. Ordinary header entry auto-selects an appointment from another day or one already linked; a next unlinked
   appointment today is not selected.
7. Existing-appointment mode replaces the selected featured row with the list, permits multiple selection, lacks
   a clear check, or fails to pass exactly the chosen id on `Начать приём`.
8. Create-appointment mode uses a duplicate/simplified form or write path, allows changing the patient, omits
   price/payment fields, or loses the appointment id returned by the manual door.
9. Without-appointment mode renders booking fields or creates an appointment/payment side effect.
10. The full encounter page reintroduces a selector/toggle/full booking section after the modal already fixed the
    link mode.
11. History/view stack or past-visit editing regresses from the already accepted encounter-page audit.

Each retained/new test must name the user-visible failure, impact and independent oracle. Perform one temporary
fault injection for each protected independent class and record which assertion turned red. If the untouched
candidate fails, leave the acceptance test failing for handoff and do not fix product code.

## Required result

Return binary PASS or FAIL. Every FAIL must name a reachable scenario, impact, exact violated owner ID and evidence;
style/recommendations are not findings. Run the focused patient-card/start-modal/encounter-page tests, scoped
ESLint, webapp typecheck and `git diff --check`. If tests/artifacts change, explicitly stage only allowed paths and
commit; otherwise leave the tree clean. Report exact commands/counts, candidate SHA, kill-set/fault injections and
auditor SHA.
