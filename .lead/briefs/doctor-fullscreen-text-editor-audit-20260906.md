# Independent audit: fullscreen doctor text editor

## Role and authority

You are the independent auditor of candidate `bfc6bd52d` in branch `wt/doctor-fullscreen-text-editor-20260906`. Read the full `AGENTS.md` heading map and §10a, §10b, §16, §17, §21 and §24 before acting. Owner authority is `MODAL-TEXT-01..08`, `PATIENT-NOTE-EDITOR-01..03`, `DISEASE-EDIT-03/04/05/05A`, and `LIFE-LIFESTYLE-01..04` in `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`, plus `.lead/briefs/doctor-fullscreen-text-editor-20260906.md`.

Do not change product code. You may add/commit only genuinely missing behavioral acceptance tests and a concise audit artifact if required. Revert every fault injection. Do not push, land, deploy, run full CI, or perform visual/screenshot acceptance; the owner performs the visual review on TEST.

## Classify before checking

- Repeated behavior: modal mode selection, immediate autofocus, viewport/keyboard geometry reactions, cancel/save semantics, note/disease/lifestyle write behavior. Use behavioral tests and a kill-set prepared before reading existing tests.
- One-time structure: reuse of the existing `DoctorModal` stack/portal instead of a parallel modal implementation; desktop branch preservation. Inspect the final diff rather than writing source-text tests.
- Visual styling: no taste findings. Check only objective layout contracts represented in DOM/classes/styles and event behavior.

## Exact kill-set / requirements

1. One reusable doctor-zone text-editor presentation extends `DoctorModal`; no second drawer/dialog/portal/stack implementation.
2. On mobile it fills the complete visible viewport with no top gap, rounded top corners or drawer handle; without a keyboard it still fills the screen.
3. Header stays at the top safe area. Borderless textarea begins immediately below it, fills the available middle region and owns long-text scrolling. Footer remains above the keyboard.
4. Geometry reacts to `window.visualViewport.height` and `offsetTop`; fallback uses dynamic viewport units rather than a fixed guessed pixel height. Listeners clean up.
5. The single text field is focused immediately when the modal opens/mounts so browsers may open the keyboard without a second tap. No animation-delay timer. Reopen behavior must focus again.
6. Mobile footer has Cancel left and Save right. Cancel closes without persisting the draft; Save persists through the existing path. Escape/close behavior must not silently save.
7. Desktop keeps the existing right-sheet/dialog geometry and top-oriented form; the fullscreen mobile mode must not alter unrelated `DoctorModal` presentations.
8. Exact call sites: patient Overview → Notes → New note; Disease anamnesis editor (now with Cancel); Lifestyle as one current editable field with no visible/editable date.
9. Lifestyle updates the latest existing row (PATCH) and appends only if no row exists (POST); technical history remains stored and prior rows are not deleted.
10. The multi-section life-anamnesis parent modal is not converted wholesale; only its current lifestyle text editor uses the new presentation.

## Required result

Return binary PASS or FAIL. Each FAIL must give a reachable scenario, impact, exact violated item and evidence. Recommendations/style are not findings. Report exact commands and counts. If tests are added, commit them and name the SHA; otherwise leave the worktree clean.
