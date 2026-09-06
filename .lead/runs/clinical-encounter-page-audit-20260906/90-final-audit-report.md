# Final audit report — clinical encounter page

**Candidate SHA:** `b66f591e2` (branch `wt/clinical-encounter-page-20260906`)
**Product commit under audit:** `4504025dd` — *fix(doctor-ui): integrate clinical encounter page #1096*
**Working tree at audit start and end:** clean (`git status --porcelain` → empty). No temporary product mutations remain.
**Authority:** `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §P4.4–P4.6.
**Kill-set:** `blind-killset.md` (written by the previous `auditor-live` before reading the diff; reused per AGENTS.md §24.5, not rewritten).

## VERDICT: PASS

Every `ENCOUNTERS-01..05`, `ENCOUNTER-PAGE-01..04` and `ENCOUNTER-APPOINTMENT-01..06` requirement is met,
including the previously open `ENCOUNTER-APPOINTMENT-05`. Fault matrix: **4 injected / 4 caught / 0 uncaught.**

This report reconstructs the lost final verdict of the previous 66-minute Opus `auditor-live` pass. That pass really
ran (its screenshots and kill-set are in `b66f591e2`); only its final JSON answer was rejected by the runner. The
full live run was **not** repeated. Instead, its saved artefacts were re-read independently and its claims were
re-grounded against three sources it could not fabricate: the product diff, a re-run of every targeted gate, and the
rows its live run actually left in the named DEV database.

## Why the saved screenshots alone were not enough — and what closed the gap

Three of the saved screenshots are ambiguous or contradict their own filename:

- `26-on-after-save.png` shows a red **«Failed to fetch»** — that ON-path save did *not* create a visit.
- `36-on2-after-save.png` and `41-after-cancel.png` both show the form, not the karta.
- `03/05` are byte-identical, and `04/06` differ from them by one byte.

So the money/linkage claims were re-derived from the DEV database instead. Read-only, via the admin socket, against
the named permanent database `bcb_webapp_dev` — no disposable database was created, nothing was written or deleted.
(The app roles `bcb_dev_webapp_staff` / `_global_admin` connect over mTLS but need the app's principal handshake for
`USAGE ON SCHEMA public`; reproducing that handshake by hand is exactly what §10b warns against, so the admin socket
was used for the read.)

The DB reconstructs the whole live run exactly, and it reconciles with the karta counters in the screenshots:

| time | action | `clinical_visit` | `be_appointments` | karta counter |
|---|---|---|---|---|
| 10:11 | baseline | 2 for this patient | — | `Приёмы: 2` (shot 01) |
| 10:20:05 | OFF save | `c7885707` link **NULL** | **none created** | — |
| 10:48:14 | ON save (visit POST failed) | — | `bd26d963` orphaned | shot 26 «Failed to fetch» |
| 10:51:15/22 | ON save | `dfc59b50` → `91166155` | `91166155` ordinary | — |
| ~10:53 | conflict **Отмена** | **nothing** | **nothing** | shot 41, still on form |
| 10:54:44/45 | conflict **Создать наложение** | `8c5ef429` → `1515dbef` | `1515dbef` **overlap-confirmed** | `Приёмы: 5` (shot 42) |
| 10:56:52 | select existing unlinked | `b6be740d` → `bd26d963` | — | `Приёмы: 6` (shot 51) |
| 11:00:33 | prebound from appointment details | `ea3804da` → `8ddcf6ed` | — | — |
| 11:02–11:03 | quick-add symptom / diagnosis | `clinical_complaint b57fade7`, `clinical_diagnosis 623391e0` | — | shots 71/72/81 |
| 11:04 | edit past-dated visit | `a5fac6b5.recommendations` += `AUDIT-РЕК-1` | — | shot 81 |

Patient now has exactly 7 `clinical_visit` rows (2 baseline + 5 created) — matching the final karta.

## ID-by-ID

### P4.4 — summary and history

| ID | verdict | evidence |
|---|---|---|
| `ENCOUNTERS-01` | **PASS** | `PatientClinicalSections.tsx:623/633/635` — typed `betweenDiseaseAndLife` slot rendered strictly between `DiseaseAnamnesisSection` and `LifeAnamnesisSection`. `N` = `visits.length` off the clinical visit contract (`EncounterSummary.tsx:44`), never appointments — DB proves it: the karta read 6 while only 3 appointments existed from the run. Placement visible in one frame in `42-after-confirm.png` (`Анамнез заболевания` → `Приёмы: 5` → `Анамнез жизни`). |
| `ENCOUNTERS-02` | **PASS** | `primaryCount`/`repeatCount` are two independent `filter()`s (`EncounterSummary.tsx:38-39`), so several primaries count correctly — no boolean collapse. Previous visit = `visits[0]` under `orderBy(desc(clinicalVisit.visitedAt))` (`pgPatientClinical.ts:288`) = newest, not oldest, and is a clickable button opening that visit. Shots 01 (`1/1`), 42 (`1/4`). `PatientTabKarta.ui.test.tsx` → 5/5 PASS incl. asymmetric fixture and newest-visit click. |
| `ENCOUNTERS-03` | **PASS** | Both actions sit in the shared footer grid of the summary card (`EncounterSummary.tsx:72-80`); no permanent second history column on «Карта». Shots 01, 42. |
| `ENCOUNTERS-04` | **PASS** | `02-history-modal-mobile.png`: full chronological list as the next layer, karta still mounted behind a single dim. Row tap → `03-view-nested-mobile.png`, nested compact view, karta not unmounted. |
| `ENCOUNTERS-05` | **PASS** | View stays a compact modal with an «Изменить» action (shot 03). Exactly two full-page destinations exist — `visits/new/page.tsx` and `visits/[visitId]/page.tsx`; `NewVisitPanel.tsx` (1547 lines) deleted with **zero** remaining references (`grep -rn NewVisitPanel apps/webapp/src` → empty), so no orphan and no build break. |

### P4.5 — the encounter page

| ID | verdict | evidence |
|---|---|---|
| `ENCOUNTER-PAGE-01` | **PASS** | `83-edit-linked-visit-record-row.png` shows, on one screen: `Дата и время`, `Тип приёма`, and `Запись: 15 августа 2026 г. в 18:00 · Санкт-Петербург · Дмитрий Берсон · Сеанс 60 мин` — date, time, branch, specialist, service, linked record. Prebound case: `60-prebound-mobile.png`. Unlinked case renders the explicit `Без связи с записью` (`EncounterPageClient.tsx:719`), and a dangling link renders `Связанная запись не найдена.` See observation **O-1** on the header time. |
| `ENCOUNTER-PAGE-02` | **PASS** | **No second visit entity.** The candidate's only edits to `visits/route.ts`, `appointments/unlinked/route.ts` and `modules/patient-clinical/ports.ts` are comment lines (`git show 4504025dd` — 1 changed line each, all inside `/** */`). The page posts to the existing `POST/PATCH /api/doctor/patients/[userId]/visits[/[visitId]]`; every field it sends (`anamnesisText`, `exam`, `manipulations`, `trialResults`, `recommendations`, `complaintUpdates`, `diagnosisUpdates`, `canonicalAppointmentId`) matches the route's existing zod schema name-for-name (`visits/route.ts:22-27,48,58`). `trialResults` is gated to first visits on **both** render (`:923` branch) and save (`:573` branch) — no field is shown that would be silently dropped. Live persistence proven by the edit PATCH landing `AUDIT-РЕК-1` in `clinical_visit.recommendations`. |
| `ENCOUNTER-PAGE-03` | **PASS** | Shared `PatientClinicalCreateModal` from `PatientClinicalSections.tsx` — no new local form. DB: `clinical_complaint b57fade7 «AUDIT-СИМПТОМ»` 11:02:47, `clinical_diagnosis 623391e0 «AUDIT-ДИАГНОЗ»` 11:03:11 — the existing patient-scoped tables. Both appear on the page without navigation (`72-after-diagnosis-added-mobile.png`, via `onSaved={reloadClinical}`) and on the karta (`81-after-edit-save-karta.png`). |
| `ENCOUNTER-PAGE-04` | **PASS** | `[visitId]/page.tsx` has **no date guard** — it loads any visit of the patient. Live: `a5fac6b5`, `visited_at = 2026-08-18 21:25+03` (three weeks past), opened and saved; its `recommendations` is now `Продолжать ЛФК, контроль качества сна` + `AUDIT-РЕК-1`. Shots 80/81; karta reflects the change. |

### P4.6 — link to the calendar appointment

| ID | verdict | evidence |
|---|---|---|
| `ENCOUNTER-APPOINTMENT-01` | **PASS** | Whole «Связь с записью» section is gated on `mode === 'create' && !appointmentPreboundFromQuery` (`:739`) — with `?appointmentId=` the **selector does not render at all** (`60-prebound-mobile.png`: only «Связан с записью: …», date/time inputs disabled). The id is not dropped: save refuses on an unresolved link (`:526-529`) and otherwise sends `effectiveBoundAppointment.internalId` (`:549`). Live: visit `ea3804da` links to `8ddcf6ed`, an appointment created **2026-08-06**, i.e. genuinely pre-existing. See coverage note **O-3**. |
| `ENCOUNTER-APPOINTMENT-02` | **PASS** | Single filtered source: `appointments/unlinked/route.ts` drops every appointment already referenced by a clinical visit (`listLinkedAppointmentIds` → `linkedSet`) plus cancelled ones. Live, end to end: `bd26d963` was orphaned at 10:48 (its visit POST failed), was therefore offered as unlinked, and was selected and linked at 10:56:52 → visit `b6be740d`; it can no longer be re-offered. «Без записи» branch is the default `SelectItem` (`:765`). Shots 50/51. |
| `ENCOUNTER-APPOINTMENT-03` | **PASS** | `useState(true)` (`:258`) — default ON, visible checked in `22-desktop-appt-form-filled.png`. Explicit OFF in `12-new-encounter-off-mobile.png`. Live OFF save at 10:20:05 → visit `c7885707` with `canonical_appointment_id` NULL and **zero** `be_appointments` rows anywhere in the run before 10:48. Fault **F1** caught. |
| `ENCOUNTER-APPOINTMENT-04` | **PASS** | Canonical door, not a duplicate: the page renders the calendar's own `DoctorAppointmentForm`, resolves fields through `resolveCalendarCreateSubmission`, builds money through `appointmentFinancialRequestFields`, and POSTs to `/api/doctor/booking-engine/appointments/manual` — the same door `DoctorCalendarEventPanel` uses. `grep -rn allowOverlap` confirms exactly one manual-door URL in the page and **no** second appointment write-path. Canonical fields all present in `22-desktop-appt-form-filled.png`: Начало (date+time), Филиал, Сеанс, Длительность 60, **Стоимость 7000 ₽**, Комментарий. DB: `91166155` `source=admin_manual`, `price_minor=700000 RUB` — the 7000 ₽ shown — linked to visit `dfc59b50`. `manual/route.route.test.ts` → 13/13 PASS. Fault **F2** caught. |
| `ENCOUNTER-APPOINTMENT-05` | **PASS** | Owner text: «Отмена подтверждения ничего не создаёт; явное согласие разрешает наложение.» Four separate things had to hold, and all four do — see the dedicated section below. Faults **F3**, **F4** caught. |
| `ENCOUNTER-APPOINTMENT-06` | **PASS** | OFF: zero appointments **and zero финансовых операций** — `be_payments`, `be_payment_intents`, `patient_payment` all have 0 rows in the run window, and 0 rows referencing any of the three run appointments. ON: the appointment carries the ordinary snapshot produced by the door's own `resolveStaffAppointmentFinancials` / `initialAppointmentStatusForSnapshot` (`price_minor 700000`, `RUB`, `prepayment_mode disabled`, `prepayment_required_minor 0`, `status confirmed`) — the page supplies request fields, the door computes the snapshot. Fault **F1** caught. |

## `ENCOUNTER-APPOINTMENT-05` — not a decorative dialog

The kill-set named the exact way this could be fake: *«Confirm cannot actually create the overlap because the service
conflict check or the PostgreSQL exclusion constraint still rejects → user sees an error, zero rows.»* It is not fake.

1. **Confirmation appears before any write.** The first manual POST carries no flag and stays fail-closed; the door
   returns 409 `slot_overlap`; the page opens «Время занято» (`40-conflict-dialog-cancel.png`) and `createLinkedAppointment`
   returns `{ok:false}`, so `handleCreate` returns *before* the visit POST (`:552-554`).
2. **Cancel creates nothing.** Not inferred from the UI — proven by absence in the DB: between `dfc59b50` (10:51:22)
   and `8c5ef429` (10:54:45) there is **no** `clinical_visit` row, and between `91166155` (10:51:15) and `1515dbef`
   (10:54:44) there is **no** `be_appointments` row. The ~10:53 cancel wrote zero rows of either kind, and zero
   finance rows. Shot 41: still on the form, no navigation.
3. **Consent physically creates the overlap.** Two live rows share one slot for one specialist:

   | id | start–end | specialist | status | deleted_at | `overlap_confirmed_*` |
   |---|---|---|---|---|---|
   | `91166155` | 2026-09-26 15:00–16:00 +03 | `c9515025` | confirmed | NULL | NULL (ordinary) |
   | `1515dbef` | 2026-09-26 15:00–16:00 +03 | `c9515025` | confirmed | NULL | `= start_at / end_at` |

   Both pass the constraint predicate's other terms, so this is a real overlap the DB now permits — verified live on
   DEV: `be_appointments_specialist_no_overlap` carries the
   `overlap_confirmed_start_at IS DISTINCT FROM start_at OR …` term, exempting only the row whose marker equals its
   own slot, while trigger `be_appointments_confirmed_overlap_occupancy_guard` keeps that row occupying the slot
   against any later ordinary write. The DB half shipped earlier (`2ca8475c1`, `8b6d371d9`,
   migration `20260906T110000_…`) and is **not** modified by this candidate — the candidate only wires the UI to it.
4. **Consent goes through the same door, not a second one.** The retry is the *same* request plus `allowOverlap: true`
   (`:498`), and the server sets the marker only after a genuinely caught `slot_overlap`, never from the client flag
   alone (`manual/route.ts:108-126`). Visit `8c5ef429` links to the id that door actually returned.

## Architectural checks

| check | verdict | evidence |
|---|---|---|
| Single `Visit` entity / one service+port | **PASS** | No new visit API, entity or repository. Candidate touches `visits/route.ts`, `appointments/unlinked/route.ts`, `ports.ts` **in comments only**. One create page, one edit page, one compact view modal. |
| Canonical manual booking door | **PASS** | Reuses `DoctorAppointmentForm` + `appointmentFinancialRequestFields` + `POST …/appointments/manual`; no parameterised clone, no simplified write-path. |
| Price / payment snapshot | **PASS** | Snapshot computed inside the door; DB row carries `price_minor 700000 RUB`, `prepayment_mode disabled`, `prepayment_required_minor 0`; zero finance rows created. |
| Returned appointment ID is the one linked | **PASS** | `canonicalAppointmentId = json.appointment.id` (`:521,556`). All four linked visits point at appointment ids that exist in `be_appointments`; none invented, none lost. Fault **F2** caught. |
| OFF = zero side effects | **PASS** | Zero appointments, zero finance rows. Fault **F1** caught. |
| Overlap cancel/confirm physically works | **PASS** | Section above. |
| Prebound hides the selector | **PASS** | Section gated at `:739`; `60-prebound-mobile.png`. |
| Top-strip nested drawer | **PASS (named fault not reproduced)** | See **O-2**. |
| One shell, no raw Dialog / parallel primitives / double scroll / local design tokens | **PASS** | `DoctorAppShell` applied once in the two server pages, never nested in the client. `grep -nE "#[0-9a-fA-F]{3,8}\|rounded-\[\|text-\[[0-9]\|leading-\[\|primitives/dialog\|overflow-y-auto\|min-h-screen"` over all three new client files → **no hits**. Only shared doctor primitives imported; `Select` uses `displayLabel` per §22. Scoped ESLint clean. |
| Orphan census before deletion | **PASS** | `NewVisitPanel.tsx` removed; zero references remain; typecheck green — deleted only after it was genuinely unreferenced. |

## Fault matrix — 4 injected, 4 caught, 0 uncaught

Injected one at a time into `EncounterPageClient.tsx` on the committed tree, each reverted immediately; final
`git status --porcelain` empty.

| # | named fault (kill-set class) | injection | result |
|---|---|---|---|
| **F1** | `ENCOUNTER-APPOINTMENT-03/06` — OFF still creates an appointment | `} else if (createAppointmentEnabled) {` → `} else if (true) {` | **caught**, 1 failed / 3 passed — reddened `«Создать запись» off saves the visit and never touches the booking door` |
| **F2** | `ARCH-3` — visit linked to a fabricated / lost id | `canonicalAppointmentId = created.appointmentId` → hardcoded uuid | **caught**, 2 failed / 2 passed — reddened `the visit is linked to the id the manual door actually returned` and the consent test |
| **F3** | `ENCOUNTER-APPOINTMENT-05` — cancel writes anyway | removed the early `return` after `if (!created.ok)` | **caught**, 2 failed / 2 passed — reddened `a conflict stops before any write and «Отмена» leaves nothing created` and the consent test |
| **F4** | `ENCOUNTER-APPOINTMENT-05` / `ARCH-2` — consent does not repeat the same request | deleted `...(options?.allowOverlap ? { allowOverlap: true } : {})` | **caught**, 1 failed / 3 passed — reddened `«Создать наложение» repeats the same manual request with the consent flag` |

Each injection reddened the *intended* assertion and left the others green — the tests are aimed, not incidental.

Kill-set classes with no automated test are `look`-class per §24.4 and are closed by live + DB evidence above:
`ENCOUNTERS-01..05`, `ENCOUNTER-PAGE-01/03/04`, `ENCOUNTER-APPOINTMENT-01/02`, `ARCH-1/4/5/6`.

## Gates re-run on `b66f591e2`

| gate | command | result |
|---|---|---|
| acceptance UI test | `pnpm --dir apps/webapp exec vitest --run --project=ui "src/app/app/doctor/patients/[userId]/visits/EncounterPageClient.ui.test.tsx"` | **4/4 PASS** |
| karta UI test | `pnpm --dir apps/webapp exec vitest --run --project=ui "src/app/app/doctor/patients/[userId]/tabs/PatientTabKarta.ui.test.tsx"` | **5/5 PASS** |
| manual booking door | `pnpm --dir apps/webapp exec vitest --run "src/app/api/doctor/booking-engine/appointments/manual/route.route.test.ts"` | **13/13 PASS** |
| typecheck | `pnpm --dir apps/webapp exec tsc --noEmit` | **PASS** (exit 0) |
| scoped lint | `pnpm --dir apps/webapp exec eslint 'src/app/app/doctor/patients/[userId]/visits' '…/tabs/PatientTabKarta.tsx' '…/tabs/karta'` | **PASS** (exit 0, no output) |

Not run, by brief: full CI, push, deploy, land, plan/taskdb/queue edits.

## Observations — recorded, not auto-fixed (§24.6: gate, not a scope generator)

**O-1 — visit time renders in UTC, not the clinic timezone (pre-existing, not a candidate regression).**
`83-edit-linked-visit-record-row.png` shows `Дата и время 15 августа 2026 15:00` directly above
`Запись: 15 августа 2026 г. в 18:00` — the same visit, three hours apart, on one screen. Cause:
`fmtVisitDate`/`fmtVisitTime` in `pgPatientClinical.ts:73-81` (and the in-memory twin) use `getUTCHours()`/`getUTCDate()`,
so a visit stored `18:00+03` displays as `15:00`. The same shift is visible in the accepted P4.4 surfaces
(shot 03 shows `18:25` for a visit stored `21:25+03`; shot 02 shows `19:10` for `22:10+03`).
**This predates the candidate** — the identical formatter is present at the branch base `1a8b958b9`, and
`git log -S` traces it back to a repo-wide prettier pass. No owner checkbox states the timezone, and the candidate
does not touch the formatter, so it is **not** a finding against this SHA. It is a genuine product defect and an
**owner question**, because `ENCOUNTER-PAGE-01` does require the page to show the time and a doctor reading two
contradicting times on one screen is a real hazard. Related known item: memory `patient-card-hardcodes-moscow-tz`
(TZ threading deferred).

**O-2 — top-strip tap: the owner-reported defect is absent, but its positive half is not demonstrated.**
Requirement context: `MODAL-01` (no second dim) and `MODAL-02` (nested layer above, lower state preserved) are both
already accepted `[x]`; no owner checkbox mandates dismissal by tapping outside. Kill-set `ARCH-6` named the defect as
*«tapping the visible top strip dismisses the LOWER layer too, or adds a second scrim»* — **neither occurs**: the
nested stack in shots 03/04/05/06 keeps a single dim (`useDoctorModalOverlay` gives the backdrop to the first layer
only, `DoctorModalLayerContext.tsx:57`) and the lower layer is never lost. Honest caveat: in all three saved attempts
(`04` mouse tap, `05` touch tap, `06` single modal) the tap dismissed **nothing at all** — `03` and `05` are
byte-identical — so «уезжает вниз только самый верхний слой» is not positively demonstrated either. This was not
re-tested live because the candidate provably does not touch the modal stack: `DoctorModal.tsx`,
`DoctorModalLayerContext.tsx` and `primitives/drawer.tsx` are absent from the candidate diff and byte-identical to the
main tree. Re-testing unchanged shared primitives would be scope generation, not a gate. Flagged for the lead.

**O-3 — coverage note, not a defect.** `ENCOUNTER-APPOINTMENT-01`'s page-side contract (prebound id not re-offered and
not dropped on save) is proven live and in the DB, and guarded in code, but has **no** automated test —
`EncounterPageClient.ui.test.tsx` renders `boundAppointmentId={null}` in all four cases. A minimal test was
deliberately **not** added: the brief restricts a PASS commit to the report alone, and the existing test file runs
green. Cheap follow-up for whoever owns the next slice.

**O-4 — DEV residue from the live run.** The previous pass left, in `bcb_webapp_dev`: 5 `clinical_visit` rows
(`c7885707`, `dfc59b50`, `8c5ef429`, `b6be740d`, `ea3804da`), 3 `be_appointments` (`bd26d963`, `91166155`,
`1515dbef`, the last two a deliberate overlap), `clinical_complaint b57fade7`, `clinical_diagnosis 623391e0`, and
`AUDIT-РЕК-1` appended to `a5fac6b5.recommendations`. **Not cleaned by this audit on purpose** — these rows *are* the
physical proof of `ENCOUNTER-APPOINTMENT-05` and `ENCOUNTER-PAGE-04`; deleting them would destroy the evidence this
report cites. DEV is a mutable sandbox (§1b.3). Lead's call when to clear them.

**O-5 —** `60-prebound-mobile.png` carries a Next.js dev-overlay badge reading «3 Issues». Contents unknown from a
screenshot and unreproducible without a live run; recorded so it is not silently lost.

## Not done

- Full CI, `push:checked`, deploy to TEST and live TEST smoke — out of brief scope; `CLINICAL-GATE-03/04` stay open.
- The `ENCOUNTER-APPOINTMENT-05` checkbox in the owner acceptance file is still `- [ ]`. This audit concludes it is
  now satisfied, but ticking checkboxes is the lead's act after its own completeness check (§24.7), not the auditor's.
- No product fix was made, and no acceptance test was added or altered (none was needed — the saved test runs green).
- O-1 (UTC time) and O-2 (top-strip) are owner questions, deliberately left as questions.
