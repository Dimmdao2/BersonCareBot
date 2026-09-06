# Тест или взгляд

Repeatable data/access/period/drill-down behavior is verified by the cheapest public behavioral tests and a blind
kill-set. One-time route ownership, code reuse, architecture, privilege declaration and removal/move quality are
verified by inspection and named-DEV proof where required. Visual taste is not part of this audit.

# Independent audit: doctor analytics first honest stage

## Role and authority

You are the independent `auditor-live` for branch `wt/doctor-analytics-first-stage-20260906`. Before acting,
read the `AGENTS.md` heading map and fully read the relevant migration/privilege rules in §1, §5, §10a, §10b,
§16, §17, §21, §22 and §24. Owner authority and exact checklist are sections A–D, F and G in
`docs/_TODO/DOCTOR_ANALYTICS_REBUILD_2026-09-06.md`. Section E is explicitly future work and must neither be
implemented nor reported as a defect.

Oracle quote: «Специалист видит только аналитику по доступным ему пациентам и получает два понятных
разреза: записи и фактическую активность назначенных программ».

Do not change product code. You may add/adjust and commit only genuinely justified behavioral acceptance tests
plus concise audit artifacts. Revert every fault injection. Do not push, land, deploy or run full CI. If a live
check is needed, use named DEV on an isolated non-shared port and leave no process/data behind. Do not perform
visual taste review or screenshots; the owner accepts visuals on TEST.

This port agent has one turn. Do not end the turn waiting for a background process: run every required focused
check in the foreground and wait for it. Before ending, either commit every allowed test/audit artifact using
explicit paths or leave the worktree clean and report that no audit commit was needed.

## Exact owner checklist in scope

- `AN-ROUTE-01` — `/app/doctor/analytics` belongs to the specialist workspace, uses
  `requireDoctorWorkspaceContext`, and is available to an ordinary specialist without a global-admin role.
- `AN-ROUTE-02` — platform analytics has the separate `/app/admin/analytics` route; platform navigation and legacy
  redirects lead there and do not collide with the doctor route.
- `AN-ROUTE-03` — doctor navigation `Аналитика` leads to `/app/doctor/analytics`, not `material-ratings`.
- `AN-SCOPE-01` — every doctor aggregate is limited by `organizationId` and visibility actor/pre-authorized patient
  IDs; `getDefaultOrganizationId` and a global loader are forbidden.
- `AN-SCOPE-02` — another organization and an invisible patient affect neither KPI, chart nor drill-down; ordinary
  specialist and clinic-admin behavior are checked separately.
- `AN-SCOPE-03` — the platform-scope phrase and empty platform content block are absent from doctor UI while the
  correct tenant-scoped material ratings remain available.
- `AN-UI-01` — reuse `DoctorAppShell`, `DoctorPageHeader`, `doctorSectionTabClass`, `DoctorSection`, `DoctorStatCard`
  and existing chart/period primitives; do not create another shell or local design system.
- `AN-UI-02` — section tabs behave like schedule/patient-card tabs; exactly `Записи` and `Активность`, responsive,
  with `?tab=` URL state.
- `AN-PERIOD-01` — presets `24 часа`, `7 дней`, `30 дней` and a custom date range are available.
- `AN-PERIOD-02` — KPI, series and drill-down share specialist/organization business-timezone boundaries, inclusive
  start and exclusive end.
- `AN-STATE-01` — loading/error/empty state belongs to the active tab, never leaks raw errors and never invents zero
  for an unavailable metric.
- `AN-REC-01` — scoped KPIs cover total, future/completed, cancellations, reschedules, primary/follow-up and unique
  patients without claiming unsupported financial/clinical semantics.
- `AN-REC-02` — a non-empty scoped daily appointment series comes through the existing `DoctorAppointmentsPort`;
  SQL/filter logic is not copied into UI/API.
- `AN-REC-03` — chart and KPI use one scope and consistent drill-down records.
- `AN-REC-04` — cancellations have a separate series/value and no technical player/app errors appear.
- `AN-ACT-01` — activity counts only visible patients with an active assigned program.
- `AN-ACT-02` — factual metrics are program patients, patients with marks in period, mark/completion count, active
  days and share of active patients.
- `AN-ACT-03` — the daily series is factual activity and is not labelled exact adherence without structured expected
  schedule data.
- `AN-ACT-04` — patient drill-down leads to the existing patient/exercise-calendar path and cannot expose an
  invisible patient.
- `AN-ACT-05` — correct tenant-scoped material ratings remain reachable from Activity; global
  `ContentEngagementStatsResponse` is not reused.
- `AN-ACT-06` — support/favourite split is implemented only if an honest existing domain marker is available;
  otherwise it remains explicitly blocked and must not be simulated.
- `AN-ADMIN-01` — cross-clinic totals, platform registrations/channels/top pages and operational analytics are not
  available from doctor route/API.
- `AN-ADMIN-02` — player/HLS/proxy/transcode/storage errors, user-agent and internal reminder delivery errors remain
  global-admin only.
- `AN-TEST-01` — behavioral evidence covers tenant isolation, visibility actor, ordinary specialist versus clinic
  admin, period/timezone and KPI-to-drill-down consistency.
- `AN-TEST-02` — any new DB read root has named-DEV privilege proof; privilege declaration is central and no
  migration grants privileges.
- `AN-AUDIT-01` — return one independent binary verdict for A–D, F and G; owner performs visual acceptance on TEST.
- `AN-INTEGRATION-01` — is not closed by this audit; landing, cleanup, integration CI and TEST deploy belong to the
  orchestrator after PASS.

Section E (`AN-MONEY-01`, `AN-ADHERENCE-01`, `AN-VIDEO-01`, `AN-APP-01`, `AN-REMINDER-01`) is explicitly outside
this first-stage audit and absence of those metrics is not a finding.

## Test or inspection — classify before reading tests

- Repeatable behavior: organization and patient-visibility isolation, ordinary specialist vs clinic-admin scope,
  timezone-inclusive/exclusive period boundaries, KPI/time-series/drill-down agreement, honest activity metrics,
  and authorization of doctor/admin routes. Prepare a blind kill-set before reading existing tests, then use the
  cheapest public behavioral layer.
- One-time structure: platform analytics moved rather than copied; doctor UI reuses shared shell/tabs/charts; no
  global loader/default organization/raw SQL/new ad-hoc DB access; no fabricated money/adherence/watch-time metric.
  Inspect final diff and architecture gates; do not test source strings.
- Visual layout is owner live-review territory. Only broken navigation/runtime, unavailable content, leaked data,
  false metrics, authorization failures, or build/integration failures are findings.

## Blind kill-set authority

Prepare the kill-set before opening candidate tests. It must cover independent reachable failures:

1. `/app/doctor/analytics` rejects an ordinary specialist or uses global-admin/default-organization context.
2. A record/activity belonging to another organization changes any doctor KPI, series or drill-down.
3. A patient hidden from a specialist remains visible to that specialist; clinic-admin coverage follows the
   currently implemented visibility contract rather than an invented clinic-wide selector.
4. `/app/admin/analytics` or platform navigation is broken, duplicated, or reachable through the doctor route.
5. Period boundaries are evaluated in server/browser timezone or use an inclusive end, producing an off-by-one-day
   record/activity.
6. Appointment KPI, time series and drill-down apply different scope/status/date semantics.
7. Activity claims adherence, expected schedule, watch minutes, promo/assigned split, money or other unavailable
   telemetry rather than the factual marks/days/active-patient values authorized by D.
8. Activity includes patients without an active assigned program or exposes an invisible patient in drill-down.
9. Tenant-scoped material ratings disappear or are replaced by global `ContentEngagementStatsResponse`.
10. Technical player/proxy/transcode/storage errors or operational analytics leak into doctor UI.
11. A new DB read root lacks the central privilege/read-path treatment required by the existing application login,
    causing a reachable TEST/production permission failure.

Each retained/new test must identify the user-visible failure, impact and independent oracle. Perform one temporary
fault injection per protected independent class and report which assertion turned red. A failing acceptance test on
the untouched candidate is a valid FAIL handoff; do not fix product code.

## Required result

Return binary PASS or FAIL against A–D, F and G. Every FAIL must include a reachable scenario, impact, exact violated
ID and evidence. Recommendations/style are not findings. Run targeted tests, webapp typecheck, scoped ESLint,
architecture/access checks applicable to the diff, and `git diff --check`. For any new DB read root, prove its
actual named-DEV read path safely without creating a disposable DB. If tests/artifacts change, stage explicit paths
and commit; otherwise leave the worktree clean. Report exact commands, counts, kill-set/fault-injection results,
candidate SHA and auditor SHA.
