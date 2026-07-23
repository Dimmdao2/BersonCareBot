# Track A — UI-P shared doctor presentation reality audit

Audit run: `/root/ui4_frameless_fix` (second independent assignment)

Audited SHA: `dbb1c03ce8c09ba524bb044a508c9d2ccd6e604a`

Owner-plan denominator: `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md`, section
`UI-P — shared doctor presentation (#925)`.

Verdict vocabulary: `real-done` / `partial` / `fake-done` / `owner-deferred`.

This is one read-only presentation audit pass. No product code, DB, runtime, deploy, plan checkbox or taskdb state
was changed.

## Authority and evidence boundary

The eight literal UI-P checklist rows below are the complete denominator. The latest P2B supersession map and the
2026-07-22 owner ruling govern them: doctor canvas is `#F6F4EF`; page headers and primary surfaces stay white;
semantic primary stays `#406ca7`; Today is the flat-list visual reference; Clients and Messages retain native
whole-row interaction; sidebar/mobile menu rows use the minimal menu radius while section tabs keep their own pill
contract.

Existing live evidence is source-bound to the audited code. Evidence SHA
`0eda771fe2d9152f9252248ebe11f586737b0eed` is an ancestor of the audited SHA, and
`git diff --name-status 0eda771fe..dbb1c03ce -- apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor apps/webapp/src/app/styles apps/webapp/src/modules/doctor-clients apps/webapp/src/infra/repos/pgDoctorClients.ts`
produced no output.

Live base:

`/home/dev/dev-projects/.lead/runs/ui-finish-984/0eda771fe/live-ui-audit-20260722T205446Z`

- D0 / M0: `doctor-desktop/i0_app_doctor_2026-07-22T20-57-25Z.png` /
  `doctor-mobile/i0_app_doctor_2026-07-22T20-59-34Z.png`;
- D1 / M1: `doctor-desktop/i1_app_doctor_patients_2026-07-22T20-57-25Z.png` /
  `doctor-mobile/i1_app_doctor_patients_2026-07-22T20-59-34Z.png`;
- D2 / M2: `doctor-desktop/i2_app_doctor_communications_tab_chats_2026-07-22T20-57-25Z.png` /
  `doctor-mobile/i2_app_doctor_communications_tab_chats_2026-07-22T20-59-34Z.png`.

All six manifest entries are HTTP 200 with `err: null` and no console errors. Direct pixel checks on D0/D1 return
canvas `srgb(246,244,239)`, header `srgb(255,255,255)` and primary `srgb(64,108,169)`.

Two later source-bound continuations supersede only the populated Today/Clients live-evidence gaps in rows 4 and
5; they do not add a populated Messages fixture:

- Today, SHA `e669e2c123c41ddb1167af8e31e4f2f9f472c98b`:
  `/home/dev/dev-projects/.lead/runs/ui6-today-live/e669e2c12-20260723T001405Z/manifest.md`. The hashed
  desktop/mobile PNGs show a populated support row, its larger/lighter primary line, frameless divider rhythm,
  full-width hover, far-right pointer activation and native-link `Enter`.
- Clients, SHA `c431fe7a102e4056737e3052e63143ad5046a762`:
  `/home/dev/dev-projects/.lead/runs/ui4-populated-live/c431fe7a1-20260722T235339Z/manifest.md`. The hashed
  desktop/mobile PNGs show a populated flat row without an enclosing side frame; the existing UI-4 live pass also
  proves far-right pointer and keyboard activation.

The later bounded Communications pass is source-bound to SHA `77843fa2bda4da7a88e4b079b072310c69a2956d`
(`TRACK_A_UI3_REALITY_AUDIT.md`, “Empty-state/route live addendum”). Its Chats list still contains zero dialogs, so
it cannot prove row typography, divider/hover, whole-row activation or selected state for Messages.

## Exact reality matrix

| # | Checkbox quoted verbatim | Code evidence | Test evidence | Source-bound D/M PNG | Verdict |
|---|---|---|---|---|---|
| 1 | “**SUPERSEDED — 2026-07-22 by `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2:** Doctor canvas uses exact Design DNA `#F6F4EF`; page header remains white, and primary `#406ca7` does not change.” | `apps/webapp/src/app/styles/doctor.css:3-15` centralizes the DNA canvas and white header; `apps/webapp/src/app/styles/bersoncare-tweakcn-theme.css:88-101` consumes the canvas and sets doctor-scoped primary. The scoped exact-string census found no component-local `#406ca7` or stale `#faf9f4`. | `apps/webapp/src/app/styles/doctorDnaTheme.contract.test.ts:7-14`; `apps/webapp/src/shared/ui/doctor/DoctorPresentationChrome.test.tsx:29-37`. | D0–D2 and M0–M2 show the greige canvas and white header/surfaces. Direct pixels prove `#F6F4EF`, white and `#406CA7`. | **real-done** |
| 2 | “Радиусы block/KPI/control `12/8/24px`, основной padding `18px` и белый input не размножены локально.” | Shared tokens live at `doctor.css:7-13`; page block/KPI classes at `doctorVisual.ts:6-7,69-74`; doctor controls at `shared/ui/doctor/primitives/button.tsx:16-31`, `input.tsx:8-14`, `select.tsx:23-29`; page-header padding uses the shared token at `shell/DoctorPageHeader.tsx:72,98`. No raw `rounded-[12px|8px|24px]` or page-level `p-[18px]` exists in the affected Today/Clients/Messages/shared surfaces. | `DoctorPresentationChrome.test.tsx:20-27,39-65`. | D0/M0 show 12px page blocks and 8px KPI shells; D1/M1 and D2/M2 show pill controls and white input surfaces. | **real-done** |
| 3 | “KPI используют порядок label → value.” | `apps/webapp/src/app/app/doctor/analytics/clients/DoctorStatCard.tsx:54-58` renders `doctorMetricLabelClass` before `doctorMetricValueClass`; the shared label/value roles are `doctorVisual.ts:62-67`. | `apps/webapp/src/app/app/doctor/analytics/clients/DoctorStatCard.test.tsx:8-16`. The current focused gate also exercises its consumers. | D0/M0 and D1/M1 visibly show label above value. | **real-done** |
| 4 | “Основной текст doctor-списков крупнее и легче без изменения meta/badge/calendar typography.” | `DoctorDnaFlatListRow.tsx:17-27` owns `text-base font-normal` primary and `text-xs` meta; all three consumers reuse it: `DoctorTodayDashboard.tsx:185-190`, `PatientsPageClient.tsx:779-787`, `DoctorSupportInbox.tsx:374-407`. Calendar/meta markup remains outside the primary role. | `DoctorPresentationChrome.test.tsx:68-87`; `PatientsPageClient.test.tsx:157-174`; `DoctorSupportInbox.test.tsx:93-121`; `DoctorTodayDashboard.test.tsx:249-309`. | D1/M1 and the later Clients continuation show the larger/lighter Clients rows; the later Today continuation shows the same primary role on a populated support row while calendar labels remain compact. The source-bound Messages list is still empty, so its primary row typography is not visible live. | **partial** |
| 5 | “Clients/messages используют один shared list-row contract: геометрия как «На сопровождении», full-row hover и divider `#f0efeb` (`#967`).” | The only shared contract is `DoctorDnaFlatListRow.tsx:8-27`: top-only `#f0efeb` divider, no side/bottom border and whole-row hover. Today, Clients and Messages consume it at `DoctorTodayDashboard.tsx:185-210`, `PatientsPageClient.tsx:761-800`, `DoctorSupportInbox.tsx:358-422`; their list surfaces add no side frame. | `DoctorPresentationChrome.test.tsx:68-87`; Today whole native link `DoctorTodayDashboard.test.tsx:249-309`; Clients pointer/keyboard button `PatientsPageClient.test.tsx:209-232`; Messages pointer/keyboard/selected marker `DoctorSupportInbox.test.tsx:77-121`. | The later Today continuation proves frameless divider rhythm, full-row hover, far-right pointer activation and native-link `Enter`; the Clients live batches prove the frameless row plus far-right pointer and keyboard activation. The source-bound Messages list is still empty, so its row/divider/hover/selected state remains unavailable. | **partial** |
| 6 | “Общие tabs имеют более округлые края и более тёмный нейтральный hover без page-local divergence (`#967`).” | `DoctorSectionTabs.ts:3-16` is the shared tab vocabulary and uses its own 24px pill plus `--doctor-section-tab-hover`; schedule, communications, analytics and booking tabs consume the same helper. It does not import menu radius. | `DoctorPresentationChrome.test.tsx:89-100` proves active, inactive hover and independence from menu radius. | D2/M2 show the common rounded Communications tabs; D0/D2 simultaneously show that sidebar menu rows retain a different geometry. | **real-done** |
| 7 | “Пункты основного sidebar/mobile menu возвращены к прежней почти прямоугольной форме с действительно минимальным скруглением и не наследуют 24px doctor button radius (`#967`). Owner live recheck 2026-07-22 отклонил промежуточный `rounded-md` как всё ещё слишком округлый; rounded section tabs этим пунктом не меняются.” | `navChrome.ts:6-7` fixes the shared menu radius at `rounded-sm`; `shell/DoctorMenuAccordion.tsx:80-95,207-210,359-396`, `DoctorAdminSidebar.tsx:85-93` and `DoctorHeader.tsx:190-198` apply it after the doctor button class, so it overrides the 24px default. Tabs remain independently pill-shaped in `DoctorSectionTabs.ts`. | `DoctorPresentationChrome.test.tsx:89-100` asserts `rounded-sm`, rejects radius sharing and preserves tab pills. | D0–D2 show minimally rounded desktop sidebar rows next to pill section tabs. M0–M2 show the mobile header but do not open the mobile menu drawer, so the mobile menu row geometry lacks live evidence. | **partial** |
| 8 | “Clients search находится в page-header slot.” | `PatientsPageClient.tsx:657-688` passes the search input through `DoctorPageHeader.tabs`; the shared header right slot is `shell/DoctorPageHeader.tsx:81-92`. | `PatientsPageClient.test.tsx:134-139` proves the search is inside `[data-doctor-page-header-tabs]`, full-width, and not in the toolbar. | D1 shows the search aligned in the desktop header right half; M1 shows the compact mobile header placement. | **real-done** |

## Validation

- Current focused gate:
  `pnpm --dir apps/webapp exec vitest run src/app/styles/doctorDnaTheme.contract.test.ts src/shared/ui/doctor/DoctorPresentationChrome.test.tsx src/app/app/doctor/DoctorTodayDashboard.test.tsx src/app/app/doctor/patients/PatientsPageClient.test.tsx src/app/app/doctor/messages/DoctorSupportInbox.test.tsx --reporter=dot`
  → **5 files / 74 tests PASS**.
- Two existing React `act(...)` warnings occur in the inactive polling test for `DoctorSupportInbox`; they do not
  fail the gate and are not evidence for or against a UI-P checkbox.
- The accumulated full CI recorded green on the evidence SHA is reused: the source-binding diff above proves zero
  product/UI drift. Full CI was not repeated for this docs-only audit.

## Aggregate verdict

- real-done: **5/8**;
- partial: **3/8** — rows 4, 5 and 7;
- fake-done: **0/8**;
- owner-deferred: **0/8**.

**Closed: 5/8 against `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md#UI-P`.**

**NOT DONE:** only populated Messages live state remains for rows 4/5: primary typography, divider/full-row hover,
whole-row activation and selected-dialog state. The mobile menu must still be opened in a live capture to seal its
minimal row radius independently of desktop. Owner acceptance remains separate and has not been set.

No dependency-ready product defect was found, so this audit does not create a correction batch. The residual is one
batched live-evidence pass, not implementation scope.
