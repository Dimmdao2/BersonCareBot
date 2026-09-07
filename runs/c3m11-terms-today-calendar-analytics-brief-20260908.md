# C3M-11 terminology sweep — Today, analytics, calendar

Read the `AGENTS.md` heading map before every action, then the full sections for doctor UI, text/select, tests and orchestration that match the files below. Authority: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M.6 and C3M-11; taskdb `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` — «Терминология не реализуется условными строками по страницам.»

Mechanically finish only these active presentation surfaces:

- `apps/webapp/src/app/app/doctor/DoctorCurrentAppointmentCard.tsx`
- `DoctorTodayLeftKpiRow.tsx`, `DoctorTodayWeeklyAppointmentsChart.tsx`
- `analytics/activity/ActivityAnalyticsTab.tsx`, `ProgramActivityDynamicsChart.tsx`
- `analytics/clients/ClientContactPieChart.tsx`
- `calendar/DoctorCalendarPatientSearch.tsx`
- `schedule/tabs/ScheduleCalendarTab.tsx`
- `doctor/admin/booking/BookingOverviewPanel.tsx`, `BookingPatientSearchPicker.tsx`

One required pattern: use the already mounted `useDoctorPatientTerms()` context and its grammatical forms. Do not add page-level `if client` conditions, another resolver, another dictionary, props that duplicate the context, another group, or another membership field. The sole group membership remains `doctor_patient_support.on_support`; this slice does not change booking policy. Replace only visible text/aria/title/fallback presentation, not code comments or domain identifiers.

Do not write or modify tests: this is variable UI copy and is accepted by code inspection/live UI under AGENTS §10a. Run scoped formatting/lint, webapp typecheck, and `git diff --check`; commit explicit paths with `#1098`, no push and no full CI.
