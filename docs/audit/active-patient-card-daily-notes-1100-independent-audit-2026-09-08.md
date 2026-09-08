# Independent audit — #1100 active patient-card daily notes

## Candidate

- Candidate SHA: `8d174f039a3e82d578aab0089a9eed202a163182`
- Merge base with `feat/doctor-ui-rebuild`: `29a4894c3f64bad8765202b9a8a785aee4175c9b`
- Authority: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` NOTE-01..08, UI-01 and UI-07; audit brief for the active `/app/doctor/patients/[userId]` overview.

## Test or inspection — classification recorded before opening current tests

| ID      | Classification                                                                             | Cheapest useful evidence                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NOTE-01 | Repeated data behavior; failure is costly and silent                                       | Existing route/domain coverage if present, plus inspection that the active card reaches the one daily API; no duplicate UI test of the uniqueness rule.       |
| NOTE-02 | Repeated date-domain behavior; failure is costly and silent                                | Existing date unit/route coverage if present; inspect this candidate for changes to the already accepted date path.                                           |
| NOTE-03 | Observable presentation, loud and inexpensive to notice                                    | Direct component inspection and scoped UI acceptance; no new test solely for ordering/text.                                                                   |
| NOTE-04 | Repeated critical edit/save behavior; lost or divergent notes are costly and can be silent | One UI acceptance at the active patient-card boundary only if current coverage does not prove that typing enters the daily autosave surface without Add/Save. |
| NOTE-05 | Visual truncation/expansion shape                                                          | Direct inspection; live visual acceptance is cheaper than pinning DOM/CSS.                                                                                    |
| NOTE-06 | Repeated edit-by-date behavior; wrong-date writes are costly and silent                    | Existing shared-panel UI/route coverage if present; direct inspection that the active card reuses that panel.                                                 |
| NOTE-07 | Repeated concurrency/failure behavior; stale overwrite or lost draft is costly and silent  | Existing shared-panel behavior test with targeted fault injection; do not duplicate it at the patient-card wrapper.                                           |
| NOTE-08 | Mixed behavior                                                                             | Existing shared-panel focus/state test if present; direct inspection for stable keys, refresh/reload, and unrelated Jitsi/video remount scope.                |
| UI-01   | One-time integration shape and reuse                                                       | Direct wiring/import/endpoint inspection; no source-string test.                                                                                              |
| UI-07   | One-time scope containment                                                                 | Merge-base diff inspection; no test of file lists/classes/counts.                                                                                             |

## Blind kill-set

Recorded from authority before intentionally opening existing tests or implementation. A preliminary repository `code-search` used to locate owner material unexpectedly returned two short existing-test snippets (an import line and a draft-value assertion); neither supplied the faults or expected integration behavior below.

1. **K1 — active-card divergence:** clicking the active overview's notes stat or note action still opens the old append-only manual form. Impact: the same client/author/day can enter a second workflow and the doctor sees inconsistent history. Expected detector: active-card UI acceptance if not already covered.
2. **K2 — dead secondary trigger:** either the notes stat or its note action fails to open the daily editor/history. Impact: a documented entry point is non-functional. Expected detector: the same active-card UI acceptance; this is user-visible and otherwise loud.
3. **K3 — manual commit survives:** the active notes surface exposes Add/Save or typing does not autosave through the daily contract. Impact: the doctor can close believing text was saved when it was not, a costly silent loss. Expected detector: active-card UI acceptance observing typed text and the public fetch boundary.
4. **K4 — duplicate domain/path:** the active card mounts a copied note editor or calls an endpoint other than `/api/doctor/clients/[userId]/notes`. Impact: live meeting and patient card can silently disagree. Expected detector: direct reuse/wiring inspection, not an import-string test.
5. **K5 — wrong history/editor shape:** today is not first/open/borderless, earlier notes are not newest-first/collapsed to three visual lines, or expanding an earlier note does not preserve its date in a separate textarea. Impact: NOTE-03..06 behavior is absent. Expected detector: shared-panel scoped behavior evidence plus direct visual inspection; no new wrapper duplicate.
6. **K6 — stale-write/lost-draft failure:** writes for one date race, an older response wins, a failed request clears local text, or retry requires a parent refresh. Impact: silently lost clinical notes. Expected detector: existing shared-panel UI behavior test with one fault injection covering the serialized failure/retry path.
7. **K7 — unstable integration:** autosave invokes `router.refresh`, reloads the parent, uses unstable editor keys, or the card introduces a second state/domain that loses a successfully saved note on reopen. Impact: focus/state loss and possible video remount. Expected detector: direct inspection plus existing stable-panel behavior evidence; modal reopen itself may remount UI but must reload the same persisted daily note.
8. **K8 — collateral patient-card change:** files or behavior outside the active overview notes correction changed. Impact: unrelated patient-card regression contrary to UI-07. Expected detector: exact merge-base diff and active-route wiring inspection.

## Per-ID result

| ID      | Result | Evidence                                                                                                                                                                                                                                                                                                                                         |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NOTE-01 | PASS   | `PatientTabOverview` now sends both existing entry points to one modal containing the canonical panel. `pgDoctorNotes.saveDaily` scopes its upsert by organization/client/author/date, and `20260908T033001_daily_doctor_notes.sql` installs `uq_doctor_notes_daily_author ... NULLS NOT DISTINCT`; this candidate creates no second write path. |
| NOTE-02 | PASS   | The canonical GET resolves `today` through `resolveDoctorCalendarDate`; `DoctorNotesPanel.load()` captures that value once per mount and a reopened modal performs a fresh GET. The scoped timezone unit test proves stored IANA and `app_display_timezone` fallback dates.                                                                      |
| NOTE-03 | PASS   | Direct inspection: `visibleNotes` sorts descending by `noteDate`; `formatDate` renders a calendar date without a saved/created time.                                                                                                                                                                                                             |
| NOTE-04 | PASS   | Direct inspection and the updated active-card acceptance: today is injected first when absent, remains expanded, and typing autosaves. The modal has no separate Add/Save lifecycle.                                                                                                                                                             |
| NOTE-05 | PASS   | Direct inspection: only today starts expanded; a collapsed historic note is rendered with `line-clamp-3`. This visual class/layout requirement was not converted into a source/DOM-shape test.                                                                                                                                                   |
| NOTE-06 | PASS   | Direct inspection plus the shared-panel test: a past date toggles into its own textarea, and `changeText(note.noteDate, ...)` preserves that date through the POST body.                                                                                                                                                                         |
| NOTE-07 | PASS   | `versionsRef`, `savedVersionsRef`, `savingRef`, and timers are keyed per date; a stale response cannot replace local text, failure retains the draft and schedules retry, and no parent refresh is called. Both concurrency and network-retry shared-panel scenarios passed.                                                                     |
| NOTE-08 | PASS   | Editors use stable `key={note.noteDate}`; autosave does not replace their text/node. Live meeting tabs use `keepMounted`, so tab switching does not remount the note panel or video stage. No `router.refresh`/reload exists in the inspected integration.                                                                                       |
| UI-01   | PASS   | Canonical `/app/doctor/patients/[userId]` resolves the overview through `PatientCardClient` → `PatientTabOverview`; the active modal and live meeting sidebar both mount the same `DoctorNotesPanel`, which uses `/api/doctor/clients/[userId]/notes`.                                                                                           |
| UI-07   | PASS   | `git diff --name-status 29a4894c3f64bad8765202b9a8a785aee4175c9b..8d174f039a3e82d578aab0089a9eed202a163182` reports only `PatientTabOverview.tsx`; the diff removes the old manual form and otherwise changes only the notes-card handlers/modal body.                                                                                           |

## Test disposition and fault injection

The existing `PatientTabOverview.ui.test.tsx` encoded the superseded fullscreen manual editor: Cancel discarded the draft and Save sent an append-only POST. On the untouched candidate,

```text
pnpm --dir apps/webapp exec vitest run 'src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.ui.test.tsx'
→ FAIL: 1 file, 2 tests; both looked for the removed “Текст заметки…” manual textarea.
```

It was replaced in place by one acceptance scenario for the costly silent regression K1/K3/K4: both existing entry points reach the daily editor, typing POSTs the date/text to the canonical endpoint without a modal Add/Save control, and reopening through the other entry point retrieves the successfully saved daily note.

Required fault injection was performed once in production wiring:

```text
<DoctorNotesPanel userId={userId} embedded />
→ <DoctorNotesPanel userId={`${userId}-fault-injection`} embedded />

pnpm --dir apps/webapp exec vitest run 'src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.ui.test.tsx'
→ FAIL: “Unable to find an element with the placeholder text of: Заметка…” at the daily-editor assertion.
```

The mutation was reverted by an exact inverse patch. `git diff --exit-code HEAD -- 'apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.tsx'` then returned exit `0`, proving that no temporary production change remained.

## Scoped commands

- `pnpm install --frozen-lockfile` — PASS; the supplied clone initially had no `node_modules`.
- `pnpm --dir apps/webapp exec vitest run 'src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.ui.test.tsx' 'src/app/app/doctor/clients/DoctorNotesPanel.ui.test.tsx' 'src/app/api/doctor/clients/[userId]/notes/route.route.test.ts' 'src/modules/doctor-calendar-timezone/doctorCalendarTimezone.unit.test.ts'` — PASS: 4 files, 9 tests.
- After the inverse fault-injection patch and final formatting, `pnpm --dir apps/webapp exec vitest run 'src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.ui.test.tsx'` — PASS: 1 file, 1 test.
- `pnpm --dir apps/webapp exec eslint 'src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.tsx' 'src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.ui.test.tsx'` — PASS.
- Initial `pnpm --dir apps/webapp typecheck` — environment/setup failure: clean-clone workspace package declarations were not built, producing repository-wide `TS2307` errors for internal `@bersoncare/*` packages. After the same package-build prefix used by the root typecheck (`operator-db-schema`, `db-principal`, `shared-contracts`, `platform-merge`, `error-tracking`), `pnpm --dir apps/webapp typecheck` — PASS.
- `rg -l "export function DoctorNotesPanel|/api/doctor/clients/.*/notes|saveDaily\\(" apps packages --glob '*.ts' --glob '*.tsx' | sort`, preceded by `code-search` for daily-note components/endpoints/services/repositories — one canonical component, route, module port/service and production repository path; the other matches are their tests, in-memory adapter and consumers. No duplicate implementation was introduced.
- `git merge-base --is-ancestor b5dea3ea1 8d174f039a3e82d578aab0089a9eed202a163182` and a quiet path diff — PASS; the accepted daily-contract correction is an ancestor and its panel/route/repository/timezone paths are unchanged in this candidate.
- `pnpm exec prettier --check 'apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.ui.test.tsx' 'docs/audit/active-patient-card-daily-notes-1100-independent-audit-2026-09-08.md' && git diff --check` — PASS.
- Full CI was not run: the candidate is one local webapp integration correction, and the targeted UI/route/unit checks, scoped lint and webapp typecheck cover its integration risk.

## Verdict

**PASS.** No reachable in-scope product violation remains. The only candidate-adjacent failure was the obsolete manual-save UI test; it has been updated to the intentional daily behavior and fault-injection-proven.
