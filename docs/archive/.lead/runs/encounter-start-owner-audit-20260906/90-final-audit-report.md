# Final audit report — common encounter actions and start modal

**Candidate SHA:** `f4c2d4f3a` (branch `wt/encounter-start-owner-audit-20260906`)
**Product commit under audit:** `63e3860c9` — *fix(doctor-ui): start encounters from patient context*
**Auditor SHA:** `de3fbc210` (tests + kill-set) → see final commit for this report
**Authority:** `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §P4.4–P4.6
**Kill-set:** `blind-killset.md` — written from the owner checklist **before** any test file was opened
**Product code:** not modified. All seven fault injections reverted; `git status --porcelain` empty between them.

## VERDICT: FAIL — 1 finding

One reachable owner-requirement violation. Everything else in the kill-set holds.

---

## Finding F-1 — the new-encounter page never says the encounter is unlinked

| | |
|---|---|
| **Owner IDs** | `ENCOUNTER-PAGE-09`, `ENCOUNTER-PAGE-LINK-02` |
| **Where** | `apps/webapp/src/app/app/doctor/patients/[userId]/visits/EncounterPageClient.tsx:487` |
| **Severity** | reachable on the primary «Без записи на приём» path |

**Reachable scenario.** Patient card → `Начать приём` → mode `Без записи на приём` → `Начать приём`.
The modal pushes `/visits/new?withoutAppointment=1`; the page renders `boundAppointmentId = null`.
The whole link line is gated on `mode === 'create' && boundAppointmentId`, so **nothing at all** is
rendered. The `Пациент` block shows only the patient's name.

**Impact.** The doctor cannot distinguish an intentionally unlinked encounter from one whose linked
appointment is still loading or was silently dropped — the two states are byte-identical on screen.
The same page in `mode === 'edit'` does state `Без связи с записью` (`:481`), so the omission reads
as an oversight, not a decision.

**Owner text violated.**
- `ENCOUNTER-PAGE-09` — «При отсутствии связи явно написано, что приём не связан с записью.»
- `ENCOUNTER-PAGE-LINK-02` — «при режиме без записи явно показано `Без связи с записью`.»

**Evidence.** Failing acceptance test, left red as the handoff oracle (AGENTS.md §24.5/§24.6 — the
auditor does not fix product code):
`visits/EncounterPageClient.ui.test.tsx` → *«states the encounter is not linked when the start modal
chose the without-appointment mode»*.

**Note for the fixer.** `visits/new/page.tsx:34-38` reads only `appointmentId`; the modal's
`withoutAppointment=1` is currently ignored, so «without» and «select-but-nothing-picked» reach the
page as the same state. Restoring the sentence for `mode === 'create' && !boundAppointmentId` closes
the owner ID; threading the explicit flag is a separate call for the owner, not part of this finding.

---

## Kill-set outcome — 11 classes, 0 uncaught

| # | class | outcome |
|---|---|---|
| K1 | entry bypasses the modal / keeps the old label | **caught green** (F5) + inspection |
| K2 | header actions missing/duplicated per tab; Karta `Приёмы: N` survives | **inspection PASS** |
| K3 | encounter page loses/fakes patient tabs; global nav loses the section | **inspection PASS** |
| K4 | selector not the three exact labels / leaks the internal key | **inspection PASS** |
| K5 | trusted appointment-detail entry loses the id | **caught green** (F6, F7) |
| K6 | auto-select picks another day / an already-linked record | **caught green** (F1) |
| K7 | featured row folded into the list; multi-select; wrong id confirmed | **caught green** (F2, F3) |
| K8 | duplicate create form/write path; patient changeable; money fields lost | **inspection PASS** |
| K9 | without-appointment mode renders booking fields or writes | **caught green** (F4) + inspection |
| K10 | page reintroduces a selector, or stops stating the mode | **FAIL → F-1** (failing acceptance test) |
| K11 | history/view stack, past-visit editing regress | **inspection PASS** |

### Fault injections — «what was broken → which assertion turned red»

| id | temporary product mutation | assertion that turned red |
|---|---|---|
| F1 | auto-select filter drops `at.toISODate() === todayIso` | *does not auto-select an appointment from another day…* |
| F2 | `AppointmentChoice` renders the check unconditionally | *replaces the auto-selection…* `toHaveLength(1)` (+4 more) |
| F3 | confirm sends `appointments[0]` instead of the selection | *automatically selects the next available appointment today* — `routerPush` args |
| F4 | confirm passes `selectedAppointmentId` in every mode | *confirms the without-appointment mode with no appointment id at all* |
| F5 | header `Начать приём` calls `router.push` instead of opening the modal | *opens the start modal from the identity header…* — modal absent |
| F6 | `createVisitFrom` effect calls `openEncounterStart()` with no id | *opens the start modal prebound with the appointment…* |
| F7 | modal drops the `current && available.some(...)` prebound guard | *keeps an explicitly prebound appointment selected even when it is not today* |

7 injected / 7 caught / 0 uncaught. Every mutation reverted with `git checkout --`.

## What was proved by inspection (AGENTS.md §24.4 — one-time structure, not tests)

- **`ENCOUNTERS-ACTION-01..05`** — the action row is rendered **once**, inside the unconditional identity
  header card (`PatientCardClient.tsx:578-591`), above and outside the tab panels, so it is present on all
  five tabs and is not copied into any of them. `История приёмов` outline left, `Начать приём` primary right.
- **`ENCOUNTERS-BLOCK-01`** — `tabs/karta/EncounterSummary.tsx` has **zero importers**
  (`grep -rn EncounterSummary apps/webapp/src` → definition only); the `Приёмы: N` card no longer renders.
- **`ENCOUNTER-PAGE-02A/02B/02C`** — `PatientEncounterPageShell` mounts `PatientCardRouteTabs` with
  `activeTab={null}`: the same five labels from the single `PATIENT_CARD_TABS` source, no `Приём` tab, none
  marked active. Tap → `patientCardHref(userId, {tab})`. Global nav: `isDoctorNavItemActive`
  (`doctorNavLinks.ts:227`) matches `/app/doctor/patients/` by prefix, so `…/visits/new` keeps the section lit.
- **`ENCOUNTER-START-02/03`** — one `MODE_OPTIONS` array with exactly the three owner labels, rendered
  through the canonical doctor `Select` with `displayLabel={selectedModeLabel}`; the internal keys
  `select`/`create`/`without` never reach `SelectValue`.
- **`ENCOUNTER-CREATE-01/02/08`** — create mode renders `DoctorAppointmentCreatePanel`, i.e. the calendar's own
  `DoctorCalendarEventPanel` in `startInCreate` mode with `hidePatient` — the patient search is not rendered at
  all (`DoctorAppointmentForm.tsx:161`), so the patient cannot be changed, while Начало / Филиал /
  Длительность / Стоимость / Комментарий stay untouched. One door: the panel POSTs to
  `…/appointments/manual`; no second write path exists.
- **`ENCOUNTER-CREATE-03/09`** — `onCreated(newId)` is called with `json.appointment?.id`, the id the manual
  door actually returned (`DoctorCalendarEventPanel.tsx:563,578`), and that id is what `openEncounter` puts in
  the URL.
- **`ENCOUNTER-LINK-07`** — enforced server-side: `appointments/unlinked/route.ts:53` drops every appointment
  in `listLinkedAppointmentIds` plus cancelled ones. Not re-tested in the UI.
- **`ENCOUNTER-MONEY-01/02`, `ENCOUNTER-PAGE-LINK-01`** — `EncounterPageClient` has exactly four `fetch`
  calls (`/clinical`, `/appointments`, `/visits`, `/visits/{id}`): no booking-engine call, no link selector,
  no toggle, no booking section anywhere on the page.
- **`ENCOUNTERS-VIEW-01/02`, `ENCOUNTER-PAGE-23`** — history modal + nested compact view still wired
  (`PatientCardClient.tsx:795-808`); `visits/[visitId]/page.tsx` has no date guard. Matches the accepted
  `clinical-encounter-page-audit-20260906` report; re-confirmed against the current tree.

### Prior-audit evidence reused

`.lead/runs/clinical-encounter-page-audit-20260906/90-final-audit-report.md` was written against the **previous**
ID scheme (`ENCOUNTER-APPOINTMENT-01..06`), which `63e3860c9` replaced, and its line numbers no longer resolve —
`EncounterPageClient.tsx` shrank from ~1100 to 852 lines. Only its live DB findings about the manual door,
the overlap consent and the zero-finance OFF path were reused, after re-confirming the corresponding code paths
still exist in this tree. Its claim that the unlinked case renders `Без связи с записью` **no longer holds for the
create page** — that is finding F-1.

## Owner questions (not findings — AGENTS.md §24.6)

- **Q-1 — an appointment already in progress is never featured or preselected.** Both the auto-select
  (`PatientEncounterStartModal.tsx:108`) and the featured block (`:138`) require `at >= now`, so a record that
  started 15 minutes ago falls into the plain list with nothing selected and the confirm button disabled.
  `ENCOUNTER-LINK-02` says «**следующая** … запись сегодня» (future), but `ENCOUNTER-LINK-04` says
  «**текущая**/ближайшая». The two readings differ exactly on the commonest case — the doctor starting the
  encounter a few minutes late. One line from the owner settles it; no work started.
- **Q-2 — a third name for the encounter-start action.** The appointment row in the patient card offers
  «Оформить визит» (`tabs/PatientTabRecords.tsx:870`). It correctly opens the common modal, so
  `ENCOUNTER-START-01` holds, but `ENCOUNTERS-ACTION-06` names only the next-record and appointment-details
  entries and forbids only `Создать визит`/`Новый визит`. Rename to `Начать приём` too?
- **Q-3 — dead code left behind.** `tabs/karta/EncounterSummary.tsx` has no importers, and the
  `+ Создать визит` button in `tabs/PatientTabOverview.tsx:1716` is permanently `hidden` at its only render
  site (`compositionMode="overview"` ⇒ `isComposed`). Neither is reachable, so neither is a violation; both
  are deletion candidates.

## Commands and counts

```
pnpm install --frozen-lockfile                                   # worktree had no node_modules
pnpm -r --filter "./packages/**" run build                       # workspace types required by tsc
npx vitest run --project ui  <4 focused files>                   # baseline:  4 files, 7 tests, all green
npx vitest run --project ui  <4 focused files>                   # final:  12 passed | 1 failed (13)
npx tsc --noEmit -p apps/webapp/tsconfig.json                    # exit 0
npx eslint <3 changed test files>                                # exit 0
git diff --check                                                 # clean
```

The single red test is finding F-1's acceptance oracle and is intentionally left failing for handoff.

## Committed paths

- `apps/webapp/src/app/app/doctor/patients/[userId]/PatientCardClient.ui.test.tsx`
- `apps/webapp/src/app/app/doctor/patients/[userId]/PatientEncounterStartModal.ui.test.tsx`
- `apps/webapp/src/app/app/doctor/patients/[userId]/visits/EncounterPageClient.ui.test.tsx`
- `.lead/runs/encounter-start-owner-audit-20260906/{blind-killset,90-final-audit-report}.md`

## НЕ СДЕЛАНО

- No push, land, deploy or full CI (out of scope by brief).
- No screenshot/visual review — owner accepts presentation live on TEST (`CLINICAL-GATE-03`).
- No live DEV/TEST run: every kill-set item resolved at the component layer or by inspection, so
  standing up a server would have added machinery without adding evidence (§10a «Цена проверки»).
- `ENCOUNTER-CONFLICT-01..04` and `ENCOUNTER-CREATE-10` were not re-proved live; they live entirely inside
  the unchanged manual door and were proved against the DEV database by the prior audit. `63e3860c9` only
  adds the `onCreated` callback to that path.
