# Patient Work3 — independent audit: assigned symptom manual entry

Audited commit: `2cdfde439 feat(patient): add assigned symptom entries` on `wt/patient-work3-20260906`
(HEAD `bd8f08249`). Auditor did not modify product code. Not pushed, not landed.

## 1. Blind kill-set (written before opening any existing test)

Derived only from the owner requirement + `AGENTS.md` §10a/§10b, before reading `*.test.ts(x)`.
Each row: if the product broke exactly this way, would anything go red?

| # | Class | Break to inject | Why a human loses something |
|---|---|---|---|
| K1 | write ownership | `addSymptomEntry` stops matching `trackingId` against the caller's own trackings (accepts any id) | Patient writes symptom observations into another patient's medical diary — cross-tenant data corruption of special-category PD |
| K2 | system tracking | `addSymptomEntry` drops the `isGeneralWellbeingTracking` reject | Home check-in wellbeing series gets polluted by manual symptom entries; the "Самочувствие за неделю" chart lies |
| K3 | entry type | new modal submits `daily` (or lets the value flow from state) instead of the fixed `instant` | Owner decision "new form must not create daily points" broken; one daily point per day silently replaces the intended in-the-moment series |
| K4 | stats ownership order | stats route reads entries first / drops the 404 on a foreign `trackingId` | Any authenticated patient reads another patient's symptom history through `GET /api/patient/diary/symptom-stats` |
| K5 | sparse timeline | `fillDays=1` stops emitting empty calendar days (points collapse to only days that have entries) | Days without observations vanish, so the horizontal timeline compresses gaps and the graph misrepresents the course of the symptom |
| K6 | refresh after save | successful save no longer notifies / chart no longer refetches | Patient saves, sees a toast, and the graph still shows the old picture — indistinguishable from a lost write |
| K7 | listing scope | diary lists archived / system (`general_wellbeing`, `warmup_feeling`) trackings, or trackings outside the org principal | Patient sees service rows they must not act on, or an archived symptom returns |
| K8 | no revival | LFK tab / QuickAdd / self-create / rename / archive reachable again from the patient diary surface | Patient mutates a clinician-assigned tracking; owner decision reversed |
| K9 | duplicate guard | instant dedup window guard removed | Double-tap writes two identical observations |
| K10 | tariff gating | `patient_diaries` handlers become tariff-gated | Critical mechanic disappears for a clinic on a lower tariff |

Classification applied (per brief):

- K1, K2, K3, K4, K5, K6, K9, K10 — repeated behavior → automated test.
- K7, K8 — one-time structure (this commit's composition) → diff/reachability inspection, no source-text test.
- Modal geometry, ~7 visible days at 390px, horizontal scrolling, scroll-to-newest, legibility → live evidence only.

## 2. Verdict per requirement

| ID | Verdict | Evidence |
|---|---|---|
| R1 listing (active, org context, system excluded, one list, no revival) | **PASS** | code + live; see §2.1 |
| R2 modal, 0–10, always `instant`, ownership/system/dedup on existing path, observable save | **PASS (code+tests)**, live click-through **BLOCKED** | §2.2 |
| R3 graph reuse, binding, horizon, explicit missing days, horizontal scroll | **PARTIAL** — data layer PASS (live), **scroll-to-newest = finding F-1**, ~7-days-at-390px live **BLOCKED** | §2.3 |
| R4 no DB/schema/migration; author distinction deferred; no doctor/clinical change | **PASS** | §2.4 |
| R5 docs resolve only manual symptom input | **PASS** | §2.5 |

### 2.1 R1 — diary listing — PASS

- Active only: `PatientDiaryAuthenticatedMain.tsx:92` → `deps.diaries.listSymptomTrackings(userId)` →
  `symptom-service.ts:63` `listTrackings(userId, activeOnly = true)`.
- Organization context: the fetch runs inside `renderPatientDiaryAuthenticatedMain`, which is only reached through
  `withPatientOrganizationPrincipal(...)` + `runWithWebappDbOperationFamily('patient_diary', ...)`
  (`PatientDiaryAuthenticatedMain.tsx:36-45`). No unprincipled read added.
- System trackings excluded: filter on `!isGeneralWellbeingTracking(symptomKey) && symptomKey !== 'warmup_feeling'`.
  **Live-confirmed**: the owner's DEV patient owns exactly one tracking — `32fa15ae-685d-4e1a-bd4d-a2bcdfb2bef0`
  «Самочувствие после разминки» (`warmup_feeling`), still listed by the symptoms journal — and the new diary block
  renders the empty state instead of it.
- One clickable list: live DOM at 390×844 and 1280×900 → `#patient-symptoms-tracking-section` count **1**,
  `getByRole('tab')` count **0**, console errors **0**. Rows are `<button>`-based (`SymptomTrackingRow.tsx:31-43`).
- No revival: `page.tsx` imports no `QuickAddPopup` / `LfkSessionForm` / `LfkDiarySectionClient`; the page always
  passes `wellbeingMvpSingle`, and `DiaryTabsClient` returns the single-column branch before ever building `<Tabs>`
  (`DiaryTabsClient.tsx:24-27`); rename/archive/self-create controls are gone from the row.

### 2.2 R2 — entry modal — PASS on code and tests, live click-through BLOCKED

- One canonical modal: `PatientModal` + `PatientModalFooter` from `@/shared/ui/patient/PatientModal` — the
  documented canonical patient container; the cross-DOM `form={formId}` submit is the pattern that file itself
  prescribes for footer buttons rendered through its portal.
- 0–10: `NumericChipGroup min={0} max={10}`.
- Always `instant`: `formData.set('entryType', 'instant')` — proven by test, not by reading (fault F5 below).
- Ownership + system + dedup stay on the existing action/DB-root path: `addSymptomEntry` is unchanged by this
  commit; it still resolves the tracking through `listSymptomTrackings(session.user.userId)`, rejects
  `general_wellbeing`, and runs the instant-dedup window read before writing. Client-side
  `shouldConfirmInstantDuplicate` retained.
- Observable in the same modal, no reload: the modal is not closed on success, the toast fires,
  `notifyDiarySymptomEntrySaved()` dispatches, and `SymptomChart` refetches on that event. No `router.refresh()`.
- **BLOCKED**: the owner's DEV patient has no assigned non-system tracking, so the live "open modal → save →
  see graph refresh → reopen → persistence" click-through could not be executed. No fixture was created.

### 2.3 R3 — graph — PARTIAL

PASS parts:

- Reuses the existing route and aggregation: `SymptomChart` is the **only** consumer of
  `/api/patient/diary/symptom-stats`, and the route still aggregates through `aggregateSymptomEntriesByDaySplit`.
- Binds to the selected tracking: the modal passes `trackings={[{ id, symptomTitle: title }]}`.
- Broader recent horizon: `initialPeriod="month"` (30-day rolling window).
- Explicit missing calendar days — **live-proven** against the DEV DB (see §4, probe A): 30 points, first
  `2026-08-08`, last `2026-09-06`, **0 non-contiguous steps**, empty days carried as `{instant:null,daily:null}`.
  Without `fillDays` the same window returns the old sparse shape, so other callers are unchanged.
- Old daily history stays renderable (the `daily` line is untouched) while the new form can only produce `instant`.
- ~7 days at 390px holds by construction: `Math.max(364, days * 52)` at 52px/day against a drawer body of
  ≈390 − 32px padding ≈ 358px ⇒ ≈6.9 days visible. **Live confirmation BLOCKED** (no tracking to open).

FAIL part: **F-1, scroll-to-newest on first open** — see §5.

### 2.4 R4 — no schema work, author distinction deferred — PASS

- `git show --name-only 2cdfde439` matches nothing under `db/`, `schema`, `migration`, `*.sql`. No migration added.
- **Accepted owner deferral (recorded, not a finding):** the code still cannot distinguish a clinician observation
  from a patient one. `symptom_entries` carries only `source: 'bot' | 'webapp' | 'import'` and is always written
  against the patient's own `userId`; there is no clinician write path into symptom entries at all (writers are the
  patient diary action, `wellbeingMoodService`, and the integrator bot). Adding that distinction needs a column, and
  the owner deferred it for this stage.
- No doctor/clinical complaint file changed by the commit. Boundary as it stands: clinical complaints are a
  doctor-side record (`/api/doctor/patients/[userId]/complaints/**`, `karta/PatientClinicalSections.tsx`, with
  severity/updates/visits), entirely separate from the patient diary's `symptom_trackings`/`symptom_entries`.
  Recorded as context only — not a finding for this patient-only stage.

### 2.5 R5 — documentation — PASS

- `diary/diary.md` now describes the mounted symptom block and keeps «Полноценные вкладки симптомов/ЛФК и QuickAdd
  … до продуктового решения» plus an explicit line that manual rehabilitation input stays undecided.
- `symptoms/symptoms.md` and `modules/diaries/diaries.md` describe the one-modal instant-only flow and state that
  self-create/rename/archive and QuickAdd are not wired into this surface.
- `DEEP_CODE_AUDIT_PLAN.md` row `N1-Q2` is split correctly: symptom decision **RESOLVED**, manual
  rehabilitation/LFK still **OWNER QUESTION**, retained QuickAdd/LFK branches explicitly left unmounted.

## 3. Tests added and fault matrix

Two files added, no product code touched. Both are behavior tests at the cheapest layer that sees the break;
no source-text, DOM, class-name, width or file-count assertions.

- `apps/webapp/src/app/app/patient/diary/symptoms/patientSymptomEntryBoundary.route.test.ts` (project `route`) —
  K1, K2, K4, K5. Calls the real server action and the real route handler over a fake `buildAppDeps()`.
- `apps/webapp/src/app/app/patient/diary/symptoms/SymptomTrackingRow.ui.test.tsx` (project `ui`) — K3, K6.
  Chosen at the UI layer only because the server action legitimately still accepts `daily` (journal + bot use it),
  so the fixed type of *this* surface is not observable below the component.

K9 (dedup) and K10 (tariff gating) were not re-implemented: K10 is already held by
`patientDiariesNeverGated.route.test.ts` (green at this SHA, 4/4), whose poisoned-proxy construction makes any
re-introduced entitlement call throw by construction; K9's logic was not touched by this commit and its client/server
guards are still on the path.

| Fault injected | Exact assertion that went red | Result |
|---|---|---|
| F1 `actions.ts`: ownership lookup falls back to `?? { symptomKey: null }` | `refuses an entry for a tracking that is not the caller's own…` → `expected true to be false` | caught |
| F2 `actions.ts`: `isGeneralWellbeingTracking(tMeta.symptomKey)` → `isGeneralWellbeingTracking(null)` | `refuses an entry for the service general_wellbeing tracking…` → `expected true to be false` | caught |
| F3 `symptom-stats/route.ts`: ownership 404 block deleted (entries read regardless) | `answers 404 for a tracking the caller does not own…` → `expected 200 to be 404` | caught |
| F4 `symptom-stats/route.ts`: `fillDays === '1'` → `false` | `fillDays=1 returns every calendar day…` → `expected ['2026-03-05','2026-03-09'] to deeply equal ['2026-03-04', …(5)]` | caught |
| F5 `SymptomTrackingRow.tsx`: `entryType` set to `'daily'` | `submits the picked 0–10 value as an instant entry` → `expected 'daily' to be 'instant'` | caught |
| F6 `SymptomTrackingRow.tsx`: `notifyDiarySymptomEntrySaved()` removed | `announces the saved entry so the open chart refetches…` → `expected "vi.fn()" to be called 1 times, but got 0 times` | caught |

**Caught 6 / 6. Uncaught 0.** Every mutation reverted with `git checkout --` immediately after its run; the working
tree carries only the two test files and this artifact.

## 4. Commands and results

```
pnpm --dir apps/webapp exec vitest run --project route  …/patientSymptomEntryBoundary.route.test.ts   → 4 passed
pnpm --dir apps/webapp exec vitest run --project ui     …/SymptomTrackingRow.ui.test.tsx              → 2 passed
pnpm --dir apps/webapp exec vitest run --project route  …/patientDiariesNeverGated.route.test.ts      → 4 passed (pre-existing)
pnpm --dir apps/webapp typecheck                                                                     → clean
npx eslint <7 changed product files + 2 new test files>                                              → clean
```

No full CI: the change is `local`/`app` scope with no shared package, root config, lockfile or cross-app contract
touched (§10 "Уровни и full CI в аудите").

Live, isolated dev server on **127.0.0.1:5211** (candidate range 5210–5219; 5200/5202 belong to parallel chats),
worktree env copied from the main checkout, logged in as the owner's DEV patient `kinesiospace@gmail.com`:

| Probe | Result |
|---|---|
| `GET /app/patient/diary` | 200; 1 symptom section; 0 tabs; 0 console errors; at 390×844 and 1280×900 |
| A `…/symptom-stats?trackingId=32fa15ae…&period=month&fillDays=1` | 200; 30 points; `2026-08-08 … 2026-09-06`; 0 non-contiguous steps; empty days as `null` |
| B same window, no `fillDays` | 200; 0 points (legacy sparse shape preserved) |
| C `…?trackingId=a0000000-0000-4000-8000-0000000000ff` | **404** `{"ok":false,"error":"not_found"}` |
| D same request unauthenticated | **401** `{"ok":false,"error":"unauthorized"}` |

Screenshots: `/tmp/shotter/diary-390.png`, `/tmp/shotter/diary-1280.png`.

**BLOCKED live scenario (named exactly, no fixture created):** open an assigned symptom → modal → save an instant
value → graph refresh → horizontal scroll to older dates → close/reopen → persistence. The owner's DEV patient owns
no assigned non-system tracking (its only tracking is the service `warmup_feeling`), and the brief forbids creating
one. Route/service behavior was inspected and probed live instead (probes A–D above).

## 5. Findings

### F-1 — the month graph opens scrolled to the oldest end, not to today (PLAUSIBLE, live confirmation blocked)

**Requirement violated:** R3 "horizontally scrolls with about seven days visible … scroll-to-newest".

**Where:** `apps/webapp/src/modules/diaries/components/SymptomChart.tsx:105-109`.

**Mechanism.** The scroll-to-newest layout effect depends on `[points, scrollable]`. On the first open of a symptom
modal the sequence is: `points` is `[]` while loading, so the scroll container is not rendered at all; when the
response arrives, the same commit both renders the container and mounts `RechartsSymptom` for the first time.
`RechartsSymptom` is `dynamic(() => import('./SymptomChartRecharts'), { ssr: false })`, so at that moment its chunk
has not resolved and the container's only child is the `AppContentLoading` placeholder, which is `w-full` with no
minimum width — `scrollWidth === clientWidth`, so `scrollLeft = scrollWidth` clamps to 0. When the chunk resolves and
the ~1560px chart replaces the placeholder, `points` is unchanged, so the effect never re-runs.

**Failure scenario.** Patient with an assigned symptom opens it on a phone: the 30-day window is ~1560px wide with
~7 days visible, and the view sits on `2026-08-08…08-14` — typically the empty far end of the window — instead of
the recent days they just came to check. Saving an entry produces a fresh `points` array and re-runs the effect
(the chunk is loaded by then), so the defect is specific to the first open of each symptom per page load — the exact
moment the screen is supposed to answer "how have I been lately".

**Why not confirmed here.** The live path needs an assigned tracking that owner DEV data does not have, and jsdom
has no layout (`scrollWidth` is always 0), so no cheap automated arbiter exists. The mechanism is read from the code
and the two component definitions; it needs one live look once an assigned tracking exists.

**Handoff, not fixed by the auditor.** Cheapest correction shape: re-run the scroll after the chart itself is
mounted/measured (e.g. drive it from the rendered chart width rather than from `points` alone).

### F-2 — `renameSymptomTracking` / `archiveSymptomTracking` remain exported server actions (OWNER QUESTION, pre-existing)

Not a regression from this commit and not a MUST FIX for this stage: the commit correctly removed both from the UI.
But `apps/webapp/src/app/app/patient/diary/symptoms/actions.ts` is a `'use server'` module that the patient client
bundle imports, and every exported async function in such a module is an addressable endpoint; both exports are also
registered as deliberate exemptions in `protectedActionRegistry.ts:1255-1266`. Neither checks that the tracking was
assigned by a clinician — only that the caller owns it. So the "patient does not rename or archive assigned
trackings" rule is currently enforced by the absence of UI, not by the action.

Owner decision needed: delete these two exports (self-create is already a hard `patient_self_create_disabled`
stub and could be the model), or keep them as a supported patient capability. Not touched by the auditor.

## 6. Explicit non-findings

- The new «Отслеживаемые симптомы» block carries the bordered `patientSectionSurfaceClass` while its neighbours on
  the diary (`Самочувствие за неделю`, `Разминки за неделю`, `План за неделю`) render borderless. Visual only —
  style is not an audit finding; noted for the owner's eye during acceptance.
- The symptoms journal still lists the service `warmup_feeling` tracking that the new diary block hides. Pre-existing,
  and `symptoms.md` scopes the exclusion to "в новом списке" — no claim was broken.
- `SymptomChart`'s zero-tracking string «Нет отслеживаемых симптомов. Добавьте симптом выше.» is unreachable from
  this surface (the modal always passes exactly one tracking) — dead copy, not a defect.
