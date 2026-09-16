# Track A — UI-2 built-in Online location reality audit

## Audit contract

- Run: `ui2_reality_audit` (`audit/ui2-reality-20260723`).
- Audited HEAD: `b3083e7919b2c7180f5e21c0e9f2d7902c94fb13`.
- Bounded live DEV source SHA: `77843fa2bda4da7a88e4b079b072310c69a2956d`. The UI-2 implementation file
  set listed in the matrix has no diff from the audited HEAD to this live SHA; intervening product changes are
  outside UI-2.
- Owner denominator: exactly seven UI-2 rows from
  `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` § «UI-2 — built-in Online location».
- This is the single independent audit pass. Product code, DB, runtime, deploy and taskdb were not changed.
- `real-done` here means agent evidence-real: current code/test evidence plus the contract-appropriate source-bound
  runtime proof. Owner acceptance remains a separate owner-only layer and is not inferred by this audit. A
  presentation state without its required source-bound current live PNG remains `partial`, not a fake PASS; a
  structural negative may close from an exact feature manifest, symbol census, focused tests and the existing live
  API path when a cosmetic PNG or positive mutation would not prove that atom better.
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

## Bounded DEV live pass — 2026-07-23

The one presentation lane used only the existing DEV bypass, Settings surface and product API. It did not use direct
SQL, TEST/PROD, real integrations or external delivery. Canonical evidence is external and source-bound:

```text
/home/dev/dev-projects/.lead/runs/ui2-online-location-live/
  77843fa2b-20260723T002730Z/manifest.md
```

Accepted PNG from the bounded pass:

| PNG                                  | Route / viewport                                                | SHA-256                                                            | Evidence                                                                                                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-settings-online-off-desktop.png` | `/app/doctor/schedule?tab=setup&section=locations`, `1440x1000` | `754f976dfa9de71ba8c474eb2ce739ce02b4387d77780b73f61b34b6262a52c5` | Exactly one reserved «Онлайн» control is visible and off; the existing service-location matrix contains only the physical location and has zero Online service switches while Online is off. |

The paired product-API census returned exactly one reserved branch (`title=Онлайн`, `cityCode=online`), one active
public service and no active Online assignment. The Settings route and overview requests returned HTTP `200`.

The first technical attempt was interrupted before feature mutation when the shared DEV Next PID changed. After the
new PID stayed constant with repeated HTTP `200` probes for more than 30 seconds, the one authorized fresh pass again
stopped before feature mutation: `/app/patient/booking` returned HTTP `200`, but its RSC failed before rendering
«Запись» on `app.read_current_patient_booking_rows(...)`. Per the one-pass/no-loop limit, no third browser pass was
started. Final product-API verification confirmed Online remained inactive, Online assignment remained inactive and
the reserved singleton count remained one. `results.json` and `manifest.md` contain the exact diagnostics and
rollback evidence.

## Row-by-row matrix

|   # | Checkbox (quoted verbatim)                                                                                                  | Code evidence                                                                                                                                                                                                                                                                                                                                                                                                                                 | Test evidence                                                                                                                                                                                                                                                                                                                                                                                              | Source-bound live PNG / TEST evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Verdict          |
| --: | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
|   1 | `[x] «Онлайн» является встроенной включаемой локацией в существующей модели, а не вручную создаваемым workaround.`          | `modules/booking-engine/onlineLocation.ts:4-35,45-117` defines the reserved identity, exact-organization singleton lookup and idempotent state setter over the existing `BeBranch`/catalog port. `BookingSoloLocationsSection.tsx:86-117` separates that built-in row from physical branches and renders its dedicated switch. `api/admin/booking-engine/branches/[id]/route.ts:30-42,69-70` prevents manual edit/delete of the reserved row. | `onlineLocation.test.ts:31-139` proves identity, exact-org lookup, OFF → ON on the same row, idempotent singleton creation, duplicate rejection and state/color updates; `online-location/route.test.ts:19-116` proves exact organization and authorization; `BookingSoloLocationsSection.test.tsx:65-80` proves the dedicated switch calls the existing state endpoint. Included in fresh `165/165 PASS`. | Source-bound DEV PNG `01-settings-online-off-desktop.png` plus the paired existing overview API census prove exactly one reserved «Онлайн» control and one `be_branches`-backed reserved singleton, separate from the physical-location create/list surface. Positive ON presentation belongs to rows 2/4/5; owner acceptance remains a separate owner-only layer.                                                                                                                                                                                                                                                                                                             | `real-done`      |
|   2 | `[x] Состояние Online location гейтит существующие online-галочки услуг.`                                                   | `BookingSoloAvailabilitySection.tsx:43-49,100-128` builds service columns only from active existing branches, so inactive Online exposes no service checkbox; activation exposes the same existing availability switches. `onlineLocation.ts:41-43,45-117` changes branch state without deleting service-availability rows.                                                                                                                   | `BookingSoloAvailabilitySection.test.tsx:57-72` proves the Online column absent while off and present with existing service switches while on. Included in fresh `165/165 PASS`.                                                                                                                                                                                                                           | The same source-bound DEV PNG proves the negative half: Online is off and the existing matrix has zero Online service switches. The positive on-state pair and owner acceptance were not captured because the pass stopped before mutation.                                                                                                                                                                                                                                                                                                                                                                                                                                    | `partial`        |
|   3 | `[x] Не создана новая schema/delivery-mode/booking engine.`                                                                 | Exact feature-manifest census of `838253c72` finds no schema, migration, package or integrator file. `booking-engine/service.ts:257-264` delegates to the helper through the existing catalog port; the current non-test symbol census shows that same identity/state helper reused by Settings and the existing patient/public branch-service-specialist paths, with no second engine or delivery-mode projection.                           | The helper, route, Settings, schedule, patient-catalog and public-catalog suites all pass in the fresh 11-file / `165/165` packet. This structural negative is supported by the exact file/symbol census, not inferred from tests alone.                                                                                                                                                                   | Source-bound DEV used only the existing Settings route and `/api/admin/booking-engine/overview`; the API census remained one `be_branches`-backed Online singleton. A positive mutation or cosmetic PNG would not prove the no-new-schema/engine atom better; owner acceptance remains separate.                                                                                                                                                                                                                                                                                                                                                                               | `real-done`      |
|   4 | `[x] Отдельно доказано, что Online присутствует в существующих schedule location list/filters без второго projection.`      | `doctorScheduleApi.ts:43-60` supplies active branches from the existing booking overview. `ScheduleWorkTab.tsx:564-566,700-710,1138-1179` maps that same branch list directly into the independent location filters. `pgBookingCalendar.ts:57-69,119-126` returns active `be_branches` through existing calendar filter metadata, consumed directly by `ScheduleCalendarTab.tsx:988-993,1102-1106,1691-1697`.                                 | `ScheduleWorkTab.test.tsx:437-460` proves the built-in Online branch is present in the existing work-location filters. `ScheduleCalendarTab.test.tsx:508-525` proves the same for the calendar filter. Both broad suites pass in fresh `165/165 PASS`.                                                                                                                                                     | Exact code is on TEST; no current source-bound Work/Calendar Online-filter PNG or owner acceptance was found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `partial`        |
|   5 | `[x] Отдельно доказано, что online services видны в существующем client booking wizard при включённой Online location.`     | `inPersonServicesCatalog.ts:69-84,101-159` returns Online only when its existing branch is active and has a public service assigned to an active exact-org specialist. `bookingCatalogRsc.ts:157-214` exposes that location and service list to the authenticated patient flow. `FormatStepClient.tsx:64-75` and `ServiceStepClient.tsx:92-128` continue through the existing service/slot wizard.                                            | `bookingCatalogRsc.test.ts:110-181` proves enabled Online plus an assigned service reaches the authenticated wizard. `inPersonServicesCatalog.test.ts:204-290` proves the active/assigned positive and inactive/unassigned negatives. Included in fresh `165/165 PASS`.                                                                                                                                    | No PNG. A bounded correction ran the canonical non-destructive `bash deploy/host/migrate-dev.sh --execute`: migrations, C4D artifact and exact P2-B/E1 closure all passed, including the direct `app_patient` count through `app.read_current_patient_booking_rows(...)`. After restarting the single canonical DEV `:5200`, one `dev:client` recheck still returned HTTP `200` with `0` «Запись» markers and `6` markers for the same RSC query failure. Missing migration/function ACL is therefore excluded; the full enrichment/request-principal execution path remains blocked. Per the same-defect stop rule, no second correction loop or Online mutation was started. | `partial`        |
|   6 | `[x] Online-only services на публичной странице попадают в online-block, а не в physical location (#972).`                  | `inPersonServicesCatalog.ts:40-67` excludes the built-in Online branch from physical cities. `publicOrganizationBooking.ts:63-83` returns physical cities and Online separately under the organization principal. `PublicFormatStepClient.tsx:29-83` renders separate physical and Online blocks; `book/[slug]/page.tsx:22-40` supplies the published organization projection.                                                                | `publicOrganizationBooking.test.ts:110-210` proves an Online-only service is absent from physical Moscow and present under Online. `PublicFormatStepClient.test.tsx:49-66` proves the link is absent from the physical block and present in the Online block. Included in fresh `165/165 PASS`.                                                                                                            | TEST smoke proves the general public slots endpoint returns HTTP 200, but no sanctioned published-slug source-bound PNG proves this separation live.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `partial`        |
|   7 | `[ ] Live proof этого публичного разделения ждёт sanctioned published slug/U6B #926; repository-evidence его не подменяет.` | This is an explicit evidence/dependency gate, not product code to implement in this audit. The separate public projection above does not close it.                                                                                                                                                                                                                                                                                            | Automated tests prove the repository contract only and intentionally cannot substitute for this row.                                                                                                                                                                                                                                                                                                       | No sanctioned published-slug/U6B `#926` live capture or owner acceptance exists. Locked TEST smoke is explicitly insufficient.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `owner-deferred` |

## Aggregation

| Verdict        | Count |
| -------------- | ----: |
| real-done      |     2 |
| partial        |     4 |
| fake-done      |     0 |
| owner-deferred |     1 |
| **Total**      | **7** |

## Coherent residual batch (do not execute inside this audit)

The canonical DEV migration/runtime closure did not clear the patient-booking RSC failure: direct `app_patient`
capability evidence is green, while the product's full enrichment/request-principal query still fails after restart.
This excludes a missing migration or bare function ACL and leaves one exact runtime/product-path blocker. The same
defect survived the single correction, so no second audit-fix loop is allowed. After that separate blocker is
resolved, one new owner-authorized live batch may cover Settings Online on, the positive gated service column,
Online in both schedule filters, and the authenticated patient wizard service list. The public
physical-versus-Online split still waits for sanctioned published slug/U6B `#926`; do not invent a second booking
projection or treat repository evidence as its live proof.

closed 2/7 against `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` § UI-2

**NOT DONE:** row 2 still lacks the positive Online-on service-column state and row 4 still lacks positive
Work/Calendar Online-filter PNGs. Row 5 is blocked at live DEV by the full patient-booking
enrichment/request-principal query: canonical migrate/runtime closure and direct capability checks pass, but the
restarted page repeats the same RSC failure (`0` booking markers, `6` query-error markers); no second correction loop
was started. Row 6 still lacks its sanctioned public split PNG. Row 7 remains explicitly owner/dependency-gated by
sanctioned published slug/U6B `#926`; repository evidence and locked TEST smoke do not close it. Owner acceptance
remains separate. Mobile evidence was not captured because the bounded fresh pass stopped before feature mutation.
