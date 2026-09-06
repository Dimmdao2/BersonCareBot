# Independent auditor-live — patient karta encounter summary/history (P4.4)

- **Candidate:** branch `wt/clinical-encounters-ui-20260906`, product SHA `6fb9b19e2`, base `90b5a1393`
- **Authority:** `AGENTS.md`; `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` P4.4 (`ENCOUNTERS-01..05`),
  `CLINICAL-GATE-01`
- **Role:** `auditor-live` (first blind pass over this surface, §10b / §24.5)

## 1. Blind kill-set (written BEFORE opening any `*.test.*`)

Derived only from the owner acceptance text and AGENTS §16/§17/§21. Each entry: named failure in the form
"given X → wrongly Y", then the §24.4 classification (Test = repeatable behaviour, cheapest public layer;
Look = one-off quality / layout / composition, proven by reading final state + live).

| ID | Named failure | ID covered | Test or Look |
|----|---------------|-----------|--------------|
| K01 | Patient has V visits and A calendar appointments (A≠V) → header shows the appointment count instead of the visit count | ENCOUNTERS-01 | Test (count derivation is a named owner contract; cheapest layer = pure derivation) |
| K02 | Block rendered outside the disease-anamnesis → life-anamnesis position | ENCOUNTERS-01 | Look (composition; §10a forbids pinning DOM order) |
| K03 | Visits = [primary, primary, repeat] → primary count collapses to 1 (or "primary" inferred as "the first visit") | ENCOUNTERS-02 | Test (derivation) |
| K04 | Visits with mixed dates → "previous encounter" shows earliest / a future visit instead of the latest one | ENCOUNTERS-02 | Test (derivation) |
| K05 | Tapping the shown previous-encounter date opens a different visit than the one whose date is displayed | ENCOUNTERS-02 | Test (wrong clinical record shown; silent) |
| K06 | Zero visits → NaN / "Invalid Date" / crash in the summary | ENCOUNTERS-01/02 | Look (loud) unless the same pure helper already under test → then Test |
| K07 | Old permanent second history column / old inline form still reachable in the karta tab | ENCOUNTERS-03 | Look (one-off removal; §24.4 forbids tests on absence of code) |
| K08 | Footer actions are local buttons, not the shared doctor action panel | ENCOUNTERS-03 | Look |
| K09 | Opening a visit row from history unmounts/closes the patient card or the whole stack | ENCOUNTERS-04 | Look (loud, live) |
| K10 | History list silently truncated (limit N) so older encounters are invisible while the summary counts them | ENCOUNTERS-04 | Test if a limit exists in the data path; else Look |
| K11 | "Новый приём" opens an inline/nested form instead of navigating to the full-page route | ENCOUNTERS-05 | Look (composition + live) |
| K12 | Edit opens a duplicate/parallel editor instead of the canonical page route | ENCOUNTERS-05 | Look (rg for duplicate route) |
| K13 | Encounter created from an appointment detail (`pendingAppointmentId` set) → id dropped, encounter silently unlinked from the calendar appointment | preserve-path | Test (silent + expensive) |
| K14 | `pendingAppointmentId` not consumed once → create path re-opens in a loop / second encounter for the same appointment | preserve-path | Test |
| K15 | Close callback of the selected appointment detail navigates away or triggers a create instead of just closing the detail | preserve-path | Test (stray write is silent) |
| K16 | Raw `Dialog` / duplicate modal shell instead of `DoctorModal` | §16 | Look (rg + lint) |
| K17 | Local hex colour, `text-lg/xl/3xl/[13px]`, `rounded-2xl`, `shadow-*` on page-level section | §16 | Look (rg self-check) |
| K18 | Explanatory copy invented beyond owner scope | §21 | Look |
| K19 | Nested scroll inside the modal body (double scrollbars on mobile) | §16 | Look (live) |
| K20 | Duplicate route/editor implementation added | ENCOUNTERS-05 | Look (rg) |
| K21 | The 829-line reduction removed a live capability that is not in owner scope (doctor can no longer do X) | CLINICAL-GATE-01 | Look (diff read + live) |

Named kill classes: **21**.

## 2. Classification applied (§24.4)

Seven classes proved repeatable behaviour and went to the cheapest layer that can see them — the tab component
itself, because the derivations (`visits.length`, `filter(type)`, `visits[0]`, id→visit lookup, redirect URL,
close callback) live inline in the component and have no layer below the UI. Fourteen classes are one-off
removal quality, layout or composition and were proved by reading the final state plus a live look, per §24.4
and §10a («не закреплять UI-тестом тексты, количество элементов, расположение или DOM»).

## 3. Independent oracles

- **Newest-first ordering** (basis for «предыдущий приём» = `visits[0]`): `apps/webapp/src/infra/repos/pgPatientClinical.ts:286`
  — `.orderBy(desc(clinicalVisit.visitedAt))`. Confirmed at the repo layer, not from the component under test.
- **Visit ≠ appointment**: the tab reads `GET /api/doctor/patients/[userId]/clinical` → `listVisits`
  (`clinical_visit`), never an appointments source.
- **Owner text** for every ENCOUNTERS-* expectation.

## 4. Fault injection — «what was broken → which assertion went red» (§10b.5)

Every injection was applied to product code by the auditor, run, and reverted (`git checkout --`).
Command: `pnpm exec vitest --run --project=ui "src/app/app/doctor/patients/[userId]/tabs/PatientTabKarta.ui.test.tsx"`.

| # | Class | Injected break | Result |
|---|-------|----------------|--------|
| INJ-1 | K03 | `primaryCount` counts `'repeat'` instead of `'first'` | **GREEN — NOT CAUGHT** (see §5) |
| INJ-2 | K04 | previous encounter = `visits[visits.length-1]` (oldest) | RED ×3 — «Предыдущий приём: 05.09.2026» not found |
| INJ-3 | K05 | history row always opens `visits[0]`, ignoring the clicked id | RED — «Осмотр-Б-текст» not found |
| INJ-4 | K13 | `?appointmentId=` dropped from the redirect URL | RED — `routerReplace` called with wrong args |
| INJ-5 | K14 | `router.replace` → `router.push` (back-button re-entry) | RED — same assertion |
| INJ-6 | K15 | close callback no longer calls `composition.onCloseSelectedVisit()` | RED — «called 1 times, but got 0 times» |
| INJ-7 | K01 | N counts only appointment-linked visits | RED — «Приёмы: 2» not found |
| INJ-1 (repeat, after fix) | K03 | `primaryCount` counts `'repeat'` | RED — «Первичных: 2» not found |
| INJ-1b | K03 | `repeatCount` counts `'first'` | RED — «Повторных: 1» not found |

**Named kill classes: 21. Caught by test: 7 (K01, K03, K04, K05, K13, K14, K15). Proved by Look: 14.
Uncaught on the candidate as delivered: 1 (K03) — closed by the auditor's test change below.**

## 5. Findings

### F-1 (test, fixed by auditor) — the delivered test could not see a primary/repeat mix-up

`PatientTabKarta.ui.test.tsx` shipped a symmetric fixture: one `first` + one `repeat`. Both counters therefore
read `1`, so swapping the two derivations — or pointing both at the same value — stayed green (INJ-1). The
owner requirement it is supposed to protect is explicitly the asymmetric one: ENCOUNTERS-02 «Несколько
первичных приёмов допустимы и корректно учитываются», which the fixture never exercised.

Fixed once, per §24.5, by adding a second primary encounter (`visit-c`) so the fixture reads 2 primary /
1 repeat. Product code untouched — it was already correct. INJ-1 and INJ-1b now both go red.

### F-2 (process) — the product worker wrote its own tests, contrary to §10b

`PatientTabKarta.ui.test.tsx` was authored in the product commit `6fb9b19e2` by the implementing worker, which
§10b forbids («Воркер продуктового этапа тесты не пишет»), and the worker reported its own fault injection as
evidence. F-1 is exactly the failure mode that rule exists to prevent: the author's own arbiter confirmed what
the author had already thought of, and the fixture blind spot survived. The tests themselves are otherwise
sound and are retained (see §6) — the finding is the process, and the correction is that the blind kill-set in
§1 and the injections in §4 were produced independently and before this file was opened.

### F-3 (integration dependency, not a candidate defect) — create/edit dead-ends

`/app/doctor/patients/[userId]/visits/new` and `.../visits/[visitId]/edit` do not exist on this branch; there is
no `visits/` directory. The catch-all `[...tabSlug]/page.tsx` finds no valid tab segment and renders
«Страница не найдена». Live probe: the redirect fires correctly and lands there.
Owner scope P4.5 (`ENCOUNTER-PAGE-01..04`) is unimplemented (`[ ]`), and the sibling worktree
`bcb-wt-clinical-anamnesis-20260906` is working that area now. Classified per brief as an expected integration
dependency — **not** a candidate PASS for ENCOUNTERS-05.

Side observation, pre-existing and out of scope: that missing route answers **HTTP 200**, not 404 (soft-404).
The candidate did not introduce it.

### F-4 (integration dependency) — the summary cannot yet sit in its required position

ENCOUNTERS-01 requires the block «между анамнезом заболевания и анамнезом жизни». Those are two separate blocks
only after P4.2/P4.3 land; today the tab has one combined «Анамнез» section and the summary is rendered after it
(live-confirmed, mobile and desktop). Whoever lands P4.2/P4.3 must re-place this block; nothing in the candidate
prevents that.

### F-5 (recommendation, not a gate finding) — 1 792 orphaned lines

`karta/NewVisitPanel.tsx` (1 547), `karta/VisitCatalogTextarea.tsx` (240, imported only by it) and
`karta/mockData.ts` (5) now have no importer anywhere. Keeping them until P4.5 ports the unlinked-appointment
picker and the service/catalog logic is defensible; leaving them after P4.5 lands is not. Orchestrator's call —
§24.6 forbids the auditor turning this into scope.

### F-6 (recommendation) — dead `mt-0.5` in the history row

`EncounterHistoryModal` puts the meta line in a sibling `<span className={cn(doctorDnaFlatListMetaClass, 'mt-0.5')}>`,
plainly intending a second line, but both spans are inline inside a flex child, so date, badge, time and location
render on one line (see the live shot). Margin has no effect on an inline element. Presentation only; §24.6 says
style is not a finding.

## 6. Test disposition (§10b «Что проверяет аудитор тестов»)

All five tests retained; one fixture strengthened. Each protects a named silent failure, uses an oracle
independent of the implementation, and sits on the cheapest layer that can observe it (the derivations have no
layer below the UI). The file is selected by the `ui` Vitest project (`apps/webapp/vitest.config.ts:74`) and runs
in the GitHub Actions job `test-webapp-behavior` — «Test (webapp unit / route / UI)» — so §10b criterion 4 holds.
No test pins layout, radii, typography, source text or element counts beyond the counters that are themselves the
owner contract.

## 7. Per-ID verdict

| ID | Verdict | Evidence |
|----|---------|----------|
| ENCOUNTERS-01 | **PARTIAL** | Count source correct and proven (INJ-7 red; live «Приёмы: 2» for a 2-visit patient). Position blocked by F-4. |
| ENCOUNTERS-02 | **PASS** | Live «Первичных: 1 / Повторных: 1 / Предыдущий приём: 18 августа 2026» (newest of 18.08 / 15.08); the link opens exactly that encounter. INJ-2/INJ-3/INJ-1/INJ-1b red. Multi-primary covered after F-1. |
| ENCOUNTERS-03 | **PASS** | Live desktop + XR: one column, no permanent history pane, footer «История приёмов» (outline) + «Новый приём» (primary `size="sm"`), doctor primitives only. |
| ENCOUNTERS-04 | **PASS** | Live: nested `DoctorModal` (2 dialogs stacked), full chronology, both rows, no truncation, no nested scroll container, Escape closes only the top layer (2→1→0), patient card visible throughout, URL unchanged. |
| ENCOUNTERS-05 | **FAIL (integration dependency)** | Read half PASS — compact `DoctorModal`, live on XR drawer and desktop. Create/edit half dead-ends per F-3. |
| pendingAppointmentId path | **PASS** | Live: `?tab=karta&createVisitFrom=appt-XYZ-1` → `replace` → `/visits/new?appointmentId=appt-XYZ-1`, once, id encoded; `replace` not `push`, so Back does not bounce forward. INJ-4/INJ-5 red. |
| selected-appointment composition | **PASS (not exercised live)** | Close callback clears the parent selection and does not navigate or create (INJ-6 red + code read). The Записи → «Заметки визита» click path itself was not walked live. |
| §16/§17/§21 primitives | **PASS** | `rg` self-check clean: no `rounded-2xl`, bare `<h2>`, `text-lg/xl/2xl/3xl/[13px]/[18px]`, raw hex, `shadow-*`, `@/components/ui`. Violet package badge and the «— файлы, прикреплённые к визиту» line are carried verbatim from the pre-existing `VisitCard`, not invented here. |
| K21 capability sweep | **See F-3/F-5** | Removed: inline create (`NewVisitPanel` + unlinked-appointment mode picker) and inline edit (`VisitCard` → PATCH). Both are in owner scope to move; the destination does not exist yet. |

## 8. Commands and results

```
pnpm exec tsc --noEmit -p tsconfig.json                                  → exit 0
pnpm exec eslint <5 changed files>                                       → exit 0
pnpm exec vitest --run --project=ui PatientTabKarta.ui.test.tsx          → 5 passed (candidate, and after the fixture fix)
9 fault injections (§4), each reverted                                   → 8 red, 1 green (INJ-1, closed by F-1)
live: next dev :5311 (isolated), owner doctor session, patient 0b7fadbd… → §7 evidence, 0 console errors
```

Full CI was not run (§24.7 — targeted level for a single-tab candidate). Shots:
`/tmp/enc-audit/{xr,desktop}-*.png`, `origin2.png`.

## 9. Candidate cleanliness

Tree carries no leftover audit edits: every fault injection reverted, no product file modified by the auditor.
The only committed changes are the strengthened fixture in `PatientTabKarta.ui.test.tsx` and this artifact.
There is no `docs/audit` queue file in this repository, so no queue row was added.

## 10. Verdict

**FAIL — NOT FOR LAND as a standalone commit.**

Not for defects in what the candidate itself owns: ENCOUNTERS-02/03/04, the read modal, the appointment-origin
path and the composition contract all pass, live and under injection, and the code stays inside the doctor
primitive canon. The blocking reason is single and mechanical — ENCOUNTERS-05 is an owner requirement of *this*
candidate's own scope (P4.4), and on this branch «создание и редактирование приёма переходят на одну полноценную
страницу приёма» dead-ends on «Страница не найдена». Landing alone therefore removes the doctor's only working
create/edit encounter path and closes no P4.4 checkbox that depends on it.

**Flips to PASS FOR LAND when bundled with the P4.5 `ENCOUNTER-PAGE` workstream**, after re-checking exactly two
integration points: (1) `/visits/new` and `/visits/[visitId]/edit` resolve and consume `?appointmentId=`;
(2) the summary block is re-placed between disease and life anamnesis once P4.2/P4.3 land (F-4). No new blind
audit of this surface is required for that check — §24.5: the kill-set and tests above are reused.

**НЕ СДЕЛАНО:** full CI (targeted level chosen per §24.7); the Записи → «Заметки визита» live click-through
(covered by test + code read only); ENCOUNTERS-05 create/edit live behaviour (page absent);
`CLINICAL-GATE-03` Playwright acceptance of the full clinical path (needs P4.5 + P4.6 present).
