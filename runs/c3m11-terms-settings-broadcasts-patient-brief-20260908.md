# C3M-11 terminology sweep — settings, broadcasts and patient UI

Read the `AGENTS.md` heading map before every action, then the full sections for doctor/patient UI, text/select, tests and orchestration that match the files below. Authority: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M.6 and C3M-11; taskdb `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` — «Терминология не реализуется условными строками по страницам.»

Finish only these active surfaces: `BroadcastConfirmStep.tsx`, `BroadcastForm.tsx` and their presentation `labels.ts`; `SettingsForm.tsx`, `AppointmentReminderSettingsSection.tsx`, `BookingEventNotificationsSection.tsx`, `BookingSoloServicesSection.tsx`, `BookingSoloSpecialistsSection.tsx`; settings `patient-home/PatientHomeBlockItemsDialog.tsx`, `PatientHomeBlockPreview.tsx`, `PatientHomeBlockRuntimeStatusBadge.tsx`, `PatientHomeBlockSettingsCard.tsx`, `PatientHomeCreateSectionInlineDialog.tsx`, `PatientHomeDailyWarmupRotationPanel.tsx`; doctor usage `ProductAnalyticsTopPagesChart.tsx`; patient `PatientPrimaryNavStrip.tsx` and `PatientTopNav.tsx`.

One required pattern: doctor/settings surfaces use the already mounted `useDoctorPatientTerms()` context; patient surfaces use the already mounted `usePatientTerms()` context; pure presentation helpers receive resolved terms from their caller. Do not add local conditionals, another resolver/dictionary, another group, or a membership field. The literal choices inside the settings select (`Клиенты/Пациенты`, `Избранные/На сопровождении`) are option values and must remain literal. Replace only visible presentation, not comments or identifiers.

Do not write or modify tests: this is variable UI copy and is accepted by inspection/live UI under AGENTS §10a. Run scoped formatting/lint, webapp typecheck, and `git diff --check`; commit explicit paths with `#1098`, no push and no full CI.
