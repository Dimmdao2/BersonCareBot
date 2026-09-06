# Independent audit: clinical lists owner correction

## Role and authority

You are the independent `auditor-live` for the candidate in branch
`wt/clinical-lists-owner-correction-20260906`. Before acting, read the `AGENTS.md` heading map and fully read
§10a, §10b, §16, §17, §21 and §24. Owner authority is P4.1 and P4.3 in
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`, including `CLINICAL-HEADER-05/06/07`,
`CLINICAL-HISTORY-01/02/03`, `CLINICAL-ROW-05/06`, and the final owner correction for the life-anamnesis card.

Oracle quote from that file: «При включении `ScrollText` актуальные симптомы или диагнозы не исчезают».

Do not change product code. You may add or adjust only genuinely missing behavioral acceptance tests in the
named component test and create concise audit artifacts under the named audit directory. Revert every fault
injection. Do not push, land, deploy, run full CI, start the shared dev server, or perform screenshot/taste review;
the owner performs visual acceptance on TEST.

## Test or inspection — classify before reading tests

- Repeatable behavior: history toggle preserves active rows; historical rows appear above and are hidden alone;
  one life editor opens from the card header; all four editor sections remain available including empty ones;
  lifestyle updates the latest row or creates one when absent. Prepare the blind kill-set before reading tests,
  then use the cheapest behavioral UI test where justified by §10a/§10b.
- One-time structure: exactly two clinical cards remain; `ScrollText` is icon-only; main life card has one
  `SquarePen`, no per-section controls/placeholders, and only filled values. Inspect rendered behavior and final
  diff. Do not write source-text, CSS-class, import-count, or screenshot tests.
- Spacing and color taste are owner live-review territory. Only objective missing controls, extra visible text,
  wrong list replacement, broken save/update flow, build/runtime errors, or scope violations are findings.

## Blind kill-set authority

Prepare the kill-set before opening the existing test file. It must cover these independent failures:

1. A visible text button «История» returns instead of the compact icon-only `ScrollText` action.
2. Enabling history replaces/hides active complaints or diagnoses instead of prepending history above them.
3. Historical rows receive the active red critical marker or are rendered as active rows.
4. Empty clinical lists or empty life sections render `—`, placeholder rows, or occupy visible main-card space.
5. Main life card exposes per-section history/add/edit controls instead of one header `SquarePen`.
6. The shared life editor omits any of the four contract sections or fails to offer the existing append/edit flow
   for the first three.
7. Lifestyle is rendered as dated history, appends on every edit, or deletes prior DB rows instead of editing the
   latest current value while retaining history.
8. Saving lifestyle fails to refresh the open card through the existing path or closes the wrong modal layer.

Each retained or new acceptance test must state the user-visible failure, consequence and independent owner
oracle. For every protected independent class, perform one temporary product-code fault injection and record
which assertion turned red. A failing acceptance test on the unmodified candidate is sufficient evidence of a
real defect and must remain failing for handoff; do not fix the product.

## Required result

Return binary PASS or FAIL. Each FAIL must name a reachable scenario, impact, exact violated owner item and
evidence. Style/recommendations are not findings. Run targeted Vitest for the component, scoped ESLint, webapp
typecheck and `git diff --check`. If tests/artifacts are changed, explicitly stage only allowed paths and commit;
otherwise leave the candidate clean. Report exact commands, test counts, fault injections, candidate SHA and any
auditor commit SHA.
