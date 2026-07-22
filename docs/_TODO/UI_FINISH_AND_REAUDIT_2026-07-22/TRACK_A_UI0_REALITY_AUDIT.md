# Track A — UI-0 reality audit

**Audit date:** 2026-07-23  
**Audited HEAD:** `cef84186449d6d1e38672e2136745e61bc83a3f5`  
**Owner checklist authority:** `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md`, UI-0  
**Execution authority:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`  
**Baseline matrix:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_EVIDENCE_MATRIX.md`, A-UI-015…019

This is the single permitted audit pass for the exact five-item UI-0 denominator. It did not change product code,
database state, DEV/TEST runtime, deploy state or taskdb. Historical plan status and generic smoke were not treated
as substitutes for atom-specific evidence.

## Result matrix

| checkbox (quoted verbatim) | code evidence (current HEAD) | targeted test evidence | existing live PNG / TEST evidence | verdict |
|---|---|---|---|---|
| `[x] Устранён SSR/render failure после выбора услуги.` | `apps/webapp/src/app/app/patient/booking/bookingCatalogRsc.ts:94-154` resolves the patient organization, validates the branch/service against the current catalog and canonical slot context under the explicit organization principal, and fails closed; `apps/webapp/src/app/app/patient/booking/new/slot/page.tsx:28-79` redirects invalid selections and renders `SlotStepClient` only from the validated result. | `apps/webapp/src/app/app/patient/booking/bookingCatalogRsc.test.ts:235-313,315-377` proves the valid full slot context and fail-closed mismatch. Included in the fresh `7 files / 73 tests PASS` gate below. | `TEST_DEPLOY_EVIDENCE_2026-07-22.md:45-53` binds exact deployed SHA `45ffed731…` to locked smoke `22/22 PASS`, including `public.booking.slots` HTTP 200. This proves the server slots contract, not a post-fix browser render after service selection; no atom-specific live PNG was found. | `partial` |
| `[x] Видимость услуг соблюдает выбранного специалиста, clinic-wide и solo правила владельца; одной location assignment недостаточно.` | `apps/webapp/src/modules/patient-booking/inPersonServicesCatalog.ts:101-159` requires an active exact-organization specialist-service-branch assignment; optional `specialistId` narrows to that specialist, while its absence forms the clinic-wide union (and a one-specialist organization naturally yields solo scope). `apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx:166-177` applies the same selected specialist + branch intersection in calendar creation. | `apps/webapp/src/modules/patient-booking/inPersonServicesCatalog.test.ts:132-292` covers clinic-wide visibility, location-only exclusion, selected-specialist narrowing and active exact-org Online assignment; `apps/webapp/src/app/app/patient/booking/bookingCatalogRsc.test.ts:110-180`; `apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.test.tsx:251-313` excludes another specialist's service. Included in `73/73 PASS`. | The exact-SHA TEST smoke above proves one canonical published slots request, but it does not prove the four-way UI denominator (selected specialist / clinic-wide / solo / location-only negative). No atom-specific live PNG or live result record for that complete denominator was found. | `partial` |
| `[x] Запись из календаря создаёт видимого organization-owned клиента по действующему contract.` | `apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx:418-471` sends the new-patient draft to the atomic endpoint without client-supplied organization/specialist authority; `apps/webapp/src/app/api/doctor/booking-engine/appointments/manual-patient-visit/route.ts:50-120` supplies trusted organization and clinical actor; `apps/webapp/src/infra/repos/pgBookingEngine.ts:1301-1428` creates/resolves the patient, invited organization relationship and appointment in one transaction; `apps/webapp/src/infra/repos/pgDoctorClients.ts:270-295` includes exact-organization `invited` and `active` enrollments in Clients. | `DoctorCalendarEventPanel.test.tsx:251-313`; `manual-patient-visit/route.test.ts:90-207,237-272`; `createScheduledManualPatientVisit.test.ts:46-126`; `pgBookingEngine.createManualPatientVisit.test.ts:289-384`; `pgDoctorClients.repo.test.ts:78-89`. All included in `73/73 PASS`. | Source-specific DEV record `/home/dev/dev-projects/BersonCareBot/.claude/screenshots/UI0-LIVE-DEV/2026-07-20T18-52-final/result.md` records canonical endpoint HTTP 200, appointment visible in the weekly calendar and exact organization-owned patient projection. PNG: `01-calendar-final.png` (`sha256 43f7cd93031ff41916d3a31e447aaee87225de5b5fce23b15da5497a025f8fda`). The durable binding is `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/LOG.md:302-314`. Current targeted regressions remain green. | `real-done` |
| `[x] ФИО в детали записи ведёт в существующую карточку пациента.` | `apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx:518-540` renders the FIO as a link whenever the canonical `platformUserId` exists; `apps/webapp/src/app/app/doctor/patients/patientCardHref.ts:1-18` builds the canonical patient-card route. | `apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.test.tsx:231-248` proves the exact canonical href and the no-ID plain-heading fallback. Included in `73/73 PASS`. | The same source-specific DEV result records that the selected appointment's FIO targets `/app/doctor/patients/<userId>` and that the route returns HTTP 200 for the same clinic-admin role. PNG: `02-calendar-event-selected.png` (`sha256 dadfdd400c8599a231cca1646219678e112426eb2bbe2a712ad6ce4ca7f976e8`). Durable binding: `LOG.md:302-314`. | `real-done` |
| `[ ] Owner live recheck остаётся отдельным acceptance-layer и не выводится из smoke.` | Not a product-code checkbox. The open owner checkbox in `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md:418` is the authority; neither current code nor smoke can close it. | N/A. Automated tests cannot substitute for owner acceptance. | `TEST_DEPLOY_EVIDENCE_2026-07-22.md:61-67` explicitly leaves live owner UI acceptance open and states that smoke PASS is not owner acceptance or whole-plan closure. No owner acceptance record was found. | `owner-deferred` |

## Fresh targeted verification

Command:

```bash
pnpm --dir packages/db-principal run build && pnpm --dir apps/webapp exec vitest run \
  src/app/app/patient/booking/bookingCatalogRsc.test.ts \
  src/modules/patient-booking/inPersonServicesCatalog.test.ts \
  src/app/app/doctor/calendar/DoctorCalendarEventPanel.test.tsx \
  src/app-layer/doctor/createScheduledManualPatientVisit.test.ts \
  src/app/api/doctor/booking-engine/appointments/manual-patient-visit/route.test.ts \
  src/infra/repos/pgBookingEngine.createManualPatientVisit.test.ts \
  src/infra/repos/pgDoctorClients.repo.test.ts
```

Result: **7 test files / 73 tests PASS**. An initial invocation before building the workspace package produced
`66 PASS` plus one suite-load failure (`@bersoncare/db-principal` dist absent in the fresh worktree); after the
documented package build, the complete identical seven-file selection passed. No test failure was hidden.

## Bounded correction batch

No dependency-ready product-code defect was found, so this audit does not authorize a code correction batch.
The remaining repository gap is evidence, not an implementation finding: perform one owner-controlled live UI-0
walkthrough on the intended live environment and retain a source-bound result/PNG set covering (a) service click →
slot page without render failure and (b) selected-specialist, clinic-wide, solo and location-only-negative service
visibility. The same walkthrough may re-confirm calendar-created client visibility and FIO navigation, but it must
not be inferred from locked smoke.

`closed 2/5 against docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md (UI-0)`

## NOT DONE:

- The SSR/render checkbox lacks an atom-specific post-fix live browser artifact.
- The service-visibility checkbox lacks live evidence for its complete selected-specialist / clinic-wide / solo /
  location-only-negative denominator.
- Owner live recheck remains explicitly open and owner-only; neither `73/73` targeted tests nor locked TEST smoke
  closes it.
