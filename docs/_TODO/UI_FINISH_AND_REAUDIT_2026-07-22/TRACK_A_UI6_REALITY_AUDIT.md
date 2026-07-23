# Track A — UI-6 Today reality audit

## Audit contract

- Run: `ui6_reality_audit` (`audit/ui6-reality-20260723`).
- Audited HEAD: `7b4775ae48f89343668c3dcb18857c2ec9f0e50e`.
- Owner denominator: exactly nine UI-6 rows from
  `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md:524-535`.
- This is the single independent presentation/behavior audit pass. Product code, DB, runtime, deploy, taskdb and
  owner checkboxes were not changed.
- Supersession lock: row 2 retains its literal historical text for denominator fidelity, but current owner canon is
  `P2B-05`: the calendar header action is the standard doctor button **«Открыть расписание»**. The audit does not
  resurrect the old «Открыть календарь» label or link presentation.
- Verdict rule: `real-done` requires current code, applicable test evidence and source-bound live proof for the
  visible state. A row with repository evidence but without its required live state is `partial`; a gate explicitly
  waiting on an undefined owner contract is `owner-deferred`.

## Fresh targeted validation and reused live evidence

Full CI was not repeated. The audit worktree has no installed `node_modules`, so the targeted packet ran through
the integration checkout after `cmp` proved that all six test files and their six directly audited implementation
files were byte-identical between the two checkouts:

```text
pnpm --dir apps/webapp exec vitest run \
  src/app/app/doctor/DoctorTodayDashboard.test.tsx \
  src/app/app/doctor/DoctorTodayMiniCalendar.test.tsx \
  src/app/app/doctor/loadDoctorTodayDashboard.test.ts \
  src/modules/system-settings/doctorTodayPreferences.test.ts \
  src/app/app/settings/DoctorTodayPreferencesSection.test.tsx \
  src/app/api/admin/settings/route.test.ts

PASS — 6 files / 81 tests
```

Vitest global setup printed the existing non-fatal DEV migration warning for
`0229_operator_incident_alert_claims` (`permission_denied`, SQLSTATE `42501`) and explicitly continued with the
in-memory/jsdom suites. All 81 selected tests ran and passed; no DB/runtime evidence is inferred from them.

The product diff from accumulated-green product SHA `45ffed7318c584cf501d6972e231d197bebce6f6` to audited HEAD
is empty. The narrower Today/UI/settings product diff from live-evidence SHA
`0eda771fe2d9152f9252248ebe11f586737b0eed` to audited HEAD is also empty.

Existing validation remains applicable:

- accumulated CI on `45ffed731`: lint, typecheck, integrator tests, webapp gate, media-worker tests, production
  builds and registry/audit gate are recorded green in `TEST_DEPLOY_EVIDENCE_2026-07-22.md:41-55`;
- the UI-6 presentation package reused focused green suites recorded in
  `TRACK_A_TODAY_CLIENTS_MESSAGES_REAUDIT.md:6-17`;
- the `#963` behavior stage records 62 focused tests, six migration-contract tests, a private repeat-apply smoke,
  typecheck, lint, journal and settings-accessor gates in
  `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/LOG.md:4524-4536`.

Source-bound Today live batch:

`/home/dev/dev-projects/.lead/runs/ui-finish-984/0eda771fe/live-ui-audit-20260722T205446Z`

- desktop: `doctor-desktop/i0_app_doctor_2026-07-22T20-57-25Z.png`;
- mobile: `doctor-mobile/i0_app_doctor_2026-07-22T20-59-34Z.png`;
- both `last-shot.json` records: HTTP 200, `err: null`, zero console errors.

The fixture is empty: no appointment, no people row and no alternative preference state. It proves the current
empty presentation, but cannot prove a first-appointment boundary or either non-default `#963` behavior.

### Populated Today live addendum — 2026-07-23

One source-bound DEV pass on SHA `e669e2c123c41ddb1167af8e31e4f2f9f472c98b` added the missing Today fixture
states without changing product code. External manifest and hashed desktop/mobile PNGs:

`/home/dev/dev-projects/.lead/runs/ui6-today-live/e669e2c12-20260723T001405Z/manifest.md`

- the existing synthetic support row is populated on desktop and mobile;
- full-row hover reaches the far-right icon area and the list has no enclosing side frame;
- pointer activation at `row right edge - 4px` and native-link `Enter` both reach the patient workspace, so the
  row behavior is not limited to the name;
- a reversible confirmed 07:30 DEV appointment makes the visible calendar start at 06:30 on desktop and mobile;
  it was then cancelled through the canonical manual-cancel API with `notifyPatient=false`;
- the subsequent Settings-switch substep stopped after the shared DEV server restarted while opening Settings.
  Under the one-pass rule it was not retried, so the alternative preference states remain partial.

The initial desktop/mobile captures record HTTP 200 and zero console/page errors. The interrupted custom harness
did not persist its final diagnostic JSON, so the addendum does not overstate a complete no-error ledger for the
interaction substeps.

### Settings residual attempt — BLOCKED 2026-07-23

A bounded DEV attempt on source SHA `e35c331693938989bbdcbb40519573b7036df159` did not produce the required
changed Settings/Today evidence. External manifest with hashed artifacts:

`/home/dev/dev-projects/.lead/runs/ui6-settings-live/e35c33169-20260723T012740Z/manifest.md`

- The initial organization row was absent, so Today used the exact code default: both signal kinds visible and
  `peopleListMode=on_support`. Initial Settings desktop and Today desktop/mobile captures confirm that baseline.
- The first preflight failed before mutation because its label-parent locator did not reach the sibling switch.
- In the corrected attempt, a tool-cell reported completion while its browser PID was still alive; a diagnostic
  command unintentionally started a duplicate PID. That duplicate performed one canonical Settings UI PATCH
  (`wellbeing_low_streak` off). The original attempt detected the changed `updatedAt` before its next mutation and
  stopped at the concurrency guard. No target-state PNG was captured.
- Cleanup used only the Settings UI and restored the exact logical defaults. PATCH and final GET tokens represent
  the same instant despite ISO/DB formatting and precision differences; final GET returns both signal kinds and
  `on_support`. The initially absent row is now a materialized default row, an explicitly allowed DEV-only residue.
  No direct SQL, delete, new API, TEST or PROD action occurred.
- Canonical DEV stop left ports `5200` and `4200` free. After the second mechanical failure no third evidence
  attempt was run.

This blocked run changes no row verdict: rows 7 and 8 remain `partial`, and owner acceptance remains separate.

## Nine-row evidence matrix

| # | Checkbox (quoted verbatim) | Code evidence | Test evidence | Source-bound live PNG | Verdict |
|---:|---|---|---|---|---|
| 1 | `[x] KPI на «Сегодня» имеют compact presentation без искусственной пустой высоты.` | `DoctorTodayDashboard.tsx:124-138` renders one compact KPI row. `DoctorTodayLeftKpiRow.tsx:132-175` uses `DoctorMetricList` without a height/min-height contract; `doctorVisual.ts:63-74,99-101` owns the compact value, `p-2.5` shell and dense grid. | `DoctorTodayDashboard.test.tsx:166-183` proves four compact counters. `DoctorTodayLeftKpiRow.test.tsx:31-173` covers zero/non-zero compact cards and their modal actions. Reused green gates above. | Desktop and mobile PNGs show four compact cards with no artificial empty height. | **real-done** |
| 2 | `[x] Дата и «Открыть календарь» находятся в compact calendar header, ссылка расположена справа.` | Applying the supersession: `DoctorTodayMiniCalendar.tsx:227-237` keeps date and the standard **«Открыть расписание»** action in one `justify-between` header. The old label is absent. | `DoctorTodayMiniCalendar.test.tsx:116-134` proves one compact header, current href and standard control classes; `DoctorTodayDashboard.test.tsx:140-164` proves the current action at page level. | Both PNGs show the date left and **«Открыть расписание»** right in one compact header. | **real-done** |
| 3 | `[x] Дублирующая фраза/строка с количеством записей удалена.` | `DoctorTodayDashboard.tsx:266-278` renders the mini-calendar directly and keeps the appointment KPI row absent. `DoctorTodayMiniCalendar.tsx:227-253` has the date/action, one conditional empty hint and the accessible event list, but no duplicate appointment-count line. | `DoctorTodayDashboard.test.tsx:140-196` proves the old appointment headings/KPI row are absent and the calendar is first. `DoctorTodayMiniCalendar.test.tsx:150-180` proves the empty hint disappears when appointments exist. | Both PNGs show no duplicate count phrase/row; the only appointment copy is the legitimate empty-state hint «Записей на сегодня нет». | **real-done** |
| 4 | `[x] Desktop-разделение страницы «Сегодня» возвращено к точному 50/50 (#966).` | `DoctorTodayDashboard.tsx:118-122` uses `md:grid-cols-2`, with no 45/55 or asymmetric template. | `DoctorTodayDashboard.test.tsx:198-205` asserts exact two equal desktop columns and rejects the former asymmetric class. | Desktop PNG shows equal left/right canvases; mobile PNG shows the intended stacked composition. | **real-done** |
| 5 | `[x] «Открыть расписание» оформлено стандартной doctor-кнопкой (#966).` | `DoctorTodayMiniCalendar.tsx:231-236` renders the route as `buttonVariants({ size: "sm" })`. | `DoctorTodayMiniCalendar.test.tsx:116-134` proves `h-8`, doctor control radius and exact route; dashboard tests also assert the current label. | The standard blue doctor button is visible in both PNGs. | **real-done** |
| 6 | `[x] Календарная сетка начинается ровно за один час до первого приёма, если именно приём расширяет нижнюю границу; default window и рабочие границы не получают второй запас (#966).` | `DoctorTodayMiniCalendar.tsx:135-172` passes exact working bounds to the shared helper without local pre-padding. `visibleTimeWindow.ts:28-69` applies one 60-minute event buffer while expanding exact default/working bounds. | `DoctorTodayMiniCalendar.test.tsx:350-410` proves default preservation, the 07:30→06:30 event boundary, the exact 08:00→07:00 no-double-padding case and exact working-bound expansion. | `live-pass/today-desktop-early-appointment.png` and `live-pass/today-mobile-populated.png` in the 2026-07-23 manifest show a 07:30 appointment and the first visible boundary at 06:30. | **real-done** |
| 7 | `[x] Состав видимых сигналов настраивается через существующий settings path после exact data contract (#963).` | Exact per-org contract: `doctorTodayPreferences.ts:6-54`; sanctioned registry entry `registry.ts:72-78`; Settings UI `DoctorTodayPreferencesSection.tsx:34-106`; normalized owner write `api/admin/settings/route.ts:484-490,666-687`; per-org read `doctor/page.tsx:85-121`; filtered query/render `loadDoctorTodayDashboard.ts:488-495,523-548` and `DoctorTodayDashboard.tsx:248-263`. | Normalization/fail-closed tests: `doctorTodayPreferences.test.ts:8-48`; UI write: `DoctorTodayPreferencesSection.test.tsx:16-43`; org-owned API write/rejection: `api/admin/settings/route.test.ts:299-335`; hidden-query/render behavior: `loadDoctorTodayDashboard.test.ts:450-471`, `DoctorTodayDashboard.test.tsx:371-381`. The prior high-risk `#963` gate is recorded green. | PNGs show only the default visible signals section. There is no source-bound Settings save plus changed Today state proving either switch. | **partial** |
| 8 | `[x] Переключатель «на сопровождении» / «недавние с визитами» имеет доказанную семантику (#963).` | Modes are closed in `doctorTodayPreferences.ts:8-19,31-48`. `loadDoctorTodayDashboard.ts:431-463` defines on-support as the exact org-scoped support result and recent-visits as org-scoped clients with appointment records, removes null visit dates and orders newest first. `DoctorTodayDashboard.tsx:70-71,149-175,228-243` changes title, empty/footer semantics and removes on-support-only copy in recent mode. | `loadDoctorTodayDashboard.test.ts:474-523` proves invited on-support count parity and all-time recent-visit filtering/order. `DoctorTodayDashboard.test.tsx:249-369` proves whole-row on-support output and the distinct recent-visits presentation. API/normalizer tests reject unknown modes. | The 2026-07-23 desktop/mobile PNGs now prove the populated default «На сопровождении» row, including whole-row pointer/keyboard behavior. The switched «Недавние с визитами» state is still absent because the one Settings pass was interrupted and not retried. | **partial** |
| 9 | `[ ] «Самые активные», новые counters и hiding semantics реализуются только после exact contract (#963).` | Correct safe state: the allowed contract contains only two proven signal kinds and two people-list modes (`doctorTodayPreferences.ts:8-19,25-48`); current UI has no ranking/counter/hiding control. | `doctorTodayPreferences.test.ts:35-47` and `api/admin/settings/route.test.ts:324-335` explicitly reject `most_active` and `hidden_clients`. | N/A: no exact owner contract exists, so no legitimate live state can be captured. | **owner-deferred** |

## Aggregate result

| Verdict | Count |
|---|---:|
| real-done | 6 |
| partial | 2 |
| fake-done | 0 |
| owner-deferred | 1 |
| **Total** | **9** |

## Coherent residual batch

No dependency-ready product-code defect was found in the nine-row scope, so this audit does not authorize an
implementation worker. The 2026-07-23 pass closed the early-appointment boundary and populated on-support state.
The remaining ready evidence work is one Settings-save → changed-Today capture for signal visibility and the
populated «Недавние с визитами» ordering, followed by owner click-through.

The later bounded Settings attempt above stopped after two mechanical failures without target-state evidence.
Under the orchestration stop rule it must not be auto-retried in this run.

If that single live pass exposes a real defect, all UI-6 findings should form one coherent worker stage. It must not
start serial audit/fix micro-rounds.

## OWNER QUESTION outside the nine-row scope

`apps/webapp/src/app/app/doctor/doctor.md:18-22` still describes the mini-calendar working-hours path as a stub,
while current `page.tsx:30-75,131-132` and `DoctorTodayMiniCalendar.tsx:151-165` implement the canonical working-bound
path. This audit does not turn that documentation drift into a task. Should the module note be corrected in a
separately authorized docs pass?

closed 6/9 against `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` § UI-6

## NOT DONE:

- Row 7 lacks a source-bound Settings-save → changed-Today live state.
- Row 8 now has populated source-bound «На сопровождении» evidence, but still lacks the switched populated
  «Недавние с визитами» state.
- Row 9 remains behind the missing exact owner contract for ranking, counters and hiding semantics.
- Owner acceptance remains separate and owner-only; this audit does not mark the plan or taskdb done.
