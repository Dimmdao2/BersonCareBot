# C3M-11 terminology sweep — client card, programs and CMS

Read the `AGENTS.md` heading map before every action, then the full sections for doctor UI, text/select, tests and orchestration that match the files below. Authority: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M.6 and C3M-11; taskdb `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` — «Терминология не реализуется условными строками по страницам.»

Finish the exact active UI list: `DoctorClientMembershipsPanel`, `DoctorClientProgramInbox`, `DoctorClientSupportPanel`, `DoctorLfkComplexExerciseOverridesPanel`, `PatientActionStrip`, `SubscriberBlockPanel`, `DoctorClientLifecycleActions`, `useDoctorPatientSupportChat`, `PatientEncounterStartModal`, `PatientSymptomTrackingControls`, `PatientTabAccount`, `PatientTabFiles`, `PatientTabOverview`, `PatientTabRecords`, `ProgramHistoryModal`, `EncounterPageClient`, `DoctorExerciseStatisticsModal`, `InstanceAddLibraryItemDialog`, `ClientProfileCard`, `SectionDeleteDialog`, `SectionSlugRenameDialog`, `DoctorCourseEditForm`, and `MaterialContentStatsClient` under `apps/webapp/src/app/app/doctor/**`.

One required pattern: consume the existing `useDoctorPatientTerms()` context and its grammatical forms. If a nested helper needs a value, pass the resolved term from the nearest context consumer; do not add a local dictionary or a page-level `if client`. Keep `onSupport` as the one membership property and `supportGroupLabel` as presentation only. Do not change booking or relationship semantics. Replace only visible text/aria/title/fallback presentation, not comments or identifiers.

Do not write or modify tests: this is variable UI copy and is accepted by inspection/live UI under AGENTS §10a. Run scoped formatting/lint, webapp typecheck, and `git diff --check`; commit explicit paths with `#1098`, no push and no full CI.
