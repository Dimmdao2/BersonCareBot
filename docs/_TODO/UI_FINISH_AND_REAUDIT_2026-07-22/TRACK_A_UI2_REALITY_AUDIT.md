# Track A — UI-2 built-in Online location reality audit

## Audit contract

- Run: `ui2_reality_audit` (`audit/ui2-reality-20260723`).
- Audited HEAD: `b3083e7919b2c7180f5e21c0e9f2d7902c94fb13`.
- Owner denominator: exactly seven UI-2 rows from
  `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` § «UI-2 — built-in Online location».
- This is the single independent audit pass. Product code, DB, runtime, deploy and taskdb were not changed.
- `real-done` requires current code/test evidence plus the live evidence and owner acceptance required by
  `ORCHESTRATOR_PROMPT.md` and `WORK_ORDER.md`. Repository evidence without a source-bound current live PNG is
  `partial`, not a fake PASS.
- Product code at the audited HEAD is identical to deployed TEST product SHA
  `45ffed7318c584cf501d6972e231d197bebce6f6`; all commits after that SHA in this branch ancestry are documentation
  only. `TEST_DEPLOY_EVIDENCE_2026-07-22.md:41-56` records accumulated full CI PASS, exact-SHA deployment and locked
  smoke `22/22`. That is runtime evidence, not an atom-specific UI screenshot or owner acceptance.

## Targeted verification actually run

The isolated worktree has no installed dependencies. The first direct invocation stopped before test collection
with `Command "vitest" not found`; a second attempt with an external Vitest binary stopped while loading the local
config because `vitest/config` could not resolve. The successful run temporarily exposed the integration checkout's
unchanged installed dependency trees to this worktree, removed those links automatically on exit, and executed:

```text
pnpm --dir apps/webapp exec vitest run --reporter=dot \
  src/modules/booking-engine/onlineLocation.test.ts \
  src/app/api/admin/booking-engine/online-location/route.test.ts \
  src/app/api/admin/booking-engine/branches/[id]/route.test.ts \
  src/app/app/settings/BookingSoloLocationsSection.test.tsx \
  src/app/app/settings/BookingSoloAvailabilitySection.test.tsx \
  src/app/app/doctor/schedule/tabs/ScheduleWorkTab.test.tsx \
  src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.test.tsx \
  src/modules/patient-booking/inPersonServicesCatalog.test.ts \
  src/app/app/patient/booking/bookingCatalogRsc.test.ts \
  src/app/book/publicOrganizationBooking.test.ts \
  src/app/book/new/PublicFormatStepClient.test.tsx

PASS — 11 files / 165 tests
```

Vitest printed existing non-fatal React `act(...)` warnings from the broad schedule suites; no test failed. Full CI
was not repeated because the product diff from the already green/deployed `45ffed731` is zero.

A bounded feature-manifest census was also run against implementation commit `838253c72`: it changed no schema,
migration, package or integrator file. Current non-test symbol census finds the Online identity/state helper reused by
the existing booking-engine service, Settings, branch protection, patient catalog and public catalog paths.

## Row-by-row matrix

| # | Checkbox (quoted verbatim) | Code evidence | Test evidence | Source-bound live PNG / TEST evidence | Verdict |
|---:|---|---|---|---|---|
| 1 | `[x] «Онлайн» является встроенной включаемой локацией в существующей модели, а не вручную создаваемым workaround.` | `modules/booking-engine/onlineLocation.ts:4-35,45-117` defines the reserved identity, exact-organization singleton lookup and idempotent state setter over the existing `BeBranch`/catalog port. `BookingSoloLocationsSection.tsx:86-117` separates that built-in row from physical branches and renders its dedicated switch. `api/admin/booking-engine/branches/[id]/route.ts:30-42,69-70` prevents manual edit/delete of the reserved row. | `onlineLocation.test.ts:31-139` proves identity, exact-org lookup, idempotent singleton creation, duplicate rejection and state/color updates; `online-location/route.test.ts:19-116` proves exact organization and authorization; the focused Settings tests also pass. Included in fresh `165/165 PASS`. | Exact product code is deployed on TEST with green full CI/smoke. No current source-bound Settings off/on PNG or owner acceptance was found. | `partial` |
| 2 | `[x] Состояние Online location гейтит существующие online-галочки услуг.` | `BookingSoloAvailabilitySection.tsx:43-49,100-128` builds service columns only from active existing branches, so inactive Online exposes no service checkbox; activation exposes the same existing availability switches. `onlineLocation.ts:41-43,45-117` changes branch state without deleting service-availability rows. | `BookingSoloAvailabilitySection.test.tsx:57-72` proves the Online column absent while off and present with existing service switches while on. Included in fresh `165/165 PASS`. | Exact code is on TEST; no source-bound live off/on checkbox pair or owner acceptance was found. | `partial` |
| 3 | `[x] Не создана новая schema/delivery-mode/booking engine.` | Feature-manifest census of `838253c72` finds no schema, migration, package or integrator file. `booking-engine/service.ts:257-264` delegates to the helper through the existing catalog port; `inPersonServicesCatalog.ts:69-159` and the patient/public loaders retain the existing branch/service/specialist assignment path. | The helper, route, Settings, schedule, patient-catalog and public-catalog suites all pass in the fresh 11-file packet. This is a structural negative additionally supported by the file/symbol census, not inferred from tests alone. | Exact code is deployed on TEST; no owner-accepted source-bound evidence package exists. | `partial` |
| 4 | `[x] Отдельно доказано, что Online присутствует в существующих schedule location list/filters без второго projection.` | `doctorScheduleApi.ts:43-60` supplies active branches from the existing booking overview. `ScheduleWorkTab.tsx:564-566,700-710,1138-1179` maps that same branch list directly into the independent location filters. `pgBookingCalendar.ts:57-69,119-126` returns active `be_branches` through existing calendar filter metadata, consumed directly by `ScheduleCalendarTab.tsx:988-993,1102-1106,1691-1697`. | `ScheduleWorkTab.test.tsx:437-460` proves the built-in Online branch is present in the existing work-location filters. `ScheduleCalendarTab.test.tsx:508-525` proves the same for the calendar filter. Both broad suites pass in fresh `165/165 PASS`. | Exact code is on TEST; no current source-bound Work/Calendar Online-filter PNG or owner acceptance was found. | `partial` |
| 5 | `[x] Отдельно доказано, что online services видны в существующем client booking wizard при включённой Online location.` | `inPersonServicesCatalog.ts:69-84,101-159` returns Online only when its existing branch is active and has a public service assigned to an active exact-org specialist. `bookingCatalogRsc.ts:157-214` exposes that location and service list to the authenticated patient flow. `FormatStepClient.tsx:64-75` and `ServiceStepClient.tsx:92-128` continue through the existing service/slot wizard. | `bookingCatalogRsc.test.ts:110-181` proves enabled Online plus an assigned service reaches the authenticated wizard. `inPersonServicesCatalog.test.ts:204-290` proves the active/assigned positive and inactive/unassigned negatives. Included in fresh `165/165 PASS`. | Exact code is on TEST; no source-bound patient-wizard Online/service PNG or owner acceptance was found. | `partial` |
| 6 | `[x] Online-only services на публичной странице попадают в online-block, а не в physical location (#972).` | `inPersonServicesCatalog.ts:40-67` excludes the built-in Online branch from physical cities. `publicOrganizationBooking.ts:63-83` returns physical cities and Online separately under the organization principal. `PublicFormatStepClient.tsx:29-83` renders separate physical and Online blocks; `book/[slug]/page.tsx:22-40` supplies the published organization projection. | `publicOrganizationBooking.test.ts:110-210` proves an Online-only service is absent from physical Moscow and present under Online. `PublicFormatStepClient.test.tsx:49-66` proves the link is absent from the physical block and present in the Online block. Included in fresh `165/165 PASS`. | TEST smoke proves the general public slots endpoint returns HTTP 200, but no sanctioned published-slug source-bound PNG proves this separation live. | `partial` |
| 7 | `[ ] Live proof этого публичного разделения ждёт sanctioned published slug/U6B #926; repository-evidence его не подменяет.` | This is an explicit evidence/dependency gate, not product code to implement in this audit. The separate public projection above does not close it. | Automated tests prove the repository contract only and intentionally cannot substitute for this row. | No sanctioned published-slug/U6B `#926` live capture or owner acceptance exists. Locked TEST smoke is explicitly insufficient. | `owner-deferred` |

## Aggregation

| Verdict | Count |
|---|---:|
| real-done | 0 |
| partial | 6 |
| fake-done | 0 |
| owner-deferred | 1 |
| **Total** | **7** |

## Coherent residual batch (do not execute inside this audit)

No dependency-ready product-code defect was found. The remaining work is one evidence-closure batch: after a
sanctioned published slug/U6B `#926` exists, capture a source-SHA-bound live set covering Settings Online off/on,
the gated service column, Online in both schedule filters, the authenticated patient wizard service list, and the
public physical-versus-Online split; then obtain owner acceptance. Do not invent a second booking projection or
repeat audit/fix rounds while that dependency is absent.

closed 0/7 against `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` § UI-2

**NOT DONE:** rows 1–6 have current code and fresh targeted test evidence but no source-bound live PNG/owner
acceptance. Row 7 remains explicitly owner/dependency-gated by sanctioned published slug/U6B `#926`; repository
evidence and locked TEST smoke do not close it.
