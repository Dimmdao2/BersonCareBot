# auditor-live report — doctor catalog flat-list alignment

Candidate: `b21959edd83d529fe86faefe90e4c3fb864f4840` on
`wt/doctor-catalog-flat-list-align`.

Authority: `AGENTS.md` §1a, §10a–§10b, §15–§17, §24; owner decision 11.09 in
`docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_PLAN.md` И9; the audit brief.

Verdict: **FAIL**. The candidate fixes the original centered catalog rows, but loses every list divider and the
shared `justify-start` regresses existing `justify-between` consumers. The required title-sort interaction is also
already broken outside this diff, so perimeter P3 cannot be accepted as green.

## Test-or-look classification (recorded before candidate inspection)

| ID | Classification | Evidence method |
| --- | --- | --- |
| P1 | One-off UI quality | Live desktop comparison and screenshots |
| P2 | UI behavior | Live desktop selection and narrow-viewport bottom drawer; no automated UI test per §10a |
| P3 | UI behavior | Live search/filter/sort/view-mode/persistence; no automated UI test per §10a |
| P4 | UI behavior | Live archive filter and archive mark |
| P5 | UI/runtime behavior | One-off live virtual-scroll traversal |
| P6 | One-off UI quality | Committed diff inspection plus live tile screenshots |
| P7 | One-off change-scope quality | Exact committed diff inventory |
| P8 | Mixed one-off quality | Exact consumer inventory plus live consumer screenshots/computed styles |

Blind kill-set prepared before implementation/test inspection: centered or inconsistent left edge; wrong padding,
height, divider, or long-title wrapping; click not updating the detail surface/selection; wrong mobile surface;
search/filter/sort/view state loss; missing archive mark/status filtering; virtual-scroll gaps or duplicates; tile
changes; shared-row alignment regressions in clients/chats/comments/Today/settings.

No acceptance test was added: every relevant failure is UI/CSS/browser interaction and automated UI tests are
forbidden by §10a. The sorting defect has no cheaper non-UI public boundary: the failure is the client control/state
wiring itself.

## Findings

### F1 — MUST FIX — virtualized canonical rows have no dividers

Reachable scenario: open any candidate catalog in list mode with at least two rows. Each
`DoctorCatalogMasterListRow` is the only child of its own `VirtualizedItemGrid` row wrapper, so its
`last:border-b-0` always matches. The computed `border-bottom-width` is `0px` for every rendered row. Before the
candidate, the second exercise `<li>` has a computed `border-top-width` of `1px` through
`DoctorDnaFlatList`; the candidate therefore removes an existing separator and violates the brief plus doctor UI
guide §A/§8.

Evidence:

- candidate: `exercises-desktop-list.png`, `recommendations-desktop-list.png`,
  `clinical-tests-desktop-list.png`;
- clean-main baseline after removing the temporary overlay: `baseline-main-exercises-list.png`;
- reference components exhibit the same latent wrapper defect: `ref-lfk-templates-desktop-list.png`,
  `ref-test-sets-desktop-list.png`. Reusing the component is correct, but it does not make the divider contract true.

Live probe expression used for the figures above:

```js
page.locator('button.rounded-none').evaluateAll((rows) => rows.map((row) => ({
  borderBottom: getComputedStyle(row.parentElement).borderBottomWidth,
  borderColor: getComputedStyle(row.parentElement).borderBottomColor,
})))

page.locator('button.rounded-none').nth(1)
  .evaluate((row) => getComputedStyle(row.closest('li')).borderTopWidth)
```

### F2 — MUST FIX — shared `justify-start` overrides existing `justify-between` callers

Reachable scenario: open `/app/settings?tab=billing`. With the candidate overlay, labels such as
“Каталог упражнений” and their “Включено” marks are grouped at the left; computed `justify-content` is
`flex-start`. After removing exactly the candidate overlay, the same live rows compute to `space-between` and the
marks return to the right. Screenshots: `consumer-settings-billing.png` (candidate) and
`baseline-main-settings-billing.png` (clean main).

The same conflicting call shape exists in `TeamSection`, `DoctorTodayDashboard`, `BillingSection`, and
`SaasBillingOverview`; exact inventory command:

```bash
rg -n "doctorDnaFlatListRowClass.*justify-between|doctorDnaFlatListRowClass.*block|doctorDnaFlatListRowClass" \
  apps/webapp/src/shared/ui/doctor/SaasBillingOverview.tsx \
  apps/webapp/src/app/app/settings/TeamSection.tsx \
  apps/webapp/src/app/app/settings/BillingSection.tsx \
  apps/webapp/src/app/app/doctor/DoctorTodayLeftKpiRow.tsx \
  apps/webapp/src/app/app/doctor/DoctorTodayDashboard.tsx \
  apps/webapp/src/modules/messaging/components/DoctorConversationListRow.tsx \
  apps/webapp/src/app/app/doctor/comments/DoctorCommentsTab.tsx \
  apps/webapp/src/app/app/doctor/patients/PatientsPageClient.tsx
```

The live chats, clients, comments, and Today message modal still render correctly because their intended alignment
is `flex-start`: `consumer-chats.png`, `consumer-clients.png`, `consumer-comments.png`,
`consumer-today-messages-modal.png`. The DEV clinic is in solo composition, so `?tab=team` redirects to
`?tab=organization`; the Team rows themselves were unavailable live, but their conflicting class is in the exact
inventory above and the billing before/after proves the Tailwind precedence affecting that call shape.

## Required perimeter

P1 → **FAIL** → Shared component gives the intended left edge, canonical padding, typography, adaptive
single-/two-line height, and long-title wrap; all separators are missing (F1). Candidate screenshots:
`exercises-desktop-list.png`, `recommendations-desktop-list.png`, `clinical-tests-desktop-list.png`; references:
`ref-lfk-templates-desktop-list.png`, `ref-test-sets-desktop-list.png`.

P2 → **PASS** → Desktop click updated the title field and added the selection strip in all three
catalogs (`*-desktop-list-selected.png`). At the narrow viewport, the same click opened the bottom-anchored dialog and retained
the selected mark: `exercises-mobile-bottom-sheet.png`, `recommendations-mobile-bottom-sheet.png`,
`clinical-tests-mobile-bottom-sheet.png`.

P3 → **FAIL** → Search filtered all three catalogs; choosing region “Голова” put `region=head` in each URL;
list/tile switching persisted across navigation and reload. But choosing “Название А→Я” through the live
sort control left the trigger at “По дате изменения” and left the rows unchanged. On desktop the whole master
header is also covered by the sticky filter toolbar (direct pointer click was intercepted), so keyboard focus was
required for sort/archive/view controls. Direct
`?titleSort=asc` does sort correctly (`exercises-sort-url-asc.png`, `recommendations-sort-url-asc.png`,
`clinical-tests-sort-url-asc.png`), localizing the failure to existing client control/state wiring. The candidate
diff does not touch this wiring, and the same failure reproduced on clean main; this is an existing reachable defect,
not a new candidate finding, but the explicit P3 requirement is not green.

P4 → **PASS** → Selecting archive scope changed each URL to `status=archived`; every rendered archived row
had `svg[aria-label="В архиве"]`. Screenshots: `exercises-desktop-archive.png`,
`recommendations-desktop-archive.png`, `clinical-tests-desktop-archive.png`. The desktop pointer-access defect of
the shared header is already reported under P3; this row records the status-filter result after keyboard activation.

P5 → **PASS** → The exercise scroller was traversed from its first through last virtual `data-index`; the
collected range was contiguous, no index was missing, and no viewport contained the same index twice. Traversal
expression:

```js
const indices = [...scroller.querySelectorAll('[data-index]')]
  .map((node) => Number(node.getAttribute('data-index')));
```

P6 → **PASS** → No tile-render line changes in the committed diff; all three tile views rendered after the
toggle: `exercises-desktop-tiles.png`, `recommendations-desktop-tiles.png`,
`clinical-tests-desktop-tiles.png`. Exact inspection command:

```bash
git diff --unified=0 b21959edd^ b21959edd -- \
  apps/webapp/src/app/app/doctor/exercises/ExercisesPageClient.tsx \
  apps/webapp/src/app/app/doctor/recommendations/RecommendationsPageClient.tsx \
  apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestsPageClient.tsx \
  | rg '^[+-].*(Tile|tile|estimatedRowHeight=220|activeTileColumns|render.*Tiles)'
```

The command produced no output.

P7 → **PASS** → The committed diff contains only the three catalog clients and the shared row-class file;
no route action, server port, schema, or other screen changed. Exact command:

```bash
git diff --name-only b21959edd^ b21959edd
```

Output:

```text
apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestsPageClient.tsx
apps/webapp/src/app/app/doctor/exercises/ExercisesPageClient.tsx
apps/webapp/src/app/app/doctor/recommendations/RecommendationsPageClient.tsx
apps/webapp/src/shared/ui/doctor/DoctorDnaFlatListRow.tsx
```

P8 → **FAIL** → Clients, chats, comments, and the Today message row remain left-aligned and unoverflowed,
but the common class breaks existing `justify-between` consumers; live billing before/after proves it, and Team/
Today call sites have the same conflict (F2).

## Validation and cleanup

```bash
pnpm --dir apps/webapp exec eslint \
  src/app/app/doctor/exercises/ExercisesPageClient.tsx \
  src/app/app/doctor/recommendations/RecommendationsPageClient.tsx \
  src/app/app/doctor/clinical-tests/ClinicalTestsPageClient.tsx \
  src/shared/ui/doctor/DoctorDnaFlatListRow.tsx
# exit 0

pnpm --dir apps/webapp typecheck
# exit 0

git show --check b21959edd
# exit 0
```

The candidate diff was temporarily applied to `/home/dev/dev-projects/BersonCareBot`, inspected through the single
shared Turbopack server at `127.0.0.1:5200`, and removed with the reverse of that exact binary diff. The target
paths in the main checkout are clean after cleanup. No product fix or automated UI test was left behind.
