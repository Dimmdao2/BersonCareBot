# C3M-10 independent audit — client portal and patient symptom tracking (`#1098`)

- **Candidate:** `e82c4a43a` «#1098 C3M-10 gate client portal and patient symptom tracking», branch
  `wt/c3m-portal-symptom-slice-20260907`, base `1746aaadc`.
- **Authority:** `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` §C3M.4, §C3M.6, §C3M.7 (C3M-10)
  and §C3M.8; worker brief `runs/c3m-portal-symptom-slice-brief-20260907.md`.
- **Role:** `auditor-live`. Kill-set built from authority before reading any test (`AGENTS.md` §24.5, §10b).
- **Verdict:** **FAIL — handoff to the fixer.** Four findings; the slice is not `land-ready` (§24.7).

## Findings

### C3M10-A1 — `rehabilitation=OFF` stopped denying the patient LFK-stats API (regression of landed C3M-08)

`apps/webapp/src/app-layer/guards/workspaceModuleAccess.ts:51-62` adds a new **first** branch that returns
`null` for any path starting with `/api/patient/diary/`. It runs before the rehabilitation branch, and
`/api/patient/diary/lfk-stats` matches it, so that route is no longer classified at all.

Failure: with `rehabilitation` switched off, `GET /api/patient/diary/lfk-stats` answers `200` for the patient
again instead of the frozen typed `403`. C3M-08 was accepted precisely on «OFF не оставляет скрытый poller,
badge или preload».

Oracle already in the repository and now red:
`src/app-layer/guards/workspaceModuleAccess.rehabilitation.audit.unit.test.ts` →
`classifies /api/patient/diary/lfk-stats under rehabilitation` (`expected "rehabilitation", received null`).

### C3M10-A2 — schedule/appointment patient APIs swept under `client_portal` by a catch-all prefix

`workspaceModuleAccess.ts:92` — `if (pathname.startsWith('/api/patient/')) return 'client_portal';` classifies
every present and future `/api/patient/**` route, `/api/patient/appointments` included. Authority keeps
schedule, appointments, cancellation and prepayment outside client-portal policy (roadmap §C3M.4 «public
booking остаётся доступным», §C3M.8 «membership … не меняет доступ к кабинету, записи, отменам, предоплате или
расписанию», worker brief item 3).

Failure: any patient appointment/booking API placed under `/api/patient/**` starts answering
`403 workspace_module_disabled` the moment the organization turns the portal off — a booking outage caused by
a portal preference. Today's booking routes live under `/api/booking*` and `/api/public`, so the break is
latent, not live; the classifier is nevertheless already wrong for the path the accepted C3M-08 oracle names.

Oracle already in the repository and now red: same file →
`does not expand rehabilitation denial to independent surface /api/patient/appointments`
(`expected null, received "client_portal"`).

### C3M10-A3 — the candidate leaves five landed assertions red; the targeted gate was never run

`pnpm --dir apps/webapp exec vitest run` over the files that import the changed modules:

| file | red assertions |
| --- | --- |
| `src/app-layer/guards/workspaceModuleAccess.rehabilitation.audit.unit.test.ts` | 2 (C3M10-A1, C3M10-A2) |
| `src/modules/doctor-clients/supportPolicy.c3m09.audit.unit.test.ts` | 2 — the accepted `ClientChannelPolicy` `toEqual` oracle does not know the new legitimate `portalAllowed` field |
| `src/app-layer/entitlements/patientDiariesNeverGated.route.test.ts` | 1 — the doctor symptom-tracking `POST` now reads `systemSettings.getDoctorWorkspaceClientDefaults` and `doctorClients.getClientSupport`, which the `#1069` critical-mechanic proof does not provide (`TypeError: Cannot read properties of undefined`) |

The last three are consequences of legitimate new behaviour, but they are landed oracles left failing: the
branch cannot be accepted while they are red (§24.7 `land-ready`).

### C3M10-A4 — the new card control exposes system diary trackings: one toggle is dead, the other silently breaks the warm-up row

`GET /api/doctor/clients/:userId/symptom-trackings` returns every organization tracking, and
`PatientSymptomTrackingControls.tsx` renders an editable checkbox for each. The `PATCH` handler excludes only
`general_wellbeing`:

- «Общее самочувствие» (`general_wellbeing`) — every toggle answers `404 not_found`; the specialist gets
  «Не удалось изменить настройки симптома» and a control that can never work;
- «Самочувствие после разминки» (`warmup_feeling`) — accepted. Unchecking it writes
  `patient_tracking_enabled = false` on the system warm-up row: the patient loses it from the diary while
  `app.apply_current_patient_warmup_feeling` (not narrowed by this migration) keeps writing entries into a row
  nobody can see any more.

Live evidence on named DEV (isolated port `5303`, patient `1c312a64-…e4e0`):

```
PATCH general_wellbeing  -> 404 {"ok":false,"error":"not_found"}
PATCH warmup_feeling     -> 200 {"ok":true}
GET  /api/patient/diary/quick-add-context (patient) -> «Самочувствие после разминки» disappeared
```

Both rows were restored to `patient_tracking_enabled = true` after the check. Every other patient-facing
surface treats these two keys as system rows (`app.configure_current_patient_assigned_symptom_tracking`
excludes both; `/api/integrator/diary/symptom-trackings` and the patient actions exclude `general_wellbeing`).

## Observations — not findings (no reachable impact / outside owner scope)

- `app.configure_current_patient_assigned_symptom_tracking` (patient rename/archive seam) was **not** narrowed
  by `patient_tracking_enabled`. It is unreachable for a disabled tracking today, because
  `renameSymptomTracking`/`archiveSymptomTracking` first look the row up through the patient-principal list,
  which now filters it out. Missing defense-in-depth, not a live hole.
- `idx_symptom_trackings_patient_visible (platform_user_id, updated_at DESC)` will not be used by
  `listTrackings`, whose predicate is `platform_user_id = $1 OR user_id = $1::text`.
- `/api/patient/mood/*` (the home wellbeing check-in of the *global* diary) is portal-gated while
  `/api/patient/diary/*` is not, and `/app/patient/diary` still offers «Общее самочувствие» through
  `quick-add-context`. Consistent in outcome (the home page is `404` anyway), arbitrary as a boundary.
- «Симптомы дневника» sits in the card **header block**, so it renders on every tab (Обзор/Карта/ЛФК/Файлы/
  Учётка), and uses raw `<input type="checkbox">` plus a local `rounded-lg border` shell instead of
  `doctorClientCardChrome` / doctor primitives (`AGENTS.md` §16). Style, not a finding — worth one pass by the
  fixer while A4 is corrected.

## What passed

**Migration, backfill, privileges.**

- Owner-aware rollback-only preflight from the exact candidate checkout against named DEV:
  `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` →
  `PASS (pending=1 total=138)`.
- `bash deploy/host/migrate-dev.sh --execute` → migration committed, declaration reconciled and
  catalog-audited, DEV port-context env synchronized.
- Backfill on DEV: `271` trackings total, `271` with `patient_tracking_enabled = true`, `0` false.
  `symptom_trackings.patient_tracking_enabled` is `NOT NULL DEFAULT true`; `doctor_patient_support.portal_enabled`
  is nullable with no default (= inherit); `idx_symptom_trackings_patient_visible` present.
- Privilege analysis of the migration bodies: `app_staff` INSERT and UPDATE column lists gained
  `patient_tracking_enabled` (repository `TRACKING_SELECT` and `setPatientTrackingEnabled` need both) and
  `doctor_patient_support` gained `portal_enabled` in INSERT and UPDATE; the three re-created definer bodies
  gained `patient_tracking_enabled` on their `app_seam_patient_self_actions_owner` relation surfaces. `app_staff`
  and `app_patient` hold table-level `SELECT`, so no column-level reader is left short.
  `pnpm run check:db-privileges-generated` — byte-identical. `pnpm run test:db-privileges` — `183/183`, `0` fail.
- `findMigrationNameViolations` over `apps/webapp/db/drizzle-migrations` — no violations.

**Portal policy, live on DEV with `client_portal` switched off for org `a0000000-…0001`.**

| check | result |
| --- | --- |
| `POST /api/doctor/patients/:id/portal-invite` | `403 {"error":"workspace_module_disabled","module":"client_portal"}` |
| `GET  …/portal-invite` (state/history) | `200` — preserved |
| `DELETE …/portal-invite` (revoke pending) | reaches the port (`404` = no such invite, not a gate) — preserved |
| `/app/patient` | `404` — private org surface denied |
| `/app/patient/diary` · `/app/patient/organizations` · `/app/patient/profile` | `200` — global diary, other-org switch and identity preserved |
| `/book` anonymous and with the patient session | `200` — public booking untouched |
| identity / enrollment / diary rows | untouched (`org_enrollments` row and both trackings intact after ON→OFF→ON) |

**Symptom slice, live on DEV.**

- Create honours the explicit form value (`patientTrackingEnabled:false` → stored `false`) and the org default
  (`all` → `true`); `is_active` stays `true` in both cases — `is_active` is not reused.
- Patient sees only enabled trackings: `quick-add-context` omitted the disabled row;
  `GET /api/patient/diary/symptom-stats?trackingId=<disabled>` → `404`, `<enabled>` → `200`.
- Specialist keeps both rows and their history through the doctor `GET`.
- Deployed seam predicates on DEV: `record_/update_/delete_current_patient_symptom_entry` all carry
  `patient_tracking_enabled = true`.
- No parallel symptom policy: no per-client symptom override column or table, no live resolver — the create
  default is a stored one-time snapshot (`patientTrackingDefault` is applied only on `POST`).

**Responsive live acceptance** (isolated port `5303`, never the shared dev server):

- doctor card `1440×900` and `390×844` — «Симптомы дневника» renders create controls (input + checkbox
  «разрешить отслеживание пациентом» + «Добавить») **and** a per-tracking edit checkbox list; both viewports
  usable. This closes the brief's open question: the candidate does supply create **and** edit controls.
- patient diary `1440×900` and `390×844` — «Отслеживаемые симптомы» lists the enabled tracking only.

**Repository gates:** webapp `tsc --noEmit` clean; scoped ESLint over the ten changed/new files — `0` problems;
`check-db-chokepoint`, `check-no-new-raw-sql`, `check-queue-port-boundary`, `check-test-runner-visibility`,
`check-c4-migration-owned-function-bodies` — all PASS; `git diff --check` clean. No full CI (§9).

## Acceptance tests added by this audit

Three files, `19` assertions, green on the candidate:

- `apps/webapp/src/modules/doctor-clients/clientPortalPolicy.c3m10.audit.unit.test.ts`
- `apps/webapp/src/app/api/doctor/patients/[userId]/portalInviteClientPolicy.route.test.ts`
- `apps/webapp/src/app/api/doctor/clients/[userId]/symptomTrackingPatientVisibility.route.test.ts`

The route files drive the real handlers together with the real workspace-module guard; only the session, the DB
principal wrapper and the ports are doubled (§10b). No test asserts source text, SQL text, DOM shape or element
counts. `/api/patient/diary/lfk-stats` and `/api/patient/appointments` were deliberately **not** duplicated —
the landed C3M-08 file already owns that oracle and is the red proof of A1/A2.

## Fault injection — one per independent failure class (§10b)

Each fault was written into the product code, the three files above were run, then the file was restored with
`git checkout --`.

| # | injected fault | red assertion |
| --- | --- | --- |
| A | `resolveClientChannelPolicy` always reports `portalAllowed: true` | `denies the portal for an explicit per-client deny` |
| B | per-client `allow` reopens a workspace-off portal (`\|\|` instead of `&&`) | `never lets a per-client allow reopen a portal the workspace switched off` |
| C | invite route asks for `medical_record` instead of `client_portal` | `refuses to issue an invite when the organization turned the portal off` |
| D | the module gate is copied onto `DELETE` (revoke) | `still reads the invite state and revokes a pending invite while the portal is off` |
| E | create-time default returns `mode !== 'off' \|\| onSupport` | `creates with off default …` and `creates with on_support default and onSupport=false …` |
| F | `GET` recomputes the flag from the current default instead of the stored value | `reports the stored value of an existing tracking, not the current default` |
| G | the visibility `PATCH` also archives the tracking | `changes only patient visibility and never archives the symptom` |
| H | the `PATCH` organization check is removed | `refuses a tracking that belongs to another organization` |

`8/8` caught, `0` missed. A1 and A2 are covered by the landed C3M-08 file, which is red on the unmodified
candidate — a failing acceptance test on the original implementation, i.e. the handoff oracle for the fixer
(§24.5).

## Kill-set coverage against the brief

| named fault | how it was answered |
| --- | --- |
| portal OFF only hides buttons | route test C + live `403` on `POST …/portal-invite` |
| identity / enrollment / data deletion | live ON→OFF→ON: enrollment row, both trackings, profile and diary intact |
| other-org portal damage | route test H (cross-org `PATCH` → `404`); `portal_enabled` lives on the `(organization_id, patient_user_id)` profile; `getClientChannelPolicy` still throws on an organization mismatch |
| public booking gated by portal/support | live `/book` `200` anonymous and authenticated with the portal off — **but** see A2 for the latent classifier hole |
| `is_active` reused for patient visibility | separate column; route test G; live create/toggle left `is_active = true` |
| disabled tracking still listed/read/writable by crafted request | live `404` on `symptom-stats`, absent from `quick-add-context`; all three entry seams carry the predicate on DEV |
| specialist losing the tracking/history | doctor `GET` returns disabled rows; the repository filter is patient-principal only — **but** see A4 for the warm-up system row |
| existing tracking backfill not true | `271/271` true on DEV |
| `off/all/on_support` create result wrong | route test E, six `it.each` combinations + live |
| later default or support change rewriting existing tracking | route test F (stored value vs current default) |
| per-client symptom inheritance/override introduced | none exists: no column, no table, no resolver |

## Handoff

Fixer scope, nothing beyond it: A1 (order the `/api/patient/diary/` exclusion after the rehabilitation branch,
or exclude by exact path), A2 (replace the `/api/patient/` catch-all with the enumerated org-private paths the
slice actually owns), A3 (bring the three landed files green), A4 (exclude both system symptom keys from the
card list and from `PATCH`, the way every other surface already does). Re-run the same three files added here
plus the three landed files; no new blind pass is needed for the same surface (§24.5).

DEV was left in its pre-audit state: audit trackings deleted, `client_portal` back to `true`, both system
trackings `patient_tracking_enabled = true`, `0` disabled trackings cluster-wide. The candidate migration
remains applied to DEV — it is additive and independent of every correction above.
