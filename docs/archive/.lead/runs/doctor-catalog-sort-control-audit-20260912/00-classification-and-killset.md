# Doctor catalog sort-control correction — pre-inspection classification and kill-set

Candidate: `3e04f4fef` + `d7fb3b6c2` + `3cd486514` on `wt/doctor-catalog-sort-control`.

Recorded before inspecting the candidate implementation diff.

| ID | Classification | Evidence method |
| --- | --- | --- |
| 1 | Test: repeatable UI behavior | Live mouse selection in six catalogs; observe row order, trigger label and URL for asc/desc/default |
| 2 | Test: repeatable pointer accessibility | Live mouse clicks on sort/archive/view controls; observe master-header counter and view button |
| 3 | Look: one-off visual geometry | Live screenshots and numeric DOM/CSS geometry on seven `DoctorCatalogPageLayout` pages, compared with schedule and analytics |
| 4 | Look: sticky/scroll/adaptive layout | Live desktop and 390×844 scroll observations; numeric toolbar/row geometry |
| 5 | Test: repeatable expensive silent data-loss behavior | Live create/select-by-list/save/reopen flow for three recommendation records, then repeat in 390×844 bottom sheet |
| 6 | Look: neighboring UI surfaces | Live schedule/tasks/courses/program-item dialog observations |
| 7 | Test: repeatable client-state behavior | Live combined search/region/type/sort operations; observe URL state and network requests for absence of RSC navigation/refetch |
| 8 | Look: one-off committed scope | Exact Git diff inventory and checks for server actions/schema/ports/permissions |

## Blind kill-set

- Sort choice does not alter the six visible lists, trigger label, or `titleSort`; returning to modified-date does not remove it.
- A sticky overlay intercepts mouse clicks on sort/archive/view controls or covers the master-list header.
- Any of the seven layout consumers keeps gray canvas between page header and toolbar, fails container-edge alignment, or Tasks loses attachment.
- Toolbar scrolls away, overlaps the first row, leaves a gap, or changes the established 390×844 layout.
- A recommendation selected from the list mounts an editor with the previous record's description and a subsequent unchanged save erases persisted text; switching three times or using the mobile sheet reproduces it.
- Schedule, Tasks, Courses, or the program-item dialog becomes displaced or covered.
- Search/region/type clears sort, sort clears another filter, or a client-only change triggers an RSC request/navigation.
- The committed change exceeds ten named UI files or touches server actions, schema, ports, or permissions.

No automated UI test is authorized by `AGENTS.md` §10a. Item 5 is exercised live because its oracle is persisted user-entered text and its impact is silent data loss.
